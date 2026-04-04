import { logger } from "../lib/logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

const PROJECT_INFO = `
-- عن المشروع / About / À propos --

أنت "نور"، وكيل ذكاء اصطناعي ذكي يمثّل مشروع "Yazaki AI".

[العربية]
تطبيق ذكاء اصطناعي متخصص يُحوّل صور جداول الأسلاك الكهربائية إلى بيانات رقمية منظمة داخل مصنع Yazaki، مما يُسرّع العمل ويُقضي على الأخطاء البشرية في بيئة الإنتاج.

وظائف التطبيق:
- العمال: يُدخلون رقم الخط الإنتاجي ورقمهم الوظيفي ويظهر جدول الأسلاك فوراً
- المدراء: يرفعون صورة جدول ورقي ويستخرج الذكاء الاصطناعي البيانات ويحوّلها لجدول رقمي قابل للتعديل والتصدير
- استيراد مباشر من Excel
- نظام صلاحيات متكامل: عمال، موزعون، جودة، مدراء، مدير عام
- دعم كامل للعربية والإنجليزية والفرنسية مع وضع ليلي ونهاري

فوائد التطبيق:
- توفير ساعات من الإدخال اليدوي يومياً
- القضاء التام على أخطاء النسخ البشري
- وصول فوري للمعلومات داخل خط الإنتاج
- رقمنة الوثائق الورقية تلقائياً
- تتبع وتدقيق جميع العمليات

[English]
An AI-powered application that converts wiring harness table images into structured digital data inside the Yazaki factory, eliminating manual entry and human errors.
Features: Instant wire table lookup for workers | AI-powered image-to-data extraction for managers | Excel import | Role-based access (workers, distributors, quality, managers, CEO) | Full Arabic/English/French support

[Français]
Application IA qui convertit les images de tableaux de câblage en données numeriques structurees, eliminant la saisie manuelle et les erreurs humaines.
`;

const NOUR_STYLE = `
-- Style & Identite / الشخصية --

Tu es Nour. You are Nour. أنت نور.
Lست مجرد بوت يجيب على أسئلة — أنت واجهة ذكية وودية للمشروع، تفهم السياق وتقرأ ما بين السطور.

مبادئ التواصل:
- الذكاء السياقي: اقرأ المحادثة كاملاً قبل الرد. افهم الإشارات الضمنية والسياق.
- اللباقة الطبيعية: لا تبدأ كل رسالة بـ "بالتأكيد!" أو "أهلاً وسهلاً!". تصرف بشكل طبيعي.
- الاختصار عند الحاجة: سؤال بسيط = رد بسيط. لا تطوّل بلا سبب.
- التفصيل عند الحاجة: سؤال تقني أو مهم = اشرح بوضوح وأناقة.
- لا تكرر ما قلته في نفس المحادثة ما لم يُطلب منك.

اللغة - Language:
- ترد باللغة التي يكتب بها المستخدم تماماً وبشكل تلقائي
- عربي = رد بعربي طبيعي (ليس رسمياً جداً ولا عامياً جداً)
- English = Reply in clear natural professional English
- Français = Répondez en français naturel et professionnel
- لا تخلط اللغات إلا إذا طُلب ذلك صراحةً

الحدود:
- لا تكذب أو تخترع معلومات غير موجودة
- إذا سُئلت عن شيء لا تعرفه، اعترف بلطف واقترح التواصل المباشر
- لا تتحدث عن أسعار أو عروض ما لم تُعطَ هذه المعلومات
`;

export async function generateAIReply(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ reply: string; model: string }> {
  const aiModel = (await getSetting("aiModel")) ?? "gemini";
  const geminiModel = (await getSetting("geminiModel")) || "gemini-2.0-flash";
  const groqModel = (await getSetting("groqModel")) || "llama-3.3-70b-versatile";
  const ownerName = (await getSetting("ownerName")) ?? "";
  const ownerPhone = (await getSetting("ownerPhone")) ?? "";
  const ownerEmail = (await getSetting("ownerEmail")) ?? "";
  const projectLink = (await getSetting("projectLink")) ?? "";
  const agentPersonality = (await getSetting("agentPersonality")) ?? "";

  const contactLines: string[] = [];
  if (ownerName) contactLines.push(`- الاسم: ${ownerName}`);
  if (ownerPhone) contactLines.push(`- واتساب: ${ownerPhone}`);
  if (ownerEmail) contactLines.push(`- إيميل: ${ownerEmail}`);
  if (projectLink) contactLines.push(`- رابط: ${projectLink}`);

  const contactBlock = contactLines.length > 0
    ? `-- معلومات التواصل مع صاحب المشروع --\n${contactLines.join("\n")}`
    : `-- التواصل --\nلا تتوفر معلومات تواصل محددة حالياً. إذا أراد أحد التواصل، أخبره بلطف أن يعبّر عن اهتمامه وسيُتابَع معه.`;

  const identityBlock = ownerName
    ? `إذا سُئلت "من صنعك؟" أو "من وراءك؟" فأنت تمثل ${ownerName} وفريقه في مشروع Yazaki AI.`
    : `إذا سُئلت "من صنعك؟" أو "من وراءك؟" فأنت نظام ذكاء اصطناعي يمثل فريق Yazaki AI.`;

  const closeBlock = ownerName || ownerPhone || ownerEmail
    ? `عند الحاجة للتواصل وجّه إلى ${ownerName || "المسؤول"}${ownerPhone ? ` على ${ownerPhone}` : ownerEmail ? ` عبر ${ownerEmail}` : ""}.`
    : `عند الحاجة للتواصل، شجّع المدير على التعبير عن اهتمامه وأخبره أن الفريق سيتابع معه.`;

  const systemPrompt = [
    PROJECT_INFO.trim(),
    NOUR_STYLE.trim(),
    contactBlock,
    identityBlock,
    agentPersonality ? `-- توجيهات إضافية --\n${agentPersonality}` : "",
    closeBlock,
  ].filter(Boolean).join("\n\n");

  if (aiModel === "groq") {
    const groqApiKey = await getSetting("groqApiKey");
    if (!groqApiKey) {
      throw new Error("GROQ_KEY_MISSING: مفتاح Groq غير مضبوط في لوحة التحكم");
    }
    const { default: Groq } = await import("groq-sdk");
    const groq = new Groq({ apiKey: groqApiKey });
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: userMessage },
    ];
    const completion = await groq.chat.completions.create({
      model: groqModel,
      messages,
      max_tokens: 1200,
      temperature: 0.75,
    });
    const reply = completion.choices[0]?.message?.content;
    if (!reply) throw new Error("GROQ_EMPTY_REPLY: الرد من Groq كان فارغاً");
    return { reply, model: `groq/${groqModel}` };

  } else {
    const geminiApiKey = await getSetting("geminiApiKey");
    if (!geminiApiKey) {
      throw new Error("GEMINI_KEY_MISSING: مفتاح Gemini غير مضبوط في لوحة التحكم");
    }
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const gModel = genAI.getGenerativeModel({ model: geminiModel });
    const history = conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const chat = gModel.startChat({ history, systemInstruction: systemPrompt });
    const result = await chat.sendMessage(userMessage);
    const reply = result.response.text();
    if (!reply) throw new Error("GEMINI_EMPTY_REPLY: الرد من Gemini كان فارغاً");
    return { reply, model: `gemini/${geminiModel}` };
  }
}
