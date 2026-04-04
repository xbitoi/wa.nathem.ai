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

// In-memory set of phones that authenticated as admin in this session
const adminSessions = new Set<string>();

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return rows[0]?.value ?? null;
}

async function upsertSetting(key: string, value: string) {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
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

// Send system alert to admin only
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

// Check if phone is recognized admin (DB or in-memory session)
async function isAdminPhone(phone: string): Promise<boolean> {
  const savedAdminPhone = await getSetting("adminPhone");
  return phone === savedAdminPhone || adminSessions.has(phone);
}

// Handle admin commands — always returns a reply string
async function handleAdminCommand(text: string, phone: string): Promise<string> {
  const t = text.trim();
  const lower = t.toLowerCase().replace(/\s+/g, " ");

  // Logout from admin mode (removes from in-memory only, DB stays)
  if (lower === "خروج" || lower === "logout" || lower === "exit") {
    adminSessions.delete(phone);
    const savedAdminPhone = await getSetting("adminPhone");
    if (phone === savedAdminPhone) {
      return "ℹ️ رقمك محفوظ كأدمن رئيسي — لن يُحذف من النظام. فقط الجلسة الحالية أُغلقت.\n\nأرسل *أنا كيرا* للعودة.";
    }
    return "🔓 تم إلغاء وضع المشرف. أنت الآن مستخدم عادي.";
  }

  // Help menu
  if (lower === "مساعدة" || lower === "help" || lower === "أوامر") {
    return `📋 *أوامر المشرف:*

🔛 *تشغيل* — تشغيل البوت (إيقاف الصيانة)
⛔ *وقف* — وضع الصيانة (يرد على الكل برسالة صيانة)
✏️ *رسالة صيانة [نص]* — تغيير رسالة الصيانة

🧑‍🤝‍🧑 *جهات الاتصال* — قائمة جميع الأرقام
📨 *سجل الرسائل* — آخر 20 رسالة في النظام
📊 *إحصائيات* — أرقام عامة عن النشاط
🔍 *رسائل [رقم]* — محادثة رقم معين
🚫 *حظر [رقم]* — حظر رقم
✅ *إلغاء حظر [رقم]* — رفع الحظر عن رقم
🚪 *خروج* — إغلاق الجلسة الحالية`;
  }

  // --- Maintenance mode ON ---
  if (lower === "وقف" || lower === "صيانة" || lower === "maintenance" || lower === "off") {
    await upsertSetting("maintenanceMode", "true");
    const msg = await getSetting("maintenanceMessage") ?? "⚙️ النظام في وضع الصيانة. سيعود قريباً.";
    return `⛔ *وضع الصيانة مفعّل*\n\nجميع الرسائل الواردة ستتلقى:\n"${msg}"\n\nأرسل *تشغيل* للعودة للعمل.`;
  }

  // --- Maintenance mode OFF ---
  if (lower === "تشغيل" || lower === "start" || lower === "online" || lower === "on") {
    await upsertSetting("maintenanceMode", "false");
    return "✅ *البوت نشط الآن*\n\nالرد التلقائي على الرسائل مفعّل.";
  }

  // --- Change maintenance message ---
  const maintMsgMatch = t.match(/^رسالة صيانة\s+(.+)/is);
  if (maintMsgMatch) {
    const newMsg = maintMsgMatch[1].trim();
    await upsertSetting("maintenanceMessage", newMsg);
    return `✏️ تم تحديث رسالة الصيانة:\n"${newMsg}"`;
  }

  // --- Contacts list ---
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

  // --- Last 20 messages system-wide ---
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

  // --- Statistics ---
  if (lower === "إحصائيات" || lower === "stats" || lower === "احصائيات") {
    const [totalContacts] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable);
    const [totalMessages] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable);
    const [blocked] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.isBlocked, true));
    const [inbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "inbound"));
    const [outbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "outbound"));

    const aiModel = (await getSetting("aiModel")) ?? "—";
    const geminiModel = (await getSetting("geminiModel")) ?? "—";
    const groqModel = (await getSetting("groqModel")) ?? "—";
    const activeModel = aiModel === "gemini" ? `Gemini / ${geminiModel}` : `Groq / ${groqModel}`;
    const maintenance = (await getSetting("maintenanceMode")) === "true";

    return `📊 *إحصائيات النظام:*

👥 جهات الاتصال: ${totalContacts.count}
🚫 محظورون: ${blocked.count}
📨 إجمالي الرسائل: ${totalMessages.count}
⬅️ مستقبلة: ${inbound.count}
➡️ مرسلة: ${outbound.count}
🤖 الموديل النشط: ${activeModel}
📡 حالة واتساب: ${state.status === "connected" ? `✅ متصل (+${state.phone})` : "❌ غير متصل"}
🔧 وضع الصيانة: ${maintenance ? "⛔ مفعّل" : "✅ معطّل"}`;
  }

  // --- Messages for specific contact ---
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

  // --- Block contact ---
  const blockMatch = t.match(/^حظر\s+(\+?[\d]+)/);
  if (blockMatch) {
    const numRaw = blockMatch[1].replace(/^\+/, "");
    const contact = await db.select().from(contactsTable).where(eq(contactsTable.phone, numRaw));
    if (!contact[0]) return `❌ الرقم +${numRaw} غير موجود.`;
    await db.update(contactsTable).set({ isBlocked: true }).where(eq(contactsTable.phone, numRaw));
    return `🚫 تم حظر +${numRaw} بنجاح.`;
  }

  // --- Unblock contact ---
  const unblockMatch = t.match(/^(?:إلغاء حظر|الغاء حظر)\s+(\+?[\d]+)/);
  if (unblockMatch) {
    const numRaw = unblockMatch[1].replace(/^\+/, "");
    await db.update(contactsTable).set({ isBlocked: false }).where(eq(contactsTable.phone, numRaw));
    return `✅ تم إلغاء حظر +${numRaw} بنجاح.`;
  }

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

        const contact = await upsertContact(phone, pushName);
        const adminPhone = (await getSetting("adminPhone")) ?? "";
        const isAdmin = phone === adminPhone || adminSessions.has(phone);

        // ─── Admin password check ─────────────────────────────────────
        const normalizedText = text.trim().toLowerCase().replace(/\s+/g, " ");
        const isKiraPassword =
          normalizedText === "أنا كيرا" ||
          normalizedText === "انا كيرا" ||
          normalizedText === "كيرا" ||
          normalizedText === "kira" ||
          normalizedText === "ana kira";

        if (isKiraPassword) {
          // Save phone persistently in DB as admin
          await upsertSetting("adminPhone", phone);
          adminSessions.add(phone);
          await saveMessage(contact.id, text, "inbound");

          const greeting = `🔐 *وضع المشرف مفعّل*

مرحباً! رقمك (+${phone}) محفوظ الآن كمشرف رئيسي في النظام.

📋 أرسل *مساعدة* لعرض جميع الأوامر المتاحة.`;
          await sock.sendMessage(jid, { text: greeting });
          await saveMessage(contact.id, greeting, "outbound", "system");
          continue;
        }

        // ─── Admin commands ───────────────────────────────────────────
        if (isAdmin) {
          await saveMessage(contact.id, text, "inbound");
          const adminReply = await handleAdminCommand(text, phone);
          await sock.sendMessage(jid, { text: adminReply });
          await saveMessage(contact.id, adminReply, "outbound", "system/admin");
          continue;
        }

        // ─── Blocked contacts ─────────────────────────────────────────
        if (contact.isBlocked) continue;

        logger.info({ phone, text: text.slice(0, 50) }, "Inbound message");

        // ─── Maintenance mode ─────────────────────────────────────────
        const maintenanceMode = (await getSetting("maintenanceMode")) === "true";
        if (maintenanceMode) {
          await saveMessage(contact.id, text, "inbound");
          const maintenanceMsg =
            (await getSetting("maintenanceMessage")) ??
            "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.";
          await sock.sendMessage(jid, { text: maintenanceMsg });
          await saveMessage(contact.id, maintenanceMsg, "outbound", "system/maintenance");
          continue;
        }

        // ─── Auto-reply via AI ────────────────────────────────────────
        const autoReply = (await getSetting("autoReply")) ?? "true";
        if (autoReply === "true") {
          // Fetch history BEFORE saving the current message to avoid duplication
          const previousMsgs = await getRecentMessages(contact.id, 12);

          // Build history pairs and ensure it starts with 'user' (Gemini requirement)
          let history = previousMsgs.map((m) => ({
            role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
            content: m.content,
          }));
          while (history.length > 0 && history[0].role !== "user") {
            history = history.slice(1);
          }
          history = history.slice(-10); // keep last 10 turns max

          // Now save the current inbound message
          await saveMessage(contact.id, text, "inbound");

          try {
            const { reply, model } = await generateAIReply(text, history);
            await sock.sendMessage(jid, { text: reply });
            await saveMessage(contact.id, reply, "outbound", model);
          } catch (err: any) {
            logger.error({ err }, "AI reply failed");

            // Send detailed error to admin only
            const adminRawPhone = (await getSetting("adminPhone"))?.replace(/@.*/, "").replace(/[^0-9]/g, "");
            if (adminRawPhone) {
              const now = new Date().toLocaleString("ar-MA", { timeZone: "Africa/Casablanca", hour12: false });
              const errMsg = err?.message ?? "خطأ غير معروف";
              const errStack = err?.stack ? `\n📋 Stack:\n${String(err.stack).slice(0, 400)}` : "";
              const aiUsed = (await getSetting("aiModel")) ?? "gemini";
              const alertText =
                `🚨 *خطأ في الذكاء الاصطناعي*\n\n` +
                `🕐 الوقت: ${now}\n` +
                `📱 المرسل: +${phone}\n` +
                `💬 الرسالة: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}\n` +
                `🤖 النموذج: ${aiUsed}\n` +
                `❌ الخطأ: ${errMsg}` +
                errStack;
              await sendAdminAlert(alertText);
            }

            // Do NOT send any error message to the regular user — stay silent
          }

          await db
            .update(contactsTable)
            .set({ lastSeen: new Date() })
            .where(eq(contactsTable.id, contact.id));
        } else {
          await saveMessage(contact.id, text, "inbound");
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
