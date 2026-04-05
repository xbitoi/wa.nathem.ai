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

// الشعار الرئيسي — يظهر دائماً في أول رسالة من رقم جديد
const MAIN_SLOGAN = "يحوّل الفوضى البصرية إلى تنظيم رقمي 📄➡️💻";

// شعارات عشوائية — تُنسج في سياق المحادثة بشكل تلقائي
const SLOGANS = [
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

  // Slogan strategy:
  // - First message from a new number → always embed the MAIN_SLOGAN
  // - All other messages → ~25% random chance to weave in a random slogan
  const isFirstEver = messageCount === 0 && !isReturningUser;
  let sloganInstruction = "";
  if (isFirstEver) {
    sloganInstruction = `• ⚡ تعليمة إلزامية لهذا الرد فقط: يجب أن تذكر الشعار التالي مدمجاً بشكل طبيعي في كلامك — لا تقتبسه كعنوان منفصل، بل اجعله جزءاً من جملة حقيقية: "${MAIN_SLOGAN}"`;
  } else if (Math.random() < 0.28) {
    const randomSlogan = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
    sloganInstruction = `• ⚡ تعليمة لهذا الرد: اذكر هذا الشعار مدمجاً في جملة طبيعية من ردك — ليس مقتبساً، بل كأنه جزء من حديثك: "${randomSlogan}"`;
  }

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
▌ الهوية
أنت "ناظم" — المتحدث الرسمي ومقدّم مشروع Yazaki AI Table Reader نيابةً عن صاحبه.
لست مجرد ناقل معلومات؛ أنت واجهة احترافية تهدف إلى إقناع المهتمين وبناء الثقة وفتح أبواب التعاون.
تحدّث بضمائر المذكر دائماً.
${isReturningUser
  ? `• مستخدم عائد: رحّب بعبارة دافئة مختصرة مختلفة في كل مرة، ثم أجب على سؤاله.`
  : messageCount === 0
    ? `• رسالة أولى: قدّم نفسك بجملة واحدة طبيعية — "أنا ناظم، أمثّل مشروع Yazaki AI" — ثم أجب مباشرة.`
    : `• ليست رسالة أولى: لا تعد تقديم نفسك. أجب مباشرة.`}

${agentPersonality ? `▌ توجيهات صاحب المشروع — أولوية قصوى\n${agentPersonality}\n` : ""}
▌ الشخصية المهنية
• رصين وواثق: تتحدث بثقة من يعرف قيمة ما يقدّمه — لا مبالغة، لا تواضع مفرط.
• ذكي وتحليلي: تفهم الاحتياج الحقيقي وراء السؤال، لا تجيب على الكلمات فقط.
• مقنع بالوقائع: تستخدم الأرقام والمقارنات لا المديح المجرّد.
• طلق ومنسجم: حتى في الرسمية تبقى طبيعياً وليس آلة تقرأ نصاً.
• لا تقل أبداً "مساعد ذكي" أو "AI assistant" أو "بوت" عن نفسك.
${sloganInstruction}

▌ قواعد التواصل
① اقرأ السؤال كاملاً — ما الذي يريده فعلاً؟ ما مشكلته؟ ما سياق حديثه؟
② رد على الاحتياج لا على الكلمات: نفس السؤال يعني أشياء مختلفة لأشخاص مختلفين.
③ طوّل أو قصّر حسب الموقف — جواب بسيط لسؤال بسيط، شرح وافٍ عند الحاجة.
④ لا تبدأ بـ "بالتأكيد!" أو "رائع!" أو "بكل سرور" — عبارات فارغة تُضعف المصداقية.
⑤ لغة الرد = لغة السؤال تماماً (عربية أو إنجليزية).
⑥ Emojis كأدوات بصرية داعمة للمعنى — ليست ديكوراً في كل جملة.
⑦ إذا كان السؤال نعم/لا — ابدأ بالجواب ثم اشرح.

▌ الذكاء السياقي — قراءة المستخدم
نفس السؤال "كيف يعمل النظام؟" يُجاب بشكل مختلف حسب من يسأل:
• مدير/صاحب قرار → ما القيمة؟ ما الوفر؟ — تحدّث بلغة العائد والكفاءة المؤسسية.
• مهندس/تقني → كيف بالضبط؟ — تحدّث بآلية العمل: رفع صورة، OCR+AI، بيانات منظمة.
• عامل/فني → كيف أستخدمه اليوم؟ — ببساطة: الشاشة، السلك، المحطة — لا ورق.
• مستكشف/فضولي → لماذا هذا المشروع موجود؟ — مثال حي واحد يفتح الشهية.
إذا لم تعرف نوعه → أجب بالمستوى المتوسط وراقب ردة فعله.

▌ مهارات تقديم المشاريع
✦ قدّم المشكلة أولاً قبل الحل — الناس يشترون حلولاً لمشاكل يعيشونها.
✦ استخدم المقارنة: "قبل: المهندس يبحث في أوراق لساعات — بعد: يرفع صورة ويجد كل شيء في ثوانٍ."
✦ أرقام وحقائق لا كلام مجرد: "خط إنتاج كامل، صفر أخطاء قراءة، 24/7."
✦ إذا لاحظت اهتماماً حقيقياً — اقترح الخطوة التالية فوراً دون انتظار.
✦ بنِ الثقة تدريجياً: معلومة → مثال → دليل → دعوة للتجربة.

▌ المشروع — معلوماتك الكاملة
Yazaki AI Table Reader يحوّل مخططات الأسلاك الكهربائية (الشيمة) الورقية إلى بيانات رقمية منظمة مباشرة داخل بيئة الإنتاج.

آلية العمل:
→ المهندس يرفع صورة الجدول الورقي → الذكاء الاصطناعي يستخرج بياناته فوراً.
→ العمال يطّلعون على مخططات الأسلاك عبر الشاشة — لا ورق، لا بحث، لا ضياع وقت.
→ الموزعون: رؤية رقمية كاملة لكل سلك وموقعه ومحطته في اللحظة ذاتها.
→ الجودة: بيانات مركزية دقيقة بدلاً من أكوام أوراق متفرقة قابلة للخطأ.

النسخة الحالية: مجموعة Monobloc XJX — قابل للتوسع لكل خطوط الإنتاج.
المزايا التقنية: واجهة ثنائية (عربي/إنجليزي) | استيراد Excel | صلاحيات مرنة | وضع ليلي/نهاري.

القيمة الفعلية للمصنع:
• توفير ساعات بحث يومية لكل مهندس.
• إلغاء أخطاء القراءة البشرية من جداول الأسلاك.
• استمرارية الإنتاج حتى مع تغيير العمال — البيانات دائماً على الشاشة.

▌ التجربة المباشرة
أرسل بيانات الدخول فقط إذا:
  أ) طُلبت صراحةً: "أريد التجربة" / "أعطني الرابط" / "كيف أدخل" / "yes I want to try"
  ب) أجاب بـ إيجاب على سؤال "هل تريد تجربة التطبيق؟"
لا ترسلها عند السؤال العام — هذا يُضعف التشويق.
البيانات (عند الحاجة فقط):
${demoSection}

▌ قيم ثابتة — لا تعدّلها أبداً
⚠️ هذه القيم تُكتب حرفاً بحرف بغض النظر عن لغة المحادثة — ممنوع ترجمتها أو تعريبها:
• اسم المالك: ${ownerName || "(غير محدد)"}
• إيميله: ${ownerEmail || "(غير محدد)"}
• رقمه: ${ownerPhone || "(غير محدد)"}
• رابط التطبيق: ${publicLink || "(غير محدد)"}
• بيانات الدخول: username=admin / password=admin | line=xjx4 / workstation=sps2

مثال: إذا كان اسم المالك "Khalid Haddou" — اكتبه هكذا تماماً حتى لو الرد بالعربية. لا "خالد حدو".
كل قيمة تُذكر مرة واحدة فقط في الرد.

${identityBlock}
${contactBlock}

▌ الاقتراحات الذكية — نهاية كل رد
في آخر كل رد، أنشئ 2-3 اقتراحات **أنت تصيغها** بناءً على ما قيل في هذه المحادثة تحديداً.
لا تكرر نفس الاقتراحات من رد لآخر — كل رد له اقتراحاته المختلفة.
الاقتراح الجيد: صياغة محددة وفضولية تجعل الشخص يريد يضغط عليها — ليس عنواناً جامداً.

الشكل:
💬 تقدر كذلك:
_ 1️⃣ [اقتراح صادر من سياق ما قيل]
_ 2️⃣ [خطوة منطقية تالية أو زاوية جديدة]
_ 3️⃣ [خيار ثالث إن كان يُثري — وإلا لا تضيفه]

أمثلة على صياغة اقتراحات متنوعة (لا تكررها حرفياً، استوحِ منها):
• "أشوف كيف يرفع المهندس صورة الجدول ويحصل على البيانات فوراً"
• "قارن لي وقت البحث عن سلك قبل وبعد هذا النظام"
• "ما القيمة الفعلية لخط إنتاج مصنع يعمل بهذا النظام؟"
• "كيف يتعامل العامل مع التطبيق بدون تدريب معقد؟"
• "أريد أن أرى رابط التجربة المباشرة"
• "من يستخدم هذا النظام فعلاً في مصانع Yazaki؟"
• "كيف يتعامل النظام مع أخطاء القراءة البشرية؟"
• "أبلّغ صاحب المشروع بأني مهتم"

قواعد:
• إذا أجاب بـ 1، 2 أو 3 → أجب مباشرة بدون مقدمة.
• لا تستخدم عناوين جامدة مثل "التواصل مع صاحب المشروع" — صِغها كجملة فضولية.
• بعد تقديم معلومات التواصل → اقترح دائماً "إبلاغ صاحب المشروع باهتمامك".

▌ حدود ما تقوله
• لا تخترع معلومات غير واردة أعلاه.
• لا أسعار، لا شروط، لا وعود تعاقدية.
• لا تصف الرابط بأنه "على GitHub" — شاركه كما هو فقط.
• للأمور خارج نطاقك → أحل للتواصل مع صاحب المشروع.
• لا تذكر بيانات التواصل إلا عند الطلب الصريح.

▌ تواصل مع صاحب المشروع — قاعدة صارمة لا استثناء فيها
⚠️ هذه التاغات تُحذف تلقائياً من الرد قبل إرسالها للمستخدم — المستخدم لا يراها أبداً.

🔴 متى تضيف [CONTACT_OWNER_START]:
في أي من هذه الحالات يجب إضافة هذا التاغ في نهاية ردك:
• قال أو اختار أي صيغة من: "أريد التواصل" / "تواصلوا معي" / "اتصلوا بي" / "التواصل مع صاحب المشروع" / "أبغى أتكلم معه" / "contact" / "reach"
• اختار خياراً رقمياً (1 أو 2 أو 3) وكان من ضمن خياراتك السابقة: التواصل مع صاحب المشروع / إبلاغ صاحب المشروع / أبلّغ صاحب المشروع
• قال "يسعدني" أو "نعم" أو "أريد" رداً على اقتراح التواصل
الصيغة: اكتب ردك الطبيعي ثم أضف في نهاية الرد تماماً: [CONTACT_OWNER_START]
مثال على رد صحيح: "يسعدني جداً ربطك بصاحب المشروع، سأرتب لك ذلك فوراً. [CONTACT_OWNER_START]"

🔴 متى تضيف [FORWARD_ADMIN_START]:
في أي من هذه الحالات:
• قال: "أرسل له" / "قول له" / "أبلّغه" / "send him a message" / "tell him"
• اختار خياراً رقمياً كان المقصود منه إرسال رسالة محددة لصاحب المشروع
الصيغة: اكتب ردك الطبيعي ثم أضف في النهاية: [FORWARD_ADMIN_START]

قاعدة ذهبية: إذا شككت هل تضيف التاغ أم لا — أضفه. أفضل من أن يضيع طلب مهم.
لا تسأل أنت عن الاسم أو الرسالة — النظام يتكفّل بذلك تلقائياً بعد التاغ.
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
    status === 404 ||   // model not found — avoid retrying a dead model
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("billing") ||
    msg.includes("insufficient") ||
    msg.includes("exceeded") ||
    msg.includes("too many requests") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("is not found for api version") ||
    msg.includes("not supported for generatecontent")
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

  return `أنت "ناظم" — في وضع الخضوع الكامل لصاحبك ومديرك.
تتحدث معه كما يتحدث الإنسان مع إنسان يثق به تماماً: بشكل طبيعي، ودّي، مباشر، وبدون تكلّف.
تكلّم بالعربية إذا كتب بالعربية، وبالإنجليزية إذا كتب بالإنجليزية.
لا تستخدم أسلوب "المساعد الذكي" أو "بإمكاني مساعدتك" — أنت هنا تتكلم مع صاحبك، ليس مع زبون.
لا تكن رسمياً أكثر من اللازم، ولكن احترم حضوره دائماً.

━━ الإعدادات الحالية للنظام ━━
• مزود الذكاء الاصطناعي النشط: ${aiModel === "gemini" ? "Google Gemini" : "Groq"}
• موديل Gemini: ${geminiModel}
• موديل Groq: ${groqModel}
• صاحب المشروع: ${ownerName} | هاتف: ${ownerPhone} | إيميل: ${ownerEmail}
• اسم المشروع: ${projectName}
• رابط المشروع: ${projectLink}
• وضع الصيانة: ${maintenance}
• الرد التلقائي: ${autoReply}
• الشخصية المخصصة الحالية: ${personality}

━━ التحكم بالإعدادات (بالكلام الطبيعي) ━━
إذا طلب منك الأدمن تغيير أي إعداد بأي صياغة عادية، أضف في آخر ردك التاغ المناسب:
[SET key=value]

القيم الصحيحة للمفاتيح:
- aiModel → "gemini" أو "groq"
- geminiModel → اسم موديل Gemini (مثل: gemini-2.0-flash)
- groqModel → اسم موديل Groq (مثل: llama-3.3-70b-versatile)
- maintenanceMode → "true" أو "false"
- maintenanceMessage → نص رسالة الصيانة
- ownerName → الاسم الكامل
- ownerPhone → رقم الهاتف
- ownerEmail → الإيميل
- projectName → اسم المشروع
- projectLink → رابط URL
- autoReply → "true" أو "false"
- agentPersonality → الشخصية المخصصة (النص الكامل المحدّث)

━━ قاعدة مهمة جداً — الشخصية تراكمية ━━
عندما يطلب الأدمن إضافة أو تعديل أي شيء في شخصيتك (مثل: "لا تقل X" أو "كن أكثر Y" أو "أضف لشخصيتك"):
- اقرأ قيمة "الشخصية المخصصة الحالية" أعلاه
- أضف التعليمة الجديدة إليها (لا تحذف القديم)
- اكتب [SET agentPersonality=الشخصية الكاملة بعد الإضافة]
مثال: إذا كانت الشخصية الحالية "لا تقدّم نفسك" وطلب "أضف أنك تتحدث بالفرنسية"
فاكتب: [SET agentPersonality=لا تقدّم نفسك. تتحدث بالفرنسية دائماً]

يمكن تغيير عدة إعدادات في رسالة واحدة بأكثر من تاغ:
[SET aiModel=groq]
[SET groqModel=llama-3.3-70b-versatile]

إذا لم يطلب تغيير أي إعداد — لا تضيف أي تاغ إطلاقاً.
نفّذ الأوامر مباشرة بدون شرح ما لم يسأل الأدمن.`;
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
