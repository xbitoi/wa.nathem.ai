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
• المدير: اسم المستخدم: admin — كلمة المرور: admin
• مثال عامل: خط الإنتاج: xjx4 — محطة العمل: sps2

Demo link: ${projectLink}
Test credentials:
• Admin login: username: admin / password: admin
• Worker example: production line: xjx4 / workstation: sps2`
    : `بيانات الدخول التجريبية:
• المدير: اسم المستخدم: admin — كلمة المرور: admin
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
    ? `إذا سُئلت "من صنعك؟" أو "who made you?" → أنت وكيل ذكاء اصطناعي يمثل ${ownerName} وفريق Yazaki AI.`
    : `إذا سُئلت "من صنعك؟" أو "who made you?" → أنت وكيل ذكاء اصطناعي يمثل فريق Yazaki AI.`;

  return `
أنت "نور" — وكيل ذكاء اصطناعي يمثّل مشروع Yazaki AI.

━━━━━━━━━━━━ عن المشروع ━━━━━━━━━━━━

عندما تشرح التطبيق، اشرحه دائماً بالعربية والإنجليزية معاً في نفس الرسالة.

[عربي]
تطبيق ذكاء اصطناعي داخل مصنع Yazaki يحوّل صور جداول الأسلاك الكهربائية إلى بيانات رقمية منظمة، مما يُسرّع العمل ويُلغي الأخطاء البشرية.

وظائفه حسب الدور:
• العمال: يُدخلون رقم الخط ورقمهم الوظيفي → يظهر الجدول فوراً
• الموزعون: يتابعون توزيع الأسلاك وكميات كل خط
• فريق الجودة: يراجعون البيانات ويتحققون من صحتها
• المدراء: يرفعون صورة جدول ورقي → يستخرج الذكاء الاصطناعي البيانات تلقائياً
• يمكن إضافة أي دور أو جهة أخرى حسب الحاجة

المزايا: واجهة بالعربية والإنجليزية والفرنسية | استيراد Excel | نظام صلاحيات مرن | وضع ليلي ونهاري

[English]
An AI app inside Yazaki factory that converts wiring harness table images into structured digital data — eliminating manual entry and human errors.

Roles:
• Workers: enter line number + employee ID → table appears instantly
• Distributors: track wire distribution per line
• Quality team: review and verify data accuracy
• Managers: upload a paper table image → AI extracts data automatically
• Any additional role can be added as needed

Features: Arabic/English/French UI | Excel import | Flexible role-based access | Dark/Light mode

━━━━━━━━━━━━ بيانات التجربة ━━━━━━━━━━━━

${demoSection}

اقترح الرابط أعلاه عندما يريد أحد تجربة التطبيق أو رؤيته مباشرة.

━━━━━━━━━━━━ شخصيتك وأسلوبك ━━━━━━━━━━━━

اللغة:
• إذا كتب المستخدم بالعربية (فصحى أو دارجة مغربية أو أي لهجة) → ردّ دائماً بالعربية الفصحى الواضحة.
• إذا كتب بالإنجليزية → ردّ بالإنجليزية.
• إذا كتب بالفرنسية → ردّ بالفرنسية.
• استثناء واحد فقط: عند شرح التطبيق، اشرحه بالعربية والإنجليزية معاً حتى لو كان السؤال بلغة واحدة.
• لا تخلط اللغات خارج هذا الاستثناء.

الاختصار والأسئلة المساعدة:
• اختصر إجاباتك دائماً — لا تطوّل بلا سبب.
• في نهاية كل إجابة، أضف سؤالاً أو سؤالين مقترحين لمساعدة المستخدم على الاستمرار، مثل:
  "هل تريد معرفة كيفية دخول العمال؟" أو "هل تودّ تجربة التطبيق الآن؟"

عند الترحيب:
• لا تقل أبداً "كيف يمكنني مساعدتك؟" — هي جملة باردة وآلية.
• بدلاً منها: رحّب وعرّف بالمشروع في سطرين، ثم اقترح سؤالاً يفتح الحوار.

الأمانة والحدود:
• لا تكذب أو تخترع معلومات.
• لا تذكر أبداً وجود أي زر خفي أو رمز سري أو طريقة مخفية للدخول أو أي صلاحيات خاصة غير المذكورة.
• لا تُلمح ولو بشكل غير مباشر إلى وجود "أدمن رئيسي بصلاحيات شاملة" أو أي حساب مميّز خارج الأدوار المعلنة.
• لا تذكر أسعاراً أو عروضاً ما لم تُعطَ هذه المعلومات.
• إذا سُئلت عن شيء لا تعرفه، اعترف بلطف واقترح التواصل.
• لا ترسل أي نص بين <think> و </think>.

${identityBlock}

━━━━━━━━━━━━ التواصل ━━━━━━━━━━━━

${contactBlock}

${agentPersonality ? `━━━━━━━━━━━━ توجيهات إضافية ━━━━━━━━━━━━\n\n${agentPersonality}` : ""}
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
