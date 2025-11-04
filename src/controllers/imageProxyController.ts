import type { Request, Response } from "express";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";

const ALLOWED_ORIGINS = new Set([
  "https://swingerunion.com",
  "https://www.swingerunion.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

const DEFAULT_ALLOW_ORIGIN = "https://swingerunion.com";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_CONTENT_LENGTH = 8 * 1024 * 1024; // 8MB
const REQUEST_TIMEOUT_MS = 10_000;

const ALLOWED_HOSTS = new Set([
  "upload.wikimedia.org",
  "wikimedia.org",
  "wikipedia.org",
  "images.pexels.com",
  "images.unsplash.com",
  "www.paypalobjects.com",
  "www.paypal.com",
  "maps.google.com",
  "maps.googleapis.com",
  "maps.gstatic.com",
  "www.google.com",
  "www.corfu-greece.com",
  "corfu-greece.com",
  "www.paypalobjects.com",
  "www.2plus2club.com",
  "www.greeka.com",
]);

function setCors(res: Response, req: Request) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", DEFAULT_ALLOW_ORIGIN);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isAllowedHost(hostname: string) {
  const lower = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(lower)) {
    return true;
  }
  if (lower.endsWith(".wikipedia.org")) {
    return true;
  }
  if (lower.endsWith(".wikimedia.org")) {
    return true;
  }
  return false;
}

function respondWithError(res: Response, req: Request, status: number, message: string) {
  setCors(res, req);
  return res.status(status).json({ error: message });
}

export async function proxyExternalImage(req: Request, res: Response) {
  if (req.method === "OPTIONS") {
    setCors(res, req);
    return res.status(204).end();
  }

  const raw = req.query.url;
  if (!raw || typeof raw !== "string" || raw.trim() === "") {
    return respondWithError(res, req, 400, "Missing ?url=");
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch (_error) {
    return respondWithError(res, req, 400, "Invalid URL");
  }

  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return respondWithError(res, req, 400, "Only http/https protocols are supported");
  }

  if (!isAllowedHost(target.hostname)) {
    return respondWithError(res, req, 403, "Host not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "SwingerUnionImageProxy/1.0",
        Accept: "image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: req.headers.referer || DEFAULT_ALLOW_ORIGIN,
      },
    });

    clearTimeout(timeout);

    if (!upstream.body) {
      return respondWithError(res, req, 502, "Upstream response had no body");
    }

    if (!upstream.ok) {
      const status = upstream.status || 502;
      return respondWithError(res, req, status, `Upstream responded ${status}`);
    }

    const contentLengthHeader = upstream.headers.get("content-length");
    if (contentLengthHeader) {
      const size = Number(contentLengthHeader);
      if (!Number.isNaN(size) && size > MAX_CONTENT_LENGTH) {
        upstream.body.cancel();
        return respondWithError(res, req, 413, "Remote image is too large");
      }
    }

    setCors(res, req);

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    const cacheControl = upstream.headers.get("cache-control") || "public, max-age=86400, s-maxage=86400";
    res.setHeader("Cache-Control", cacheControl);

    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const bodyStream = Readable.fromWeb(upstream.body as unknown as WebReadableStream<Uint8Array>);
    await pipeline(bodyStream, res);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return respondWithError(res, req, 504, "Proxy request timed out");
    }

    console.error("media proxy error", error);
    if (!res.headersSent) {
      return respondWithError(res, req, 502, "Proxy fetch failed");
    }
    res.end();
  } finally {
    clearTimeout(timeout);
  }
}
