import storage from "./storage.js";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, ChevronLeft, Lock, Sun, Moon } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

/* ----------------------------------------------------------------------- */
/* Design tokens — values live in CSS custom properties so light/dark can  */
/* swap without touching any component.                                   */
/* ----------------------------------------------------------------------- */
const T = {
  bg: "var(--bg)", panel: "var(--panel)", ink: "var(--ink)", inkSoft: "var(--inkSoft)",
  line: "var(--line)", lineStrong: "var(--lineStrong)", navy: "var(--navy)", navySoft: "var(--navySoft)",
  amber: "var(--amber)", amberSoft: "var(--amberSoft)", green: "var(--green)", greenSoft: "var(--greenSoft)",
  red: "var(--red)", redSoft: "var(--redSoft)", grey: "var(--grey)", greySoft: "var(--greySoft)",
};

const THEME_CSS = `
  .mp-root {
    --bg: #F6F4EE; --panel: #FFFFFF; --ink: #20242A; --inkSoft: #6B6E64;
    --line: #DCD7C9; --lineStrong: #B9B29B; --navy: #2158D6; --navySoft: #E3EDFC;
    --amber: #E2900A; --amberSoft: #FCECC9; --green: #189A57; --greenSoft: #DBF3E5;
    --red: #E23B30; --redSoft: #FBDFDA; --grey: #545C6B; --greySoft: #E7E9EE;
  }
  .mp-root[data-theme='dark'] {
    --bg: #15181C; --panel: #1B1F24; --ink: #ECEDE7; --inkSoft: #9A9D95;
    --line: #2E333A; --lineStrong: #454B52; --navy: #5B9DFF; --navySoft: #1B2A45;
    --amber: #FFB443; --amberSoft: #3A2A0E; --green: #3FDB8F; --greenSoft: #123324;
    --red: #FF6259; --redSoft: #3B1E1B; --grey: #C4C8D2; --greySoft: #262B33;
  }
`;

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');";

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ----------------------------------------------------------------------- */
/* Small responsive helper — lets a handful of layouts (the admin form,    */
/* the bar chart) switch to a mobile-friendly arrangement below a          */
/* breakpoint, since inline styles alone can't express media queries.      */
/* ----------------------------------------------------------------------- */
function useIsMobile(breakpoint = 680) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, [breakpoint]);
  return isMobile;
}

/* ----------------------------------------------------------------------- */
/* Status configuration                                                    */
/* ----------------------------------------------------------------------- */
const STATUS = {
  NOT_STARTED: { label: "Not started", symbol: "○", color: T.grey, bg: T.greySoft, desc: "Work hasn't meaningfully started." },
  PROPOSED: { label: "Proposed", symbol: "◇", color: T.navy, bg: T.navySoft, desc: "A proposal exists but hasn't been acted on yet." },
  IN_PROGRESS: { label: "In progress", symbol: "◐", color: T.navy, bg: T.navySoft, desc: "Active work is happening." },
  PARTIALLY_COMPLETED: { label: "Partly done", symbol: "◕", color: T.amber, bg: T.amberSoft, desc: "Some of it has been delivered." },
  AWAITING_APPROVAL: { label: "Awaiting approval", symbol: "◔", color: T.amber, bg: T.amberSoft, desc: "The rep has acted; finishing depends on someone else." },
  DELAYED: { label: "Delayed", symbol: "!", color: T.red, bg: T.redSoft, desc: "It's missed its expected timeline." },
  BLOCKED: { label: "Blocked", symbol: "⊘", color: T.red, bg: T.redSoft, desc: "A specific obstacle is stopping progress." },
  COMPLETED: { label: "Done", symbol: "✓", color: T.green, bg: T.greenSoft, desc: "Delivered." },
  DROPPED: { label: "Dropped", symbol: "✕", color: T.inkSoft, bg: T.greySoft, desc: "Won't be pursued." },
};
const STAGES = ["Identified", "Discussed with authorities", "Request submitted", "Approved, work started", "Delivered"];
const STAGE_INDEX = {
  NOT_STARTED: 0, PROPOSED: 1, IN_PROGRESS: 2, DELAYED: 2, BLOCKED: 2,
  AWAITING_APPROVAL: 3, PARTIALLY_COMPLETED: 3, COMPLETED: 4, DROPPED: -1,
};

/* ----------------------------------------------------------------------- */
/* Seed data — transcribed directly from the verified manifesto            */
/* ----------------------------------------------------------------------- */
const REP = {
  name: "Raman Gupta",
  id: "2025B1PS0917P",
  hostel: "Vyas Bhawan",
  role: "Hostel Representative",
  verifiedBy: "Election Commission",
  verifiedDate: "2026-08-25",
};

const seedPoint = (id, category, title, priority, status = "NOT_STARTED", progress = 0) => ({
  id, category, title, original: title, priority, status, progress,
  whyMatters: "", currentSituation: "Not started yet.",
  startDate: null, targetDate: null, completionDate: null,
  responsible: "H-Rep, Vyas Bhawan", externalDependency: null,
  delayReason: null, blockedBy: null, since: null, nextAction: null, expectedResolution: null,
  updates: [], evidence: [],
});

const SEED_POINTS = [
  seedPoint("jet-spray-repairs", "Hostel Amenities & Security", "Regular checks and immediate repair of jet sprays, flushes and door locks", "HIGH"),
  seedPoint("cr-ac-tv", "Hostel Amenities & Security", "Installation of AC in ground floor CR, and a TV in 1st floor CR", "MEDIUM"),
  seedPoint("water-quality-checks", "Hostel Amenities & Security", "Weekly pH and TDS checks of the water supply to maintain quality standards", "HIGH"),
  seedPoint("laundromat-table", "Hostel Amenities & Security", "Reorganize and maintain the laundromat table with clearly labeled boundaries for washed and unwashed clothes", "LOW"),
  seedPoint("first-aid-toolbox", "Hostel Amenities & Security", "Accessible first-aid, toolboxes, and mosquito repellant will be maintained", "HIGH"),
  seedPoint("night-chowki", "Hostel Amenities & Security", "Deployment of a night chowki at the entrance to enhance resident safety and prevent stray animals from entering the corridors", "CRITICAL"),

  seedPoint("wifi-dead-zones", "Infrastructure & Maintenance", "Map network dead zones and facilitate the installation of Wi-Fi extenders", "HIGH"),
  seedPoint("water-tank-insulation", "Infrastructure & Maintenance", "Water tank insulation to control the temperature during summers", "MEDIUM"),
  seedPoint("stone-ledges", "Infrastructure & Maintenance", "Installation of stone ledges in washroom cubicles", "LOW"),
  seedPoint("cycle-stands", "Infrastructure & Maintenance", "Installation of cycle stands to make space for walking by without any hassle", "MEDIUM"),
  seedPoint("washroom-night-lights", "Infrastructure & Maintenance", "Installation of permanent switch-operated night lights in all washrooms to avoid blackout from sensor inactivity", "MEDIUM"),
  seedPoint("water-softeners", "Infrastructure & Maintenance", "Explore the potential of installation of water softeners", "LOW"),

  seedPoint("auto-rickshaw-service", "Student Convenience & Vendor Perks", "Arrange a scheduled daily auto-rickshaw service stationed outside Vyas Bhawan (7:45–7:55 AM, and 1:55 PM)", "MEDIUM"),
  seedPoint("vending-machine-form", "Student Convenience & Vendor Perks", "Weekly Google Form to collect preference for vending machine refills", "LOW"),

  seedPoint(
    "progress-portal", "Transparency, Community & Logistics",
    'Launch a live "Progress Portal" to publicly track the status and percentage completion of manifesto points, ongoing complaints and initiatives',
    "CRITICAL", "COMPLETED", 100
  ),
  seedPoint("whatsapp-complaints", "Transparency, Community & Logistics", "Establish a dedicated WhatsApp group for complaints with a guaranteed 24-hour action initiation from the H-Rep side", "HIGH"),
  seedPoint("sports-gaming-weeks", "Transparency, Community & Logistics", "Organize dedicated Sports and Gaming weeks along with the Hostel Night to foster hostel unity", "MEDIUM"),
  seedPoint("trunk-transfer-service", "Transparency, Community & Logistics", "Arrange a streamlined, low-cost intra-hostel transfer service for trunks during year-end shifting", "LOW"),
];
SEED_POINTS.find((p) => p.id === "progress-portal").completionDate = REP.verifiedDate;
SEED_POINTS.find((p) => p.id === "progress-portal").currentSituation = "You're looking at it.";
SEED_POINTS.find((p) => p.id === "progress-portal").evidence = [
  { id: "e1", title: "This page", type: "External link", date: REP.verifiedDate, description: "The site you're viewing is the delivered evidence for this one." },
];
SEED_POINTS.find((p) => p.id === "progress-portal").updates = [
  { id: "u1", date: REP.verifiedDate, title: "Portal published", body: "The tracking site went live, covering all 18 manifesto points for Vyas Bhawan.", progressBefore: 0, progressAfter: 100, statusBefore: "NOT_STARTED", statusAfter: "COMPLETED", author: "Raman Gupta", evidence: [] },
];

const CATEGORIES = [...new Set(SEED_POINTS.map((p) => p.category))];
const TERM_EVENTS = [
  { date: REP.verifiedDate, label: "Manifesto verified by the Election Commission" },
  { date: REP.verifiedDate, label: "This portal went live" },
];

/* ----------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ----------------------------------------------------------------------- */
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const todayISO = () => new Date().toISOString().slice(0, 10);

function computeCompletion(points) {
  const live = points.filter((p) => p.status !== "DROPPED");
  const totalWeight = live.reduce((s, p) => s + p.weight, 0) || 1;
  const weighted = live.reduce((s, p) => s + p.progress * p.weight, 0);
  return weighted / totalWeight;
}
function computeCategoryCompletion(points) {
  return CATEGORIES.map((cat) => {
    const pts = points.filter((p) => p.category === cat && p.status !== "DROPPED");
    const tw = pts.reduce((s, p) => s + p.weight, 0) || 1;
    const w = pts.reduce((s, p) => s + p.progress * p.weight, 0);
    return { category: cat, pct: Math.round(w / tw) };
  });
}
function statusCounts(points) {
  const c = {};
  Object.keys(STATUS).forEach((k) => (c[k] = 0));
  points.forEach((p) => (c[p.status] = (c[p.status] || 0) + 1));
  return c;
}

/* ----------------------------------------------------------------------- */
/* Shared UI                                                                */
/* ----------------------------------------------------------------------- */
function StatusBadge({ status, size = "md" }) {
  const s = STATUS[status];
  const pad = size === "sm" ? "3px 8px" : "4px 10px";
  const fs = size === "sm" ? 12 : 13;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: pad,
      borderRadius: 3, background: s.bg, color: s.color, fontSize: fs, fontWeight: 500,
    }}>
      <span aria-hidden style={{ fontSize: fs + 2, lineHeight: 1 }}>{s.symbol}</span>
      {s.label}
    </span>
  );
}
function ProgressBar({ value, color = T.navy, height = 6 }) {
  return (
    <div style={{ width: "100%", height, background: T.greySoft, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width .4s ease" }} />
    </div>
  );
}
function ProgressRing({ value, size = 140, stroke = 10 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.line} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.navy} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="butt"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontFamily="'Source Serif 4', serif" fontSize={size * 0.26} fontWeight={600} fill={T.ink}>
        {Math.round(value)}%
      </text>
    </svg>
  );
}
function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 24, color: color || T.ink, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 5 }}>{label}</div>
    </div>
  );
}
function EmptyState({ text }) {
  return <div style={{ padding: "24px 0", color: T.inkSoft, fontSize: 13.5 }}>{text}</div>;
}
const Heading = ({ children, sub }) => (
  <div style={{ marginBottom: 24 }}>
    <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 26, fontWeight: 600, margin: 0, color: T.ink }}>{children}</h1>
    {sub && <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "6px 0 0" }}>{sub}</p>}
  </div>
);
const Label = ({ children }) => (
  <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${T.line}` }}>{children}</div>
);
const pText = { fontSize: 14, lineHeight: 1.7, color: T.ink, margin: 0 };
const btnPrimary = { background: T.navy, color: "#fff", border: "none", padding: "9px 16px", fontSize: 13.5, cursor: "pointer", fontWeight: 500 };
const btnSecondary = { background: "none", color: T.navy, border: `1px solid ${T.navy}`, padding: "9px 16px", fontSize: 13.5, cursor: "pointer", fontWeight: 500 };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.navy, fontSize: 13.5, cursor: "pointer", padding: 0 };
const inputStyle = { border: `1px solid ${T.line}`, padding: "9px 10px", fontSize: 13, background: T.panel, color: T.ink, fontFamily: "inherit" };

/* ----------------------------------------------------------------------- */
/* Manifesto card & detail                                                 */
/* ----------------------------------------------------------------------- */
function ManifestoCard({ p, onOpen }) {
  const s = STATUS[p.status];
  return (
    <div onClick={() => onOpen(p.id)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}
      style={{ background: T.panel, border: `1px solid ${T.line}`, padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineStrong)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
      <div style={{ fontSize: 11.5, color: T.inkSoft }}>{p.category}</div>
      <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16.5, lineHeight: 1.35, color: T.ink }}>{p.title}</div>
      <StatusBadge status={p.status} size="sm" />
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: T.inkSoft, marginBottom: 4 }}>
          <span>{p.progress}%</span>
          <span>{p.updates.length} update{p.updates.length !== 1 ? "s" : ""}</span>
        </div>
        <ProgressBar value={p.progress} color={s.color} />
      </div>
    </div>
  );
}

function MilestoneTimeline({ status }) {
  const idx = STAGE_INDEX[status];
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {STAGES.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const current = idx >= 0 && i === idx;
        return (
          <div key={s} style={{ display: "flex", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                background: done ? T.green : current ? T.navy : T.panel,
                border: `2px solid ${done ? T.green : current ? T.navy : T.lineStrong}` }} />
              {i < STAGES.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 24, background: done ? T.green : T.line }} />}
            </div>
            <div style={{ paddingBottom: 20 }}>
              <div style={{ fontSize: 13.5, color: done || current ? T.ink : T.inkSoft, fontWeight: current ? 600 : 400 }}>{s}</div>
            </div>
          </div>
        );
      })}
      {idx === -1 && <div style={{ fontSize: 13, color: T.inkSoft }}>Dropped before reaching these stages.</div>}
    </div>
  );
}

function ManifestoDetail({ point, onBack }) {
  const s = STATUS[point.status];
  return (
    <div>
      <button onClick={onBack} style={btnGhost}><ChevronLeft size={15} /> Back</button>
      <div style={{ marginTop: 18, fontSize: 12.5, color: T.inkSoft }}>{point.category}</div>
      <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 27, lineHeight: 1.3, margin: "8px 0 14px", color: T.ink }}>{point.title}</h1>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <StatusBadge status={point.status} />
        <span style={{ fontSize: 12, color: T.inkSoft }}>{point.priority.toLowerCase()} priority</span>
      </div>
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: T.inkSoft }}>
          <span>Progress</span><span>{point.progress}%</span>
        </div>
        <ProgressBar value={point.progress} color={s.color} height={9} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14, marginBottom: 28 }}>
        <div><div style={{ fontSize: 11.5, color: T.inkSoft }}>Target</div><div style={{ fontSize: 13.5 }}>{fmtDate(point.targetDate)}</div></div>
        <div><div style={{ fontSize: 11.5, color: T.inkSoft }}>Completed</div><div style={{ fontSize: 13.5 }}>{fmtDate(point.completionDate)}</div></div>
        <div><div style={{ fontSize: 11.5, color: T.inkSoft }}>Responsible</div><div style={{ fontSize: 13.5 }}>{point.responsible || "—"}</div></div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>The promise, as written</div>
        <blockquote style={{ fontFamily: "'Source Serif 4', serif", fontStyle: "italic", fontSize: 15.5,
          borderLeft: `3px solid ${T.navy}`, paddingLeft: 16, margin: 0, color: T.ink, lineHeight: 1.6 }}>
          "{point.original}"
        </blockquote>
      </div>

      {(point.status === "DELAYED" || point.status === "BLOCKED" || point.status === "AWAITING_APPROVAL") && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>Why it's stuck</div>
          <div style={{ background: T.redSoft, padding: 14, fontSize: 13.5, lineHeight: 1.6 }}>
            {point.delayReason && <p style={{ margin: "0 0 8px" }}>{point.delayReason}</p>}
            {point.blockedBy && <p style={{ margin: "0 0 8px" }}><b>Waiting on:</b> {point.blockedBy}</p>}
            {point.nextAction && <p style={{ margin: "0 0 8px" }}><b>Next step:</b> {point.nextAction}</p>}
            {point.expectedResolution && <p style={{ margin: 0 }}><b>Expected by:</b> {fmtDate(point.expectedResolution)}</p>}
            {!point.delayReason && !point.blockedBy && <p style={{ margin: 0, color: T.inkSoft }}>No explanation published yet.</p>}
          </div>
        </div>
      )}

      {point.whyMatters && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>Why it matters</div>
          <p style={pText}>{point.whyMatters}</p>
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>Where things stand</div>
        <p style={pText}>{point.currentSituation}</p>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>Stages</div>
        <MilestoneTimeline status={point.status} />
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>Updates</div>
        {point.updates.length === 0 ? <EmptyState text="No updates yet." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[...point.updates].reverse().map((u) => (
              <div key={u.id} style={{ borderLeft: `2px solid ${T.line}`, paddingLeft: 16 }}>
                <div style={{ fontSize: 11.5, color: T.inkSoft }}>{fmtDate(u.date)}</div>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15.5, margin: "4px 0" }}>{u.title}</div>
                <p style={{ ...pText, margin: "0 0 8px" }}>{u.body}</p>
                <div style={{ fontSize: 12, color: T.inkSoft }}>{u.progressBefore}% → {u.progressAfter}%, {STATUS[u.statusBefore]?.label} → {STATUS[u.statusAfter]?.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>Evidence</div>
        {point.evidence.length === 0 ? <EmptyState text="No evidence attached yet." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {point.evidence.map((e) => (
              <div key={e.id} style={{ border: `1px solid ${T.line}`, padding: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: T.inkSoft }}>{e.type} · {fmtDate(e.date)}</div>
                {e.description && <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4 }}>{e.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Public views                                                            */
/* ----------------------------------------------------------------------- */
function Overview({ points, goTab }) {
  const completion = computeCompletion(points);
  const counts = statusCounts(points);
  return (
    <div>
      <div style={{ display: "flex", gap: 36, flexWrap: "wrap", alignItems: "center", marginBottom: 36 }}>
        <ProgressRing value={completion} />
        <div style={{ flex: "1 1 260px" }}>
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 26, fontWeight: 600, margin: "0 0 8px" }}>
            {REP.hostel}'s manifesto, tracked
          </h1>
          <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.6, maxWidth: 440, margin: 0 }}>
            {REP.name} made 18 promises for this term. This page shows what's done, what isn't, and why.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 40, paddingBottom: 32, borderBottom: `1px solid ${T.line}` }}>
        <Stat label="Done" value={counts.COMPLETED} color={T.green} />
        <Stat label="In progress" value={counts.IN_PROGRESS} color={T.navy} />
        <Stat label="Awaiting approval" value={counts.AWAITING_APPROVAL} color={T.amber} />
        <Stat label="Delayed" value={counts.DELAYED} color={T.red} />
        <Stat label="Blocked" value={counts.BLOCKED} color={T.red} />
        <Stat label="Not started" value={counts.NOT_STARTED} color={T.grey} />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => goTab("manifesto")} style={btnPrimary}>View the manifesto</button>
        <button onClick={() => goTab("issues")} style={btnSecondary}>See what's stuck</button>
      </div>
    </div>
  );
}

function ManifestoList({ points, onOpen }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("recent");

  const filtered = useMemo(() => {
    let r = points.filter((p) =>
      (cat === "ALL" || p.category === cat) &&
      (status === "ALL" || p.status === status) &&
      (q === "" || p.title.toLowerCase().includes(q.toLowerCase()))
    );
    if (sort === "progress") r = [...r].sort((a, b) => b.progress - a.progress);
    if (sort === "priority") { const o = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }; r = [...r].sort((a, b) => o[a.priority] - o[b.priority]); }
    if (sort === "alpha") r = [...r].sort((a, b) => a.title.localeCompare(b.title));
    return r;
  }, [points, q, cat, status, sort]);

  return (
    <div>
      <Heading sub={`${points.length} promises`}>Manifesto</Heading>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ position: "relative", flex: "1 1 180px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.inkSoft }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" style={{ ...inputStyle, paddingLeft: 30, width: "100%" }} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={inputStyle}>
          <option value="ALL">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
          <option value="ALL">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={inputStyle}>
          <option value="recent">Default order</option>
          <option value="progress">By progress</option>
          <option value="priority">By priority</option>
          <option value="alpha">A–Z</option>
        </select>
      </div>
      {filtered.length === 0 ? <EmptyState text="Nothing matches these filters." /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
          {filtered.map((p) => <ManifestoCard key={p.id} p={p} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function ProgressDashboard({ points }) {
  const completion = computeCompletion(points);
  const counts = statusCounts(points);
  const catData = computeCategoryCompletion(points);
  return (
    <div>
      <Heading>Progress</Heading>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 36, paddingBottom: 30, borderBottom: `1px solid ${T.line}` }}>
        <Stat label="Total" value={points.length} />
        <Stat label="Overall" value={`${Math.round(completion)}%`} color={T.navy} />
        <Stat label="Done" value={counts.COMPLETED} color={T.green} />
        <Stat label="In progress" value={counts.IN_PROGRESS} color={T.navy} />
        <Stat label="Delayed" value={counts.DELAYED} color={T.red} />
        <Stat label="Blocked" value={counts.BLOCKED} color={T.red} />
        <Stat label="Not started" value={counts.NOT_STARTED} color={T.grey} />
      </div>

      <Label>By category</Label>
      <BarByCategory catData={catData} />

      <Label>By status</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
        {Object.entries(STATUS).map(([k, v]) => {
          const n = counts[k];
          const pct = points.length ? (n / points.length) * 100 : 0;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 110, flexShrink: 0, fontSize: 12.5 }}>{v.label}</div>
              <div style={{ flex: 1, minWidth: 0 }}><ProgressBar value={pct} color={v.color} /></div>
              <div style={{ width: 20, flexShrink: 0, fontSize: 12, textAlign: "right" }}>{n}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarByCategory({ catData }) {
  const isMobile = useIsMobile(560);
  return (
    <div style={{ height: 220, marginBottom: 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={catData} layout="vertical" margin={{ left: 0, right: 16 }}>
          <CartesianGrid stroke={T.line} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: T.inkSoft }} />
          <YAxis type="category" dataKey="category" width={isMobile ? 108 : 170} tick={{ fontSize: isMobile ? 9.5 : 11, fill: T.ink }} />
          <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, background: T.panel, border: `1px solid ${T.line}`, color: T.ink }} />
          <Bar dataKey="pct" fill={T.navy} radius={[0, 2, 2, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UpdatesFeed({ points }) {
  const all = useMemo(() => {
    const items = [];
    points.forEach((p) => p.updates.forEach((u) => items.push({ ...u, pointTitle: p.title })));
    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [points]);
  return (
    <div>
      <Heading>Updates</Heading>
      {all.length === 0 ? <EmptyState text="Nothing published yet." /> : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {all.map((u, i) => (
            <div key={u.id + i} style={{ borderTop: i === 0 ? "none" : `1px solid ${T.line}`, padding: "16px 0" }}>
              <div style={{ fontSize: 11.5, color: T.inkSoft }}>{fmtDate(u.date)} · {u.pointTitle}</div>
              <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 16, margin: "4px 0" }}>{u.title}</div>
              <p style={{ ...pText, margin: 0 }}>{u.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelinePage() {
  return (
    <div>
      <Heading>Timeline</Heading>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {TERM_EVENTS.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: T.navy, marginTop: 5 }} />
              {i < TERM_EVENTS.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 30, background: T.line }} />}
            </div>
            <div style={{ paddingBottom: 24 }}>
              <div style={{ fontSize: 12, color: T.inkSoft }}>{fmtDate(e.date)}</div>
              <div style={{ fontSize: 14.5, marginTop: 3 }}>{e.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssuesPage({ points, onOpen }) {
  const groups = [
    ["Delayed", points.filter((p) => p.status === "DELAYED")],
    ["Blocked", points.filter((p) => p.status === "BLOCKED")],
    ["Awaiting approval", points.filter((p) => p.status === "AWAITING_APPROVAL")],
  ];
  const any = groups.some(([, l]) => l.length > 0);
  return (
    <div>
      <Heading sub="Everything delayed, blocked, or waiting on someone else.">Issues</Heading>
      {!any && <EmptyState text="Nothing is stuck right now." />}
      {groups.map(([label, list]) => list.length > 0 && (
        <div key={label} style={{ marginBottom: 28 }}>
          <Label>{label} ({list.length})</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
            {list.map((p) => <ManifestoCard key={p.id} p={p} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function AboutPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <Heading>About</Heading>
      <p style={pText}>
        {REP.name} ({REP.id}) is the {REP.role} of {REP.hostel}. This manifesto was verified by the {REP.verifiedBy} on {fmtDate(REP.verifiedDate)}.
      </p>
      <p style={{ ...pText, marginTop: 12 }}>
        This site is one of the promises — a public tracker for the other 17.
      </p>
    </div>
  );
}

function MethodologyPage() {
  return (
    <div style={{ maxWidth: 620 }}>
      <Heading sub="Every number on this site is calculated the same way, every time. Here's exactly how.">How this works</Heading>

      <Label>Statuses</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 30 }}>
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <div style={{ width: 150, flexShrink: 0 }}><StatusBadge status={k} size="sm" /></div>
            <div style={{ fontSize: 13, color: T.inkSoft }}>{v.desc}</div>
          </div>
        ))}
      </div>

      <Label>Each promise's own progress (0–100%)</Label>
      <p style={pText}>
        This part isn't calculated — it's a judgment call the H-Rep makes and publishes, the same way the status is
        chosen. There's no automatic formula for "72% done" on a single promise; it's an honest estimate, and every
        change to it is timestamped in that promise's Updates and in the activity log on the Admin page, so you can
        see exactly when and by how much it moved.
      </p>

      <Label>The headline number (overall progress)</Label>
      <p style={{ ...pText, marginBottom: 10 }}>
        The big percentage on the Overview page is a <b>plain average</b> of every live promise's progress. Every
        promise counts exactly the same — there's no weighting by importance, so a small promise and a critical one
        move the number by the same amount.
      </p>
      <div style={{ background: T.greySoft, padding: 14, fontSize: 13, lineHeight: 1.7, marginBottom: 10, fontFamily: "monospace" }}>
        overall % = Σ (progress) ÷ (number of live promises)
      </div>
      <p style={{ ...pText, marginBottom: 22 }}>
        For example: one promise at 60% and one at 0% combine to (60 + 0) ÷ 2 = <b>30%</b>. Nobody types the
        headline number in directly; it only moves when an individual promise's progress changes.
      </p>

      <Label>Category breakdown</Label>
      <p style={pText}>
        The "By category" bars on the Progress page use the exact same formula, just scoped to the promises in that
        category instead of all 18 — so "Infrastructure & Maintenance" at 40% means the plain average of only the
        promises tagged under that category.
      </p>

      <Label>Promises that are "Dropped"</Label>
      <p style={pText}>
        A promise marked Dropped is excluded entirely from both the top and bottom of the formula above — it doesn't
        drag the percentage down as if it failed, but it also can't inflate it. It stays visible on the Manifesto
        page, clearly labeled, so nothing quietly disappears; it's just not counted as either progress or a shortfall.
      </p>

      <Label>Stages</Label>
      <p style={pText}>
        Each promise's detail page shows a five-stage timeline — Identified, Discussed with authorities, Request
        submitted, Approved/work started, Delivered. This is a visual read-out of the current status (for example,
        "Awaiting approval" or "Partly done" both show as the fourth stage), not a separate number — it's there to
        show roughly how far along the process is, not just the percentage.
      </p>

      <Label>Updates, evidence, and the audit log</Label>
      <p style={pText}>
        Every time an admin changes a promise's status or progress, it's optionally logged as an "Update" on that
        promise's page (with the before/after progress and status recorded automatically) and always logged in the
        Admin tab's activity log. Evidence attached to a promise (documents, photos, links) is additional and never
        factors into the percentage — it's there so a claim of progress can be checked, not so it can inflate the
        number.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Admin — passcode is set on first use and stored only as a hash          */
/* ----------------------------------------------------------------------- */
function AdminGate({ onAuth }) {
  const [authHash, setAuthHash] = useState(undefined); // undefined = loading, null = not set
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("admin-auth", true);
        setAuthHash(res && res.value ? JSON.parse(res.value).hash : null);
      } catch { setAuthHash(null); }
    })();
  }, []);

  const createPasscode = async () => {
    if (pass.length < 6) return setErr("Use at least 6 characters.");
    if (pass !== confirm) return setErr("Passcodes don't match.");
    const hash = await sha256(pass);
    const result = await storage.set("admin-auth", JSON.stringify({ hash }), true, hash);
    if (!result) return setErr("Couldn't reach the shared database — see README.md.");
    onAuth(hash);
  };
  const login = async () => {
    const hash = await sha256(pass);
    if (hash === authHash) onAuth(hash);
    else setErr("Incorrect passcode.");
  };

  if (authHash === undefined) return null;

  return (
    <div style={{ maxWidth: 340, margin: "50px auto", textAlign: "center" }}>
      <Lock size={20} color={T.navy} />
      {authHash === null ? (
        <>
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 19, margin: "12px 0 6px" }}>Set an admin passcode</h2>
          <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 16 }}>Nobody has set one up yet — do it once here.</p>
          <input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }} placeholder="New passcode" style={{ ...inputStyle, width: "100%", textAlign: "center", marginBottom: 8 }} />
          <input type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErr(""); }} placeholder="Confirm passcode" style={{ ...inputStyle, width: "100%", textAlign: "center", marginBottom: 10 }} onKeyDown={(e) => e.key === "Enter" && createPasscode()} />
          <button onClick={createPasscode} style={{ ...btnPrimary, width: "100%" }}>Set passcode</button>
        </>
      ) : (
        <>
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 19, margin: "12px 0 6px" }}>Admin</h2>
          <input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(""); }} placeholder="Passcode" style={{ ...inputStyle, width: "100%", textAlign: "center", marginBottom: 10 }} onKeyDown={(e) => e.key === "Enter" && login()} />
          <button onClick={login} style={{ ...btnPrimary, width: "100%" }}>Enter</button>
        </>
      )}
      {err && <div style={{ color: T.red, fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 16, lineHeight: 1.6 }}>
        Only a scrambled version of the passcode is stored — never the passcode itself.
      </div>
    </div>
  );
}

function AdminPanel({ points, setPoints, logAudit }) {
  const [selected, setSelected] = useState(points[0]?.id || null);
  const point = points.find((p) => p.id === selected);
  const [form, setForm] = useState(point || {});
  useEffect(() => { setForm(point || {}); }, [selected]);
  const updatePoint = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    setPoints((prev) => prev.map((p) => (p.id === selected ? { ...p, ...form } : p)));
    logAudit(`"${form.title}" set to ${STATUS[form.status]?.label}, ${form.progress}%`);
  };

  const [updateDraft, setUpdateDraft] = useState({ title: "", body: "" });
  const addUpdate = () => {
    if (!updateDraft.title) return;
    const u = { id: "u" + Date.now(), date: todayISO(), title: updateDraft.title, body: updateDraft.body,
      progressBefore: point.progress, progressAfter: form.progress, statusBefore: point.status, statusAfter: form.status, author: REP.name, evidence: [] };
    setPoints((prev) => prev.map((p) => (p.id === selected ? { ...p, ...form, updates: [...p.updates, u] } : p)));
    logAudit(`Update on "${form.title}": ${updateDraft.title}`);
    setUpdateDraft({ title: "", body: "" });
  };

  const [evDraft, setEvDraft] = useState({ title: "", type: "External link", description: "" });
  const addEvidence = () => {
    if (!evDraft.title) return;
    const e = { id: "e" + Date.now(), date: todayISO(), ...evDraft };
    setPoints((prev) => prev.map((p) => (p.id === selected ? { ...p, evidence: [...p.evidence, e] } : p)));
    logAudit(`Evidence on "${point.title}": ${evDraft.title}`);
    setEvDraft({ title: "", type: "External link", description: "" });
  };

  const isMobile = useIsMobile(760);

  if (!point) return <EmptyState text="No manifesto points found." />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px 1fr", gap: 24 }}>
      <div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>Points</div>
        <div style={{ display: "flex", flexDirection: "column", maxHeight: isMobile ? 220 : 540, overflowY: "auto", border: `1px solid ${T.line}` }}>
          {points.map((p) => (
            <div key={p.id} onClick={() => setSelected(p.id)}
              style={{ padding: "9px 11px", fontSize: 12.5, cursor: "pointer",
                background: p.id === selected ? T.navySoft : T.panel, borderBottom: `1px solid ${T.line}`,
                color: p.id === selected ? T.navy : T.ink }}>
              {p.title.length > 44 ? p.title.slice(0, 44) + "…" : p.title}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 19, marginBottom: 18 }}>{form.title}</h2>

        <FieldRow label="Status">
          <select value={form.status} onChange={(e) => updatePoint({ status: e.target.value })} style={inputStyle}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Progress">
          <input type="range" min={0} max={100} value={form.progress} onChange={(e) => updatePoint({ progress: Number(e.target.value) })} style={{ width: "100%", maxWidth: 200 }} />
          <span style={{ marginLeft: 10, fontSize: 13 }}>{form.progress}%</span>
        </FieldRow>
        <FieldRow label="Priority">
          <select value={form.priority} onChange={(e) => updatePoint({ priority: e.target.value })} style={inputStyle}>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Weight">
          <select value={form.weight} onChange={(e) => updatePoint({ weight: Number(e.target.value) })} style={inputStyle}>
            {Object.entries(WEIGHTS).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Target date">
          <input type="date" value={form.targetDate || ""} onChange={(e) => updatePoint({ targetDate: e.target.value })} style={inputStyle} />
        </FieldRow>

        {(form.status === "DELAYED" || form.status === "BLOCKED" || form.status === "AWAITING_APPROVAL") && (
          <>
            <FieldRow label="Reason"><input value={form.delayReason || ""} onChange={(e) => updatePoint({ delayReason: e.target.value })} style={{ ...inputStyle, width: "100%", maxWidth: 300 }} /></FieldRow>
            <FieldRow label="Waiting on"><input value={form.blockedBy || ""} onChange={(e) => updatePoint({ blockedBy: e.target.value, externalDependency: e.target.value })} style={{ ...inputStyle, width: "100%", maxWidth: 300 }} /></FieldRow>
            <FieldRow label="Next step"><input value={form.nextAction || ""} onChange={(e) => updatePoint({ nextAction: e.target.value })} style={{ ...inputStyle, width: "100%", maxWidth: 300 }} /></FieldRow>
            <FieldRow label="Expected by"><input type="date" value={form.expectedResolution || ""} onChange={(e) => updatePoint({ expectedResolution: e.target.value })} style={inputStyle} /></FieldRow>
          </>
        )}

        <FieldRow label="Why it matters" top><textarea value={form.whyMatters || ""} onChange={(e) => updatePoint({ whyMatters: e.target.value })} style={{ ...inputStyle, width: "100%", maxWidth: 360, height: 56 }} /></FieldRow>
        <FieldRow label="Current situation" top><textarea value={form.currentSituation || ""} onChange={(e) => updatePoint({ currentSituation: e.target.value })} style={{ ...inputStyle, width: "100%", maxWidth: 360, height: 56 }} /></FieldRow>

        <button onClick={save} style={{ ...btnPrimary, marginTop: 6 }}>Save</button>

        <div style={{ marginTop: 30, borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Add an update</div>
          <input placeholder="Title" value={updateDraft.title} onChange={(e) => setUpdateDraft((d) => ({ ...d, title: e.target.value }))} style={{ ...inputStyle, width: "100%", maxWidth: 360, marginBottom: 8, display: "block" }} />
          <textarea placeholder="Details" value={updateDraft.body} onChange={(e) => setUpdateDraft((d) => ({ ...d, body: e.target.value }))} style={{ ...inputStyle, width: "100%", maxWidth: 360, height: 56, marginBottom: 8, display: "block" }} />
          <button onClick={addUpdate} style={btnSecondary}>Publish</button>
        </div>

        <div style={{ marginTop: 26, borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Attach evidence</div>
          <input placeholder="Title" value={evDraft.title} onChange={(e) => setEvDraft((d) => ({ ...d, title: e.target.value }))} style={{ ...inputStyle, width: "100%", maxWidth: 280, marginBottom: 8, marginRight: 8, display: "block" }} />
          <select value={evDraft.type} onChange={(e) => setEvDraft((d) => ({ ...d, type: e.target.value }))} style={{ ...inputStyle, marginBottom: 8, maxWidth: "100%" }}>
            {["Image", "PDF", "Document", "Meeting minutes", "Official notice", "Email", "Form", "Screenshot", "External link"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <textarea placeholder="Short description" value={evDraft.description} onChange={(e) => setEvDraft((d) => ({ ...d, description: e.target.value }))} style={{ ...inputStyle, width: "100%", maxWidth: 360, height: 48, marginBottom: 8, display: "block" }} />
          <button onClick={addEvidence} style={btnSecondary}>Attach</button>
        </div>
      </div>
    </div>
  );
}
function FieldRow({ label, children, top }) {
  const isMobile = useIsMobile(560);
  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "stretch" : (top ? "flex-start" : "center"),
      gap: isMobile ? 5 : 14, marginBottom: 12,
    }}>
      <div style={{ width: isMobile ? "auto" : 140, flexShrink: 0, fontSize: 12.5, color: T.inkSoft, paddingTop: !isMobile && top ? 8 : 0 }}>{label}</div>
      <div style={{ width: isMobile ? "100%" : "auto", minWidth: 0 }}>{children}</div>
    </div>
  );
}

function AuditLogView({ log }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Activity log</div>
      {log.length === 0 ? <EmptyState text="Nothing logged yet." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
          {[...log].reverse().map((l, i) => (
            <div key={i} style={{ fontSize: 12, color: T.inkSoft, borderBottom: `1px solid ${T.line}`, paddingBottom: 6 }}>
              {fmtDate(l.date)} — {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Root app                                                                 */
/* ----------------------------------------------------------------------- */
const TABS = [
  ["overview", "Overview"], ["manifesto", "Manifesto"], ["progress", "Progress"],
  ["updates", "Updates"], ["timeline", "Timeline"], ["issues", "Issues"],
  ["about", "About"], ["methodology", "How this works"],
];

export default function ManifestoPortal() {
  const [points, setPoints] = useState(SEED_POINTS);
  const [auditLog, setAuditLog] = useState([]);
  const [tab, setTab] = useState("overview");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminHash, setAdminHash] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState("light");
  const [saveError, setSaveError] = useState(false);

  const logAudit = useCallback((text) => setAuditLog((prev) => [...prev, { date: todayISO(), text }]), []);

  // Theme is a personal, per-device preference — it stays in this browser's
  // localStorage rather than the shared database.
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("theme-pref", false);
        if (res && res.value) setTheme(res.value);
        else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
      } catch {}
    })();
  }, []);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    storage.set("theme-pref", next, false).catch(() => {});
  };

  // Portal data (the manifesto points + audit log) is shared: every visitor
  // reads the same copy from the database behind /api/storage.
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("portal-data", true);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.points) setPoints(parsed.points);
          if (parsed.auditLog) setAuditLog(parsed.auditLog);
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  // Only push writes back to the shared database when they came from an
  // authenticated admin session — a plain visitor never changes this state,
  // so this effectively only fires after an edit in the Admin tab.
  useEffect(() => {
    if (!loaded || !adminAuthed) return;
    const t = setTimeout(() => {
      storage.set("portal-data", JSON.stringify({ points, auditLog }), true, adminHash)
        .then((result) => setSaveError(!result))
        .catch(() => setSaveError(true));
    }, 400);
    return () => clearTimeout(t);
  }, [points, auditLog, loaded, adminAuthed, adminHash]);

  const openPoint = (id) => setSelectedPoint(id);
  const pointObj = points.find((p) => p.id === selectedPoint);
  const goTab = (t) => { setTab(t); setSelectedPoint(null); };

  let body;
  if (selectedPoint && pointObj) body = <ManifestoDetail point={pointObj} onBack={() => setSelectedPoint(null)} />;
  else if (tab === "overview") body = <Overview points={points} goTab={goTab} />;
  else if (tab === "manifesto") body = <ManifestoList points={points} onOpen={openPoint} />;
  else if (tab === "progress") body = <ProgressDashboard points={points} />;
  else if (tab === "updates") body = <UpdatesFeed points={points} />;
  else if (tab === "timeline") body = <TimelinePage />;
  else if (tab === "issues") body = <IssuesPage points={points} onOpen={openPoint} />;
  else if (tab === "about") body = <AboutPage />;
  else if (tab === "methodology") body = <MethodologyPage />;
  else if (tab === "admin") {
    body = !adminAuthed ? (
      <AdminGate onAuth={(hash) => { setAdminAuthed(true); setAdminHash(hash); setSaveError(false); }} />
    ) : (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 22, margin: 0 }}>Admin</h1>
          <button onClick={() => setAdminAuthed(false)} style={btnGhost}>Log out</button>
        </div>
        {saveError && (
          <div style={{ background: T.redSoft, color: T.red, padding: "10px 14px", fontSize: 12.5, marginBottom: 16 }}>
            Your last change couldn't be saved to the shared database. Check the API/database setup in README.md.
          </div>
        )}
        <AdminPanel points={points} setPoints={setPoints} logAudit={logAudit} />
        <AuditLogView log={auditLog} />
      </div>
    );
  }

  return (
    <div className="mp-root" data-theme={theme} style={{ background: T.bg, minHeight: "100vh", color: T.ink, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        ${FONT_IMPORT}
        ${THEME_CSS}
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; max-width: 100%; min-height: 100%; overflow-x: hidden; }
        img, svg { max-width: 100%; }
        input, select, textarea { max-width: 100%; }
        input:focus, select:focus, textarea:focus, button:focus { outline: 2px solid ${T.navy}; outline-offset: 1px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <header style={{ borderBottom: `1px solid ${T.line}`, background: T.panel, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div onClick={() => goTab("overview")} style={{ cursor: "pointer", fontFamily: "'Source Serif 4', serif", fontSize: 17, fontWeight: 600 }}>
            {REP.hostel} Manifesto
          </div>
          <nav style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(([k, label]) => (
              <button key={k} onClick={() => goTab(k)} style={{
                background: tab === k && !selectedPoint ? T.navySoft : "none", border: "none",
                color: tab === k && !selectedPoint ? T.navy : T.inkSoft, fontSize: 12.5, padding: "7px 9px", cursor: "pointer",
              }}>
                {label}
              </button>
            ))}
            <button onClick={() => goTab("admin")} style={{
              background: "none", border: "none", color: tab === "admin" ? T.navy : T.inkSoft,
              fontSize: 12.5, padding: "7px 9px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3,
            }}>
              Admin
            </button>
            <button onClick={toggleTheme} aria-label="Toggle dark mode" style={{
              background: "none", border: `1px solid ${T.line}`, color: T.inkSoft,
              width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", marginLeft: 6,
            }}>
              {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
            </button>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 940, margin: "0 auto", padding: "30px 20px 70px" }}>
        {body}
      </main>

      <footer style={{ borderTop: `1px solid ${T.line}`, padding: "18px 20px", textAlign: "center", fontSize: 11.5, color: T.inkSoft }}>
        {REP.hostel} · {REP.name} · verified {fmtDate(REP.verifiedDate)}
      </footer>
    </div>
  );
}

