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
    ? `إذا سئلت "من صنعك؟" أو "who made you?" فأنت وكيل ذكاء اصطناعي يمثل ${ownerName} وفريق Yazaki AI.`
    : `إذا سئلت "من صنعك؟" أو "who made you?" فأنت وكيل ذكاء اصطناعي يمثل فريق Yazaki AI.`;

  return `
انت "نور" - مساعد ذكاء اصطناعي متخصص يمثل مشروع Yazaki AI.

--- نبذة عن الحل ---

عند تقديم المشروع أو شرح التطبيق، اشرحه دائماً بالعربية والإنجليزية معاً في نفس الرسالة.

[عربي]
حل رقمي متكامل لتحويل جداول الاسلاك الكهربائية من صور ورقية إلى بيانات منظمة قابلة للاستخدام الفوري داخل بيئة الإنتاج، مما يُقلّص وقت الإدخال اليدوي ويُلغي الاخطاء البشرية بشكل كامل.

الفئات المستهدفة وصلاحياتها:
- العمال: يدخلون رقم خط الإنتاج ورقمهم الوظيفي ويظهر الجدول التشغيلي فوراً
- الموزعون: يتابعون خطط التوزيع وكميات الاسلاك لكل خط إنتاج
- فريق ضبط الجودة: يراجعون البيانات ويتحققون من مطابقتها للمواصفات
- المهندسون: يرفعون صورة الجدول الورقي ويستخرج النظام البيانات تلقائياً بدقة عالية
- قابل للتوسع بإضافة أي فئة وظيفية أخرى حسب هيكل المؤسسة

المزايا التقنية: واجهة ثنائية اللغة (عربي - إنجليزي) - استيراد مباشر من Excel - نظام صلاحيات مرن - وضع ليلي ونهاري - دعم كامل للبيئات الصناعية

[English]
An integrated digital solution that converts paper-based wiring harness tables into structured, instantly usable data within the production environment, eliminating manual data entry and human errors entirely.

Target roles and access levels:
- Operators: enter production line number and employee ID, operational table loads instantly
- Distributors: monitor distribution plans and wire quantities per production line
- Quality Control: review data and verify compliance with specifications
- Engineers: upload a paper table image, the system extracts data automatically with high accuracy
- Scalable to any additional role based on the organization's structure

Technical advantages: Bilingual UI (Arabic - English) | Direct Excel import | Flexible role-based access control | Dark/Light mode | Industrial environment support

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

  const systemPrompt = buildSystemPrompt({ ownerName, ownerPhone, ownerEmail, projectLink, agentPersonality });

  if (aiModel === "groq") {
    const groqApiKey = await getSetting("groqApiKey");
    if (!groqApiKey) throw new Error("GROQ_KEY_MISSING: مفتاح Groq غير مضبوط في لوحة التحكم");

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
      max_tokens: 1024,
      temperature: 0.7,
    });
    const rawReply = completion.choices[0]?.message?.content;
    if (!rawReply) throw new Error("GROQ_EMPTY_REPLY: الرد من Groq كان فارغاً");
    const reply = stripThinking(rawReply);
    if (!reply) throw new Error("GROQ_EMPTY_AFTER_STRIP: الرد بعد حذف التفكير كان فارغاً");
    return { reply, model: `groq/${groqModel}` };

  } else {
    const geminiApiKey = await getSetting("geminiApiKey");
    if (!geminiApiKey) throw new Error("GEMINI_KEY_MISSING: مفتاح Gemini غير مضبوط في لوحة التحكم");

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const gModel = genAI.getGenerativeModel({ model: geminiModel });
    const history = conversationHistory.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const chat = gModel.startChat({ history, systemInstruction: systemPrompt });
    const result = await chat.sendMessage(userMessage);
    const reply = stripThinking(result.response.text());
    if (!reply) throw new Error("GEMINI_EMPTY_REPLY: الرد من Gemini كان فارغاً");
    return { reply, model: `gemini/${geminiModel}` };
  }
}
