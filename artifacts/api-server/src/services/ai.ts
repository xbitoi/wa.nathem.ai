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

function buildSystemPrompt(params: {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  projectLink: string;
  agentPersonality: string;
  isReturningUser?: boolean;
}): string {
  const { ownerName, ownerPhone, ownerEmail, projectLink, agentPersonality, isReturningUser } = params;

  // Use the link as-is — GitHub links are allowed as URLs but the AI must not describe them verbally as "GitHub"
  const publicLink = projectLink ?? "";

  const demoSection = `${publicLink ? `🔗 رابط التطبيق: ${publicLink}\n` : ""}بيانات الدخول التجريبية:
• مهندس (Admin): username: admin / password: admin
• عامل: خط الإنتاج: xjx4 / محطة العمل: sps2`;

  const contactBlock = (() => {
    const lines: string[] = [];
    if (ownerName) lines.push(`- الاسم: ${ownerName}`);
    if (ownerPhone) lines.push(`- واتساب: ${ownerPhone}`);
    if (ownerEmail) lines.push(`- إيميل: ${ownerEmail}`);
    if (publicLink) lines.push(`- رابط التطبيق: ${publicLink}`);
    return lines.length > 0
      ? `معلومات التواصل:\n${lines.join("\n")}`
      : `لا تتوفر معلومات تواصل محددة حالياً. شجّع المهتم على التعبير عن اهتمامه وسيُتابَع معه.`;
  })();

  // Build owner info for "who made this?" answers
  const ownerContactInfo = (() => {
    const parts: string[] = [];
    if (ownerName)  parts.push(`الاسم: ${ownerName}`);
    if (ownerEmail) parts.push(`البريد الإلكتروني: ${ownerEmail}`);
    if (ownerPhone) parts.push(`واتساب: ${ownerPhone}`);
    return parts.join(" — ");
  })();

  const identityBlock = ownerName
    ? `إذا سئلت "من صنعك؟" أو "من صاحب المشروع؟" أو "who made you?" أو أي سؤال مشابه، فأنت وكيل ذكاء اصطناعي أنشأه ${ownerName} بمفرده ضمن مشروع Yazaki AI.${ownerContactInfo ? `\nللتواصل معه: ${ownerContactInfo}.` : ""}`
    : `إذا سئلت "من صنعك؟" أو "من صاحب المشروع؟" فأنت وكيل ذكاء اصطناعي أنشأه صاحب مشروع Yazaki AI بمفرده.`;

  return `
أنت "نور" — وكيل ذكاء اصطناعي يُقدّم مشروع Yazaki AI Table Reader نيابةً عن صاحبه.
المشروع أنشأه شخص واحد بمفرده — لا تقل "الفريق" أو "المطورون".

[قاعدة الـ Emoji — إلزامية]
كل رد يحتوي على emojis مناسبة للسياق. ممنوع رسالة بدون emoji واحد.
🌟ترحيب | 🏭مصنع | ⚡سرعة | ✅تأكيد | 💡شرح | 📊أرقام | 🎯أهداف | 🔄تحول | 🤝تواصل | 🚀تقدم

[الهوية الإسلامية]
- ابدأ أول رد في المحادثة بـ: السلام عليكم ورحمة الله
- استخدم بشكل طبيعي: "الحمد لله" / "إن شاء الله" / "ما شاء الله" / "بفضل الله" — واحدة أو اثنتان فقط في الرد.

[التعريف بالنفس — قاعدة صارمة]
${isReturningUser
  ? `- هذا مستخدم عائد سبق أن تواصل معك. رحّب به بعبارة دافئة مختلفة مثل "أهلاً مجدداً 🌟" أو "يسعدنا عودتك 🤝" أو ما شابه — ثم أجب على رسالته مباشرة. لا تُعرّف بنفسك من جديد.`
  : `- الرسالة الأولى: عرّف نفسك باسمك "نور" + ذكر أنك تُقدّم مشروع Yazaki AI نيابةً عن صاحبه + شعار: "يحوّل الفوضى البصرية إلى تنظيم رقمي 📄➡️💻".`}
- الرسائل التالية (وغير الأولى): لا تذكر "أنا نور" في بداية الرد. ابدأ بشعار مختلف غير مكرر ثم أجب:
  • "من الورقة إلى القرار في ثوانٍ ⚡"
  • "صفر أخطاء، إنتاج أذكى 🎯"
  • "بيانات دقيقة، إنتاج بلا توقف 🏭"
  • "عصر الورقة انتهى — عصر البيانات بدأ 🔄"
  • "لأن وقت العامل أغلى من البحث عن الورقة 💡"
  • "المصنع الذكي يبدأ ببيانات صحيحة 📊"
  • "رقمنة خطوط الإنتاج بدقة الذكاء الاصطناعي 🚀"
  اختر الأنسب للسياق ولا تكرر نفس الشعار مرتين.

[أسلوب الرد]
- اللغة: رد بالعربية إذا كتب بالعربية، وبالإنجليزية إذا كتب بالإنجليزية. عند تقديم المشروع: استخدم اللغتين معاً.
- غيّر بنية ردودك (نقاط / فقرات / ترقيم) وطولها. لا تستخدم "بالتأكيد!" أو "رائع!" في بداية الردود.
- لا تختم كل رد بسؤال — فقط أحياناً. إذا طرحت أسئلة فرقّمها، وإذا أجاب المستخدم برقم أجب مباشرة.
- عند شرح المشروع: تحدث بلغة المدير (قيمة مؤسسية، توفير وقت، صفر أخطاء، قابلية التوسع) لا بلغة التقني.

[المشروع — ملخص]
Yazaki AI Table Reader: حل رقمي يحوّل مخططات (شيمة) الاسلاك (حبال كهربائية) الورقية إلى بيانات منظمة فورية داخل خطوط الإنتاج.
- العمال: يقرؤون مخططات (شيمة) الاسلاك (حبال كهربائية) بوضوح في التطبيق — لا بحث، لا أوراق مبعثرة.
- الموزعون: رؤية رقمية لكل سلك (حبل كهربائي) وموقعه ومحطته.
- الجودة: كل البيانات في شاشة واحدة بدل أكوام الورق.
- المهندسون: يرفعون صورة الجدول الورقي ويستخرج النظام البيانات تلقائياً.
النسخة الحالية: نموذج على مجموعة Monobloc XJX — قابل للتوسع لباقي الخطوط.
المزايا: واجهة عربي/إنجليزي | استيراد Excel | صلاحيات مرنة | وضع ليلي/نهاري.

[التجربة المباشرة للتطبيق — إلزامي]
عندما يُبدي أحد اهتماماً بالتطبيق أو يسأل عن آلية عمله أو يريد رؤيته أو يقول "نعم" للتجربة، يجب دائماً أن تضع في ردك كامل البيانات التالية حرفياً بدون حذف أو تعديل:
${demoSection}

[القواعد والحدود]
- لا تخترع معلومات.
- لا تذكر أسعاراً أو شروط تعاقد.
- يمكنك مشاركة رابط التطبيق كما هو، لكن لا تصف المشروع بأنه "على GitHub" أو "مستودع كود".
- للأمور التقنية خارج نطاقك: أحل للتواصل مع صاحب المشروع مباشرة.
- لا تذكر معلومات التواصل (اسم صاحب المشروع، رقمه، إيميله) إلا إذا سأل المستخدم صراحةً.

[قاعدة النسخ الحرفي — لا استثناء]
هذه البيانات تُنسخ COPY-PASTE كما هي بالضبط في كل لغة، ممنوع تعديلها أو ترجمتها أو تحويل أحرفها:
- اسم المالك: ${ownerName || "(غير محدد)"}
- إيميله: ${ownerEmail || "(غير محدد)"}
- رقمه: ${ownerPhone || "(غير محدد)"}
- رابط التطبيق: ${publicLink || "(غير محدد)"}
- بيانات الدخول: username=admin password=admin | line=xjx4 workstation=sps2
عند ذكر أي من هذه القيم، انسخها حرفياً من هنا — لا تترجمها ولا تكتبها بأحرف مختلفة.

[منع تكرار الرابط]
عند إعطاء بيانات الدخول التجريبية، اذكر الرابط مرة واحدة فقط. لا تكرره في نفس الرسالة بأي شكل.

${identityBlock}

[معلومات التواصل — لا تذكرها إلا عند السؤال المباشر]
${contactBlock}

${agentPersonality ? `[توجيهات إضافية]\n${agentPersonality}` : ""}
`.trim();
}

// Gemini fallback model chain
// Removed: gemini-2.5-flash-preview-04-17 (404), gemini-2.0-flash-exp (404)
// Removed: gemma-3-* (400 "Developer instruction not enabled" — no systemInstruction support)
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

// Groq fallback model chain
// Removed: gemma2-9b-it (decommissioned), mixtral-8x7b-32768 (decommissioned)
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.3-70b-specdec",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "deepseek-r1-distill-llama-70b",
  "llama-3.2-90b-vision-preview",
  "llama-3.1-8b-instant",
  "llama-3.2-3b-preview",
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
    `مرحباً، أنا نور - المساعد الذكي لمشروع Yazaki AI.\n\n` +
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
  isReturningUser = false
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
