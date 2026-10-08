// Live runner tracking endpoint (Vercel serverless, no dependencies).
//
//   POST /api/pos?w=<writeToken>   ← OwnTracks (HTTP mode) on the runner's phone
//   GET  /api/pos?id=<id>[,<id>…][&since=<ms received>]   ← Cheer Crew app (crew)
//   GET  /api/pos?ping=1           ← health check (is storage connected?)
//
// The runner's phone only knows the write token. The crew only knows the read id,
// which is sha256(writeToken) truncated, so a shared plan link can't post fake positions.
// Storage: Upstash Redis via its REST API (Vercel → Storage → Upstash for Redis).
const crypto = require("crypto");

const KEEP = 3000;                 // points kept per runner (~12 h at one every 15 s)
const TTL = 14 * 24 * 3600;        // data expires after 14 days
const W_RE = /^[A-Za-z0-9_-]{16,64}$/;
const ID_RE = /^[0-9a-f]{24}$/;

const readId = w => crypto.createHash("sha256").update(w).digest("hex").slice(0, 24);

function store() {
  const e = process.env;
  const pick = re => { for (const k of Object.keys(e)) if (re.test(k) && e[k]) return e[k]; return null; };
  const url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL || pick(/(REST_API_URL|REDIS_REST_URL)$/);
  const token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN || pick(/(?<!READ_ONLY_)(REST_API_TOKEN|REDIS_REST_TOKEN)$/);
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}
async function pipeline(st, cmds) {
  const r = await fetch(st.url + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + st.token, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("storage " + r.status);
  return r.json();
}
async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = req.body;
  if (raw == null) { raw = await new Promise((ok, ko) => { let d = ""; req.on("data", c => { d += c; if (d.length > 20000) ko(new Error("too big")); }); req.on("end", () => ok(d)); req.on("error", ko); }); }
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  try { return JSON.parse(raw || "null"); } catch (e) { return null; }
}
const num = (v, d) => (typeof v === "number" && isFinite(v) ? +v.toFixed(d) : null);
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const q = new URL(req.url, "http://x").searchParams;
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); return send(res, 204, null); }
  const st = store();
  try {
    if (req.method === "POST") {
      const w = q.get("w") || "";
      if (!W_RE.test(w)) return send(res, 403, []);
      if (!st) return send(res, 503, []); // OwnTracks keeps the point queued and retries
      const b = await readBody(req);
      const msgs = Array.isArray(b) ? b : [b];
      const pts = [];
      for (const m of msgs) {
        if (!m || m._type !== "location") continue;
        const lat = num(m.lat, 6), lon = num(m.lon, 6);
        if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
        const t = typeof m.tst === "number" ? m.tst * 1000 : Date.now();
        // [time ms, lat, lon, accuracy m, speed km/h, battery %, received ms]
        pts.push(JSON.stringify([t, lat, lon, num(m.acc, 0), num(m.vel, 0), num(m.batt, 0), Date.now()]));
      }
      if (pts.length) { const k = "trk:" + readId(w); await pipeline(st, [["LPUSH", k, ...pts], ["LTRIM", k, 0, KEEP - 1], ["EXPIRE", k, TTL]]); }
      return send(res, 200, []); // OwnTracks expects a JSON array
    }
    if (req.method === "GET") {
      if (q.has("ping")) return send(res, 200, { ok: true, storage: !!st, now: Date.now() });
      if (!st) return send(res, 503, { ok: false, error: "storage" });
      const ids = (q.get("id") || "").split(",").filter(x => ID_RE.test(x)).slice(0, 12);
      if (!ids.length) return send(res, 400, { ok: false, error: "id" });
      const since = +q.get("since") || 0;
      const out = await pipeline(st, ids.map(id => ["LRANGE", "trk:" + id, 0, since ? 599 : KEEP - 1]));
      const r = {};
      ids.forEach((id, i) => {
        const list = (out[i] && out[i].result) || [];
        r[id] = list.map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(p => p && (p[6] || p[0]) > since).sort((a, b) => a[0] - b[0]);
      });
      return send(res, 200, { ok: true, now: Date.now(), r });
    }
    return send(res, 405, { ok: false });
  } catch (e) {
    return send(res, 502, req.method === "POST" ? [] : { ok: false, error: String(e.message || e) });
  }
};
module.exports.readId = readId;
