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

// Upward of ~200 people can land on the portal at once (e.g. a link shared
// in a hostel group). They're all doing simple GETs, which this route and
// Upstash's free tier both handle easily — the two things that actually
// matter under a concurrency spike are (1) not hanging the function on a
// slow upstream call, and (2) not sending every single visitor's request to
// Redis when the answer barely changes second to second. Both are handled
// below: a hard timeout on every Redis call, and a short edge cache on GET.

const REDIS_TIMEOUT_MS = 8000;

// A handful of very recent GETs are also cached in this function instance's
// own memory. Serverless instances are reused for bursts of traffic that
// land close together, so this trims duplicate Redis calls further on top
// of the edge cache below, at effectively no staleness cost (2s).
const memoryCache = new Map(); // key -> { value, expires }
const MEMORY_TTL_MS = 2000;

async function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN) {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({
      error: "Storage isn't configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN " +
        "in Vercel → Settings → Environment Variables, then redeploy. See README.md.",
    });
    return;
  }

  const key = String(req.query.key || "");
  if (!ALLOWED_KEYS.has(key)) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ error: "Unknown key." });
    return;
  }

  async function redis(path, init) {
    return withTimeout(async (signal) => {
      const r = await fetch(`${REDIS_URL}/${path}`, {
        ...init,
        signal,
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, ...(init && init.headers) },
      });
      if (!r.ok) throw new Error(`Upstash responded ${r.status}`);
      return r.json();
    }, REDIS_TIMEOUT_MS);
  }

  if (req.method === "GET") {
    // Every visitor's page load reads "portal-data" once. It only changes
    // when an admin saves, so a short public cache means a burst of
    // simultaneous visitors is served from Vercel's edge (or this
    // instance's own memory) instead of all hitting Redis at once.
    res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=55");

    const cached = memoryCache.get(key);
    if (cached && cached.expires > Date.now()) {
      res.status(200).json({ key, value: cached.value });
      return;
    }

    try {
      const data = await redis(`get/${encodeURIComponent(key)}`);
      const value = data.result ?? null;
      memoryCache.set(key, { value, expires: Date.now() + MEMORY_TTL_MS });
      res.status(200).json({ key, value });
    } catch {
      // If we have a stale in-memory copy, better to serve that than a hard
      // error during a transient upstream hiccup.
      if (cached) {
        res.status(200).json({ key, value: cached.value, stale: true });
      } else {
        res.status(502).json({ error: "Couldn't reach the database." });
      }
    }
    return;
  }

  if (req.method === "POST") {
    res.setHeader("Cache-Control", "no-store");

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
      // Invalidate this instance's cache immediately so the admin's own
      // next read (and any instance-local GETs) reflect the write right
      // away instead of waiting out MEMORY_TTL_MS.
      memoryCache.delete(key);
      res.status(200).json({ key, value });
    } catch {
      res.status(502).json({ error: "Couldn't reach the database." });
    }
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(405).json({ error: "Method not allowed." });
}
