import { logger } from "../lib/logger";
import { db, contactsTable, messagesTable, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
        const contact = await upsertContact(phone, pushName);

        if (contact.isBlocked) continue;

        await saveMessage(contact.id, text, "inbound");
        logger.info({ phone, text: text.slice(0, 50) }, "Inbound message");

        if (autoReply === "true") {
          const recentMsgs = await getRecentMessages(contact.id, 10);
          const history = recentMsgs.slice(-9).map((m) => ({
            role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
            content: m.content,
          }));

          const { reply, model } = await generateAIReply(text, history);
          await sock.sendMessage(jid, { text: reply });
          await saveMessage(contact.id, reply, "outbound", model);

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
