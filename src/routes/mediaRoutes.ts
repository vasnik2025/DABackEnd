import cors from "cors";
import { Router } from "express";
import { proxyExternalImage } from "../controllers/imageProxyController";

const router = Router();

const mediaCors = cors({
  origin: [
    "https://DateAstrum.com",
    "https://www.DateAstrum.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ],
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

router.options("/proxy", mediaCors, proxyExternalImage);
router.get("/proxy", mediaCors, proxyExternalImage);

export default router;

