import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

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
    { key: "adminPhone", value: data.adminPhone ?? "" },
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

  for (const { key, value } of updates) {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  }

  const raw = await getAllSettings();
  res.json(buildSettingsObject(raw));
});

// --- Gemini model fetching ---
const GEMINI_FREE_KEYWORDS = ["flash", "gemma"];

router.get("/models/gemini", async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: "Missing key" });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=50`
    );
    if (!response.ok) {
      return res.status(400).json({ error: "Invalid API key or quota exceeded" });
    }
    const data = (await response.json()) as { models?: Array<{ name: string; displayName: string; description: string; supportedGenerationMethods?: string[] }> };
    const allModels = data.models ?? [];

    const filtered = allModels
      .filter((m) => {
        const id = m.name.replace("models/", "").toLowerCase();
        const supportsChatOrGenerate =
          !m.supportedGenerationMethods ||
          m.supportedGenerationMethods.includes("generateContent");
        const isFreeModel = GEMINI_FREE_KEYWORDS.some((kw) => id.includes(kw));
        return isFreeModel && supportsChatOrGenerate;
      })
      .map((m) => ({
        id: m.name.replace("models/", ""),
        name: m.displayName || m.name.replace("models/", ""),
        description: m.description?.slice(0, 80) ?? "",
      }));

    return res.json({ models: filtered });
  } catch {
    return res.status(500).json({ error: "Failed to reach Gemini API" });
  }
});

// --- Groq model fetching ---
const GROQ_FREE_PREFERRED = [
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
  "gemma-7b-it",
];

router.get("/models/groq", async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: "Missing key" });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      return res.status(400).json({ error: "Invalid API key" });
    }
    const data = (await response.json()) as { data?: Array<{ id: string; owned_by: string; context_window?: number }> };
    const allModels = data.data ?? [];

    const filtered = allModels
      .filter((m) => {
        const id = m.id.toLowerCase();
        return (
          !id.includes("whisper") &&
          !id.includes("tts") &&
          !id.includes("vision") &&
          (id.includes("llama") || id.includes("mixtral") || id.includes("gemma") || id.includes("qwen"))
        );
      })
      .sort((a, b) => {
        const ai = GROQ_FREE_PREFERRED.indexOf(a.id);
        const bi = GROQ_FREE_PREFERRED.indexOf(b.id);
        if (ai === -1 && bi === -1) return a.id.localeCompare(b.id);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map((m) => ({
        id: m.id,
        name: m.id,
        description: m.context_window ? `Context: ${(m.context_window / 1000).toFixed(0)}k tokens` : "",
      }));

    return res.json({ models: filtered });
  } catch {
    return res.status(500).json({ error: "Failed to reach Groq API" });
  }
});

export default router;
