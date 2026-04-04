import { logger } from "../lib/logger";
import { db, contactsTable, messagesTable, settingsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { generateAIReply } from "./ai";
import fs from "fs";
import path from "path";

type WAStatus = "disconnected" | "connecting" | "qr_ready" | "connected";

interface WAState {
  status: WAStatus;
  qr: string | null;
  phone: string | null;
  name: string | null;
  client: any | null;
}

const state: WAState = {
  status: "disconnected",
  qr: null,
  phone: null,
  name: null,
  client: null,
};

const SESSION_DIR = path.join(process.cwd(), ".whatsapp-session");

// In-memory admin sessions (authenticated by password "كيرا")
const adminSessions = new Set<string>();

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

async function upsertContact(phone: string, name?: string) {
  const existing = await db.select().from(contactsTable).where(eq(contactsTable.phone, phone));
  if (existing.length > 0) {
    await db
      .update(contactsTable)
      .set({ lastSeen: new Date(), messageCount: sql`${contactsTable.messageCount} + 1`, ...(name ? { name } : {}) })
      .where(eq(contactsTable.phone, phone));
    return existing[0];
  } else {
    const [contact] = await db
      .insert(contactsTable)
      .values({ phone, name: name ?? null, messageCount: 1 })
      .returning();
    return contact;
  }
}

async function saveMessage(contactId: number, content: string, direction: "inbound" | "outbound", aiModel?: string) {
  await db.insert(messagesTable).values({ contactId, content, direction, aiModel: aiModel ?? null });
}

async function getRecentMessages(contactId: number, limit = 10) {
  return db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.contactId, contactId))
    .orderBy(messagesTable.timestamp)
    .limit(limit);
}

// Send error/system alert to admin only
export async function sendAdminAlert(message: string) {
  if (state.status !== "connected" || !state.client) return;
  const adminPhone = await getSetting("adminPhone");
  if (!adminPhone) return;
  try {
    const jid = `${adminPhone}@s.whatsapp.net`;
    await state.client.sendMessage(jid, { text: `⚠️ *تنبيه النظام*\n${message}` });
  } catch (err) {
    logger.error({ err }, "Failed to send admin alert");
  }
}

// Handle admin commands — returns admin reply or null if not an admin command
async function handleAdminCommand(text: string, phone: string): Promise<string | null> {
  const t = text.trim();
  const lower = t.toLowerCase().replace(/\s+/g, " ");

  // Logout from admin mode
  if (lower === "خروج" || lower === "logout" || lower === "exit") {
    adminSessions.delete(phone);
    return "🔓 تم إلغاء وضع المشرف. أنت الآن مستخدم عادي.";
  }

  // Help menu
  if (lower === "مساعدة" || lower === "help" || lower === "أوامر") {
    return `📋 *أوامر المشرف:*

🧑‍🤝‍🧑 *جهات الاتصال* — قائمة بجميع الأرقام
📨 *سجل الرسائل* — آخر 20 رسالة في النظام
📊 *إحصائيات* — أرقام عامة عن النشاط
🔍 *رسائل [رقم]* — محادثة رقم معين
🚫 *حظر [رقم]* — حظر رقم
✅ *إلغاء حظر [رقم]* — رفع الحظر عن رقم
🚪 *خروج* — الخروج من وضع المشرف`;
  }

  // Contacts list
  if (lower === "جهات الاتصال" || lower === "contacts" || lower === "الأرقام" || lower === "الارقام") {
    const contacts = await db
      .select()
      .from(contactsTable)
      .orderBy(desc(contactsTable.lastSeen))
      .limit(30);

    if (contacts.length === 0) return "📭 لا توجد جهات اتصال حتى الآن.";

    const lines = contacts.map((c, i) => {
      const blocked = c.isBlocked ? " 🚫" : "";
      const name = c.name ? ` (${c.name})` : "";
      return `${i + 1}. +${c.phone}${name} — ${c.messageCount} رسالة${blocked}`;
    });

    return `📋 *جهات الاتصال (${contacts.length}):*\n\n${lines.join("\n")}`;
  }

  // Last 20 messages system-wide
  if (lower === "سجل الرسائل" || lower === "messages" || lower === "الرسائل") {
    const msgs = await db
      .select({ content: messagesTable.content, direction: messagesTable.direction, timestamp: messagesTable.timestamp, phone: contactsTable.phone, name: contactsTable.name })
      .from(messagesTable)
      .leftJoin(contactsTable, eq(messagesTable.contactId, contactsTable.id))
      .orderBy(desc(messagesTable.timestamp))
      .limit(20);

    if (msgs.length === 0) return "📭 لا توجد رسائل حتى الآن.";

    const lines = msgs.reverse().map((m) => {
      const dir = m.direction === "inbound" ? "⬅️" : "➡️";
      const who = m.name || `+${m.phone}`;
      const time = new Date(m.timestamp).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
      const preview = m.content.slice(0, 60) + (m.content.length > 60 ? "…" : "");
      return `${dir} *${who}* [${time}]\n   ${preview}`;
    });

    return `📨 *آخر ${msgs.length} رسائل:*\n\n${lines.join("\n\n")}`;
  }

  // Statistics
  if (lower === "إحصائيات" || lower === "stats" || lower === "احصائيات") {
    const [contacts] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable);
    const [messages] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable);
    const [blocked] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.isBlocked, true));
    const [inbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "inbound"));
    const [outbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "outbound"));

    const aiModel = (await getSetting("aiModel")) ?? "—";
    const geminiModel = (await getSetting("geminiModel")) ?? "—";
    const groqModel = (await getSetting("groqModel")) ?? "—";
    const activeModel = aiModel === "gemini" ? `Gemini / ${geminiModel}` : `Groq / ${groqModel}`;

    return `📊 *إحصائيات النظام:*

👥 جهات الاتصال: ${contacts.count}
🚫 محظورون: ${blocked.count}
📨 إجمالي الرسائل: ${messages.count}
⬅️ مستقبلة: ${inbound.count}
➡️ مرسلة: ${outbound.count}
🤖 الموديل النشط: ${activeModel}
📡 حالة واتساب: ${state.status === "connected" ? `✅ متصل (+${state.phone})` : "❌ غير متصل"}`;
  }

  // Messages for specific contact: "رسائل [number]"
  const msgsMatch = t.match(/^(?:رسائل|messages?)\s+(\+?[\d]+)/i);
  if (msgsMatch) {
    const numRaw = msgsMatch[1].replace(/^\+/, "");
    const contact = await db.select().from(contactsTable).where(eq(contactsTable.phone, numRaw));
    if (!contact[0]) return `❌ الرقم +${numRaw} غير موجود في قاعدة البيانات.`;

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.contactId, contact[0].id))
      .orderBy(desc(messagesTable.timestamp))
      .limit(15);

    if (msgs.length === 0) return `📭 لا توجد رسائل مع +${numRaw}.`;

    const name = contact[0].name ? ` (${contact[0].name})` : "";
    const lines = msgs.reverse().map((m) => {
      const dir = m.direction === "inbound" ? "⬅️" : "➡️";
      const time = new Date(m.timestamp).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
      return `${dir} [${time}] ${m.content.slice(0, 80)}`;
    });

    return `📋 *رسائل +${numRaw}${name}:*\n\n${lines.join("\n")}`;
  }

  // Block contact: "حظر [number]"
  const blockMatch = t.match(/^حظر\s+(\+?[\d]+)/);
  if (blockMatch) {
    const numRaw = blockMatch[1].replace(/^\+/, "");
    const contact = await db.select().from(contactsTable).where(eq(contactsTable.phone, numRaw));
    if (!contact[0]) return `❌ الرقم +${numRaw} غير موجود.`;
    await db.update(contactsTable).set({ isBlocked: true }).where(eq(contactsTable.phone, numRaw));
    return `🚫 تم حظر +${numRaw} بنجاح.`;
  }

  // Unblock contact: "إلغاء حظر [number]"
  const unblockMatch = t.match(/^(?:إلغاء حظر|الغاء حظر)\s+(\+?[\d]+)/);
  if (unblockMatch) {
    const numRaw = unblockMatch[1].replace(/^\+/, "");
    await db.update(contactsTable).set({ isBlocked: false }).where(eq(contactsTable.phone, numRaw));
    return `✅ تم إلغاء حظر +${numRaw} بنجاح.`;
  }

  // Unknown command — remind admin of help
  return `❓ أمر غير معروف. أرسل *مساعدة* لعرض قائمة الأوامر المتاحة.`;
}

export async function connectWhatsApp() {
  if (state.status === "connected" || state.status === "connecting") return;

  state.status = "connecting";
  state.qr = null;

  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");

    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: authState,
      printQRInTerminal: false,
      logger: { level: "silent", trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({ level: "silent", trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({}) as any }) } as any,
    });

    state.client = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrcode = await import("qrcode");
        const qrDataUrl = await qrcode.toDataURL(qr);
        state.qr = qrDataUrl;
        state.status = "qr_ready";
        logger.info("QR code generated");
      }

      if (connection === "open") {
        state.status = "connected";
        state.qr = null;
        const user = sock.user;
        state.phone = user?.id?.split(":")[0] ?? null;
        state.name = user?.name ?? null;
        logger.info({ phone: state.phone }, "WhatsApp connected");
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        state.status = "disconnected";
        state.phone = null;
        state.name = null;
        state.client = null;
        logger.info({ reason, shouldReconnect }, "WhatsApp disconnected");
        if (shouldReconnect) {
          setTimeout(connectWhatsApp, 3000);
        } else {
          if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          }
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) continue;

        const phone = jid.replace("@s.whatsapp.net", "");
        const pushName = msg.pushName ?? undefined;
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          "";

        if (!text) continue;

        const autoReply = (await getSetting("autoReply")) ?? "true";
        const adminPhone = (await getSetting("adminPhone")) ?? "";
        const contact = await upsertContact(phone, pushName);

        // --- Admin password check ---
        const normalizedText = text.trim().toLowerCase().replace(/\s+/g, " ");
        const isKiraPassword =
          normalizedText === "أنا كيرا" ||
          normalizedText === "انا كيرا" ||
          normalizedText === "كيرا" ||
          normalizedText === "kira" ||
          normalizedText === "ana kira";

        if (isKiraPassword) {
          adminSessions.add(phone);
          await saveMessage(contact.id, text, "inbound");
          const greeting = `🔐 *وضع المشرف مفعّل*

أهلاً بك يا مشرف! يمكنك الآن استخدام الأوامر التالية:

📋 *مساعدة* — قائمة جميع الأوامر
🧑‍🤝‍🧑 *جهات الاتصال* — جميع الأرقام
📨 *سجل الرسائل* — آخر الرسائل
📊 *إحصائيات* — نشاط النظام
🔍 *رسائل [رقم]* — محادثة رقم محدد
🚫 *حظر [رقم]* / ✅ *إلغاء حظر [رقم]*
🚪 *خروج* — إلغاء وضع المشرف`;
          await sock.sendMessage(jid, { text: greeting });
          await saveMessage(contact.id, greeting, "outbound", "system");
          continue;
        }

        // --- Admin commands ---
        if (adminSessions.has(phone)) {
          await saveMessage(contact.id, text, "inbound");
          const adminReply = await handleAdminCommand(text, phone);
          await sock.sendMessage(jid, { text: adminReply! });
          await saveMessage(contact.id, adminReply!, "outbound", "system/admin");
          continue;
        }

        // --- Regular user ---
        if (contact.isBlocked) continue;

        await saveMessage(contact.id, text, "inbound");
        logger.info({ phone, text: text.slice(0, 50) }, "Inbound message");

        if (autoReply === "true") {
          const recentMsgs = await getRecentMessages(contact.id, 10);
          const history = recentMsgs.slice(-9).map((m) => ({
            role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
            content: m.content,
          }));

          try {
            const { reply, model } = await generateAIReply(text, history);
            await sock.sendMessage(jid, { text: reply });
            await saveMessage(contact.id, reply, "outbound", model);
          } catch (err: any) {
            logger.error({ err }, "AI reply failed");
            // Only notify admin, never the user
            if (adminPhone) {
              await sendAdminAlert(`فشل الرد على +${phone}: ${err?.message ?? "خطأ غير معروف"}`);
            }
          }

          await db
            .update(contactsTable)
            .set({ lastSeen: new Date() })
            .where(eq(contactsTable.id, contact.id));
        }
      }
    });
  } catch (err) {
    logger.error({ err }, "Failed to connect WhatsApp");
    state.status = "disconnected";
    state.client = null;
  }
}

export async function disconnectWhatsApp() {
  if (state.client) {
    await state.client.logout().catch(() => {});
    state.client = null;
  }
  state.status = "disconnected";
  state.qr = null;
  state.phone = null;
  state.name = null;
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
}

export async function sendWhatsAppMessage(phone: string, content: string) {
  if (state.status !== "connected" || !state.client) {
    throw new Error("WhatsApp not connected");
  }
  const jid = phone.includes("@s.whatsapp.net") ? phone : `${phone}@s.whatsapp.net`;
  await state.client.sendMessage(jid, { text: content });

  const contact = await upsertContact(phone);
  await saveMessage(contact.id, content, "outbound");
}

export function getWhatsAppStatus() {
  return {
    connected: state.status === "connected",
    phone: state.phone,
    name: state.name,
    status: state.status,
  };
}

export function getWhatsAppQr() {
  return {
    qr: state.qr,
    status: state.status,
  };
}
