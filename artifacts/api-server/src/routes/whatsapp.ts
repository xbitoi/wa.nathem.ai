import { Router } from "express";
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppQr, getWhatsAppStatus, clearWhatsAppQr } from "../services/whatsapp";

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

router.post("/request-pairing-code", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    return res.status(400).json({ success: false, message: "رقم الهاتف مطلوب" });
  }
  const cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone) {
    return res.status(400).json({ success: false, message: "رقم الهاتف غير صالح" });
  }
  try {
    await connectWhatsApp(cleanPhone);
    const status = getWhatsAppStatus();
    res.json({ success: true, pairingCode: status.pairingCode, message: "تم توليد كود الربط" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? "فشل توليد كود الربط" });
  }
});

router.post("/clear-qr", async (req, res) => {
  await clearWhatsAppQr();
  res.json({ success: true, message: "تم مسح الكود وإعادة الاتصال" });
});

export default router;

export { connectWhatsApp };
