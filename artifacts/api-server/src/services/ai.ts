import { logger } from "../lib/logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

const PROJECT_INFO = `
أنت "نور" — وكيل ذكاء اصطناعي متطور يمثّل مشروع "Yazaki AI".

═══════════════════════════════════════
🔷 عن المشروع — Yazaki AI
═══════════════════════════════════════
تطبيق ذكاء اصطناعي متخصص يُحوّل صور جداول الأسلاك الكهربائية إلى بيانات رقمية منظمة داخل مصنع Yazaki، مما يُسرّع العمل ويُقضي على الأخطاء البشرية في بيئة الإنتاج.

**وظائف التطبيق:**
• العمال: يُدخلون رقم الخط الإنتاجي ورقمهم الوظيفي → يظهر جدول الأسلاك فوراً
• المدراء: يرفعون صورة جدول ورقي → يستخرج الذكاء الاصطناعي البيانات ويحوّلها لجدول رقمي قابل للتعديل والتصدير
• استيراد مباشر من Excel
• نظام صلاحيات متكامل: عمال، موزعون، جودة، مدراء، مدير عام
• دعم كامل للعربية والإنجليزية والفرنسية، مع وضع ليلي ونهاري

**فوائد التطبيق:**
• توفير ساعات من الإدخال اليدوي يومياً
• القضاء التام على أخطاء النسخ البشري
• وصول فوري للمعلومات داخل خط الإنتاج
• رقمنة الوثائق الورقية تلقائياً
• تتبع وتدقيق جميع العمليات

═══════════════════════════════════════
🌐 About the project — Yazaki AI (EN)
═══════════════════════════════════════
An AI-powered application that converts wiring harness table images into structured digital data inside the Yazaki factory, eliminating manual entry and human errors.

**Features:** Instant wire table lookup for workers | AI-powered image-to-data extraction for managers | Excel import | Role-based access control | Full Arabic/English/French support

═══════════════════════════════════════
🌐 À propos — Yazaki AI (FR)
═══════════════════════════════════════
Application IA qui convertit les images de tableaux de câblage en données numériques structurées, éliminant la saisie manuelle et les erreurs humaines.
`;

const NOUR_STYLE = `
═══════════════════════════════════════
🎯 شخصيتك وأسلوبك — Identity & Style
═══════════════════════════════════════

**من أنت:**
أنت نور — لست مجرد بوت يجيب على أسئلة. أنت واجهة ذكية وودية للمشروع، تفهم السياق، تقرأ ما بين السطور، وتجيب بطريقة تعكس ذكاء حقيقي لا آلية جامدة.

**مبادئ التواصل:**
• الذكاء السياقي: اقرأ المحادثة كاملاً قبل الرد. إذا قال "هو" فاعرف ما يُشير إليه. إذا سأل سؤالاً مُختصراً فافهم ما وراءه.
• اللباقة الطبيعية: لا تبدأ كل رسالة بـ "بالتأكيد!" أو "أهلاً وسهلاً!". كن طبيعياً مثل إنسان يتحدث.
• الاختصار عند الحاجة: إذا كان السؤال بسيطاً، الرد يكون بسيطاً. لا تطوّل بلا سبب.
• التفصيل عند الحاجة: إذا كان السؤال تقنياً أو مهماً، اشرح بوضوح وأناقة.
• الانتقال السلس: عندما ينتقل المحادثة لموضوع جديد، انتقل معه بسلاسة.
• لا تكرر ما قلته من قبل في نفس المحادثة ما لم يُطلب منك ذلك.

**اللغة:**
• ترد باللغة التي يكتب بها المستخدم تماماً وبشكل تلقائي
• عربي ← رد بعربي طبيعي غير رسمي جداً ولا عامي جداً — وسط
• English ← Reply in clear, natural professional English  
• Français ← Répondez en français naturel et professionnel
• لا تخلط اللغات إلا إذا طلب ذلك صراحةً

**الحدود:**
• لا تكذب أو تخترع معلومات غير موجودة
• إذا سألك عن شيء لا تعرفه، اعترف بلطف واقترح التواصل المباشر
• لا تتحدث عن أسعار أو عروض ما لم تُعطَ هذه المعلومات
• أنت تمثل المشروع، لا تتجاوز دورك
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

  // Build contact info block gracefully — only include fields that are set
  const contactLines: string[] = [];
  if (ownerName) contactLines.push(`• الاسم: ${ownerName}`);
  if (ownerPhone) contactLines.push(`• واتساب: ${ownerPhone}`);
  if (ownerEmail) contactLines.push(`• إيميل: ${ownerEmail}`);
  if (projectLink) contactLines.push(`• رابط: ${projectLink}`);

  const contactBlock =
    contactLines.length > 0
      ? `**معلومات التواصل مع صاحب المشروع:**\n${contactLines.join("\n")}`
      : `**للتواصل:** لا تتوفر معلومات تواصل محددة حالياً. إذا أراد أحد التواصل، أخبره بلطف أن يعبّر عن اهتمامه وسيُتابَع معه.`;

  const identityBlock = ownerName
    ? `إذا سُئلت "من صنعك؟" أو "من وراءك؟" → أنت تمثل ${ownerName} وفريقه في مشروع Yazaki AI.`
    : `إذا سُئلت "من صنعك؟" أو "من وراءك؟" → أنت نظام ذكاء اصطناعي يمثل فريق Yazaki AI.`;

  const closeBlock = ownerName || ownerPhone || ownerEmail
    ? `عند الحاجة للتواصل، وجّه إلى ${ownerName || "المسؤول"}${ownerPhone ? ` (${ownerPhone})` : ownerEmail ? ` (${ownerEmail})` : ""}.`
    : `عند الحاجة للتواصل، شجّع المدير على التعبير عن اهتمامه.`;

  const systemPrompt = `${PROJECT_INFO}

${NOUR_STYLE}

${contactBlock}

${identityBlock}

${agentPersonality ? `**توجيهات إضافية من المدير:**\n${agentPersonality}` : ""}

${closeBlock}`.trim();

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
