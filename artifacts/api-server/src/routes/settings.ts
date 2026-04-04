import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router = Router();

const SETTING_KEYS = [
  "ownerName", "ownerEmail", "ownerPhone", "projectName",
  "projectDescription", "projectLink", "geminiApiKey", "groqApiKey",
  "aiModel", "agentPersonality", "autoReply",
] as const;

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
    projectName: raw.projectName ?? "قارئ جداول الأسلاك - Yazaki App",
    projectDescription: raw.projectDescription ?? "تطبيق يستخدم الذكاء الاصطناعي لتحويل صور جداول الأسلاك إلى بيانات رقمية منظمة",
    projectLink: raw.projectLink ?? "",
    geminiApiKey: raw.geminiApiKey ?? "",
    groqApiKey: raw.groqApiKey ?? "",
    aiModel: (raw.aiModel as "gemini" | "groq") ?? "gemini",
    agentPersonality: raw.agentPersonality ?? "",
    autoReply: raw.autoReply !== "false",
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
    { key: "groqApiKey", value: data.groqApiKey ?? "" },
    { key: "aiModel", value: data.aiModel ?? "gemini" },
    { key: "agentPersonality", value: data.agentPersonality ?? "" },
    { key: "autoReply", value: String(data.autoReply ?? true) },
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

export default router;
