import crypto from "node:crypto";
import { pool } from "./db.js";

const tokenSecret = process.env.STREAM_TOKEN_SECRET || "dev-stream-secret";

export function signStreamToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyStreamToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp < Date.now()) return null;
  return payload;
}

export async function allocateHost() {
  const { rows } = await pool.query(
    `SELECT * FROM gpu_hosts WHERE status='ready' AND active_session_id IS NULL ORDER BY created_at LIMIT 1`
  );
  return rows[0] || null;
}

export function gatewayUrl(sessionId, token) {
  const base = (process.env.STREAM_GATEWAY_BASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/?session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;
}
