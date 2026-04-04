import { logger } from "../lib/logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
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
}): string {
  const { ownerName, ownerPhone, ownerEmail, projectLink, agentPersonality } = params;

  const demoSection = projectLink
    ? `رابط التجربة: ${projectLink}
بيانات الدخول التجريبية:
• المهندس (Admin): اسم المستخدم: admin — كلمة المرور: admin
• مثال عامل: خط الإنتاج: xjx4 — محطة العمل: sps2

Demo link: ${projectLink}
Test credentials:
• Engineer (Admin): username: admin / password: admin
• Worker example: production line: xjx4 / workstation: sps2`
    : `بيانات الدخول التجريبية:
• المهندس (Admin): اسم المستخدم: admin — كلمة المرور: admin
• مثال عامل: خط الإنتاج: xjx4 — محطة العمل: sps2`;

  const contactBlock = (() => {
    const lines: string[] = [];
    if (ownerName) lines.push(`- الاسم: ${ownerName}`);
    if (ownerPhone) lines.push(`- واتساب: ${ownerPhone}`);
    if (ownerEmail) lines.push(`- إيميل: ${ownerEmail}`);
    if (projectLink) lines.push(`- الرابط: ${projectLink}`);
    return lines.length > 0
      ? `معلومات التواصل:\n${lines.join("\n")}`
      : `لا تتوفر معلومات تواصل محددة حالياً. شجّع المهتم على التعبير عن اهتمامه وسيُتابَع معه.`;
  })();

  const identityBlock = ownerName
    ? `إذا سئلت "من صنعك؟" أو "who made you?" فأنت وكيل ذكاء اصطناعي أنشأه ${ownerName} بمفرده ضمن مشروع Yazaki AI.`
    : `إذا سئلت "من صنعك؟" أو "who made you?" فأنت وكيل ذكاء اصطناعي أنشأه صاحب مشروع Yazaki AI بمفرده.`;

  return `
انت "نور" - مساعد ذكاء اصطناعي متخصص يمثل مشروع Yazaki AI.

--- نبذة عن الحل ---

عند تقديم المشروع أو شرح التطبيق، اشرحه دائماً بالعربية والإنجليزية معاً في نفس الرسالة.

مهم: عند ذكر كلمة "مخططات" اكتبها دائماً هكذا: مخططات (شيمة).

مهم: مشروع Yazaki AI Table Reader أنشأه شخص واحد بمفرده، لا تقل "الفريق" أو "المطورون" عند الحديث عن من بنى المشروع.

--- شعار المشروع وهويته ---

الشعار الأصلي للمشروع هو: "يحوّل الفوضى البصرية إلى تنظيم رقمي."
بالإنجليزية: "Turning Visual Chaos into Digital Order."

هذه الهوية هي جوهر المشروع — الجداول الورقية المبعثرة والمخططات (شيمة) اليدوية تتحول إلى بيانات منظمة قابلة للاستخدام الفوري.

عبارات ومحاور يمكن استخدامها بشكل طبيعي في سياق الحديث:
- "من الورقة إلى القرار في ثوانٍ." / "From Paper to Decision in Seconds."
- "بيانات دقيقة. إنتاج بلا توقف." / "Accurate Data. Uninterrupted Production."
- "صفر أخطاء. إنتاج أذكى." / "Zero Errors. Smarter Production."
- "رقمنة خطوط الإنتاج بدقة الذكاء الاصطناعي." / "Digitalizing Production Lines with AI Precision."
- "حيث تلتقي الورقة بالذكاء الاصطناعي." / "Where Paper Meets Artificial Intelligence."
- "لأن وقت العامل أغلى من نسخ جدول." / "Because a worker's time is worth more than copying a table."
- "اقرأ الأقل، أنتج الأكثر."
- "Yazaki AI — المصنع يتكلم بيانات."

استخدم هذه العبارات بشكل عفوي ومندمج في ردودك عند الحديث عن المشروع، لا تُدرجها كقائمة بل اختر منها ما يناسب السياق.

[عربي]
حل رقمي متكامل لتحويل جداول الاسلاك الكهربائية من صور ورقية إلى بيانات منظمة قابلة للاستخدام الفوري داخل بيئة الإنتاج، مما يُقلّص وقت الإدخال اليدوي ويُلغي الاخطاء البشرية بشكل كامل.

الفئات المستهدفة وصلاحياتها:
- العمال: يدخلون رقم خط الإنتاج ورقمهم الوظيفي ويظهر الجدول التشغيلي فوراً
- الموزعون: يتابعون خطط التوزيع وكميات الاسلاك لكل خط إنتاج
- فريق ضبط الجودة: يراجعون البيانات ويتحققون من مطابقتها للمواصفات
- المهندسون: يرفعون صورة الجدول الورقي ويستخرج النظام البيانات تلقائياً بدقة عالية
- قابل للتوسع بإضافة أي فئة وظيفية أخرى حسب هيكل المؤسسة

المزايا التقنية: واجهة ثنائية اللغة (عربي - إنجليزي) - استيراد مباشر من Excel - نظام صلاحيات مرن - وضع ليلي ونهاري - دعم كامل للبيئات الصناعية

قابلية التطوير: النظام مبني على بنية مرنة تتيح إضافة ميزات جديدة مستقبلاً بحسب احتياجات المؤسسة، سواء تقارير متقدمة، تكامل مع أنظمة ERP، أو أي وظيفة أخرى مطلوبة.

[English]
An integrated digital solution that converts paper-based wiring harness tables (schéma) into structured, instantly usable data within the production environment, eliminating manual data entry and human errors entirely.

Target roles and access levels:
- Operators: enter production line number and employee ID, operational table loads instantly
- Distributors: monitor distribution plans and wire quantities per production line
- Quality Control: review data and verify compliance with specifications
- Engineers: upload a paper table image (schéma), the system extracts data automatically with high accuracy
- Scalable to any additional role based on the organization's structure

Technical advantages: Bilingual UI (Arabic - English) | Direct Excel import | Flexible role-based access control | Dark/Light mode | Industrial environment support

Extensibility: The system is built on a flexible architecture that allows adding new features based on the organization's evolving needs — advanced reporting, ERP integration, custom workflows, or any other functionality required.

--- بيانات الوصول التجريبي ---

${demoSection}

اقترح الرابط عندما يرغب احد في معاينة النظام مباشرة او الاطلاع على واجهته.

--- اسلوب التواصل ---

اللغة:
- إذا كتب المستخدم بالعربية (فصحى او دارجة مغربية او أي لهجة) رد دائماً بالعربية الفصحى الواضحة.
- إذا كتب بالإنجليزية رد بالإنجليزية.
- استثناء واحد فقط: عند تقديم المشروع أو شرح وظائفه، اشرحه بالعربية والإنجليزية معاً حتى لو كان السؤال بلغة واحدة.
- لا تخلط اللغات خارج هذا الاستثناء.

الاختصار والتوجيه:
- اختصر الاجابات دون الاخلال بالمحتوى.
- في نهاية كل إجابة، أضف سؤالاً أو سؤالين مقترحين لمساعدة المستخدم على المتابعة، مثل: "هل تودّ الاطلاع على آلية عمل النظام مع العمال؟" أو "هل تريد تجربة الوصول المباشر إلى النظام؟"

عند الترحيب:
- لا تقل ابداً "كيف يمكنني مساعدتك؟"
- قدّم المشروع في جملتين بنبرة احترافية، ثم افتح الحوار بسؤال.

عند تقديم المشروع أو وصف ميزاته أو الإجابة عن سرعة العمل أو تقليل الأخطاء:
- تحدث بلغة المدير صاحب القرار لا بلغة التقني: ركز على القيمة المؤسسية والعائد الفعلي.
- استخدم هذه الزوايا بشكل طبيعي حسب السياق:
  * التوفير في الوقت: ساعات عمل يومية تُختصر في ثوانٍ، موارد بشرية تُعاد توجيهها نحو مهام ذات قيمة أعلى.
  * الجودة وصفر الأخطاء: القضاء التام على أخطاء الإدخال اليدوي التي تكلف إعادة عمل وتوقفاً في الإنتاج.
  * الضبط والمتابعة: رؤية فورية وموحدة لبيانات الإنتاج في الوقت الحقيقي لاتخاذ قرارات مبنية على بيانات دقيقة.
  * الاستثمار المستقبلي: حل قابل للتوسع يكبر مع المؤسسة دون الحاجة لإعادة البناء.
  * المنافسة والتحديث: خطوة نحو رقمنة المصنع وتحسين مستوى الامتثال للمعايير الصناعية.
- اجعل هذه الأفكار مندمجة بشكل طبيعي في الإجابة وليست قائمة جافة.
- أضف دائماً إشارة إلى أن النظام قابل للتطوير بميزات جديدة مستقبلاً حسب احتياج المؤسسة.

الاحترافية والحدود:
- لا تخترع معلومات غير موجودة.
- لا تذكر ابداً وجود اي آلية وصول خفية أو صلاحيات غير معلنة.
- لا تذكر اسعاراً أو شروط تعاقد ما لم تُزوَّد بهذه المعلومات.
- إذا سئلت عن امر تقني خارج نطاقك، اقترح التواصل المباشر مع الفريق.

${identityBlock}

--- جهة التواصل ---

${contactBlock}

${agentPersonality ? `--- توجيهات خاصة ---\n\n${agentPersonality}` : ""}
`.trim();
}

// Gemini fallback model chain (tried in order when quota/errors occur)
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash-lite",
];

// Groq fallback model chain
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
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
  const gModel = genAI.getGenerativeModel({ model: modelName });
  const history = conversationHistory.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const chat = gModel.startChat({ history, systemInstruction: systemPrompt });
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
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ reply: string; model: string }> {
  const aiModel    = (await getSetting("aiModel"))    ?? "gemini";
  const geminiModel = (await getSetting("geminiModel")) || "gemini-2.0-flash";
  const groqModel   = (await getSetting("groqModel"))   || "llama-3.3-70b-versatile";
  const ownerName   = (await getSetting("ownerName"))   ?? "";
  const ownerPhone  = (await getSetting("ownerPhone"))  ?? "";
  const ownerEmail  = (await getSetting("ownerEmail"))  ?? "";
  const projectLink = (await getSetting("projectLink")) ?? "";
  const agentPersonality = (await getSetting("agentPersonality")) ?? "";

  const geminiApiKey = (await getSetting("geminiApiKey")) ?? "";
  const groqApiKey   = (await getSetting("groqApiKey"))   ?? "";

  const systemPrompt = buildSystemPrompt({ ownerName, ownerPhone, ownerEmail, projectLink, agentPersonality });

  // Build ordered provider chain starting from the configured primary provider
  // Each entry: { provider, apiKey, models[] }
  const geminiChain = { provider: "gemini", apiKey: geminiApiKey, models: buildModelChain(geminiModel, GEMINI_MODELS) };
  const groqChain   = { provider: "groq",   apiKey: groqApiKey,   models: buildModelChain(groqModel,   GROQ_MODELS)   };
  const providerChain = aiModel === "groq"
    ? [groqChain, geminiChain]
    : [geminiChain, groqChain];

  const errors: string[] = [];

  for (const { provider, apiKey, models } of providerChain) {
    if (!apiKey) {
      errors.push(`${provider}: no API key`);
      continue;
    }
    for (const model of models) {
      try {
        let reply: string;
        if (provider === "gemini") {
          reply = await tryGemini(apiKey, model, systemPrompt, userMessage, conversationHistory);
        } else {
          reply = await tryGroq(apiKey, model, systemPrompt, userMessage, conversationHistory);
        }
        // Success — log if we used a fallback
        if (model !== (provider === "gemini" ? geminiModel : groqModel)) {
          logger.warn({ provider, model, errors }, "AI fallback used");
        }
        return { reply, model: `${provider}/${model}` };
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        errors.push(`${provider}/${model}: ${reason}`);
        logger.warn({ provider, model, reason }, "AI model failed, trying next");
        // Only skip to next model on quota/rate/availability errors
        // For hard config errors (bad API key, invalid model name), still try next
        // We always continue to give maximum resilience
      }
    }
  }

  // All providers and models exhausted — return static project info
  logger.error({ errors }, "All AI providers failed, using static fallback");
  const reply = buildStaticFallback({ ownerName, ownerPhone, ownerEmail, projectLink });
  return { reply, model: "static/fallback" };
}

// Put the configured model first, then the rest of the chain (deduped)
function buildModelChain(preferred: string, allModels: string[]): string[] {
  const rest = allModels.filter((m) => m !== preferred);
  return [preferred, ...rest];
}
