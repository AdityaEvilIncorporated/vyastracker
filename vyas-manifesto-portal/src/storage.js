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
 * See README.md, "Set up the shared database", for how to provision the
 * database and wire up its two environment variables on Vercel.
 */

async function getShared(key) {
  try {
    const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.value == null) return null;
    return { key, value: data.value };
  } catch {
    return null;
  }
}

async function setShared(key, value, passcodeHash) {
  try {
    const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, passcodeHash }),
    });
    if (!res.ok) return null;
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
