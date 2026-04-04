import { Router } from "express";
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppQr, getWhatsAppStatus } from "../services/whatsapp";

const router = Router();

router.get("/status", async (req, res) => {
  res.json(getWhatsAppStatus());
});

router.get("/qr", async (req, res) => {
  res.json(getWhatsAppQr());
});

router.post("/disconnect", async (req, res) => {
  await disconnectWhatsApp();
  res.json({ success: true, message: "Disconnected" });
});

router.post("/connect", async (req, res) => {
  connectWhatsApp().catch((err) => req.log.error({ err }, "WhatsApp connect error"));
  res.json({ success: true, message: "Connecting..." });
});

export default router;

export { connectWhatsApp };
