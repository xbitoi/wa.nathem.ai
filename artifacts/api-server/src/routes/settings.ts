import { Router } from "express";
import { db, settingsTable, messagesTable, contactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { invalidateSettingsCache } from "../services/ai";
import { clearAdminSessions } from "../services/whatsapp";

const router = Router();

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settingsTable);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function buildSettingsObject(raw: Record<string, string>) {
  return {
    ownerName: raw.ownerName ?? "",
    ownerEmail: raw.ownerEmail ?? "",
    ownerPhone: raw.ownerPhone ?? "",
    adminPhone: raw.adminPhone ?? "",
    projectName: raw.projectName ?? "Yazaki AI",
    projectDescription: raw.projectDescription ?? "تطبيق ذكاء اصطناعي يحوّل صور جداول الأسلاك الكهربائية إلى بيانات رقمية منظمة — يدعم العربية والإنجليزية والفرنسية",
    projectLink: raw.projectLink ?? "",
    geminiApiKey: raw.geminiApiKey ?? "",
    geminiModel: raw.geminiModel ?? "",
    groqApiKey: raw.groqApiKey ?? "",
    groqModel: raw.groqModel ?? "",
    aiModel: (raw.aiModel as "gemini" | "groq") ?? "gemini",
    agentPersonality: raw.agentPersonality ?? "",
    autoReply: raw.autoReply !== "false",
    maintenanceMode: raw.maintenanceMode === "true",
    maintenanceMessage: raw.maintenanceMessage ?? "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.",
  };
}

router.get("/", async (req, res) => {
  const raw = await getAllSettings();
  res.json(buildSettingsObject(raw));
});

router.post("/", async (req, res) => {
  const body = UpdateSettingsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid input" });

  const data = body.data;
  const updates: Array<{ key: string; value: string }> = [
    { key: "ownerName", value: data.ownerName ?? "" },
    { key: "ownerEmail", value: data.ownerEmail ?? "" },
    { key: "ownerPhone", value: data.ownerPhone ?? "" },
    { key: "projectName", value: data.projectName ?? "" },
    { key: "projectDescription", value: data.projectDescription ?? "" },
    { key: "projectLink", value: data.projectLink ?? "" },
    { key: "geminiApiKey", value: data.geminiApiKey ?? "" },
    { key: "geminiModel", value: data.geminiModel ?? "" },
    { key: "groqApiKey", value: data.groqApiKey ?? "" },
    { key: "groqModel", value: data.groqModel ?? "" },
    { key: "aiModel", value: data.aiModel ?? "gemini" },
    { key: "agentPersonality", value: data.agentPersonality ?? "" },
    { key: "autoReply", value: String(data.autoReply ?? true) },
    { key: "maintenanceMode", value: String(data.maintenanceMode ?? false) },
    { key: "maintenanceMessage", value: data.maintenanceMessage ?? "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon." },
  ];

  // adminPhone: only overwrite if a non-empty value is explicitly provided
  // Prevents dashboard "Save" from accidentally clearing the phone set via WhatsApp auth
  if (data.adminPhone && data.adminPhone.trim() !== "") {
    updates.push({ key: "adminPhone", value: data.adminPhone.trim() });
  }

  for (const { key, value } of updates) {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  }

  // Invalidate the AI settings cache so next message uses fresh values
  invalidateSettingsCache();

  const raw = await getAllSettings();
  res.json(buildSettingsObject(raw));
});

// --- Gemini model fetching — fixed list of 2 supported models ---
const GEMINI_SUPPORTED = [
  { id: "gemini-2.5-flash-preview-04-17", name: "Gemini 2.5 Flash", description: "الأحدث — رصيد يومي كبير" },
  { id: "gemini-2.0-flash",               name: "Gemini 2.0 Flash", description: "ثابت ومستقر — رصيد عالٍ" },
];

router.get("/models/gemini", async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: "Missing key" });

  // Validate key with a lightweight check
  try {
    const check = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`
    );
    if (!check.ok) return res.status(400).json({ error: "Invalid API key or quota exceeded" });
  } catch {
    return res.status(500).json({ error: "Failed to reach Gemini API" });
  }

  return res.json({ models: GEMINI_SUPPORTED });
});

// --- Groq model fetching — fixed list of 2 supported models ---
const GROQ_SUPPORTED = [
  { id: "llama-3.3-70b-versatile",                   name: "Llama 3.3 70B Versatile",     description: "الأموثق — رصيد يومي كبير" },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B",            description: "الأحدث — رصيد جيد" },
];

router.get("/models/groq", async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: "Missing key" });

  // Validate key
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return res.status(400).json({ error: "Invalid API key" });
  } catch {
    return res.status(500).json({ error: "Failed to reach Groq API" });
  }

  return res.json({ models: GROQ_SUPPORTED });
});

// ─── Full system reset ────────────────────────────────────────────────────────
router.post("/reset", async (_req, res) => {
  try {
    // Order: messages first (FK → contacts), then contacts, then settings
    await db.delete(messagesTable);
    await db.delete(contactsTable);
    await db.delete(settingsTable);

    // Clear in-memory admin session cache
    clearAdminSessions();

    // Bust the AI settings cache so next call reads fresh (empty) DB
    invalidateSettingsCache();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Reset failed", detail: String(err) });
  }
});

export default router;
