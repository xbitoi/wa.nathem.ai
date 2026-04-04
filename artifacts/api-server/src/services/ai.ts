import { logger } from "../lib/logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Settings cache (30 second TTL) ─────────────────────────────────────────
let _settingsCache: Record<string, string | null> | null = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 30_000;

async function getAllSettings(): Promise<Record<string, string | null>> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_TTL_MS) return _settingsCache;
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string | null> = {};
  for (const row of rows) map[row.key] = row.value;
  _settingsCache = map;
  _settingsCacheAt = now;
  return map;
}

export function invalidateSettingsCache() {
  _settingsCache = null;
}

async function getSetting(key: string): Promise<string | null> {
  const map = await getAllSettings();
  return map[key] ?? null;
}

// ── Circuit breaker — skip recently-failed models (3 min cooldown) ──────────
const failedModels = new Map<string, number>();
const CIRCUIT_BREAKER_MS = 3 * 60 * 1000;

function isModelCoolingDown(provider: string, model: string): boolean {
  const key = `${provider}/${model}`;
  const failedAt = failedModels.get(key);
  if (!failedAt) return false;
  if (Date.now() - failedAt < CIRCUIT_BREAKER_MS) return true;
  failedModels.delete(key);
  return false;
}

function markModelFailed(provider: string, model: string) {
  failedModels.set(`${provider}/${model}`, Date.now());
}

// ── Per-call timeout ─────────────────────────────────────────────────────────
const AI_TIMEOUT_MS = 9_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// Strip chain-of-thought <think>...</think> blocks that some models output
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s+/, "")
    .trim();
}

const SLOGANS = [
  "يحوّل الفوضى البصرية إلى تنظيم رقمي 📄➡️💻",
  "من الورقة إلى القرار في ثوانٍ ⚡",
  "صفر أخطاء، إنتاج أذكى 🎯",
  "بيانات دقيقة، إنتاج بلا توقف 🏭",
  "عصر الورقة انتهى — عصر البيانات بدأ 🔄",
  "لأن وقت العامل أغلى من البحث عن الورقة 💡",
  "المصنع الذكي يبدأ ببيانات صحيحة 📊",
  "رقمنة خطوط الإنتاج بدقة الذكاء الاصطناعي 🚀",
  "من الشيمة إلى الشاشة في ثوانٍ 🖥️",
  "الجودة تبدأ من بيانات صحيحة ✅",
  "لا أخطاء قراءة — لا توقف إنتاج 🛡️",
  "بيانات أسلاك دقيقة على مدار الوردية بأكملها 🤖",
  "خط الإنتاج يستحق أكثر من ورقة مبعثرة 📑",
  "رؤية رقمية لكل سلك، في كل محطة 🔌",
  "التحول الرقمي يبدأ من أصغر تفصيلة في المصنع 🏗️",
];

function buildSystemPrompt(params: {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  projectLink: string;
  agentPersonality: string;
  isReturningUser?: boolean;
  messageCount?: number;
}): string {
  const { ownerName, ownerPhone, ownerEmail, projectLink, agentPersonality, isReturningUser, messageCount = 0 } = params;

  const publicLink = projectLink ?? "";

  // Slogan used only on first message and every 5th message — not every time
  const useSloganThisMessage = messageCount === 0 || messageCount % 5 === 0;
  const sloganIndex = messageCount % SLOGANS.length;
  const assignedSlogan = SLOGANS[sloganIndex];

  const demoSection = `${publicLink ? `🔗 رابط التطبيق: ${publicLink}\n` : ""}بيانات الدخول التجريبية:
• مهندس (Admin): username: admin / password: admin
• عامل: خط الإنتاج: xjx4 / محطة العمل: sps2`;

  const contactBlock = (() => {
    const lines: string[] = [];
    if (ownerName)  lines.push(`- الاسم: ${ownerName}`);
    if (ownerPhone) lines.push(`- واتساب: ${ownerPhone}`);
    if (ownerEmail) lines.push(`- إيميل: ${ownerEmail}`);
    return lines.length > 0
      ? `معلومات التواصل (اذكرها فقط عند السؤال المباشر):\n${lines.join("\n")}`
      : `لا تتوفر معلومات تواصل محددة حالياً. شجّع المهتم على التعبير عن اهتمامه وسيُتابَع معه.`;
  })();

  const identityBlock = ownerName
    ? `إذا سئلت "من صنعك؟" أو "من صاحب المشروع؟" فأنت وكيل ذكاء اصطناعي أنشأه بمفرده. اكتب اسمه حرفياً كما هو محفوظ: "${ownerName}" — ممنوع ترجمته أو تعريبه. لا تذكر إيميله أو رقمه إلا إذا طُلبا صراحةً.`
    : `إذا سئلت "من صنعك؟" فأنت وكيل ذكاء اصطناعي أنشأه صاحب مشروع Yazaki AI بمفرده.`;

  return `
أنت "ناظم" — تُمثّل مشروع Yazaki AI Table Reader وتتحدث نيابةً عن صاحبه (شخص واحد بمفرده، لا فريق). أنت صوته أمام الزبائن والزوار.

══════════════════════════════
الشخصية والأسلوب
══════════════════════════════
تحدّث كإنسان حقيقي: دافئ، واثق، مباشر. لا تبدو كروبوت يقرأ من سكريبت.

قاعدة هوية صارمة:
• لا تقل أبداً "مساعد ذكي" أو "AI assistant" أو "بوت" عن نفسك.
• إذا سألك أحد "من أنت؟" قل أنك ناظم، من يقدّم هذا المشروع نيابةً عن صاحبه.
• تحدّث بضمائر المذكر دائماً.

قواعد التحدث:
• اقرأ الرسالة جيداً وافهم ما يريده بالضبط قبل أي شيء. إذا كان السؤال بسيطاً أجب مباشرة، لا تحشو.
• رد بالعربية إذا كتب بالعربية، بالإنجليزية إذا كتب بالإنجليزية.
• غيّر طول ردودك وبنيتها (نقاط أحياناً، فقرات أحياناً) حسب نوع السؤال.
• لا تبدأ بـ "بالتأكيد!" أو "رائع!" أو "سؤال ممتاز!" — هذه عبارات فارغة.
• إذا سألك سؤالاً مباشراً (نعم/لا) ابدأ بالجواب ثم اشرح.
• استخدم emojis بشكل طبيعي حيث تضيف — ليس في كل كلمة.
• كلمات إسلامية (إن شاء الله، الحمد لله) بشكل عفوي حين تناسب السياق، ليس كواجب.
${useSloganThisMessage ? `• هذه الرسالة: اندمج فيها بشكل طبيعي هذا الشعار: "${assignedSlogan}"` : ""}

التعامل حسب نوع المستخدم:
• مدير/صاحب قرار → كلّمه بلغة القيمة المؤسسية: توفير وقت، صفر أخطاء، تحكم كامل.
• عامل/فني → كلّمه بشكل عملي مباشر: واضح وبسيط وبلا تعقيد.
• مستكشف/فضولي → كن المعلم الودود: اشرح بمثال حي واحد بدل القوائم الطويلة.

الرسالة الأولى:
${isReturningUser
  ? `- مستخدم عائد: رحّب به بعبارة دافئة طبيعية مختلفة (مثل "أهلاً مجدداً" أو "يسعدنا عودتك") — ثم أجب على سؤاله.`
  : messageCount === 0
    ? `- رسالة أولى: قدّم نفسك باسمك "ناظم" بجملة واحدة طبيعية — مثل: "أنا ناظم، أُمثّل مشروع Yazaki AI" — لا تقل أبداً "مساعد ذكي". ثم أجب على ما قاله أو سأله مباشرة.`
    : `- ليست رسالة أولى: لا تعيد تقديم نفسك. أجب مباشرة.`}

══════════════════════════════
المشروع — ما تعرفه
══════════════════════════════
Yazaki AI Table Reader: يحوّل مخططات الأسلاك الكهربائية (الشيمة) الورقية إلى بيانات رقمية منظمة داخل خطوط الإنتاج.

كيف يعمل:
- المهندس يرفع صورة الجدول الورقي → النظام يستخرج البيانات تلقائياً بالذكاء الاصطناعي.
- العمال يقرؤون مخططات الأسلاك على الشاشة — لا ورق، لا بحث.
- الموزعون: رؤية رقمية كاملة لكل سلك وموقعه ومحطته.
- الجودة: كل البيانات في شاشة واحدة بدل أكوام الورق.

النسخة الحالية: مجموعة Monobloc XJX — قابل للتوسع لكل الخطوط.
المزايا: واجهة عربي/إنجليزي | استيراد Excel | صلاحيات مرنة | وضع ليلي/نهاري.

[التجربة المباشرة]
أرسل بيانات الدخول فقط في هاتين الحالتين:
  أ) طلب صريح: "أريد التجربة" / "أعطني الرابط" / "كيف أدخل" / "yes I want to try"
  ب) إجابة إيجابية على سؤال "هل تريد تجربة التطبيق؟"
ممنوع إرسالها عند السؤال العام عن المشروع أو مزاياه أو آليته.
البيانات (عند الحاجة فقط):
${demoSection}

══════════════════════════════
حدود ما تقوله
══════════════════════════════
- لا تخترع معلومات غير موجودة هنا.
- لا أسعار، لا شروط تعاقد.
- لا تصف الرابط بأنه "على GitHub" — فقط شاركه كما هو.
- للأمور خارج نطاقك: أحل للتواصل مع صاحب المشروع.
- لا تذكر معلومات التواصل إلا إذا طُلبت صراحةً.

[قيم ثابتة — قاعدة COPY-PASTE الصارمة]
⚠️ هذه القيم تُكتب حرفاً بحرف كما هي أدناه — بغض النظر عن لغة المحادثة.
ممنوع ترجمتها، تعريبها، أو تغيير أي حرف فيها مهما كان السياق:

- اسم المالك: ${ownerName || "(غير محدد)"}
- إيميله: ${ownerEmail || "(غير محدد)"}
- رقمه: ${ownerPhone || "(غير محدد)"}
- رابط التطبيق: ${publicLink || "(غير محدد)"}
- بيانات الدخول: username=admin password=admin | line=xjx4 workstation=sps2

مثال توضيحي (مهم جداً):
إذا كان اسم المالك "Khalid Haddou" — اكتبه هكذا بالضبط حتى لو الرد بالعربية.
لا تكتب "خالد حدو" ولا "خالد هدو" — الاسم المحفوظ هو الصحيح الوحيد.

كل قيمة تُذكر مرة واحدة فقط في الرد — لا تكرار.

${identityBlock}

${contactBlock}

══════════════════════════════
اقتراحات نهاية الرد
══════════════════════════════
في آخر كل رد، اعرض 2-3 خطوات طبيعية ممكنة للمستخدم. اجعلها تبدو عضوية وليست قائمة آلية.
الشكل المقبول (يمكن تنويع الصياغة):

💬 تقدر كذلك:
_ 1️⃣ [خيار]
_ 2️⃣ [خيار]
_ 3️⃣ [خيار — اختياري]

اختر من هذه فقط ما يناسب السياق (لا تعرض ما تحدثت عنه في الرد):
• تجربة التطبيق مباشرة 🖥️
• معرفة المزايا التفصيلية ⚡
• كيف يستخدم العمال التطبيق 👷
• كيف يستخدم المهندسون التطبيق 👨‍💻
• التواصل مع صاحب المشروع 🤝
• إرسال رسالة للمالك نيابةً عنك 📩
• كيف يحوّل التطبيق الصور إلى بيانات 📄
• من يستفيد من هذا المشروع 🎯
• التقنيات المستخدمة في المشروع 🔧
• سؤال آخر؟ اكتبه وأنا معك 💬

ملاحظات:
- إذا أجاب المستخدم برقم (1، 2، 3) أجب مباشرة بدون مقدمة.
- بعد تقديم معلومات المالك أضف دائماً: "إرسال رسالة للمالك نيابةً عنك 📩"

══════════════════════════════
تواصل مع صاحب المشروع — تاغات النظام
══════════════════════════════
⚠️ التاغات تُحذف تلقائياً قبل وصول الرد للمستخدم:

حالة 1 — يريد التواصل مع صاحب المشروع أو اختار "التواصل مع صاحب المشروع":
اكتب ردك الطبيعي ثم أضف في الآخر: [CONTACT_OWNER_START]

حالة 2 — يريد إرسال رسالة محددة ("قول له" / "أرسل له" / "أبلّغه"):
اكتب ردك الطبيعي ثم أضف في الآخر: [FORWARD_ADMIN_START]

لا تسأل أنت عن الاسم أو الرسالة — النظام يتولى ذلك بعد التاغ.

${agentPersonality ? `══════════════════════════════\nتوجيهات إضافية من صاحب المشروع\n══════════════════════════════\n${agentPersonality}` : ""}
`.trim();
}

// Gemini fallback model chain
// Removed: gemini-2.0-flash-exp (404)
// Removed: gemma-3-* (400 "Developer instruction not enabled" — no systemInstruction support)
const GEMINI_MODELS = [
  "gemini-2.5-flash-preview-04-17", // Flash 2.5 — latest (user: "flash 3.1")
  "gemini-2.0-flash",               // Flash 2.0 — stable fallback
];

// Groq fallback model chain — 2 models only, large daily quota
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",                      // most reliable, large quota
  "meta-llama/llama-4-scout-17b-16e-instruct",    // newer, good quota
];

// Detect quota / billing / rate-limit errors that should trigger fallback
function isQuotaError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const status = err?.status ?? err?.statusCode ?? 0;
  return (
    status === 429 ||
    status === 503 ||
    status === 402 ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("billing") ||
    msg.includes("insufficient") ||
    msg.includes("exceeded") ||
    msg.includes("too many requests") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable")
  );
}

async function tryGemini(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  // systemInstruction must be set on getGenerativeModel, NOT on startChat
  const gModel = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });
  const history = conversationHistory.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const chat = gModel.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  const reply = stripThinking(result.response.text());
  if (!reply) throw new Error("GEMINI_EMPTY_REPLY");
  return reply;
}

async function tryGroq(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const { default: Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey });
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMessage },
  ];
  const completion = await groq.chat.completions.create({
    model: modelName,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  });
  const rawReply = completion.choices[0]?.message?.content;
  if (!rawReply) throw new Error("GROQ_EMPTY_REPLY");
  const reply = stripThinking(rawReply);
  if (!reply) throw new Error("GROQ_EMPTY_AFTER_STRIP");
  return reply;
}

function buildStaticFallback(params: {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  projectLink: string;
}): string {
  const { ownerName, ownerPhone, ownerEmail, projectLink } = params;

  const contactLines: string[] = [];
  if (ownerName)   contactLines.push(`- المسؤول: ${ownerName}`);
  if (ownerPhone)  contactLines.push(`- واتساب: ${ownerPhone}`);
  if (ownerEmail)  contactLines.push(`- البريد: ${ownerEmail}`);
  if (projectLink) contactLines.push(`- الرابط: ${projectLink}`);

  const contactSection = contactLines.length > 0
    ? `\n\nللتواصل المباشر:\n${contactLines.join("\n")}`
    : "";

  return (
    `مرحباً، أنا ناظم - أُمثّل مشروع Yazaki AI نيابةً عن صاحبه.\n\n` +
    `مشروع Yazaki AI Table Reader هو حل رقمي لتحويل مخططات (شيمة) الاسلاك الكهربائية ` +
    `من صور ورقية إلى بيانات منظمة داخل بيئة الإنتاج.` +
    (projectLink ? `\n\nللمعاينة المباشرة: ${projectLink}` : "") +
    contactSection +
    `\n\n(النظام يمر بضغط تقني مؤقت — سأعود للرد الكامل قريباً)`
  );
}

export async function generateAIReply(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  isReturningUser = false,
  messageCount = 0
): Promise<{ reply: string; model: string }> {
  // Fetch all settings in one DB query (cached for 30 seconds)
  const s = await getAllSettings();
  const aiModel        = s["aiModel"];
  const geminiModel    = s["geminiModel"];
  const groqModel      = s["groqModel"];
  const ownerName      = s["ownerName"];
  const ownerPhone     = s["ownerPhone"];
  const ownerEmail     = s["ownerEmail"];
  const projectLink    = s["projectLink"];
  const agentPersonality = s["agentPersonality"];
  const geminiApiKey   = s["geminiApiKey"];
  const groqApiKey     = s["groqApiKey"];

  const _aiModel      = aiModel    ?? "gemini";
  const _geminiModel  = geminiModel || "gemini-2.0-flash";
  const _groqModel    = groqModel   || "llama-3.3-70b-versatile";
  const _ownerName    = ownerName   ?? "";
  const _ownerPhone   = ownerPhone  ?? "";
  const _ownerEmail   = ownerEmail  ?? "";
  const _projectLink  = projectLink ?? "";
  const _personality  = agentPersonality ?? "";
  const _geminiKey    = geminiApiKey ?? "";
  const _groqKey      = groqApiKey   ?? "";

  const systemPrompt = buildSystemPrompt({
    ownerName: _ownerName,
    ownerPhone: _ownerPhone,
    ownerEmail: _ownerEmail,
    projectLink: _projectLink,
    agentPersonality: _personality,
    isReturningUser,
    messageCount,
  });

  // Build ordered provider chain starting from the configured primary provider
  const geminiChain = { provider: "gemini", apiKey: _geminiKey, models: buildModelChain(_geminiModel, GEMINI_MODELS) };
  const groqChain   = { provider: "groq",   apiKey: _groqKey,   models: buildModelChain(_groqModel,   GROQ_MODELS)   };
  const providerChain = _aiModel === "groq"
    ? [groqChain, geminiChain]
    : [geminiChain, groqChain];

  const errors: string[] = [];

  for (const { provider, apiKey, models } of providerChain) {
    if (!apiKey) {
      errors.push(`${provider}: no API key`);
      continue;
    }
    for (const model of models) {
      // Skip models that recently failed (circuit breaker)
      if (isModelCoolingDown(provider, model)) {
        errors.push(`${provider}/${model}: skipped (cooling down)`);
        continue;
      }
      try {
        let reply: string;
        const label = `${provider}/${model}`;
        if (provider === "gemini") {
          reply = await withTimeout(
            tryGemini(apiKey, model, systemPrompt, userMessage, conversationHistory),
            AI_TIMEOUT_MS, label
          );
        } else {
          reply = await withTimeout(
            tryGroq(apiKey, model, systemPrompt, userMessage, conversationHistory),
            AI_TIMEOUT_MS, label
          );
        }
        if (model !== (provider === "gemini" ? _geminiModel : _groqModel)) {
          logger.warn({ provider, model }, "AI fallback used");
        }
        return { reply, model: `${provider}/${model}` };
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        errors.push(`${provider}/${model}: ${reason}`);
        logger.warn({ provider, model, reason }, "AI model failed, trying next");
        // Circuit breaker: remember quota/rate-limit failures
        if (isQuotaError(err) || reason.includes("TIMEOUT")) {
          markModelFailed(provider, model);
        }
      }
    }
  }

  // All providers exhausted — static fallback
  logger.error({ errors }, "All AI providers failed, using static fallback");
  const reply = buildStaticFallback({ ownerName: _ownerName, ownerPhone: _ownerPhone, ownerEmail: _ownerEmail, projectLink: _projectLink });
  return { reply, model: "static/fallback" };
}

// Put the configured model first, then the rest of the chain (deduped)
function buildModelChain(preferred: string, allModels: string[]): string[] {
  const rest = allModels.filter((m) => m !== preferred);
  return [preferred, ...rest];
}

// ── Admin conversational AI — natural chat + natural language settings control ─
function buildAdminSystemPrompt(s: Record<string, string | null>): string {
  const aiModel      = s["aiModel"]      ?? "gemini";
  const geminiModel  = s["geminiModel"]  ?? "gemini-2.0-flash";
  const groqModel    = s["groqModel"]    ?? "llama-3.3-70b-versatile";
  const ownerName    = s["ownerName"]    ?? "غير مضبوط";
  const ownerPhone   = s["ownerPhone"]   ?? "غير مضبوط";
  const ownerEmail   = s["ownerEmail"]   ?? "غير مضبوط";
  const projectName  = s["projectName"]  ?? "Yazaki AI Table Reader";
  const projectLink  = s["projectLink"]  ?? "غير مضبوط";
  const maintenance  = s["maintenanceMode"] === "true" ? "مفعّل" : "معطّل";
  const autoReply    = s["autoReply"] !== "false" ? "مفعّل" : "معطّل";
  const personality  = s["agentPersonality"] ?? "افتراضية";

  return `أنت "ناظم" — تتحدث مع صاحبك ومديرك الأدمن مباشرةً.
تكلّم بشكل طبيعي، ودّي، ومباشر بالعربية (أو بالإنجليزية إذا كتب هو بالإنجليزية).
لا تستخدم أسلوب "الوكيل التجاري" — أنت هنا تتكلم مع صاحبك، ليس مع زبون.

الإعدادات الحالية للنظام:
- مزود الذكاء الاصطناعي النشط: ${aiModel === "gemini" ? "Google Gemini" : "Groq"}
- موديل Gemini: ${geminiModel}
- موديل Groq: ${groqModel}
- صاحب المشروع: ${ownerName} | هاتف: ${ownerPhone} | إيميل: ${ownerEmail}
- اسم المشروع: ${projectName}
- رابط المشروع: ${projectLink}
- وضع الصيانة: ${maintenance}
- الرد التلقائي: ${autoReply}
- الشخصية المخصصة: ${personality}

قواعد تغيير الإعدادات:
إذا طلب منك الأدمن تغيير أي إعداد بأي صياغة طبيعية، أضف في آخر ردك هذا التاغ:
[SET key=value]

القيم الصحيحة للمفاتيح:
- aiModel → "gemini" أو "groq"
- geminiModel → اسم موديل Gemini (مثل: gemini-2.0-flash, gemini-1.5-pro)
- groqModel → اسم موديل Groq (مثل: llama-3.3-70b-versatile, qwen/qwen3-32b, compound-beta)
- maintenanceMode → "true" أو "false"
- maintenanceMessage → نص رسالة الصيانة
- ownerName → الاسم الكامل
- ownerPhone → رقم الهاتف
- ownerEmail → الإيميل
- projectName → اسم المشروع
- projectLink → رابط URL
- autoReply → "true" أو "false"
- agentPersonality → وصف الشخصية المخصصة

يمكن تغيير عدة إعدادات في رسالة واحدة بأكثر من تاغ:
[SET aiModel=groq]
[SET groqModel=llama-3.3-70b-versatile]

إذا لم يطلب تغيير أي إعداد، لا تضيف التاغ إطلاقاً.
لا تشرح للأدمن كيف تعمل الأوامر ما لم يسأل — فقط نفّذ.`;
}

export async function generateAdminReply(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ reply: string; model: string; actions: Record<string, string> }> {
  const s = await getAllSettings();
  const systemPrompt = buildAdminSystemPrompt(s);

  const _aiModel     = s["aiModel"]    ?? "gemini";
  const _geminiModel = s["geminiModel"] || "gemini-2.0-flash";
  const _groqModel   = s["groqModel"]   || "llama-3.3-70b-versatile";
  const _geminiKey   = s["geminiApiKey"] ?? "";
  const _groqKey     = s["groqApiKey"]   ?? "";

  const geminiChain = { provider: "gemini", apiKey: _geminiKey, models: buildModelChain(_geminiModel, GEMINI_MODELS) };
  const groqChain   = { provider: "groq",   apiKey: _groqKey,   models: buildModelChain(_groqModel,   GROQ_MODELS)   };
  const providerChain = _aiModel === "groq" ? [groqChain, geminiChain] : [geminiChain, groqChain];

  let rawReply = "";
  let usedModel = "static/fallback";

  outer:
  for (const { provider, apiKey, models } of providerChain) {
    if (!apiKey) continue;
    for (const model of models) {
      if (isModelCoolingDown(provider, model)) continue;
      try {
        const label = `${provider}/${model}`;
        rawReply = provider === "gemini"
          ? await withTimeout(tryGemini(apiKey, model, systemPrompt, userMessage, conversationHistory), AI_TIMEOUT_MS, label)
          : await withTimeout(tryGroq(apiKey, model, systemPrompt, userMessage, conversationHistory), AI_TIMEOUT_MS, label);
        usedModel = `${provider}/${model}`;
        break outer;
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        logger.warn({ provider, model, reason }, "Admin AI model failed, trying next");
        if (isQuotaError(err) || reason.includes("TIMEOUT")) markModelFailed(provider, model);
      }
    }
  }

  if (!rawReply) rawReply = "حدث خطأ مؤقت. جرّب مجدداً.";

  // Extract [SET key=value] tags from reply
  const actions: Record<string, string> = {};
  const actionRegex = /\[SET\s+([a-zA-Z]+)\s*=\s*([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(rawReply)) !== null) {
    actions[match[1].trim()] = match[2].trim();
  }
  // Clean reply — remove all [SET ...] tags (new regex literal to avoid lastIndex issue)
  const reply = rawReply.replace(/\[SET\s+[a-zA-Z]+\s*=\s*[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim();

  return { reply, model: usedModel, actions };
}
