/*
 * Shared storage API route (Vercel serverless function).
 *
 * Backs GET/POST /api/storage?key=... with a Redis database (Upstash's free
 * tier works well here). This is what makes the portal's data visible to
 * every visitor instead of only the browser that wrote it.
 *
 * Required environment variables (set in Vercel → Settings → Environment
 * Variables, then redeploy):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 * (If you provisioned Redis through Vercel's own Marketplace integration
 * instead of upstash.com directly, it may name these KV_REST_API_URL /
 * KV_REST_API_TOKEN instead — both names are accepted below.)
 *
 * Only two keys are ever read or written: "portal-data" and "admin-auth".
 * Anyone can read them (it's a public tracker). Writes require already
 * knowing the current admin passcode's hash — sent by the client as
 * "passcodeHash" — once a passcode has been set. That stops a random
 * visitor from overwriting the public data via a direct API call. It's
 * lightweight protection, not enterprise-grade security: don't share the
 * admin passcode, and treat this as a hobby-project trust model.
 */

const ALLOWED_KEYS = new Set(["portal-data", "admin-auth"]);
const MAX_VALUE_LENGTH = 200000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({
      error: "Storage isn't configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN " +
        "in Vercel → Settings → Environment Variables, then redeploy. See README.md.",
    });
    return;
  }

  const key = String(req.query.key || "");
  if (!ALLOWED_KEYS.has(key)) {
    res.status(400).json({ error: "Unknown key." });
    return;
  }

  async function redis(path, init) {
    const r = await fetch(`${REDIS_URL}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, ...(init && init.headers) },
    });
    if (!r.ok) throw new Error(`Upstash responded ${r.status}`);
    return r.json();
  }

  if (req.method === "GET") {
    try {
      const data = await redis(`get/${encodeURIComponent(key)}`);
      res.status(200).json({ key, value: data.result ?? null });
    } catch {
      res.status(502).json({ error: "Couldn't reach the database." });
    }
    return;
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const value = body && body.value;
    const passcodeHash = body && body.passcodeHash;

    if (typeof value !== "string") {
      res.status(400).json({ error: '"value" must be a string.' });
      return;
    }
    if (value.length > MAX_VALUE_LENGTH) {
      res.status(413).json({ error: "That's too large to store." });
      return;
    }

    try {
      const existing = await redis("get/admin-auth");
      const existingHash = existing.result ? JSON.parse(existing.result).hash : null;

      // Once a passcode exists, every write (including changing the
      // passcode itself) must prove it already knows that passcode's hash.
      // Before any passcode exists, the first write is unrestricted so the
      // very first admin can set one up.
      if (existingHash && existingHash !== passcodeHash) {
        res.status(403).json({ error: "Not authorized." });
        return;
      }

      await redis(`set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: value,
      });
      res.status(200).json({ key, value });
    } catch {
      res.status(502).json({ error: "Couldn't reach the database." });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed." });
}
