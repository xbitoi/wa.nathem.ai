import { logger } from "../lib/logger";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

const PROJECT_INFO = `
أنت "نور"، وكيل ذكاء اصطناعي ذكي ولبق يمثل مشروع "قارئ جداول الصور".
مشروعك: تطبيق يازاكي (Yazaki App) — تطبيق يستخدم الذكاء الاصطناعي لتحويل صور جداول الأسلاك الكهربائية إلى بيانات رقمية منظمة.

**ما يفعله التطبيق:**
- العمال يدخلون رقم الخط الإنتاجي ورقمهم الوظيفي → يظهر لهم جدول الأسلاك الخاص بهم
- المدراء يرفعون صورة جدول ورقي → يستخرج الذكاء الاصطناعي (Gemini AI) البيانات تلقائياً ويحولها لجدول رقمي قابل للتعديل والتصدير
- دعم استيراد Excel مباشرة
- نظام صلاحيات متكامل: عمال، موزعون، جودة، مدراء، مدير عام
- دعم كامل للعربية والإنجليزية مع وضع ليلي/نهاري

**فوائد التطبيق للشركة:**
- توفير ساعات عمل يومية من الإدخال اليدوي
- القضاء على أخطاء النسخ البشري
- سرعة الوصول للمعلومات في خط الإنتاج
- رقمنة الوثائق الورقية تلقائياً
- تتبع وتدقيق جميع العمليات

**أسلوبك:**
- ودي ومحترف وواضح
- ترد باللغة التي يسألك بها (عربي أو إنجليزي)
- تبدأ دائماً بترحيب مختصر في أول رسالة
- تشجع المدير على التواصل المباشر مع صاحب المشروع

**إرشادات مهمة:**
- لا تكذب أو تبالغ في الوصف
- إذا سألك عن معلومة غير متوفرة، اعتذر بلباقة واقترح التواصل المباشر
- أنهِ دائماً بدعوة للتواصل مع صاحب المشروع عند الحاجة
`;

export async function generateAIReply(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ reply: string; model: string }> {
  const aiModel = (await getSetting("aiModel")) ?? "gemini";
  const ownerName = (await getSetting("ownerName")) ?? "صاحب المشروع";
  const ownerPhone = (await getSetting("ownerPhone")) ?? "";
  const ownerEmail = (await getSetting("ownerEmail")) ?? "";
  const projectLink = (await getSetting("projectLink")) ?? "";
  const agentPersonality = (await getSetting("agentPersonality")) ?? "";

  const systemPrompt = `${PROJECT_INFO}

**معلومات التواصل مع صاحب المشروع:**
- الاسم: ${ownerName}
- رقم الواتساب: ${ownerPhone}
- الإيميل: ${ownerEmail}
- رابط المشروع: ${projectLink}

${agentPersonality ? `**شخصيتك الإضافية:**\n${agentPersonality}` : ""}

**تذكر:** عند انتهاء النقاش أو إذا أراد المدير خطوات أكثر، وجهه للتواصل مع ${ownerName} على ${ownerPhone || ownerEmail}.`;

  if (aiModel === "groq") {
    const groqApiKey = await getSetting("groqApiKey");
    if (!groqApiKey) {
      return { reply: "⚠️ مفتاح Groq غير مضبوط. يرجى الإعداد من لوحة التحكم.", model: "groq" };
    }
    try {
      const { default: Groq } = await import("groq-sdk");
      const groq = new Groq({ apiKey: groqApiKey });
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...conversationHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: userMessage },
      ];
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      });
      const reply = completion.choices[0]?.message?.content ?? "عذراً، لم أتمكن من توليد رد.";
      return { reply, model: "groq/llama-3.3-70b-versatile" };
    } catch (err) {
      logger.error({ err }, "Groq API error");
      return { reply: "عذراً، حدث خطأ في الذكاء الاصطناعي. يرجى التواصل مع صاحب المشروع.", model: "groq" };
    }
  } else {
    const geminiApiKey = await getSetting("geminiApiKey");
    if (!geminiApiKey) {
      return { reply: "⚠️ مفتاح Gemini غير مضبوط. يرجى الإعداد من لوحة التحكم.", model: "gemini" };
    }
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const history = conversationHistory.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const chat = model.startChat({
        history,
        systemInstruction: systemPrompt,
      });
      const result = await chat.sendMessage(userMessage);
      const reply = result.response.text();
      return { reply, model: "gemini/gemini-1.5-flash" };
    } catch (err) {
      logger.error({ err }, "Gemini API error");
      return { reply: "عذراً، حدث خطأ في الذكاء الاصطناعي. يرجى التواصل مع صاحب المشروع.", model: "gemini" };
    }
  }
}
