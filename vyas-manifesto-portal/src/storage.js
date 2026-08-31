/*
 * Storage layer for the manifesto portal.
 *
 * storage.get(key, shared) / storage.set(key, value, shared, passcodeHash)
 *
 * - shared = true  -> goes through /api/storage, a Vercel serverless
 *   function backed by a small Redis database. Every visitor reads and
 *   writes the same copy, which is the whole point of a public tracker.
 *   Used for "portal-data" (the manifesto points) and "admin-auth"
 *   (the hashed passcode, so admin login works from any device).
 * - shared = false (default) -> stays in this browser's localStorage.
 *   Used only for "theme-pref", a personal per-device preference.
 *
 * Reliability notes (this matters once a lot of people open the portal at
 * the same time, e.g. a link shared in a hostel group):
 * - Every network call has a hard timeout so a slow/hanging request can't
 *   leave the UI stuck loading forever.
 * - GETs retry a couple of times with a short backoff before giving up —
 *   most failures under a traffic burst are transient.
 * - The last good shared read is cached in localStorage. If a later read
 *   fails outright, the UI falls back to that instead of showing nothing.
 *
 * See README.md, "Set up the shared database", for how to provision the
 * database and wire up its two environment variables on Vercel.
 */

const REQUEST_TIMEOUT_MS = 10000;
const GET_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;
const LOCAL_CACHE_PREFIX = "shared-cache:";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function readLocalCache(key) {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_PREFIX + key);
    if (raw == null) return null;
    return { key, value: raw };
  } catch {
    return null;
  }
}
function writeLocalCache(key, value) {
  try {
    localStorage.setItem(LOCAL_CACHE_PREFIX + key, value);
  } catch {
    // Best-effort only — a full/unavailable localStorage shouldn't break reads.
  }
}

async function getShared(key) {
  for (let attempt = 0; attempt <= GET_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(`/api/storage?key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      if (data.value == null) return null;
      writeLocalCache(key, data.value);
      return { key, value: data.value };
    } catch {
      if (attempt < GET_RETRIES) await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
    }
  }
  // Every attempt failed — fall back to the last copy we saw, so a
  // transient blip during a traffic spike shows stale data instead of a
  // blank/broken page.
  return readLocalCache(key);
}

async function setShared(key, value, passcodeHash) {
  try {
    const res = await fetchWithTimeout(`/api/storage?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, passcodeHash }),
    });
    if (!res.ok) return null;
    writeLocalCache(key, value);
    return { key, value };
  } catch {
    return null;
  }
}

const storage = {
  async get(key, shared = false) {
    if (shared) return getShared(key);
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return null;
      return { key, value: raw };
    } catch {
      return null;
    }
  },
  async set(key, value, shared = false, passcodeHash) {
    if (shared) return setShared(key, value, passcodeHash);
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch {
      return null;
    }
  },
};

export default storage;
