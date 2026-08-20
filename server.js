const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();

const TERMS_VERSION = "2026-08-20-v2";

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.get("/turu-logo-v2.png", (req, res) => res.sendFile(__dirname + "/turu-logo-v2.png"));

const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined
});

app.set("trust proxy", 1);

app.use(session({
  store: new pgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || "CHANGE_THIS_SESSION_SECRET",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 30
  }
}));

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function berlinDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function berlinTimeMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const hour = Number(
    parts.find(p => p.type === "hour")?.value || 0
  );

  const minute = Number(
    parts.find(p => p.type === "minute")?.value || 0
  );

  return hour * 60 + minute;
}

function isPastSlot(date, start) {
  const today = berlinDate();

  if (date < today) return true;
  if (date > today) return false;

  const [hour, minute] = String(start).split(":").map(Number);

  return hour * 60 + minute <= berlinTimeMinutes();
}

function page(title, body, req) {
  return `<!doctype html>
<html lang="de">
<head>
<meta name="theme-color" content="#0b4aa2">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="TuRU Padel">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/turu-logo-v2.png">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – TuRU 1880 Padel</title>

<style>
:root{
  --blue:#174b9b;
  --blue-dark:#123b7c;
  --blue-light:#edf4ff;
  --text:#172033;
  --muted:#667085;
  --line:#e5eaf2;
  --bg:#f6f8fc;
  --white:#ffffff;
  --green:#138a55;
  --orange:#c47b00;
  --red:#c0392b;
}

*{
  box-sizing:border-box;
}

body{
  margin:0;
  font-family:Arial,Helvetica,sans-serif;
  background:var(--bg);
  color:var(--text);
}

a{
  color:var(--blue);
  text-decoration:none;
  font-weight:700;
}

a:hover{
  text-decoration:underline;
}

.topbar{
  background:#fff;
  border-bottom:1px solid var(--line);
}

.brand{
  max-width:1120px;
  margin:0 auto;
  padding:24px 22px 18px;
  display:flex;
  align-items:center;
  gap:14px;
}

.brand-logo{
  width:48px;
  height:48px;
  object-fit:contain;
  border-radius:12px;
}

.brand-title{
  font-size:23px;
  font-weight:900;
  color:var(--blue);
  line-height:1.1;
}

.brand-sub{
  margin-top:4px;
  color:var(--muted);
  font-size:13px;
}

.nav{
  max-width:1120px;
  margin:0 auto;
  padding:0 22px 18px;
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  align-items:center;
}

.nav a,
.nav button{
  border:1px solid var(--line);
  background:#fff;
  color:#334155;
  padding:9px 13px;
  border-radius:9px;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
}

.nav a:hover,
.nav button:hover{
  background:var(--blue-light);
  border-color:#c9daf7;
  text-decoration:none;
}

.nav .primary,
.nav .active{
  background:var(--blue);
  color:#fff;
  border-color:var(--blue);
}

.nav .primary:hover,
.nav .active:hover{
  background:var(--blue-dark);
  color:#fff;
}

main{
  max-width:1120px;
  margin:28px auto 60px;
  padding:0 22px;
}

.hero{
  background:#fff;
  border:1px solid var(--line);
  border-radius:18px;
  padding:30px;
  margin-bottom:20px;
  box-shadow:0 8px 28px rgba(20,40,80,.06);
}

.hero h1{
  margin:0 0 8px;
  color:var(--blue);
  font-size:30px;
}

.hero p{
  margin:7px 0;
  color:var(--muted);
  line-height:1.6;
}

.card{
  background:#fff;
  border:1px solid var(--line);
  border-radius:16px;
  padding:24px;
  margin-bottom:20px;
  box-shadow:0 6px 22px rgba(20,40,80,.05);
}

.card h2{
  margin:0 0 16px;
  color:#18345f;
  font-size:21px;
}

.muted{
  color:var(--muted);
}

.actions{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-top:18px;
}

.btn,
button.btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:42px;
  padding:10px 17px;
  border:1px solid var(--blue);
  border-radius:10px;
  background:var(--blue);
  color:#fff;
  font-weight:800;
  cursor:pointer;
  text-decoration:none;
}

.btn:hover,
button.btn:hover{
  background:var(--blue-dark);
  text-decoration:none;
}

.btn.secondary{
  background:#fff;
  color:var(--blue);
  border-color:#c9d7ed;
}

.btn.secondary:hover{
  background:var(--blue-light);
}

.btn.danger{
  background:#fff;
  color:var(--red);
  border-color:#efc7c2;
}

.btn.danger:hover{
  background:#fff4f2;
}

form{
  margin:0;
}

label{
  display:block;
  margin:14px 0 7px;
  font-weight:800;
  color:#344054;
}

input{
  width:100%;
  max-width:520px;
  padding:12px 13px;
  border:1px solid #cfd7e6;
  border-radius:10px;
  background:#fff;
  color:var(--text);
  font-size:15px;
  outline:none;
}

input:focus{
  border-color:#7ea4dd;
  box-shadow:0 0 0 3px rgba(23,75,155,.10);
}

input[type="date"]{
  max-width:240px;
}

.grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(185px,1fr));
  gap:12px;
}

.slot{
  background:#fff;
  border:1px solid #dbe4f2;
  border-radius:13px;
  padding:16px;
  text-align:center;
}

.slot:hover{
  border-color:#9db8df;
  box-shadow:0 5px 15px rgba(23,75,155,.08);
}

.slot-time{
  font-size:18px;
  font-weight:900;
  color:#18345f;
  margin-bottom:11px;
}

.slot.busy,
.slot.past{
  background:#f7f8fa;
  border-color:#e5e7eb;
  color:#8a919d;
}

.slot.busy:hover,
.slot.past:hover{
  box-shadow:none;
  border-color:#e5e7eb;
}

.slot-status{
  font-size:13px;
  font-weight:800;
  color:#7b8492;
}

.ok{
  border-left:5px solid var(--green);
}

.warn{
  border-left:5px solid var(--orange);
}

.error{
  border-left:5px solid var(--red);
}

.notice{
  padding:13px 15px;
  background:var(--blue-light);
  border:1px solid #d7e5fb;
  border-radius:10px;
  color:#315486;
  margin-top:15px;
}

table{
  width:100%;
  border-collapse:separate;
  border-spacing:0;
  overflow:hidden;
  border:1px solid var(--line);
  border-radius:12px;
}

th{
  background:#f1f5fb;
  color:#334155;
  padding:13px;
  text-align:left;
  font-size:13px;
}

td{
  padding:13px;
  border-top:1px solid var(--line);
  vertical-align:middle;
}

.badge{
  display:inline-block;
  padding:5px 9px;
  border-radius:999px;
  font-size:12px;
  font-weight:900;
  background:#eef2f7;
  color:#667085;
}

.badge.ok{
  border:0;
  background:#e9f8f0;
  color:#147a4b;
}

.badge.warn{
  border:0;
  background:#fff4dc;
  color:#996000;
}

.badge.error{
  border:0;
  background:#fff0ee;
  color:#b33226;
}


/* Kalenderansichten – im bestehenden TuRU-Design */
.calendar-toolbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
  margin-bottom:18px;
}
.calendar-tabs{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}
.calendar-tabs a{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:9px 13px;
  border:1px solid var(--line);
  border-radius:9px;
  background:#fff;
  color:#334155;
  font-size:14px;
  font-weight:800;
}
.calendar-tabs a.active{
  background:var(--blue);
  color:#fff;
  border-color:var(--blue);
}
.calendar-nav{
  display:flex;
  align-items:center;
  gap:8px;
}
.calendar-nav a{
  display:inline-flex;
  min-width:38px;
  min-height:38px;
  align-items:center;
  justify-content:center;
  border:1px solid var(--line);
  border-radius:9px;
  background:#fff;
  color:var(--blue);
  font-weight:900;
}
.calendar-nav .today{
  padding:9px 12px;
  min-width:auto;
}
.calendar-title{
  font-size:20px;
  font-weight:900;
  color:#18345f;
}
.calendar-legend{
  display:flex;
  gap:14px;
  flex-wrap:wrap;
  margin-top:15px;
  color:var(--muted);
  font-size:13px;
  font-weight:800;
}
.calendar-legend span{
  display:inline-flex;
  align-items:center;
  gap:6px;
}
.legend-dot{
  width:10px;
  height:10px;
  border-radius:50%;
  display:inline-block;
}
.legend-free{background:var(--green)}
.legend-busy{background:var(--red)}
.legend-blocked{background:var(--orange)}

.week-calendar{
  display:grid;
  grid-template-columns:78px repeat(7,minmax(110px,1fr));
  border:1px solid var(--line);
  border-radius:12px;
  overflow:hidden;
  background:#fff;
  min-width:850px;
}
.week-calendar .wc-head,
.week-calendar .wc-time,
.week-calendar .wc-cell{
  min-height:70px;
  border-right:1px solid var(--line);
  border-bottom:1px solid var(--line);
  padding:8px;
}
.week-calendar .wc-head{
  background:#f1f5fb;
  color:#18345f;
  text-align:center;
  font-weight:900;
}
.week-calendar .wc-head small{
  display:block;
  margin-top:3px;
  color:var(--muted);
  font-weight:700;
}
.week-calendar .wc-time{
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:900;
  color:#18345f;
  background:#fafbfd;
}
.wc-cell{
  background:#fff;
}
.wc-slot{
  width:100%;
  min-height:52px;
  border-radius:9px;
  padding:7px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  text-align:center;
  font-size:11px;
  font-weight:900;
  line-height:1.25;
}
.wc-slot.free{
  background:#eaf8f1;
  color:#147a4b;
}
.wc-slot.busy{
  background:#fff0ee;
  color:#b33226;
}
.wc-slot.blocked{
  background:#fff4dc;
  color:#996000;
}
.wc-slot.past,
.wc-slot.limit{
  background:#f2f4f7;
  color:#8a919d;
}
.wc-name{
  margin-top:2px;
  font-weight:700;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.month-wrap{
  overflow-x:auto;
}
.month-calendar{
  display:grid;
  grid-template-columns:repeat(7,minmax(120px,1fr));
  min-width:840px;
  border:1px solid var(--line);
  border-radius:12px;
  overflow:hidden;
  background:#fff;
}
.month-head{
  background:#f1f5fb;
  color:#18345f;
  padding:10px 8px;
  text-align:center;
  font-size:13px;
  font-weight:900;
  border-right:1px solid var(--line);
  border-bottom:1px solid var(--line);
}
.month-day{
  min-height:112px;
  padding:9px;
  border-right:1px solid var(--line);
  border-bottom:1px solid var(--line);
  background:#fff;
}
.month-day.outside{
  background:#fafbfd;
  color:#a0a7b2;
}
.month-day-link{
  display:block;
  height:100%;
  color:inherit;
}
.month-number{
  font-weight:900;
  color:#18345f;
}
.month-day.outside .month-number{
  color:#a0a7b2;
}
.month-summary{
  margin-top:12px;
  display:flex;
  flex-wrap:wrap;
  gap:5px;
}
.month-pill{
  padding:4px 7px;
  border-radius:999px;
  font-size:10px;
  font-weight:900;
}
.month-pill.free{background:#eaf8f1;color:#147a4b}
.month-pill.busy{background:#fff0ee;color:#b33226}
.month-pill.blocked{background:#fff4dc;color:#996000}
.month-pill.limit{background:#f2f4f7;color:#8a919d}

.day-calendar{
  display:grid;
  gap:10px;
}
.calendar-slot{
  display:grid;
  grid-template-columns:150px 1fr auto;
  gap:14px;
  align-items:center;
  background:#fff;
  border:1px solid #dbe4f2;
  border-radius:13px;
  padding:14px 16px;
}
.calendar-slot .slot-time{
  margin:0;
}
.calendar-slot .slot-info{
  min-width:0;
}
.calendar-slot .slot-info strong{
  display:block;
  color:#18345f;
}
.calendar-slot .slot-info small{
  display:block;
  margin-top:3px;
  color:var(--muted);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.calendar-slot.free{
  border-left:4px solid var(--green);
}
.calendar-slot.busy{
  border-left:4px solid var(--red);
  background:#fbfbfc;
}
.calendar-slot.blocked{
  border-left:4px solid var(--orange);
  background:#fffdf8;
}
.calendar-slot.past,
.calendar-slot.limit{
  border-left:4px solid #b9bec7;
  background:#f7f8fa;
}
.calendar-status{
  font-size:13px;
  font-weight:900;
}
.calendar-status.free{color:var(--green)}
.calendar-status.busy{color:var(--red)}
.calendar-status.blocked{color:var(--orange)}
.calendar-status.past,
.calendar-status.limit{color:#7b8492}
.calendar-scroll{
  overflow-x:auto;
}

@media(max-width:700px){

  .brand{
    padding:18px 15px 14px;
  }

  .nav{
    padding:0 15px 14px;
  }

  main{
    padding:0 12px;
    margin-top:18px;
  }

  .hero,
  .card{
    padding:18px;
    border-radius:14px;
  }

  .hero h1{
    font-size:25px;
  }

  table{
    display:block;
    overflow-x:auto;
    white-space:nowrap;
  }
}
</style>

<style>
.terms-fixed{
  position:fixed;right:16px;bottom:16px;z-index:9999;
  display:inline-flex;align-items:center;gap:6px;
  padding:10px 14px;border-radius:999px;
  background:#0b5ed7;color:#fff;text-decoration:none;
  font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25)
}
.terms-fixed:hover{filter:brightness(1.08);color:#fff}
</style>

</head>
<body>

<header class="topbar">

  <div class="brand">

    <img class="brand-logo" src="/turu-logo-v2.png" alt="TuRU 1880 Düsseldorf">

    <div>
      <div class="brand-title">
        TuRU 1880 Padel
      </div>

      <div class="brand-sub">
        Padelplatz buchen
      </div>
    </div>

  </div>

  ${nav(req)}

</header>

<main>
${body}
</main>

<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
</script>
<a class="terms-fixed" href="/terms" aria-label="Nutzungsbedingungen">📜 Nutzungsbedingungen</a>
</body>
</html>`;
}
function nav(req) {
  const path = req?.path || "";

  const active = (href, exact = false) =>
    (exact ? path === href : path === href || path.startsWith(href + "/"))
      ? "primary active"
      : "";

  if (!req?.session?.member) {
    return `<nav class="nav">
      <a class="${active("/", true)}" href="/">Startseite</a>
      <a class="${active("/login", true)}" href="/login">Mitglieder-Login</a>
      <a class="${active("/register", true)}" href="/register">Registrieren</a>
    </nav>`;
  }

  return `<nav class="nav">
    <a class="${active("/", true)}" href="/">Startseite</a>
    <a class="${active("/booking")}" href="/booking">Platz buchen</a>
    <a class="${active("/my-bookings")}" href="/my-bookings">Meine Buchungen</a>
    <a class="${active("/password")}" href="/password">Passwort ändern</a>
    ${req.session.member.admin
      ? `<a class="${active("/admin")}" href="/admin">Administration</a>`
      : ""}
    <form method="post" action="/logout">
      <button type="submit">Abmelden</button>
    </form>
  </nav>`;
}

const INACTIVITY_TIMEOUT_MS = 1000 * 60 * 30;

async function destroyMemberSessions(memberId) {
  await pool.query(`DELETE FROM user_sessions WHERE sess::text LIKE $1`, [`%\"id\":${Number(memberId)}%`]);
}

function touchSession(req) {
  if (req.session) req.session.lastActivity = Date.now();
}

function loginRequired(req, res, next) {
  if (!req.session.member) return res.redirect("/login");
  const last = Number(req.session.lastActivity || Date.now());
  if (Date.now() - last > INACTIVITY_TIMEOUT_MS) {
    return req.session.destroy(() => res.redirect("/login?reason=inactive"));
  }
  pool.query("SELECT id,name,email,status,admin,session_version FROM members WHERE id=$1", [req.session.member.id])
    .then(result => {
      const member = result.rows[0];
      if (!member || member.status !== "approved" || Number(req.session.sessionVersion || 1) !== Number(member.session_version || 1)) {
        return req.session.destroy(() => res.redirect("/login?reason=changed"));
      }
      req.session.member = { id: member.id, name: member.name, email: member.email, admin: member.admin };
      req.session.sessionVersion = Number(member.session_version || 1);
      touchSession(req);
      next();
    })
    .catch(error => { console.error(error); res.status(500).send("Serverfehler"); });
}

function adminRequired(req, res, next) {
  loginRequired(req, res, () => {
    if (!req.session.member?.admin) {
      return res.status(403).send(page("Kein Zugriff", nav(req) + '<div class="card error"><h2>Kein Zugriff</h2><p>Dieser Bereich ist nur für Administratoren verfügbar.</p></div>', req));
    }
    next();
  });
}

function slots() {
  const result = [];

  for (let minutes = 9 * 60; minutes < 22 * 60; minutes += 90) {

    const formatTime = value =>
      String(Math.floor(value / 60)).padStart(2, "0") +
      ":" +
      String(value % 60).padStart(2, "0");

    result.push({
      start: formatTime(minutes),
      end: formatTime(minutes + 90)
    });
  }

  return result;
}

function normalizeYmd(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : "";
}

function dateFromYmd(value) {
  const normalized = normalizeYmd(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return new Date(NaN);

  const [, y, m, d] = match.map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function weekdayFromYmd(value) {
  return dateFromYmd(value).getUTCDay();
}

function normalizeTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }

  const raw = String(value || "").trim();

  // PostgreSQL TIME normally arrives as HH:MM:SS.
  const match = raw.match(/^(\d{1,2}):(\d{2})/);

  if (!match) return "";

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function timeToMinutes(value) {
  const normalized = normalizeTime(value);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function blockTimeOverlaps(block, start, end) {
  // Keine Uhrzeit = komplette Sperre für den jeweiligen Tag.
  if (!block.start_time || !block.end_time) return true;

  const blockStart = timeToMinutes(block.start_time);
  const blockEnd = timeToMinutes(block.end_time);
  const slotStart = timeToMinutes(start);
  const slotEnd = timeToMinutes(end);

  if (
    blockStart === null ||
    blockEnd === null ||
    slotStart === null ||
    slotEnd === null
  ) {
    return false;
  }

  // Zeitintervalle überschneiden sich:
  // Slot-Beginn < Sperr-Ende UND Slot-Ende > Sperr-Beginn.
  return slotStart < blockEnd && slotEnd > blockStart;
}

function blockAppliesToDate(block, date) {
  const currentYmd = normalizeYmd(date);
  const startYmd = normalizeYmd(block.start_date);
  const endYmd = normalizeYmd(block.end_date || block.start_date);

  if (!currentYmd || !startYmd || !endYmd) return false;

  const current = dateFromYmd(currentYmd);
  const startDate = dateFromYmd(startYmd);
  const endDate = dateFromYmd(endYmd);

  if (
    Number.isNaN(current.getTime()) ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  ) {
    return false;
  }

  const type = String(block.recurrence_type || "once").toLowerCase();

  // Einmalige Sperre: zwischen Start- und Enddatum.
  if (type === "once") {
    return current >= startDate && current <= endDate;
  }

  const recurrenceEndYmd = normalizeYmd(block.recurrence_end_date);
  const recurrenceEnd = recurrenceEndYmd
    ? dateFromYmd(recurrenceEndYmd)
    : endDate;

  if (current < startDate || current > recurrenceEnd) {
    return false;
  }

  if (type === "daily") {
    return true;
  }

  if (type === "weekly") {
    const weekdays = Array.isArray(block.weekdays)
      ? block.weekdays.map(Number).filter(Number.isInteger)
      : [];

    const selectedWeekdays = weekdays.length
      ? weekdays
      : [startDate.getUTCDay()];

    return selectedWeekdays.includes(current.getUTCDay());
  }

  if (type === "monthly") {
    return current.getUTCDate() === startDate.getUTCDate();
  }

  return false;
}

async function getActiveBlocksForDate(date) {
  const selectedDate = normalizeYmd(date);

  if (!selectedDate) return [];

  // Keine SQL-Datumsfilterung hier: PostgreSQL liefert DATE/TIME je nach
  // Treiber-Konfiguration unterschiedlich. Die vollständige Prüfung erfolgt
  // anschließend zuverlässig in JavaScript.
  const result = await pool.query(`
    SELECT
      id,
      start_date,
      end_date,
      start_time,
      end_time,
      recurrence_type,
      weekdays,
      recurrence_end_date,
      reason,
      active
    FROM booking_blocks
    WHERE active = TRUE
    ORDER BY start_date, start_time, id
  `);

  return result.rows.filter(block =>
    blockAppliesToDate(block, selectedDate)
  );
}

async function isSlotBlocked(date, start, end) {
  const blocks = await getActiveBlocksForDate(date);

  return blocks.some(block =>
    blockTimeOverlaps(block, start, end)
  );
}

function recurrenceLabel(block) {
  if (block.recurrence_type === "once") return "Einmalig";
  if (block.recurrence_type === "daily") return "Täglich";
  if (block.recurrence_type === "monthly") return "Monatlich";

  if (block.recurrence_type === "weekly") {
    const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const days = Array.isArray(block.weekdays)
      ? block.weekdays.map(Number).sort((a, b) => a - b)
      : [];

    return "Wöchentlich" + (days.length
      ? " (" + days.map(day => names[day]).join(", ") + ")"
      : "");
  }

  return block.recurrence_type || "Einmalig";
}

function formatBlockTime(block) {
  if (!block.start_time || !block.end_time) return "Ganztägig";
  return `${String(block.start_time).slice(0, 5)}–${String(block.end_time).slice(0, 5)} Uhr`;
}

async function initDb() {

    await pool.query(`
    CREATE TABLE IF NOT EXISTS members(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      alias TEXT,
      terms_accepted_at TIMESTAMP,
      terms_version TEXT,
      session_version INTEGER NOT NULL DEFAULT 1
    );
  `);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS alias TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS terms_version TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS terms_acceptances(
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      terms_version TEXT NOT NULL,
      accepted_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_terms_acceptances_member
    ON terms_acceptances(member_id, accepted_at DESC);
  `);
  await pool.query(`
    INSERT INTO terms_acceptances(member_id, terms_version, accepted_at)
    SELECT m.id, m.terms_version, m.terms_accepted_at
    FROM members m
    WHERE m.terms_accepted_at IS NOT NULL
      AND m.terms_version IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM terms_acceptances a
        WHERE a.member_id = m.id
          AND a.terms_version = m.terms_version
          AND a.accepted_at = m.terms_accepted_at
      );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings(
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      booking_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(booking_date, start_time)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id);
  `);

await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
`);
  await pool.query(`
  CREATE TABLE IF NOT EXISTS booking_blocks (
    id SERIAL PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    recurrence_type VARCHAR(20) NOT NULL DEFAULT 'once',
    weekdays INTEGER[],
    recurrence_end_date DATE,
    reason TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE
  );
`);

  const email = (
    process.env.ADMIN_EMAIL || "rey@turu1880.de"
  ).trim().toLowerCase();

  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.warn(
      "ADMIN_PASSWORD fehlt. Admin wird nicht automatisch angelegt."
    );
    return;
  }

  const hash = await bcrypt.hash(password, 12);

  await pool.query(`
    INSERT INTO members(
      name,
      email,
      password_hash,
      status,
      admin
    )
    VALUES($1,$2,$3,'approved',TRUE)

    ON CONFLICT(email)
    DO UPDATE SET
      admin=TRUE,
      status='approved',
      password_hash=$3
  `, [
    "Administrator",
    email,
    hash
  ]);
}


app.get("/", (req, res) => {

  const content = req.session.member

    ? `
      <section class="hero">

        <h1>Willkommen bei TuRU 1880 Padel</h1>

        <p>
          Hallo <b>${esc(req.session.member.name)}</b>,
          hier kannst du deinen Padelplatz einfach und schnell buchen.
        </p>

        <div class="actions">

          <a class="btn" href="/booking">
            🎾 Platz buchen
          </a>

          <a class="btn secondary" href="/my-bookings">
            Meine Buchungen
          </a>

        </div>

      </section>

      <div class="card">

        <h2>Deine Buchung</h2>

        <p class="muted">
          Wähle einen freien Termin.
          Vergangene Termine können nicht gebucht werden.
        </p>

      </div>
    `

    : `
      <section class="hero">

        <h1>TuRU 1880 Padel</h1>

        <p>
          Die Buchungsseite für die Padelplätze
          von TuRU 1880 Düsseldorf.
        </p>

        <p>
          Padelplätze können ausschließlich von
          freigeschalteten Mitgliedern gebucht werden.
        </p>

        <div class="actions">

          <a class="btn" href="/login">
            Mitglieder-Login
          </a>

          <a class="btn secondary" href="/register">
            Mitglied registrieren
          </a>

        </div>

      </section>

      <div class="card">

        <h2>So funktioniert es</h2>

        <p class="muted">
          Registrieren, vom Administrator freischalten lassen
          und anschließend einen freien Termin auswählen.
        </p>

      </div>
    `;

  res.send(
    page(
      "Startseite",
      content,
      req
    )
  );
});


app.get("/terms", (req, res) => {
  res.send(page("Nutzungsbedingungen", `
    <div class="card">
      <h1>Nutzungsbedingungen – TuRU 1880 Padel</h1>
      <p class="muted">Version ${TERMS_VERSION} · Stand: 20.08.2026</p>

      <h2>1. Geltungsbereich</h2>
      <p>Diese Nutzungsbedingungen regeln die Nutzung der TuRU 1880 Padel-App und die darüber angebotenen Funktionen, insbesondere Registrierung, Buchung, Anzeige und Stornierung von Padelterminen.</p>

      <h2>2. Registrierung und Benutzerkonto</h2>
      <p>Für die Nutzung geschützter Funktionen ist ein persönliches Benutzerkonto erforderlich. Die bei der Registrierung gemachten Angaben müssen richtig sein. Zugangsdaten und Passwort sind vertraulich zu behandeln und dürfen nicht an andere Personen weitergegeben werden.</p>

      <h2>3. Zustimmung zu diesen Nutzungsbedingungen</h2>
      <p>Die Nutzungsbedingungen können jederzeit über diesen Bereich gelesen werden. Für Registrierung und Nutzung des Benutzerkontos ist eine aktive Zustimmung erforderlich. Ohne Zustimmung ist keine Registrierung beziehungsweise Nutzung der geschützten Funktionen möglich.</p>

      <h2>4. Buchungen</h2>
      <p>Buchungen sind erst verbindlich, nachdem sie in der App ausdrücklich bestätigt und erfolgreich gespeichert wurden. Jede Nutzerin und jeder Nutzer ist dafür verantwortlich, die ausgewählte Zeit und den Platz vor der Bestätigung zu prüfen. Buchungen in der Vergangenheit sind nicht möglich.</p>

      <h2>5. Stornierungen</h2>
      <p>Stornierungen müssen in der App ausdrücklich bestätigt werden. Nach erfolgreicher Stornierung ist der Termin wieder nach den jeweils geltenden Buchungsregeln verfügbar.</p>

      <h2>6. Anzeige von Namen und Alias</h2>
      <p>Bei Buchungen wird zur Information anderer Nutzer grundsätzlich der Vorname angezeigt. Stattdessen kann freiwillig ein Alias hinterlegt werden. Ist ein Alias vorhanden, kann dieser bei der Buchungsanzeige verwendet werden. Der Alias ist keine Pflichtangabe.</p>

      <h2>7. Verhalten und ordnungsgemäße Nutzung</h2>
      <p>Die Anlage und die App sind verantwortungsvoll zu nutzen. Unzulässig sind insbesondere missbräuchliche Buchungen, falsche Angaben, die Nutzung fremder Konten sowie Handlungen, die den ordnungsgemäßen Betrieb oder andere Nutzer beeinträchtigen.</p>

      <h2>8. Sperrung und Rechteänderungen</h2>
      <p>Bei Verstößen gegen diese Nutzungsbedingungen oder bei organisatorischer Notwendigkeit kann ein Benutzerkonto gesperrt oder dessen Rechte geändert werden. Gesperrte Nutzer dürfen geschützte Funktionen nicht weiter nutzen. Bei Sperrungen oder relevanten Rechteänderungen kann eine bestehende Sitzung automatisch beendet werden.</p>

      <h2>9. Verfügbarkeit und technische Änderungen</h2>
      <p>Ein Anspruch auf eine jederzeit störungsfreie Verfügbarkeit der App besteht nicht. Funktionen, Buchungsregeln und technische Abläufe können weiterentwickelt oder angepasst werden.</p>

      <h2>10. Änderungen der Nutzungsbedingungen</h2>
      <p>Diese Nutzungsbedingungen können für die Weiterentwicklung der App oder aus organisatorischen beziehungsweise rechtlichen Gründen geändert werden. Bei einer neuen Version kann vor der weiteren Nutzung eine erneute aktive Zustimmung verlangt werden.</p>

      <h2>11. Datenschutz</h2>
      <p>Personenbezogene Daten werden nur im Rahmen der für Registrierung, Benutzerverwaltung und Buchungsfunktion erforderlichen Verarbeitung genutzt. Weitere Informationen können in einer gesonderten Datenschutzerklärung bereitgestellt werden.</p>

      <h2>12. Schlussbestimmung</h2>
      <p>Mit der aktiven Zustimmung bestätigt der Nutzer, diese Nutzungsbedingungen gelesen und akzeptiert zu haben.</p>

      <div class="actions">
        <a class="btn" href="/register">Registrieren und akzeptieren</a>
        <a class="btn secondary" href="/">Zur Startseite</a>
      </div>
    </div>`, req));
});

app.get("/register", (req, res) => {

  res.send(
    page(
      "Registrierung",

      `
      <div class="card">

        <h2>Mitglied registrieren</h2>

        <p class="muted">
          Nach der Registrierung muss der Administrator
          dein Konto freischalten.
        </p>

        <form method="post" action="/register">

          <label>Name</label>

          <input
            name="name"
            maxlength="100"
            required
          >

          <label>E-Mail</label>

          <input
            type="email"
            name="email"
            maxlength="200"
            required
          >

          <label>Passwort</label>
          <input type="password" name="password" minlength="8" required>

          <label>Passwort bestätigen</label>
          <input type="password" name="confirm_password" minlength="8" required>

          <label>Freiwilliger Alias für Buchungen</label>
          <input name="alias" maxlength="50" placeholder="Optional – sonst wird dein Vorname angezeigt">

          <label style="display:flex;align-items:flex-start;gap:8px">
            <input type="checkbox" name="accept_terms" value="yes" style="width:auto;margin-top:4px" required>
            <span>Ich akzeptiere die <a href="/terms" target="_blank">Nutzungsbedingungen</a>.</span>
          </label>

          <div class="actions">

            <button class="btn" type="submit">
              Registrierung senden
            </button>

            <a class="btn secondary" href="/login">
              Zum Login
            </a>

          </div>

        </form>

      </div>
      `,
      req
    )
  );
});


app.post("/register", async (req, res) => {

  try {

    const name =
      String(req.body.name || "").trim();

    const email =
      String(req.body.email || "")
        .trim()
        .toLowerCase();

    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirm_password || "");
    const alias = String(req.body.alias || "").trim();
    const acceptTerms = req.body.accept_terms === "yes";

    if (!name || !email || password.length < 8 || password !== confirmPassword || !acceptTerms) {

      return res.status(400).send(

        page(
          "Fehler",

          nav(req) +

          '<div class="card error">' +
          '<h2>Fehler</h2>' +
          '<p>Bitte alle Angaben ausfüllen, Passwort bestätigen und die Nutzungsbedingungen akzeptieren.</p>' +
          '</div>',

          req
        )
      );
    }


    const existing = await pool.query(
      "SELECT id FROM members WHERE email=$1",
      [email]
    );


    if (existing.rowCount) {

      return res.status(409).send(

        page(
          "Account vorhanden",

          nav(req) +

          '<div class="card warn">' +
          '<h2>Account vorhanden</h2>' +
          '<p>Diese E-Mail ist bereits registriert.</p>' +
          '<a class="btn secondary" href="/login">Zum Login</a>' +
          '</div>',

          req
        )
      );
    }


    const count = await pool.query(
      "SELECT COUNT(*)::int AS n FROM members WHERE status='approved'"
    );


    if (count.rows[0].n >= 100) {

      return res.status(409).send(

        page(
          "Aufnahmestopp",

          nav(req) +

          '<div class="card warn">' +
          '<h2>100 Mitglieder erreicht</h2>' +
          '<p>Momentan können keine weiteren Mitglieder freigeschaltet werden.</p>' +
          '</div>',

          req
        )
      );
    }


    const hash =
      await bcrypt.hash(password, 12);


    await pool.query(

      "INSERT INTO members(name,email,password_hash,status,alias,terms_accepted_at,terms_version) VALUES($1,$2,$3,'pending',$4,NOW(),$5)",
      [name, email, hash, alias || null, TERMS_VERSION]

    );


    res.send(

      page(
        "Registrierung",

        nav(req) +

        '<div class="card ok">' +
        '<h2>Registrierung erfolgreich</h2>' +
        '<p>Dein Account wartet jetzt auf die Freischaltung durch den Administrator.</p>' +
        '<div class="actions">' +
        '<a class="btn secondary" href="/login">Zum Login</a>' +
        '</div>' +
        '</div>',

        req
      )
    );

  } catch (error) {

    console.error(error);

    res.status(500).send(
      "Serverfehler"
    );
  }
});


app.get("/terms/accept", (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!email) return res.redirect("/login");

  res.send(page("Nutzungsbedingungen akzeptieren", `
    <div class="card">
      <h1>Nutzungsbedingungen</h1>
      <p>Bitte lies die vollständigen <a href="/terms" target="_blank">Nutzungsbedingungen</a>. Erst nach deiner aktiven Zustimmung kannst du dich anmelden.</p>
      <form method="post" action="/terms/accept">
        <input type="hidden" name="email" value="${esc(email)}">
        <label style="display:flex;align-items:flex-start;gap:8px">
          <input type="checkbox" name="accept_terms" value="yes" style="width:auto;margin-top:4px" required>
          <span>Ich habe die Nutzungsbedingungen gelesen und akzeptiere die Version ${TERMS_VERSION}.</span>
        </label>
        <div class="actions">
          <button class="btn" type="submit">Nutzungsbedingungen akzeptieren</button>
          <a class="btn secondary" href="/login">Abbrechen</a>
        </div>
      </form>
    </div>`, req));
});

app.post("/terms/accept", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const accepted = req.body.accept_terms === "yes";
    if (!email || !accepted) {
      return res.status(400).send(page("Fehler", `<div class="card error"><h2>Zustimmung erforderlich</h2><p>Bitte bestätige die Nutzungsbedingungen.</p><a class="btn secondary" href="/login">Zum Login</a></div>`, req));
    }

    const result = await pool.query(
      "UPDATE members SET terms_accepted_at=NOW(), terms_version=$1 WHERE email=$2 RETURNING id",
      [TERMS_VERSION, email]
    );
    if (!result.rowCount) return res.redirect("/login");

    await pool.query(
      "INSERT INTO terms_acceptances(member_id, terms_version, accepted_at) VALUES($1,$2,NOW())",
      [result.rows[0].id, TERMS_VERSION]
    );

    res.redirect("/login");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});


app.get("/admin/terms", requireAdmin, async (req, res) => {
  try {
    const acceptedResult = await pool.query(`
      SELECT
        m.name,
        m.email,
        m.status,
        a.terms_version,
        a.accepted_at
      FROM terms_acceptances a
      JOIN members m ON m.id = a.member_id
      ORDER BY a.accepted_at DESC
    `);

    const missingResult = await pool.query(
      `SELECT name, email, status
       FROM members
       WHERE terms_accepted_at IS NULL
          OR terms_version IS DISTINCT FROM $1
       ORDER BY name ASC`,
      [TERMS_VERSION]
    );

    const acceptedRows = acceptedResult.rows.map(m => `
      <tr>
        <td>${esc(m.name || "")}</td>
        <td>${esc(m.email || "")}</td>
        <td>${esc(m.status || "")}</td>
        <td>${new Date(m.accepted_at).toLocaleString("de-DE")}</td>
        <td>${esc(m.terms_version)}</td>
      </tr>
    `).join("");

    const missingRows = missingResult.rows.map(m => `
      <tr>
        <td>${esc(m.name || "")}</td>
        <td>${esc(m.email || "")}</td>
        <td>${esc(m.status || "")}</td>
        <td>Erinnerung bei Anmeldung aktiv</td>
      </tr>
    `).join("");

    res.send(page("Nutzungsbedingungen – Verwaltung", `
      <div class="card">
        <h1>📜 Nutzungsbedingungen – Protokoll</h1>
        <p>Jede Zustimmung wird mit Benutzer, Datum/Uhrzeit und Versionsnummer dauerhaft protokolliert.</p>
        <p><strong>Aktuelle Version:</strong> ${TERMS_VERSION}</p>
      </div>

      <div class="card">
        <h2>Noch nicht akzeptiert</h2>
        <p>Diese Nutzer erhalten bei der Anmeldung eine Erinnerung und können die aktuelle Version direkt öffnen und akzeptieren.</p>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Hinweis</th></tr></thead>
            <tbody>${missingRows || '<tr><td colspan="4">Alle Benutzer haben die aktuelle Version akzeptiert.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>Akzeptierungsprotokoll</h2>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Akzeptiert am</th><th>Version</th></tr></thead>
            <tbody>${acceptedRows || '<tr><td colspan="5">Noch keine Akzeptierungen vorhanden.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="actions">
          <a class="btn secondary" href="/admin">Zur Administration</a>
        </div>
      </div>`, req));
  } catch (error) {
    console.error("Fehler bei Nutzungsbedingungen-Verwaltung:", error);
    res.status(500).send(page("Serverfehler", `<div class="card error"><h2>Fehler</h2><p>Die Übersicht konnte nicht geladen werden.</p><a class="btn secondary" href="/admin">Zurück</a></div>`, req));
  }
});


app.get("/login", (req, res) => {

  res.send(

    page(
      "Login",

      `
      <div class="card">

        <h2>Mitglieder-Login</h2>

        <form method="post" action="/login">

          <label>E-Mail</label>

          <input
            type="email"
            name="email"
            required
          >

          <label>Passwort</label>

          <input
            type="password"
            name="password"
            required
          >

          <div class="actions">

            <button class="btn" type="submit">
              Anmelden
            </button>

            <a class="btn secondary" href="/register">
              Registrieren
            </a>

          </div>

        </form>

      </div>
      `,
      req
    )

  );
});


app.post("/login", async (req, res) => {

  try {

    const email =
     String(req.body?.email || "")
        .trim()
        .toLowerCase();

    const password =
     String(req.body?.password || "")


    const result = await pool.query(

      "SELECT * FROM members WHERE email=$1",

      [email]

    );


    const member =
      result.rows[0];


    if (
      !member ||
      !(await bcrypt.compare(
        password,
        member.password_hash
      ))
    ) {

      return res.status(401).send(

        page(
          "Login",

          `
          <div class="card error">

            <h2>Login fehlgeschlagen</h2>

            <p>
              E-Mail oder Passwort ist falsch.
            </p>

            <div class="actions">

              <a class="btn secondary" href="/login">
                Zurück zum Login
              </a>

            </div>

          </div>
          `,

          req
        )
      );
    }


    if (!member.terms_accepted_at || member.terms_version !== TERMS_VERSION) {

      return res.status(403).send(
        page(
          "Nutzungsbedingungen",
          `
          <div class="card warn">
            <h2>Nutzungsbedingungen bestätigen</h2>
            <p>Bevor du die TuRU 1880 Padel-App weiter nutzen kannst, musst du die aktuelle Version der Nutzungsbedingungen lesen und aktiv akzeptieren.</p>
            <div class="actions">
              <a class="btn" href="/terms/accept?email=${encodeURIComponent(email)}">Nutzungsbedingungen öffnen</a>
              <a class="btn secondary" href="/login">Abbrechen</a>
            </div>
          </div>`,
          req
        )
      );
    }


    if (member.status !== "approved") {

      return res.status(403).send(

        page(
          "Nicht freigeschaltet",

          `
          <div class="card warn">

            <h2>Noch nicht freigeschaltet</h2>

            <p>
              Dein Account wartet noch auf die
              Freischaltung durch den Administrator.
            </p>

          </div>
          `,

          req
        )
      );
    }


    req.session.member = {

      id: member.id,

      name: member.name,

      email: member.email,

      admin: member.admin

    };
    req.session.sessionVersion = Number(member.session_version || 1);
    req.session.lastActivity = Date.now();


    res.redirect("/");

  } catch (error) {

    console.error(error);

    res.status(500).send(
      "Serverfehler"
    );
  }
});


app.get("/logout-inactive", (req, res) => { req.session.destroy(() => res.redirect("/login?reason=inactive")); });

app.post("/logout", (req, res) => {

  req.session.destroy(() => {

    res.redirect("/");

  });

});

app.get("/password", loginRequired, (req, res) => {
  res.send(
    page(
      "Passwort ändern",
      `
      <div class="hero">
        <h1>🔐 Passwort ändern</h1>
        <p>Ändere hier dein persönliches Passwort.</p>
      </div>

      <div class="card">
        <form method="post" action="/password">
          <label>Aktuelles Passwort</label>
          <input type="password" name="current_password" minlength="8" required>

          <label>Neues Passwort</label>
          <input type="password" name="new_password" minlength="8" required>

          <label>Neues Passwort wiederholen</label>
          <input type="password" name="confirm_password" minlength="8" required>

          <div class="actions">
            <button class="btn" type="submit">Passwort speichern</button>
          </div>
        </form>
      </div>
      `,
      req
    )
  );
});


app.post("/password", loginRequired, async (req, res) => {
  try {
    const currentPassword = String(req.body.current_password || "");
    const newPassword = String(req.body.new_password || "");
    const confirmPassword = String(req.body.confirm_password || "");

    if (newPassword.length < 8) {
      return res.status(400).send(
        page(
          "Passwort ändern",
          `
          <div class="card error">
            <h2>Passwort zu kurz</h2>
            <p>Das neue Passwort muss mindestens 8 Zeichen lang sein.</p>
            <a class="btn" href="/password">Zurück</a>
          </div>
          `,
          req
        )
      );
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).send(
        page(
          "Passwort ändern",
          `
          <div class="card error">
            <h2>Passwörter stimmen nicht überein</h2>
            <p>Bitte beide neuen Passwörter identisch eingeben.</p>
            <a class="btn" href="/password">Zurück</a>
          </div>
          `,
          req
        )
      );
    }

    const result = await pool.query(
      "SELECT password_hash FROM members WHERE id=$1 AND status='approved'",
      [req.session.member.id]
    );

    const member = result.rows[0];

    if (!member || !(await bcrypt.compare(currentPassword, member.password_hash))) {
      return res.status(401).send(
        page(
          "Passwort ändern",
          `
          <div class="card error">
            <h2>Aktuelles Passwort ist falsch</h2>
            <p>Bitte überprüfe dein bisheriges Passwort.</p>
            <a class="btn" href="/password">Zurück</a>
          </div>
          `,
          req
        )
      );
    }

    const hash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      "UPDATE members SET password_hash=$1 WHERE id=$2",
      [hash, req.session.member.id]
    );

    res.send(
      page(
        "Passwort geändert",
        `
        <div class="card ok">
          <h2>✓ Passwort geändert</h2>
          <p>Dein neues Passwort wurde erfolgreich gespeichert.</p>
          <div class="actions">
            <a class="btn" href="/">Zur Startseite</a>
          </div>
        </div>
        `,
        req
      )
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});



function datePlusDays(value, days) {
  const date = dateFromYmd(value);
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date);
}

function startOfIsoWeek(value) {
  const date = dateFromYmd(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return ymd(date);
}

function monthStart(value) {
  const date = dateFromYmd(value);
  return ymd(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function monthEnd(value) {
  const date = dateFromYmd(value);
  return ymd(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

function monthTitle(value) {
  return dateFromYmd(value).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function germanDayShort(value) {
  return dateFromYmd(value).toLocaleDateString("de-DE", {
    weekday: "short",
    timeZone: "UTC"
  }).replace(".", "");
}

function germanDayLong(value) {
  return dateFromYmd(value).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function bookingLimitDate(req) {
  const today = berlinDate();
  if (req.session.member?.admin) return null;
  return datePlusDays(today, 7);
}

function canMemberBookDate(req, date) {
  if (req.session.member?.admin) return true;
  const today = berlinDate();
  const limit = datePlusDays(today, 7);
  return date >= today && date <= limit;
}

async function getBookingsForDate(date) {
  const result = await pool.query(`
    SELECT
      b.id,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.member_id,
      COALESCE(NULLIF(m.alias, ''), NULLIF(split_part(m.name, ' ', 1), ''), m.name) AS member_name
    FROM bookings b
    JOIN members m ON m.id = b.member_id
    WHERE b.booking_date=$1
    ORDER BY b.start_time
  `, [date]);

  return result.rows;
}

async function getDayState(date) {
  const [bookings, blocks] = await Promise.all([
    getBookingsForDate(date),
    getActiveBlocksForDate(date)
  ]);

  return { bookings, blocks, date };
}

function getSlotState(slot, dayState) {
  const block = dayState.blocks.find(item =>
    blockTimeOverlaps(item, slot.start, slot.end)
  );

  if (block) {
    return {
      type: "blocked",
      label: "🔒 Gesperrt",
      detail: block.reason || "Reserviert"
    };
  }

  const booking = dayState.bookings.find(item =>
    String(item.start_time).slice(0, 5) === slot.start
  );

  if (booking) {
    return {
      type: "busy",
      label: "🔴 Belegt",
      detail: booking.member_name || "Reserviert"
    };
  }

  return {
    type: "free",
    label: "🟢 Frei",
    detail: ""
  };
}

function calendarNavigation(view, date, req) {
  let previous;
  let next;

  if (view === "day") {
    previous = datePlusDays(date, -1);
    next = datePlusDays(date, 1);
  } else if (view === "week") {
    previous = datePlusDays(startOfIsoWeek(date), -7);
    next = datePlusDays(startOfIsoWeek(date), 7);
  } else {
    const d = dateFromYmd(date);
    previous = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
    next = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  }

  return `
    <div class="calendar-nav">
      <a href="/booking?view=${view}&date=${previous}" aria-label="Zurück">‹</a>
      <a class="today" href="/booking?view=${view}&date=${berlinDate()}">Heute</a>
      <a href="/booking?view=${view}&date=${next}" aria-label="Weiter">›</a>
    </div>
  `;
}

async function renderDayCalendar(date, req) {
  const state = await getDayState(date);
  const limit = bookingLimitDate(req);
  const outsideLimit = limit && date > limit;

  const html = slots().map(slot => {
    const past = isPastSlot(date, slot.start);
    const stateForSlot = getSlotState(slot, state);

    if (past) {
      return `
        <div class="calendar-slot past">
          <div class="slot-time">${slot.start}–${slot.end}</div>
          <div class="slot-info"><strong>Vergangen</strong><small>Dieser Termin ist nicht mehr buchbar.</small></div>
          <div class="calendar-status past">Nicht buchbar</div>
        </div>
      `;
    }

    if (outsideLimit) {
      return `
        <div class="calendar-slot limit">
          <div class="slot-time">${slot.start}–${slot.end}</div>
          <div class="slot-info"><strong>Buchungsfrist</strong><small>Für Mitglieder maximal 7 Tage im Voraus.</small></div>
          <div class="calendar-status limit">Noch nicht buchbar</div>
        </div>
      `;
    }

    if (stateForSlot.type === "blocked") {
      return `
        <div class="calendar-slot blocked">
          <div class="slot-time">${slot.start}–${slot.end}</div>
          <div class="slot-info"><strong>${esc(stateForSlot.label)}</strong><small>${esc(stateForSlot.detail)}</small></div>
          <div class="calendar-status blocked">Gesperrt</div>
        </div>
      `;
    }

    if (stateForSlot.type === "busy") {
      return `
        <div class="calendar-slot busy">
          <div class="slot-time">${slot.start}–${slot.end}</div>
          <div class="slot-info"><strong>🔴 Belegt</strong><small>${esc(stateForSlot.detail)}</small></div>
          <div class="calendar-status busy">Belegt</div>
        </div>
      `;
    }

    return `
      <div class="calendar-slot free">
        <div class="slot-time">${slot.start}–${slot.end}</div>
        <div class="slot-info"><strong>🟢 Frei</strong><small>Ein Padelplatz verfügbar</small></div>
        <form method="post" action="/book" onsubmit="return confirm('Möchtest du diesen Termin wirklich verbindlich buchen?');">
          <input type="hidden" name="date" value="${esc(date)}">
          <input type="hidden" name="start" value="${esc(slot.start)}">
          <input type="hidden" name="end" value="${esc(slot.end)}">
          <button class="btn" type="submit">Jetzt buchen</button>
        </form>
      </div>
    `;
  }).join("");

  return `
    <div class="calendar-title">${esc(germanDayLong(date))}</div>
    <div class="day-calendar">${html}</div>
  `;
}

async function renderWeekCalendar(date, req) {
  const start = startOfIsoWeek(date);
  const days = Array.from({ length: 7 }, (_, index) => datePlusDays(start, index));
  const states = await Promise.all(days.map(getDayState));
  const limit = bookingLimitDate(req);

  let html = `<div class="calendar-scroll"><div class="week-calendar">
    <div class="wc-head">Zeit</div>
    ${days.map(day => `
      <div class="wc-head">
        ${esc(germanDayShort(day))}
        <small>${day.slice(8,10)}.${day.slice(5,7)}.</small>
      </div>
    `).join("")}`;

  for (const slot of slots()) {
    html += `<div class="wc-time">${slot.start}</div>`;

    days.forEach((day, index) => {
      const state = getSlotState(slot, states[index]);
      const past = isPastSlot(day, slot.start);
      const limited = limit && day > limit;

      if (past) {
        html += `<div class="wc-cell"><div class="wc-slot past">Vergangen</div></div>`;
      } else if (limited) {
        html += `<div class="wc-cell"><div class="wc-slot limit">7-Tage-Frist</div></div>`;
      } else if (state.type === "blocked") {
        html += `<div class="wc-cell"><div class="wc-slot blocked">🔒 Gesperrt<div class="wc-name">${esc(state.detail)}</div></div></div>`;
      } else if (state.type === "busy") {
        html += `<div class="wc-cell"><div class="wc-slot busy">🔴 Belegt<div class="wc-name">${esc(state.detail)}</div></div></div>`;
      } else {
        html += `<div class="wc-cell">
          <a class="wc-slot free" href="/booking?view=day&date=${day}">
            🟢 Frei
          </a>
        </div>`;
      }
    });
  }

  html += `</div></div>`;
  return html;
}

async function renderMonthCalendar(date, req) {
  const base = dateFromYmd(date);
  const first = monthStart(date);
  const firstDate = dateFromYmd(first);
  const firstWeekday = firstDate.getUTCDay() || 7;
  const gridStart = datePlusDays(first, -(firstWeekday - 1));
  const last = monthEnd(date);
  const lastDate = dateFromYmd(last);
  const lastWeekday = lastDate.getUTCDay() || 7;
  const gridEnd = datePlusDays(last, 7 - lastWeekday);
  const totalDays = Math.round((dateFromYmd(gridEnd) - dateFromYmd(gridStart)) / 86400000) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => datePlusDays(gridStart, i));
  const states = await Promise.all(days.map(getDayState));
  const limit = bookingLimitDate(req);

  let html = `<div class="month-wrap"><div class="month-calendar">
    ${["Mo","Di","Mi","Do","Fr","Sa","So"].map(day => `<div class="month-head">${day}</div>`).join("")}`;

  days.forEach((day, index) => {
    const inMonth = day.slice(0, 7) === date.slice(0, 7);
    const limited = limit && day > limit;
    const pastDay = day < berlinDate();
    const state = states[index];

    let free = 0;
    let busy = 0;
    let blocked = 0;

    slots().forEach(slot => {
      const slotState = getSlotState(slot, state);
      if (slotState.type === "blocked") blocked++;
      else if (slotState.type === "busy") busy++;
      else if (!pastDay && !(limited && !req.session.member.admin)) free++;
    });

    html += `
      <div class="month-day ${inMonth ? "" : "outside"}">
        <a class="month-day-link" href="/booking?view=day&date=${day}">
          <div class="month-number">${day.slice(8,10)}</div>
          <div class="month-summary">
            ${pastDay ? `<span class="month-pill limit">Vergangen</span>` : ""}
            ${limited ? `<span class="month-pill limit">7-Tage-Frist</span>` : ""}
            ${free && !limited ? `<span class="month-pill free">${free} frei</span>` : ""}
            ${busy ? `<span class="month-pill busy">${busy} belegt</span>` : ""}
            ${blocked ? `<span class="month-pill blocked">${blocked} gesperrt</span>` : ""}
          </div>
        </a>
      </div>
    `;
  });

  html += `</div></div>`;
  return html;
}

app.get("/booking", loginRequired, async (req, res) => {
  try {
    const view = ["day", "week", "month"].includes(String(req.query.view || ""))
      ? String(req.query.view)
      : "day";

    let date = String(req.query.date || berlinDate());

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = berlinDate();
    }

    const today = berlinDate();

    // Vergangenheit nicht als Startdatum anzeigen.
    if (date < today) date = today;

    let calendarBody = "";

    if (view === "day") {
      calendarBody = await renderDayCalendar(date, req);
    } else if (view === "week") {
      calendarBody = await renderWeekCalendar(date, req);
    } else {
      calendarBody = await renderMonthCalendar(date, req);
    }

    const limit = bookingLimitDate(req);
    const limitNotice = req.session.member.admin
      ? `
        <div class="notice">
          👑 Administrator: Buchungen können beliebig weit im Voraus vorgenommen werden.
        </div>
      `
      : `
        <div class="notice">
          Mitglieder können maximal <b>7 Tage im Voraus</b> buchen.
          Die Kalenderansichten zeigen weitere Tage, dort kann aber noch nicht gebucht werden.
        </div>
      `;

    res.send(
      page(
        "Platz buchen",
        `
        <div class="hero">
          <h1>🎾 Platz buchen</h1>
          <p>
            Wähle Tag, Woche oder Monat und sehe sofort,
            wann der Platz frei, belegt oder gesperrt ist.
          </p>
        </div>

        <div class="card">
          <div class="calendar-toolbar">
            <div class="calendar-tabs">
              <a class="${view === "day" ? "active" : ""}" href="/booking?view=day&date=${date}">Tag</a>
              <a class="${view === "week" ? "active" : ""}" href="/booking?view=week&date=${date}">Woche</a>
              <a class="${view === "month" ? "active" : ""}" href="/booking?view=month&date=${date}">Monat</a>
            </div>

            ${calendarNavigation(view, date, req)}
          </div>

          <div style="margin-bottom:18px">
            <label for="bookingDate">Spieltag</label>
            <input
              type="date"
              id="bookingDate"
              value="${esc(date)}"
              min="${esc(today)}"
              ${!req.session.member.admin ? `max="${esc(limit)}"` : ""}
              onchange="window.location.href='/booking?view=${view}&date='+this.value"
            >
          </div>

          ${calendarBody}

          <div class="calendar-legend">
            <span><i class="legend-dot legend-free"></i> Frei</span>
            <span><i class="legend-dot legend-busy"></i> Belegt + Name</span>
            <span><i class="legend-dot legend-blocked"></i> Gesperrt</span>
          </div>

          ${limitNotice}
        </div>
        `,
        req
      )
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});


app.post("/book", loginRequired, async (req, res) => {

  const date =
    String(req.body.date || "");

  const start =
    String(req.body.start || "");

  const end =
    String(req.body.end || "");


  if (!date || !start || !end) {

    return res.status(400).send(

      page(

        "Buchungsfehler",

        `
        <div class="card error">

          <h2>Buchung nicht möglich</h2>

          <p>
            Die Buchungsdaten sind unvollständig.
          </p>

          <div class="actions">

            <a
              class="btn"
              href="/booking"
            >
              Zurück zur Buchung
            </a>

          </div>

        </div>
        `,

        req

      )

    );
  }


  // WICHTIG:
  // Auch bei einem direkten POST dürfen
  // vergangene Zeiten nicht gebucht werden.

  // Nur die vom System vorgesehenen 90-Minuten-Slots zulassen.
  const validSlot = slots().some(
    slot => slot.start === start && slot.end === end
  );

  if (!validSlot) {
    return res.status(400).send(
      page(
        "Buchungsfehler",
        `
        <div class="card error">
          <h2>Buchung nicht möglich</h2>
          <p>Diese Spielzeit ist nicht gültig.</p>
          <div class="actions">
            <a class="btn" href="/booking">Zurück zur Buchung</a>
          </div>
        </div>
        `,
        req
      )
    );
  }

  const bookingDate = normalizeYmd(date);

  if (
    bookingDate !== date ||
    await isSlotBlocked(bookingDate, start, end)
  ) {
    return res.status(409).send(
      page(
        "Buchung nicht möglich",
        `
        <div class="card warn">
          <h2>Termin gesperrt</h2>
          <p>Dieser Zeitraum wurde vom Administrator reserviert oder gesperrt.</p>
          <div class="actions">
            <a class="btn" href="/booking?date=${encodeURIComponent(date)}">Andere Zeit auswählen</a>
          </div>
        </div>
        `,
        req
      )
    );
  }


  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).send(
      page(
        "Buchungsfehler",
        `
        <div class="card error">
          <h2>Ungültiges Datum</h2>
          <p>Bitte wähle einen gültigen Spieltag.</p>
          <div class="actions">
            <a class="btn" href="/booking">Zurück zur Buchung</a>
          </div>
        </div>
        `,
        req
      )
    );
  }

  if (!req.session.member.admin && !canMemberBookDate(req, date)) {
    return res.status(409).send(
      page(
        "Buchungsfrist",
        `
        <div class="card warn">
          <h2>Buchung noch nicht möglich</h2>
          <p>Mitglieder können maximal 7 Tage im Voraus buchen.</p>
          <div class="actions">
            <a class="btn" href="/booking?view=day&date=${esc(berlinDate())}">Zum Kalender</a>
          </div>
        </div>
        `,
        req
      )
    );
  }

  if (isPastSlot(date, start)) {

    return res.status(409).send(

      page(

        "Buchung nicht möglich",

        `
        <div class="card warn">

          <h2>Termin nicht mehr buchbar</h2>

          <p>
            Dieser Termin liegt bereits
            in der Vergangenheit.
          </p>

          <div class="actions">

            <a
              class="btn"
              href="/booking"
            >
              Neue Zeit auswählen
            </a>

          </div>

        </div>
        `,

        req

      )

    );
  }


  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    // Normale Mitglieder dürfen nur eine aktive Buchung
    // gleichzeitig haben. Administratoren dürfen unbegrenzt
    // viele aktive Buchungen anlegen.

    if (!req.session.member.admin) {

      const active =
        await client.query(

          `SELECT id
           FROM bookings
           WHERE member_id=$1
           AND used=FALSE
           AND (booking_date + start_time) > NOW()
           FOR UPDATE`,

          [
            req.session.member.id
          ]

        );


      if (active.rowCount) {

        await client.query(
          "ROLLBACK"
        );


        return res.status(409).send(

          page(

            "Buchung",

            `
            <div class="card warn">

              <h2>Bereits eine aktive Buchung</h2>

              <p>
                Du hast bereits eine aktive
                Platzbuchung.
              </p>

              <p class="muted">
                Du kannst erst wieder buchen,
                wenn diese Buchung abgelaufen ist.
              </p>

              <div class="actions">

                <a
                  class="btn secondary"
                  href="/my-bookings"
                >
                  Meine Buchungen
                </a>

                <a
                  class="btn"
                  href="/booking"
                >
                  Zurück zur Buchung
                </a>

              </div>

            </div>
            `,

            req

          )

        );
      }
    }


    await client.query(

      `INSERT INTO bookings(
        member_id,
        booking_date,
        start_time,
        end_time
      )
      VALUES($1,$2,$3,$4)`,

      [
        req.session.member.id,
        bookingDate,
        start,
        end
      ]

    );


    await client.query(
      "COMMIT"
    );


    res.send(

      page(

        "Buchung bestätigt",

        `
        <div class="card ok">

          <h2>✓ Buchung bestätigt</h2>

          <p>
            Dein Padelplatz ist erfolgreich gebucht.
          </p>

          <div class="notice">

            <b>${esc(date)}</b>
            <br>
            ${esc(start)} – ${esc(end)}

          </div>

          <div class="actions">

            <a
              class="btn"
              href="/my-bookings"
            >
              Meine Buchungen
            </a>

            <a
              class="btn secondary"
              href="/booking"
            >
              Weitere Zeiten
            </a>

          </div>

        </div>
        `,

        req

      )

    );


  } catch (error) {

    await client
      .query("ROLLBACK")
      .catch(() => {});


    // Termin wurde gleichzeitig
    // von jemand anderem gebucht.

    if (error.code === "23505") {

      return res.status(409).send(

        page(

          "Termin belegt",

          `
          <div class="card error">

            <h2>Termin bereits belegt</h2>

            <p>
              Dieser Termin wurde gerade
              von einem anderen Mitglied gebucht.
            </p>

            <div class="actions">

              <a
                class="btn"
                href="/booking"
              >
                Andere Zeit auswählen
              </a>

            </div>

          </div>
          `,

          req

        )

      );
    }


    console.error(error);

    res.status(500).send(
      "Serverfehler"
    );


  } finally {

    client.release();

  }

});


app.get("/my-bookings", loginRequired, async (req, res) => {

  try {

    const result =
      await pool.query(

        `SELECT *
         FROM bookings
         WHERE member_id=$1
         ORDER BY booking_date,start_time`,

        [
          req.session.member.id
        ]

      );


    const now =
      new Date();


    const rows =
      result.rows.map(booking => {

        const date =
          booking.booking_date instanceof Date

            ? booking.booking_date
                .toISOString()
                .slice(0, 10)

            : String(
                booking.booking_date
              ).slice(0, 10);


        const start =
          String(
            booking.start_time
          ).slice(0, 5);


        const end =
          String(
            booking.end_time
          ).slice(0, 5);


        const bookingDate =
          new Date(
            `${date}T${start}:00`
          );


        const status =
          booking.used

            ? "genutzt"

            : bookingDate > now

              ? "gebucht"

              : "abgelaufen";


        const badgeClass =

          status === "gebucht"

            ? "ok"

            : status === "abgelaufen"

              ? "warn"

              : "";


        const cancelButton =

          !booking.used &&
          bookingDate > now

            ? `
              <form
                method="post"
                action="/cancel/${booking.id}" onsubmit="return confirm('Möchtest du diese Buchung wirklich stornieren?');">

                <button
                  class="btn danger"
                  type="submit"
                >
                  Stornieren
                </button>

              </form>
              `

            : "";


        return (

          "<tr>" +

          "<td>" +
          esc(date) +
          "</td>" +

          "<td><b>" +
          esc(start) +
          "-" +
          esc(end) +
          "</b></td>" +

          '<td>' +

          '<span class="badge ' +
          badgeClass +
          '">' +

          esc(status) +

          "</span>" +

          "</td>" +

          "<td>" +
          cancelButton +
          "</td>" +

          "</tr>"

        );

      }).join("");


    const table =

      result.rows.length

        ? `
          <table>

            <thead>

              <tr>

                <th>Datum</th>
                <th>Zeit</th>
                <th>Status</th>
                <th>Aktion</th>

              </tr>

            </thead>

            <tbody>

              ${rows}

            </tbody>

          </table>
          `

        : `
          <p class="muted">
            Du hast noch keine Buchungen.
          </p>
          `;


    res.send(

      page(

        "Meine Buchungen",

        `

        <div class="hero">

          <h1>Meine Buchungen</h1>

          <p>
            Hier findest du deine gebuchten
            Padelzeiten.
          </p>

        </div>


        <div class="card">

          ${table}

        </div>

        `,

        req

      )

    );


  } catch (error) {

    console.error(error);

    res.status(500).send(
      "Serverfehler"
    );

  }

});
app.post("/cancel/:id", loginRequired, async (req, res) => {

  try {

    const result = await pool.query(

      `DELETE FROM bookings
       WHERE id=$1
       AND member_id=$2
       AND used=FALSE
       AND (booking_date + start_time)>NOW()
       RETURNING *`,

      [
        req.params.id,
        req.session.member.id
      ]

    );


    if (!result.rowCount) {

      return res.status(404).send(

        page(

          "Stornierung",

          `
          <div class="card error">

            <h2>Stornierung nicht möglich</h2>

            <p>
              Die Buchung wurde nicht gefunden
              oder ist bereits abgelaufen.
            </p>

            <div class="actions">

              <a
                class="btn secondary"
                href="/my-bookings"
              >
                Meine Buchungen
              </a>

            </div>

          </div>
          `,

          req

        )

      );

    }


    res.redirect("/my-bookings");


  } catch (error) {

    console.error(error);

    res.status(500).send(
      "Serverfehler"
    );

  }

});


app.get("/admin", adminRequired, async (req, res) => {
  try {
    const [membersResult, bookingsResult, blocksResult, statsResult] =
      await Promise.all([
        pool.query(`
          SELECT id, name, email, status, admin, created_at
          FROM members
          ORDER BY admin DESC, created_at DESC
        `),
        pool.query(`
          SELECT b.*, m.name, m.email
          FROM bookings b
          JOIN members m ON m.id=b.member_id
          ORDER BY b.booking_date DESC, b.start_time DESC
        `),
        pool.query(`
          SELECT *
          FROM booking_blocks
          WHERE active=TRUE
          ORDER BY start_date, start_time, id
        `),
        pool.query(`
          SELECT
            m.id,
            m.name,
            m.email,
            COUNT(b.id)::int AS total_bookings,
            COUNT(b.id) FILTER (
              WHERE (b.booking_date + b.start_time) > NOW()
            )::int AS future_bookings,
            MIN(b.booking_date) AS first_booking,
            MAX(b.booking_date) AS last_booking
          FROM members m
          LEFT JOIN bookings b ON b.member_id=m.id
          GROUP BY m.id, m.name, m.email
          ORDER BY total_bookings DESC, m.name ASC
        `)
      ]);

    const approved = membersResult.rows.filter(m => m.status === "approved").length;
    const pending = membersResult.rows.filter(m => m.status === "pending").length;
    const adminCount = membersResult.rows.filter(m => m.admin).length;
    const totalBookings = bookingsResult.rowCount;

    const memberRows = membersResult.rows.map(member => {
      let statusAction = "";

      if (member.admin) {
        statusAction = member.id === req.session.member.id
          ? '<span class="badge ok">Du bist Admin</span>'
          : `<form method="post" action="/admin/remove-admin/${member.id}" style="display:inline">
               <button class="btn danger" type="submit">Admin entfernen</button>
             </form>`;
      } else if (member.status === "pending") {
        statusAction =
          `<form method="post" action="/admin/approve/${member.id}" style="display:inline">
             <button class="btn" type="submit">Freigeben</button>
           </form>`;
      } else if (member.status === "approved") {
        statusAction =
          `<form method="post" action="/admin/block/${member.id}" style="display:inline">
             <button class="btn danger" type="submit">Sperren</button>
           </form>`;
      } else {
        statusAction =
          `<span class="badge error">Gesperrt</span>
           <form method="post" action="/admin/approve/${member.id}" style="display:inline">
             <button class="btn secondary" type="submit">Entsperren</button>
           </form>`;
      }

      const adminAction = member.admin
        ? ""
        : `<form method="post" action="/admin/make-admin/${member.id}" style="display:inline">
             <button class="btn secondary" type="submit">Zum Admin machen</button>
           </form>`;

      return `
        <tr>
          <td><b>${esc(member.name)}</b></td>
          <td>${esc(member.email)}</td>
          <td>${member.admin ? '<span class="badge ok">Admin</span>' : esc(member.status)}</td>
          <td>
            <div class="actions" style="margin-top:0">
              ${statusAction}
              ${adminAction}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    const bookingRows = bookingsResult.rows.map(booking => `
      <tr>
        <td>${esc(String(booking.booking_date).slice(0, 10))}</td>
        <td><b>${esc(String(booking.start_time).slice(0, 5))}–${esc(String(booking.end_time).slice(0, 5))}</b></td>
        <td>${esc(booking.name)}</td>
        <td>${esc(booking.email)}</td>
        <td>
          <form method="post" action="/admin/cancel-booking/${booking.id}" onsubmit="return confirm('Möchtest du diese Buchung wirklich stornieren?');">
            <button class="btn danger" type="submit">Stornieren</button>
          </form>
        </td>
      </tr>
    `).join("");

    const statsRows = statsResult.rows.map(row => `
      <tr>
        <td><b>${esc(row.name)}</b><br><span class="muted">${esc(row.email)}</span></td>
        <td><b>${row.total_bookings}</b></td>
        <td>${row.future_bookings}</td>
        <td>${row.first_booking ? esc(String(row.first_booking).slice(0, 10)) : "–"}</td>
        <td>${row.last_booking ? esc(String(row.last_booking).slice(0, 10)) : "–"}</td>
      </tr>
    `).join("");

    const blockRows = blocksResult.rows.length
      ? blocksResult.rows.map(block => `
        <tr>
          <td>${esc(String(block.start_date).slice(0, 10))}–${esc(String(block.end_date).slice(0, 10))}</td>
          <td>${esc(formatBlockTime(block))}</td>
          <td>${esc(recurrenceLabel(block))}</td>
          <td>${esc(block.reason || "Reserviert")}</td>
          <td>
            <form method="post" action="/admin/block/delete/${block.id}">
              <button class="btn danger" type="submit">Entfernen</button>
            </form>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="5" class="muted">Keine aktiven Sperren/Reservierungen.</td></tr>`;

    const weekdayChecks = [
      [1, "Montag"], [2, "Dienstag"], [3, "Mittwoch"],
      [4, "Donnerstag"], [5, "Freitag"], [6, "Samstag"], [0, "Sonntag"]
    ].map(([value, label]) =>
      `<label style="display:inline-flex;align-items:center;gap:6px;margin:6px 12px 6px 0;font-weight:700">
        <input type="checkbox" name="weekdays" value="${value}" style="width:auto">
        ${label}
      </label>`
    ).join("");

    res.send(page("Administration", `
      <div class="hero">
        <h1>Administration</h1>
        <p>Mitglieder, Reservierungen, Sperren und Statistiken verwalten.</p>
      </div>

      <div class="grid">
        <div class="card"><h2>Mitglieder</h2><p><b>${approved}</b> freigeschaltet</p></div>
        <div class="card"><h2>Wartend</h2><p><b>${pending}</b> Registrierungen</p></div>
        <div class="card"><h2>Administratoren</h2><p><b>${adminCount}</b></p></div>
        <div class="card"><h2>Buchungen</h2><p><b>${totalBookings}</b> insgesamt</p></div>
      </div>

      <div class="card">
        <h2>🔒 Platz sperren / reservieren</h2>
        <p class="muted">
          Es gibt einen Padelplatz. Eine Sperre verhindert, dass Mitglieder den Zeitraum buchen können.
          Leer gelassene Uhrzeiten bedeuten: ganztägig.
        </p>

        <form method="post" action="/admin/block">
          <div class="grid">
            <div>
              <label>Von Datum</label>
              <input type="date" name="start_date" required>
            </div>
            <div>
              <label>Bis Datum</label>
              <input type="date" name="end_date" required>
            </div>
            <div>
              <label>Von Uhrzeit</label>
              <input type="time" name="start_time">
            </div>
            <div>
              <label>Bis Uhrzeit</label>
              <input type="time" name="end_time">
            </div>
          </div>

          <label>Wiederholung</label>
          <select name="recurrence_type" style="width:100%;max-width:520px;padding:12px;border:1px solid #cfd7e6;border-radius:10px;background:#fff;font-size:15px">
            <option value="once">Keine – einmalig</option>
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
          </select>

          <label>Wiederholung bis</label>
          <input type="date" name="recurrence_end_date">

          <label>Wochentage bei wöchentlicher Wiederholung</label>
          <div>${weekdayChecks}</div>

          <label>Grund / Bezeichnung</label>
          <input type="text" name="reason" maxlength="200" placeholder="z. B. Training, Turnier, Wartung">

          <div class="actions">
            <button class="btn" type="submit">🔒 Sperre speichern</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Aktive Sperren / Reservierungen</h2>
        <table>
          <thead><tr>
            <th>Datum</th><th>Zeit</th><th>Wiederholung</th><th>Grund</th><th>Aktion</th>
          </tr></thead>
          <tbody>${blockRows}</tbody>
        </table>
      </div>

      <div class="card">
        <h2>➕ Mitglied manuell anlegen</h2>
        <p class="muted">
          Der neue Benutzer wird sofort freigeschaltet. Das Passwort wird verschlüsselt gespeichert.
        </p>

        <form method="post" action="/admin/create-member">
          <div class="grid">
            <div>
              <label>Name</label>
              <input type="text" name="name" maxlength="100" required>
            </div>
            <div>
              <label>E-Mail</label>
              <input type="email" name="email" maxlength="200" required>
            </div>
            <div>
              <label>Startpasswort</label>
              <input type="password" name="password" minlength="8" required>
            </div>
          </div>

          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="make_admin" value="1" style="width:auto">
            Als Administrator anlegen
          </label>

          <div class="actions">
            <button class="btn" type="submit">Mitglied anlegen</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>👥 Mitglieder</h2>
        <table>
          <thead><tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Aktion</th></tr></thead>
          <tbody>${memberRows}</tbody>
        </table>
      </div>

      <div class="card">
        <h2>📊 Buchungsstatistik</h2>
        <p class="muted">Wer hat wie oft gebucht und wann war die erste bzw. letzte Buchung?</p>
        <table>
          <thead><tr>
            <th>Mitglied</th><th>Buchungen</th><th>Zukünftig</th><th>Erste</th><th>Letzte</th>
          </tr></thead>
          <tbody>${statsRows || '<tr><td colspan="5">Keine Mitglieder vorhanden.</td></tr>'}</tbody>
        </table>
      </div>

      <div class="card">
        <h2>📅 Alle Buchungen</h2>
        <table>
          <thead><tr><th>Datum</th><th>Zeit</th><th>Name</th><th>E-Mail</th><th>Aktion</th></tr></thead>
          <tbody>${bookingRows || '<tr><td colspan="5">Noch keine Buchungen.</td></tr>'}</tbody>
        </table>
      </div>
    
        <div class="card">
          <h2>📜 Nutzungsbedingungen</h2>
          <p>Übersicht aller akzeptierten Versionen und Zeitpunkte.</p>
          <a class="btn secondary" href="/admin/terms">Akzeptierungen anzeigen</a>
        </div>
`, req));
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});


app.post("/admin/block", adminRequired, async (req, res) => {
  try {
    const startDate = String(req.body.start_date || "");
    const endDate = String(req.body.end_date || "");
    const startTime = String(req.body.start_time || "").trim();
    const endTime = String(req.body.end_time || "").trim();
    const recurrenceType = String(req.body.recurrence_type || "once");
    const recurrenceEndDate = String(req.body.recurrence_end_date || "").trim();
    const reason = String(req.body.reason || "").trim();
    let weekdays = req.body.weekdays || [];

    if (!Array.isArray(weekdays)) weekdays = [weekdays];
    weekdays = weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).send(page("Fehler", nav(req) + `
        <div class="card error"><h2>Ungültiges Datum</h2><p>Bitte Datum prüfen.</p></div>
      `, req));
    }

    if (endDate < startDate) {
      return res.status(400).send(page("Fehler", nav(req) + `
        <div class="card error"><h2>Ungültiger Zeitraum</h2><p>Das Enddatum darf nicht vor dem Startdatum liegen.</p></div>
      `, req));
    }

    if ((startTime && !endTime) || (!startTime && endTime) || (startTime && endTime && startTime >= endTime)) {
      return res.status(400).send(page("Fehler", nav(req) + `
        <div class="card error"><h2>Ungültige Uhrzeit</h2><p>Bitte beide Uhrzeiten angeben und einen gültigen Zeitraum wählen.</p></div>
      `, req));
    }

    if (!["once", "daily", "weekly", "monthly"].includes(recurrenceType)) {
      return res.status(400).send(page("Fehler", nav(req) + `
        <div class="card error"><h2>Ungültige Wiederholung</h2></div>
      `, req));
    }

    if (recurrenceType !== "once") {
      if (!recurrenceEndDate || recurrenceEndDate < startDate) {
        return res.status(400).send(page("Fehler", nav(req) + `
          <div class="card error"><h2>Wiederholungsende fehlt</h2>
          <p>Bei einer wiederkehrenden Sperre bitte ein Enddatum der Wiederholung angeben.</p></div>
        `, req));
      }

      if (recurrenceType === "weekly" && !weekdays.length) {
        weekdays = [weekdayFromYmd(startDate)];
      }
    } else {
      weekdays = [];
    }

    await pool.query(`
      INSERT INTO booking_blocks(
        start_date, end_date, start_time, end_time,
        recurrence_type, weekdays, recurrence_end_date, reason, active
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
    `, [
      startDate,
      endDate,
      startTime || null,
      endTime || null,
      recurrenceType,
      weekdays,
      recurrenceType === "once" ? null : recurrenceEndDate,
      reason || "Reserviert"
    ]);

    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});


app.post("/admin/block/delete/:id", adminRequired, async (req, res) => {
  try {
    await pool.query(
      "UPDATE booking_blocks SET active=FALSE WHERE id=$1",
      [req.params.id]
    );
    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});



app.post("/admin/create-member", adminRequired, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const makeAdmin = req.body.make_admin === "1";

    if (!name || !email || password.length < 8) {
      return res.status(400).send(
        page(
          "Administration",
          nav(req) + `
          <div class="card error">
            <h2>Mitglied konnte nicht angelegt werden</h2>
            <p>Name, E-Mail und ein Passwort mit mindestens 8 Zeichen sind erforderlich.</p>
            <a class="btn" href="/admin">Zurück zur Administration</a>
          </div>
          `,
          req
        )
      );
    }

    const existing = await pool.query(
      "SELECT id FROM members WHERE email=$1",
      [email]
    );

    if (existing.rowCount) {
      return res.status(409).send(
        page(
          "Administration",
          nav(req) + `
          <div class="card warn">
            <h2>E-Mail bereits vorhanden</h2>
            <p>Für diese E-Mail-Adresse existiert bereits ein Mitglied.</p>
            <a class="btn" href="/admin">Zurück zur Administration</a>
          </div>
          `,
          req
        )
      );
    }

    if (!makeAdmin) {
      const count = await pool.query(
        "SELECT COUNT(*)::int AS n FROM members WHERE status='approved'"
      );

      if (count.rows[0].n >= 100) {
        return res.status(409).send(
          page(
            "Administration",
            nav(req) + `
            <div class="card warn">
              <h2>100 Mitglieder erreicht</h2>
              <p>Es können keine weiteren Mitglieder angelegt werden.</p>
              <a class="btn" href="/admin">Zurück zur Administration</a>
            </div>
            `,
            req
          )
        );
      }
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO members(name,email,password_hash,status,admin)
       VALUES($1,$2,$3,'approved',$4)`,
      [name, email, hash, makeAdmin]
    );

    res.send(
      page(
        "Mitglied angelegt",
        nav(req) + `
        <div class="card ok">
          <h2>✓ Mitglied angelegt</h2>
          <p><b>${esc(name)}</b> wurde erfolgreich angelegt und freigeschaltet.</p>
          <p class="muted">
            Das Passwort wurde verschlüsselt gespeichert. Der Benutzer kann es nach dem Login selbst ändern.
          </p>
          <div class="actions">
            <a class="btn" href="/admin">Zur Administration</a>
          </div>
        </div>
        `,
        req
      )
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});


app.post(
  "/admin/approve/:id",
  adminRequired,
  async (req, res) => {

    try {

      const count =
        await pool.query(

          "SELECT COUNT(*)::int AS n FROM members WHERE status='approved'"

        );


      if (
        count.rows[0].n >= 100
      ) {

        return res.status(409).send(

          page(

            "Admin",

            `
            <div class="card warn">

              <h2>
                100 Mitglieder erreicht
              </h2>

              <p>
                Es können keine weiteren
                Mitglieder freigeschaltet werden.
              </p>

            </div>
            `,

            req

          )

        );

      }


      await pool.query(

        "UPDATE members SET status='approved' WHERE id=$1 AND admin=FALSE",

        [
          req.params.id
        ]

      );


      res.redirect("/admin");


    } catch (error) {

      console.error(error);

      res.status(500).send(
        "Serverfehler"
      );

    }

  }
);


app.post("/admin/make-admin/:id", adminRequired, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.session.member.id)) {
      return res.redirect("/admin");
    }

    await pool.query(
      `UPDATE members
          SET admin=TRUE, status='approved'
        WHERE id=$1`,
      [req.params.id]
    );

    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});


app.post("/admin/remove-admin/:id", adminRequired, async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId)) {
      return res.redirect("/admin");
    }

    if (targetId === Number(req.session.member.id)) {
      return res.status(400).send(page(
        "Administration",
        nav(req) + `
          <div class="card warn">
            <h2>Adminrechte nicht entfernt</h2>
            <p>Du kannst dir deine eigenen Adminrechte nicht selbst entziehen.</p>
            <a class="btn" href="/admin">Zurück zur Administration</a>
          </div>
        `,
        req
      ));
    }

    const count = await pool.query(
      "SELECT COUNT(*)::int AS n FROM members WHERE admin=TRUE"
    );

    if (count.rows[0].n <= 1) {
      return res.status(400).send(page(
        "Administration",
        nav(req) + `
          <div class="card warn">
            <h2>Letzter Administrator</h2>
            <p>Der letzte Administrator kann nicht entfernt werden.</p>
            <a class="btn" href="/admin">Zurück zur Administration</a>
          </div>
        `,
        req
      ));
    }

    await pool.query(
      "UPDATE members SET admin=FALSE, session_version=session_version+1 WHERE id=$1",
      [targetId]
    );

    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});


app.post(
  "/admin/block/:id",
  adminRequired,
  async (req, res) => {

    try {

      await pool.query(

        "UPDATE members SET status='blocked', session_version=session_version+1 WHERE id=$1 AND admin=FALSE",

        [
          req.params.id
        ]

      );


      res.redirect("/admin");


    } catch (error) {

      console.error(error);

      res.status(500).send(
        "Serverfehler"
      );

    }

  }
);


app.post(
  "/admin/cancel-booking/:id",
  adminRequired,
  async (req, res) => {

    try {

      await pool.query(

        "DELETE FROM bookings WHERE id=$1",

        [
          req.params.id
        ]

      );


      res.redirect("/admin");


    } catch (error) {

      console.error(error);

      res.status(500).send(
        "Serverfehler"
      );

    }

  }
);



// ============================================================
// TuRU Padel – Progressive Web App (PWA)
// Das bestehende Design und die Buchungslogik bleiben unverändert.
// ============================================================

app.get("/manifest.webmanifest", (req, res) => {
  res.type("application/manifest+json").send(JSON.stringify({
    name: "TuRU 1880 Padel",
    short_name: "TuRU Padel",
    description: "TuRU 1880 Padel – Platzbuchung",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f8fc",
    theme_color: "#0b4aa2",
    icons: [
      {
        src: "/turu-logo-v2.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/turu-logo-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  }));
});

app.get("/sw.js", (req, res) => {
  res.type("application/javascript").send(`
const CACHE_NAME = "turu-padel-shell-v2";
const SHELL = ["/turu-logo-v2.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Private pages, bookings and API responses are deliberately not cached.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/turu-logo-v2.png") {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request)
      )
    );
  }
});
`);
});

app.get("/pwa-check", (req, res) => {
  res.json({
    ok: true,
    app: "TuRU 1880 Padel",
    pwa: true
  });
});

initDb()

  .then(() => {

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          "TuRU Padel läuft auf Port " +
          PORT
        );

      }

    );

  })

  .catch(error => {

    console.error(
      "Datenbankfehler:",
      error
    );

    process.exit(1);

  });
