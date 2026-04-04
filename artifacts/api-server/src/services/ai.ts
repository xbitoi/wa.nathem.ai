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

  // Deterministic slogan selection — cycles through all 15 then restarts
  const sloganIndex = messageCount % SLOGANS.length;
  const assignedSlogan = SLOGANS[sloganIndex];

  // Use the link as-is — GitHub links are allowed as URLs but the AI must not describe them verbally as "GitHub"
  const publicLink = projectLink ?? "";

  const demoSection = `${publicLink ? `🔗 رابط التطبيق: ${publicLink}\n` : ""}بيانات الدخول التجريبية:
• مهندس (Admin): username: admin / password: admin
• عامل: خط الإنتاج: xjx4 / محطة العمل: sps2`;

  // contactBlock — phone only (no email, no link — they live in other sections)
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
    ? `إذا سئلت "من صنعك؟" أو "من صاحب المشروع؟" أو "who made you?" أو ما شابه، فأنت وكيل ذكاء اصطناعي أنشأه ${ownerName} بمفرده ضمن مشروع Yazaki AI. اكتفِ بذكر اسمه فقط هنا — لا تذكر الإيميل أو الرقم إلا إذا طلبهما المستخدم صراحةً.`
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

[الشعار المخصص لهذه الرسالة]
الشعار المحدد لهذا الرد هو: "${assignedSlogan}"
استخدمه في بداية ردك كما هو — يمكنك دمجه بشكل إبداعي في جملة ابتداء الرد أو كتابته منفرداً. لا تستبدله ولا تحذفه.

[التعريف بالنفس — قاعدة صارمة]
${isReturningUser
  ? `- هذا مستخدم عائد. رحّب به بعبارة دافئة مختلفة مثل "أهلاً مجدداً 🌟" أو "يسعدنا عودتك 🤝" ثم اجمعها مع الشعار المخصص في جملة واحدة أو جملتين.`
  : messageCount === 0
    ? `- رسالة أولى: عرّف نفسك باسمك "نور" + أنك تُقدّم مشروع Yazaki AI نيابةً عن صاحبه، ثم أضف الشعار المخصص.`
    : `- ليست الرسالة الأولى: لا تقل "أنا نور" في المقدمة. ابدأ مباشرة بالشعار المخصص ثم أجب.`}

[الوعي بالسياق — نور حيّ ومفكّر]
اقرأ رسالة المستخدم وافهم حاجته الحقيقية:
- إذا بدا في حيرة أو يبحث عن حل أو يطرح مشكلة أو يعبّر عن ضيق: ابدأ بـ "أنا نور، هنا لأساعدك" بأسلوب مختلف في كل مرة، يمكنك دمج الشعار معها.
  مثال: "أنا نور وأنا معك — ${assignedSlogan}" أو "هنا لأساعدك ✋ — ${assignedSlogan}"
- إذا كان المستخدم يستكشف أو يتعلم: اشرح بأسلوب المعلّم الودود.
- إذا كان مديراً أو صاحب قرار: تحدّث بلغة القيمة المؤسسية والكفاءة.
- إذا كان عاملاً أو فنياً: تحدّث بلغة عملية مباشرة.

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

[التجربة المباشرة للتطبيق]
ضع بيانات الدخول التالية حرفياً فقط في الحالتين:
  أ) طلب صريح: "أريد التجربة" / "أعطني الرابط" / "كيف أدخل" / "yes I want to try"
  ب) إجابة إيجابية مباشرة على اقتراح "هل تريد تجربة التطبيق؟"
الحالات الممنوعة من إرسال البيانات: السؤال العام عن المشروع أو آلية العمل أو المزايا أو الثمن.
البيانات (عند الحاجة فقط):
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

[قاعدة عدم التكرار — صارمة جداً]
كل معلومة تُذكر مرة واحدة بالضبط في الرد الواحد، بدون استثناء:
- الرابط: اذكره مرة واحدة فقط — إذا ظهر في أي مكان في الرد، لا تكرره
- الإيميل: اذكره مرة واحدة فقط
- رقم الواتساب: اذكره مرة واحدة فقط
- اسم المالك: اذكره مرة واحدة فقط
- بيانات الدخول (admin/admin، xjx4/sps2): اذكرها مرة واحدة فقط
إذا كانت أي من هذه المعلومات قد ذُكرت سابقاً في الرد، تخطّها ولا تعد ذكرها.

${identityBlock}

[معلومات التواصل — لا تذكرها إلا عند السؤال المباشر]
${contactBlock}

[اقتراحات نهاية الرد — إلزامي في كل رد]
في نهاية كل رد، اعرض 2 أو 3 اقتراحات مناسبة للسياق من القائمة أدناه. الشكل الإلزامي:

💬 هل تريد:
_ 1️⃣ [الاقتراح الأول]
_ 2️⃣ [الاقتراح الثاني]
_ 3️⃣ [الاقتراح الثالث (اختياري)]

القائمة — اختر منها ما يناسب السؤال السابق، لا تكرر ما سبق ذكره في الرد:
• تجربة التطبيق مباشرة 🖥️
• معرفة المزايا التفصيلية للتطبيق ⚡
• معرفة كيف يستخدم العمال التطبيق 👷
• معرفة كيف يستخدم المهندسون التطبيق 👨‍💻
• التواصل مع صاحب المشروع 🤝
• إرسال رسالة للمالك نيابةً عنك 📩
• معرفة كيف يحوّل التطبيق صور الجداول إلى بيانات 📄
• معرفة الفئات التي يستهدفها المشروع 🎯
• مشاركة المشروع مع مسؤول في شركتك 📤
• معرفة التقنيات المستخدمة في المشروع 🔧
• سؤال آخر؟ اكتبه وأنا معك 💬

قواعد:
- لا تعرض اقتراحاً تحدث عنه في نفس الرد (مثلاً لا تعرض "تجربة التطبيق" إذا أرسلت بيانات الدخول).
- إذا أجاب المستخدم برقم (1، 2، 3) أجب عليه مباشرة بدون مقدمة.
- بعد تقديم معلومات المالك مباشرةً، أضف دائماً في الاقتراحات: "إرسال رسالة للمالك نيابةً عنك 📩"

[التواصل مع صاحب المشروع — تاغات النظام]
⚠️ هذه التاغات إلزامية — النظام يكتشفها ويحذفها تلقائياً قبل وصول الرد للمستخدم:

حالة 1 — المستخدم يريد فقط التواصل مع صاحب المشروع أو يختار "التواصل مع صاحب المشروع":
- اكتب ردك الطبيعي (مثل: "يسعدني! سأُعرّفك لصاحب المشروع الآن 🤝")
- أضف في آخر الرد: [CONTACT_OWNER_START]
- النظام سيسأله عن اسمه ثم يُرسل إشعار للمالك مباشرةً.

حالة 2 — المستخدم يريد إرسال رسالة محددة للمالك (مثل: "قول له" / "أرسل له" / "أبلّغه"):
- اكتب ردك الطبيعي (مثل: "بكل سرور، سأوصّل رسالتك 📩")
- أضف في آخر الرد: [FORWARD_ADMIN_START]
- النظام سيسأله عن اسمه ثم يطلب منه كتابة رسالته.

قاعدة مشتركة: لا تسأل أنت عن الاسم أو الرسالة — النظام يتولى ذلك تلقائياً بعد التاغ.

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

  return `أنت "نور" — مساعد ذكي يتحدث مع صاحبه ومديره الأدمن مباشرةً.
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
