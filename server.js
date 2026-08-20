const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const webpush = require("web-push");

const app = express();

const TERMS_VERSION = "2026-08-20-v2";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:info@turu1880.de";
const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (PUSH_ENABLED) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("Push ist noch nicht aktiviert: VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY fehlen.");
}

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
    maxAge: 1000 * 60 * 60 * 24 * 365
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

.message-link{position:relative;}
.message-badge{
  display:none;
  min-width:19px;
  height:19px;
  padding:0 5px;
  margin-left:5px;
  border-radius:999px;
  background:#c0392b;
  color:#fff;
  font-size:11px;
  line-height:19px;
  text-align:center;
  vertical-align:middle;
}
.message-badge.visible{display:inline-block;}
.nav-disabled{opacity:.55;cursor:not-allowed;padding:10px 12px;display:inline-flex;align-items:center;}

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

const unreadBadge = document.getElementById("unreadMessageBadge");
if (unreadBadge) {
  fetch("/api/messages/unread-count", { credentials: "same-origin" })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const count = Number(data?.count || 0);
      if (count > 0) {
        unreadBadge.textContent = count > 99 ? "99+" : String(count);
        unreadBadge.classList.add("visible");
        document.title = "(" + (count > 99 ? "99+" : count) + ") Neue Nachricht" + (count === 1 ? "" : "en") + " – " + document.title;
      }
    })
    .catch(() => {});
}

async function turuEnablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    alert("Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.");
    return;
  }
  if (!window.isSecureContext) {
    alert("Push-Benachrichtigungen benötigen eine sichere HTTPS-Verbindung.");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("Push-Benachrichtigungen wurden nicht erlaubt.");
      return;
    }
    const keyResponse = await fetch("/api/push/public-key", { credentials: "same-origin" });
    const keyData = await keyResponse.json();
    if (!keyResponse.ok || !keyData.publicKey) {
      alert("Push-Benachrichtigungen sind auf dem Server noch nicht eingerichtet.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const padding = "=".repeat((4 - keyData.publicKey.length % 4) % 4);
      const base64 = (keyData.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(base64);
      const bytes = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    }
    const save = await fetch("/api/push/subscribe", { method: "POST", credentials: "same-origin", headers: {"Content-Type":"application/json"}, body: JSON.stringify(subscription) });
    if (!save.ok) throw new Error("Speichern fehlgeschlagen");
    alert("Push-Benachrichtigungen sind aktiviert.");
    location.reload();
  } catch (error) {
    console.error(error);
    alert("Push-Benachrichtigungen konnten nicht aktiviert werden.");
  }
}

async function turuDisablePush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/unsubscribe", { method: "POST", credentials: "same-origin", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      await subscription.unsubscribe();
    }
    alert("Push-Benachrichtigungen sind deaktiviert.");
    location.reload();
  } catch (error) {
    console.error(error);
    alert("Push-Benachrichtigungen konnten nicht deaktiviert werden.");
  }
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
      <a class="${active("/membership")}" href="/membership">Mitgliedsantrag</a>
    </nav>`;
  }

  return `<nav class="nav">
    <a class="${active("/", true)}" href="/">Startseite</a>
    ${req.session.member.admin || !req.session.member.hasActiveBooking
      ? `<a class="${active("/booking")}" href="/booking">🎾 Platz buchen</a>`
      : `<span class="nav-disabled" title="Du hast bereits eine aktive Buchung">🎾 Platz buchen (bereits gebucht)</span>`}
    <a class="${active("/my-bookings")}" href="/my-bookings">Meine Buchungen</a>
    <a class="${active("/password")}" href="/password">Passwort ändern</a>
    ${req.session.member.admin
      ? `<a class="${active("/admin")}" href="/admin">Administration</a>`
      : ""}
    <a class="message-link ${active("/messages")}" href="/messages">💬 Nachrichten <span id="unreadMessageBadge" class="message-badge" aria-label="Ungelesene Nachrichten"></span></a>
    <a class="${active("/notifications")}" href="/notifications">🔔 Benachrichtigungen</a>
      <form method="post" action="/logout">
      <button type="submit">Abmelden</button>
    </form>
  </nav>`;
}

function loginRequired(req, res, next) {
  if (!req.session.member) return res.redirect("/login");

  // Keine automatische Abmeldung wegen Inaktivität.
  // Der Login bleibt bestehen, solange der Nutzer sich nicht selbst abmeldet
  // oder der Administrator den Account sperrt/löscht bzw. die Session-Version ändert.
  pool.query("SELECT id,name,email,status,admin,session_version FROM members WHERE id=$1", [req.session.member.id])
    .then(result => {
      const member = result.rows[0];

      // Admin-Statusänderungen, Sperrungen und andere sicherheitsrelevante
      // Änderungen erhöhen session_version. Dadurch wird eine bestehende
      // Anmeldung beim nächsten Zugriff sofort ungültig.
      if (!member || member.status !== "approved" || Number(req.session.sessionVersion || 1) !== Number(member.session_version || 1)) {
        return req.session.destroy(() => res.redirect("/login?reason=changed"));
      }

      req.session.member = {
        id: member.id,
        name: member.name,
        email: member.email,
        admin: member.admin
      };
      req.session.sessionVersion = Number(member.session_version || 1);
      next();
    })
    .catch(error => {
      console.error(error);
      res.status(500).send("Serverfehler");
    });
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

function isAdultBirthDate(value) {
  const birth = dateFromYmd(value);
  const today = dateFromYmd(berlinDate());
  if (Number.isNaN(birth.getTime()) || Number.isNaN(today.getTime())) return false;
  if (birth > today) return false;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed =
    today.getUTCMonth() > birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age--;
  return age >= 18;
}

function adultCutoffYmd() {
  const today = dateFromYmd(berlinDate());
  today.setUTCFullYear(today.getUTCFullYear() - 18);
  return ymd(today);
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


function normalizeIban(value = "") {
  return String(value).replace(/\s+/g, "").toUpperCase();
}

function maskIban(value = "") {
  const iban = normalizeIban(value);
  if (iban.length <= 8) return iban ? "****" : "";
  return `${iban.slice(0, 4)} **** **** ${iban.slice(-4)}`;
}

function isValidIban(value = "") {
  const iban = normalizeIban(value);
  const lengths = {
    AL:28, AD:24, AT:20, AZ:28, BH:22, BE:16, BA:20, BR:29, BG:22, CR:22,
    HR:21, CY:28, CZ:24, DK:18, DO:28, EE:20, FO:18, FI:18, FR:27, GE:22,
    DE:22, GI:23, GR:27, GL:18, GT:28, HU:28, IS:26, IE:22, IL:23, IT:27,
    JO:30, KZ:20, KW:30, LV:21, LB:28, LI:21, LT:20, LU:20, MT:31, MR:27,
    MU:30, MC:27, MD:24, ME:22, NL:18, MK:19, NO:15, PK:24, PL:28, PT:25,
    QA:29, RO:24, SM:27, SA:24, RS:22, SK:24, SI:19, ES:24, SE:24, CH:21,
    TN:24, TR:26, UA:29, AE:23, GB:22, VA:22
  };
  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(iban)) return false;
  if (lengths[iban.slice(0,2)] !== iban.length) return false;
  const rearranged = iban.slice(4) + iban.slice(0,4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of String(value)) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function isValidSignature(value = "") {
  const signature = String(value || "");
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature) && signature.length <= 600000;
}

function addMonthsYmd(startYmd, months) {
  const d = dateFromYmd(startYmd);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + Number(months || 0));
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return ymd(d);
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
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS terms_version TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS member_status_log(
      id SERIAL PRIMARY KEY,
      member_id INTEGER,
      member_name TEXT,
      member_email TEXT,
      action TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      old_admin BOOLEAN,
      new_admin BOOLEAN,
      changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      changed_by INTEGER
    );
  `);

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
  await pool.query(`ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS member_name TEXT`);
  await pool.query(`ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS member_email TEXT`);
  await pool.query(`ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS member_deleted BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
  await pool.query(`ALTER TABLE terms_acceptances ALTER COLUMN member_id DROP NOT NULL`);
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
    CREATE TABLE IF NOT EXISTS membership_applications(
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      street TEXT NOT NULL,
      house_number TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      city TEXT NOT NULL,
      birth_date DATE NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      plan TEXT NOT NULL CHECK (plan IN ('monthly','annual')),
      amount_cents INTEGER NOT NULL,
      billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly','annual')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','cancelled')),
      membership_start DATE,
      minimum_end_date DATE,
      cancellation_requested_at TIMESTAMP,
      cancellation_effective_date DATE,
      iban_masked TEXT NOT NULL,
      iban_full TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      sepa_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      sepa_accepted_at TIMESTAMP,
      application_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      application_accepted_at TIMESTAMP,
      signature_data TEXT,
      signature_created_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMP,
      decided_by INTEGER
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_membership_applications_status
    ON membership_applications(status, created_at DESC);
  `);
  await pool.query(`ALTER TABLE membership_applications ADD COLUMN IF NOT EXISTS signature_data TEXT`);
  await pool.query(`ALTER TABLE membership_applications ADD COLUMN IF NOT EXISTS signature_created_at TIMESTAMP`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_membership_applications_email
    ON membership_applications(email);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages(
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      recipient_type TEXT NOT NULL DEFAULT 'all',
      recipient_member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions(
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      subscription JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member ON push_subscriptions(member_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reads(
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
      read_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY(message_id, member_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_deletions(
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
      deleted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY(message_id, member_id)
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

async function logMemberChange({ member, action, oldStatus, newStatus, oldAdmin, newAdmin, changedBy }) {
  if (!member) return;
  await pool.query(
    `INSERT INTO member_status_log(
       member_id, member_name, member_email, action,
       old_status, new_status, old_admin, new_admin, changed_by
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      member.id || null,
      member.name || null,
      member.email || null,
      action,
      oldStatus ?? null,
      newStatus ?? null,
      oldAdmin ?? null,
      newAdmin ?? null,
      changedBy || null
    ]
  );
}



app.get("/", async (req, res) => {

  if (req.session.member) {
    try {
      const active = await pool.query(
        `SELECT id FROM bookings
         WHERE member_id=$1 AND used=FALSE
           AND (booking_date + end_time) > NOW()
         LIMIT 1`,
        [req.session.member.id]
      );
      req.session.member.hasActiveBooking = active.rowCount > 0;
    } catch (error) {
      console.error("Fehler Buchungsstatus Startseite:", error);
    }
  }

  const content = req.session.member

    ? `
      <section class="hero">

        <h1>Willkommen bei TuRU 1880 Padel</h1>

        <p>
          Hallo <b>${esc(req.session.member.name)}</b>,
          hier kannst du deinen Padelplatz einfach und schnell buchen.
        </p>

        <div class="actions">

          ${req.session.member.hasActiveBooking
            ? `<span class="nav-disabled">🎾 Platz buchen (bereits gebucht)</span>`
            : `<a class="btn" href="/booking">🎾 Platz buchen</a>`}

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


app.get("/membership", (req, res) => {
  res.send(page("Als Mitglied anmelden", `
    <div class="hero">
      <h1>Mitgliedsantrag</h1>
      <p>Werde Mitglied bei TuRU 1880 und reiche deinen Mitgliedsantrag online ein.</p>
    </div>

    <div class="card">
      <h2>Mitgliedsantrag</h2>
      <p class="muted">
        Wähle zwischen 25 € monatlich oder 250 € jährlich. Die monatliche Mitgliedschaft
        hat eine Kündigungsfrist von 1 Monat zum Monatsende. Die Jahresmitgliedschaft
        hat eine Mindestlaufzeit von 12 Monaten; eine Kündigung kann zum Ablauf der Mindestlaufzeit
        mit einer Frist von 1 Monat erklärt werden.
      </p>

      <form method="post" action="/membership/apply">
        <h3>Persönliche Daten</h3>
        <div class="grid">
          <div><label>Vorname</label><input type="text" name="first_name" maxlength="100" required></div>
          <div><label>Nachname</label><input type="text" name="last_name" maxlength="100" required></div>
          <div><label>Straße</label><input type="text" name="street" maxlength="120" required></div>
          <div><label>Hausnummer</label><input type="text" name="house_number" maxlength="20" required></div>
          <div><label>PLZ</label><input type="text" name="postal_code" maxlength="12" required></div>
          <div><label>Ort</label><input type="text" name="city" maxlength="100" required></div>
          <div>
            <label>Geburtsdatum</label>
            <input id="membershipBirthDate" type="date" name="birth_date" required max="${adultCutoffYmd()}">
            <div id="minorWarning" class="alert" style="display:none;margin-top:8px">
              ⚠️ Minderjährige können keinen Mitgliedsantrag abschließen. Der Antrag ist erst ab 18 Jahren möglich.
            </div>
          </div>
          <div><label>Telefon</label><input type="tel" name="phone" maxlength="50"></div>
          <div><label>E-Mail</label><input type="email" name="email" maxlength="200" required></div>
        </div>

        <h3>Mitgliedschaft</h3>
        <div class="grid">
          <label class="card" style="margin:0">
            <input type="radio" name="plan" value="monthly" checked style="width:auto">
            <b>Monatlich – 25 €</b><br>
            <span class="muted">Kündigungsfrist: 1 Monat zum Monatsende.</span>
          </label>
          <label class="card" style="margin:0">
            <input type="radio" name="plan" value="annual" style="width:auto">
            <b>Jährlich – 250 €</b><br>
            <span class="muted">Mindestlaufzeit: 1 Jahr. Kündigung mit 1 Monat Frist zum Ablauf der Mindestlaufzeit.</span>
          </label>
        </div>

        <h3>SEPA-Lastschrift</h3>
        <p class="muted">Die Belastung erfolgt erst nach Annahme des Mitgliedsantrags und nach Maßgabe eurer SEPA-Informationen.</p>
        <div class="grid">
          <div><label>Kontoinhaber</label><input type="text" name="account_holder" maxlength="150" required></div>
          <div><label>IBAN</label><input type="text" name="iban" autocomplete="off" maxlength="40" required></div>
        </div>

        <label style="display:flex;gap:10px;align-items:flex-start;margin-top:16px">
          <input type="checkbox" name="sepa_accepted" value="1" required style="width:auto;margin-top:4px">
          <span>Ich ermächtige TuRU 1880, die fälligen Mitgliedsbeiträge per SEPA-Lastschrift von meinem angegebenen Konto einzuziehen. Die genaue Gläubiger-ID und Mandatsreferenz werden mir separat bzw. mit der Bestätigung des Mitgliedsantrags mitgeteilt.</span>
        </label>

        <label style="display:flex;gap:10px;align-items:flex-start;margin-top:14px">
          <input type="checkbox" name="application_accepted" value="1" required style="width:auto;margin-top:4px">
          <span>Ich bestätige die Angaben und beantrage die gewählte Mitgliedschaft zu den oben beschriebenen Konditionen.</span>
        </label>

        <h3>✍️ Unterschrift</h3>
        <p class="muted">Bitte unterschreibe mit dem Finger bzw. mit der Maus. Die Unterschrift ist ein Pflichtfeld.</p>
        <div style="border:1px solid #cfd8e3;border-radius:10px;background:#fff;max-width:650px">
          <canvas id="signaturePad" width="650" height="220" style="width:100%;height:220px;display:block;touch-action:none"></canvas>
        </div>
        <input type="hidden" name="signature_data" id="signatureData">
        <div class="actions" style="margin-top:8px">
          <button class="btn secondary" type="button" id="clearSignature">Unterschrift löschen</button>
          <span id="signatureHint" class="muted">Noch keine Unterschrift</span>
        </div>

        <div class="actions">
          <button id="membershipSubmit" class="btn" type="submit">Mitgliedsantrag absenden</button>
        </div>
      </form>
      <script>
        (() => {
          const input = document.getElementById("membershipBirthDate");
          const warning = document.getElementById("minorWarning");
          const button = document.getElementById("membershipSubmit");
          const form = button.closest("form");
          const cutoff = "${adultCutoffYmd()}";
          function checkAge() {
            const minor = !input.value || input.value > cutoff;
            warning.style.display = input.value && minor ? "block" : "none";
            button.disabled = !!(input.value && minor);
          }
          input.addEventListener("change", checkAge);
          input.addEventListener("input", checkAge);
          checkAge();

          const canvas = document.getElementById("signaturePad");
          const hidden = document.getElementById("signatureData");
          const hint = document.getElementById("signatureHint");
          const clear = document.getElementById("clearSignature");
          const ctx = canvas.getContext("2d");
          ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
          let drawing = false;
          function point(e) {
            const r = canvas.getBoundingClientRect();
            return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
          }
          canvas.addEventListener("pointerdown", e => {
            e.preventDefault(); drawing=true; canvas.setPointerCapture?.(e.pointerId);
            const p=point(e); ctx.beginPath(); ctx.moveTo(p.x,p.y);
          });
          canvas.addEventListener("pointermove", e => {
            if(!drawing)return; e.preventDefault();
            const p=point(e); ctx.lineTo(p.x,p.y); ctx.stroke();
            hidden.value=canvas.toDataURL("image/png"); hint.textContent="Unterschrift vorhanden ✓";
          });
          canvas.addEventListener("pointerup",()=>drawing=false);
          canvas.addEventListener("pointercancel",()=>drawing=false);
          clear.addEventListener("click",()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hidden.value="";hint.textContent="Noch keine Unterschrift";});
          form.addEventListener("submit",e=>{
            if(!hidden.value){e.preventDefault();alert("Bitte unterschreibe den Mitgliedsantrag.");canvas.scrollIntoView({behavior:"smooth",block:"center"});}
          });
        })();
      </script>
    </div>
  `, req));
});

app.post("/membership/apply", async (req, res) => {
  try {
    const firstName = String(req.body.first_name || "").trim();
    const lastName = String(req.body.last_name || "").trim();
    const street = String(req.body.street || "").trim();
    const houseNumber = String(req.body.house_number || "").trim();
    const postalCode = String(req.body.postal_code || "").trim();
    const city = String(req.body.city || "").trim();
    const birthDate = normalizeYmd(req.body.birth_date);
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const plan = String(req.body.plan || "");
    const accountHolder = String(req.body.account_holder || "").trim();
    const iban = normalizeIban(req.body.iban || "");
    const sepaAccepted = req.body.sepa_accepted === "1";
    const applicationAccepted = req.body.application_accepted === "1";
    const signatureData = String(req.body.signature_data || "");

    if (!firstName || !lastName || !street || !houseNumber || !postalCode || !city ||
        !birthDate || !email || !["monthly", "annual"].includes(plan) ||
        !accountHolder || !isPlausibleIban(iban) || !sepaAccepted || !applicationAccepted) {
      return res.status(400).send(page("Mitgliedsantrag", `
        <div class="card error">
          <h2>Antrag unvollständig</h2>
          <p>Bitte fülle alle Pflichtfelder korrekt aus, gib eine gültige IBAN an, bestätige beide Erklärungen und unterschreibe den Antrag.</p>
          <a class="btn" href="/membership">Zurück zum Antrag</a>
        </div>
      `, req));
    }

    if (!isAdultBirthDate(birthDate)) {
      return res.status(400).send(page("Mitgliedsantrag", `
        <div class="card error">
          <h2>Mitgliedsantrag nicht möglich</h2>
          <p>⚠️ Minderjährige können keinen Mitgliedsantrag abschließen. Eine Mitgliedschaft kann erst ab 18 Jahren beantragt werden.</p>
          <a class="btn secondary" href="/membership">Zurück zum Antrag</a>
        </div>
      `, req));
    }

    const duplicate = await pool.query(
      `SELECT id FROM membership_applications
       WHERE email=$1 AND status IN ('pending','approved')
       LIMIT 1`,
      [email]
    );
    if (duplicate.rowCount) {
      return res.status(409).send(page("Mitgliedsantrag", `
        <div class="card warn">
          <h2>Antrag bereits vorhanden</h2>
          <p>Für diese E-Mail-Adresse gibt es bereits einen offenen oder angenommenen Mitgliedsantrag.</p>
          <a class="btn" href="/membership">Zurück</a>
        </div>
      `, req));
    }

    const amountCents = plan === "monthly" ? 2500 : 25000;
    const interval = plan === "monthly" ? "monthly" : "annual";

    await pool.query(
      `INSERT INTO membership_applications(
        first_name,last_name,street,house_number,postal_code,city,birth_date,
        email,phone,plan,amount_cents,billing_interval,
        iban_masked,iban_full,account_holder,
        sepa_accepted,sepa_accepted_at,application_accepted,application_accepted_at,
        signature_data,signature_created_at
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,NOW(),TRUE,NOW(),$16,NOW()
      )`,
      [
        firstName,lastName,street,houseNumber,postalCode,city,birthDate,
        email,phone || null,plan,amountCents,interval,
        maskIban(iban),iban,accountHolder
      ]
    );

    res.send(page("Mitgliedsantrag eingegangen", `
      <div class="card ok">
        <h2>✓ Mitgliedsantrag erfolgreich übermittelt</h2>
        <p>Vielen Dank, ${esc(firstName)}. Dein Antrag wurde gespeichert und wird von TuRU 1880 geprüft.</p>
        <p>Die Mitgliedschaft wird erst nach Annahme durch den Verein wirksam. Informationen zur weiteren SEPA-Abwicklung erhältst du mit der Bestätigung.</p>
        <div class="actions"><a class="btn" href="/">Zur Startseite</a></div>
      </div>
    `, req));
  } catch (error) {
    console.error("Fehler Mitgliedsantrag:", error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/membership/cancel/:id", adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query(
      `SELECT id,status,plan,membership_start,minimum_end_date
       FROM membership_applications WHERE id=$1`,
      [id]
    );
    if (!result.rowCount) return res.redirect("/admin");
    const application = result.rows[0];

    if (application.status !== "approved") return res.redirect("/admin");

    const today = berlinDate();
    let effectiveDate;

    if (application.plan === "annual") {
      const minEnd = normalizeYmd(application.minimum_end_date);
      effectiveDate = minEnd || addMonthsYmd(today, 12);
    } else {
      const d = dateFromYmd(today);
      d.setUTCMonth(d.getUTCMonth() + 2, 0);
      effectiveDate = ymd(d);
    }

    await pool.query(
      `UPDATE membership_applications
       SET status='cancelled',
           cancellation_requested_at=NOW(),
           cancellation_effective_date=$2,
           updated_at=NOW()
       WHERE id=$1`,
      [id, effectiveDate]
    );
    res.redirect("/admin");
  } catch (error) {
    console.error("Fehler Kündigung:", error);
    res.status(500).send("Serverfehler");
  }
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

          <label>Geburtsdatum</label>
          <input
            type="date"
            name="birth_date"
            required
            max="${adultCutoffYmd()}"
          >
          <p class="muted">Die Registrierung ist nur ab 18 Jahren möglich.</p>

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
    const birthDate = normalizeYmd(req.body.birth_date);
    const alias = String(req.body.alias || "").trim();
    const acceptTerms = req.body.accept_terms === "yes";

    let registrationError = "";
    if (!name || !email || !birthDate || !password || !confirmPassword) {
      registrationError = "Bitte fülle alle Pflichtfelder aus.";
    } else if (password.length < 8) {
      registrationError = "Das Passwort muss mindestens 8 Zeichen lang sein.";
    } else if (password !== confirmPassword) {
      registrationError = "Die Passwörter stimmen nicht überein.";
    } else if (!isAdultBirthDate(birthDate)) {
      registrationError = "Du bist minderjährig. Ein Mitgliedsantrag kann erst ab 18 Jahren abgeschlossen werden.";
    } else if (!acceptTerms) {
      registrationError = "Bitte akzeptiere die Nutzungsbedingungen.";
    }

    if (registrationError) {
      return res.status(400).send(page(
        "Registrierung",
        `<div class="card error">
          <h2>Registrierung nicht möglich</h2>
          <p>${esc(registrationError)}</p>
          <div class="actions"><a class="btn secondary" href="/register">Zurück zur Registrierung</a></div>
        </div>`,
        req
      ));
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


    const result = await pool.query(

      "INSERT INTO members(name,email,password_hash,status,alias,birth_date,terms_accepted_at,terms_version) VALUES($1,$2,$3,'pending',$4,$5,NOW(),$6) RETURNING id",
      [name, email, hash, alias || null, birthDate, TERMS_VERSION]

    );

    await pool.query(
      "INSERT INTO terms_acceptances(member_id, terms_version, accepted_at) VALUES($1,$2,NOW())",
      [result.rows[0].id, TERMS_VERSION]
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
      <form method="post" action="/terms/accept" onsubmit="return confirm('Benutzer wirklich freigeben?');">
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
      `INSERT INTO terms_acceptances(member_id, terms_version, accepted_at)
       SELECT $1, $2, NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM terms_acceptances
         WHERE member_id=$1 AND terms_version=$2
       )`,
      [result.rows[0].id, TERMS_VERSION]
    );

    res.redirect("/login");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});



app.get("/admin/terms", adminRequired, async (req, res) => {
  try {
    const acceptedResult = await pool.query(`
      SELECT
        COALESCE(m.name, a.member_name, 'Benutzer gelöscht') AS name,
        COALESCE(m.email, a.member_email, '') AS email,
        CASE WHEN a.member_deleted THEN 'gelöscht' ELSE COALESCE(m.status, 'unbekannt') END AS status,
        a.terms_version, a.accepted_at
      FROM terms_acceptances a
      LEFT JOIN members m ON m.id = a.member_id
      ORDER BY a.accepted_at DESC
    `);

    const missingResult = await pool.query(`
      SELECT name, email, status
      FROM members
      WHERE terms_accepted_at IS NULL
         OR terms_version IS DISTINCT FROM $1
      ORDER BY name ASC
    `, [TERMS_VERSION]);

    const acceptedRows = acceptedResult.rows.map(m => `
      <tr>
        <td>${esc(m.name || "")}</td>
        <td>${esc(m.email || "")}</td>
        <td>${esc(m.status || "")}</td>
        <td>${new Date(m.accepted_at).toLocaleString("de-DE")}</td>
        <td>${esc(m.terms_version || "")}</td>
      </tr>
    `).join("");

    const missingRows = missingResult.rows.map(m => `
      <tr>
        <td>${esc(m.name || "")}</td>
        <td>${esc(m.email || "")}</td>
        <td>${esc(m.status || "")}</td>
        <td>Aktuelle Version noch nicht akzeptiert</td>
      </tr>
    `).join("");

    res.send(page("Nutzungsbedingungen – Verwaltung", `
      <div class="card">
        <h1>📜 Nutzungsbedingungen – Protokoll</h1>
        <p><strong>Aktuelle Version:</strong> ${TERMS_VERSION}</p>
        <p>Jede gespeicherte Zustimmung enthält Benutzer, Datum, Uhrzeit und Versionsnummer.</p>
      </div>

      <div class="card">
        <h2>Erinnerung erforderlich</h2>
        <p>Diese Benutzer haben die aktuelle Version noch nicht akzeptiert.</p>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Hinweis</th></tr>
            </thead>
            <tbody>
              ${missingRows || '<tr><td colspan="4">Alle Benutzer haben die aktuelle Version akzeptiert.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>Akzeptierungsprotokoll</h2>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Akzeptiert am</th><th>Version</th></tr>
            </thead>
            <tbody>
              ${acceptedRows || '<tr><td colspan="5">Noch keine Akzeptierungen vorhanden.</td></tr>'}
            </tbody>
          </table>
        </div>
        <p><a class="btn secondary" href="/admin">Zur Administration</a></p>
      </div>
    `, req));
  } catch (error) {
    console.error("Fehler /admin/terms:", error);
    res.status(500).send("Serverfehler");
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


    if (!member) {
      return res.status(401).send(
        page(
          "Benutzerkonto nicht gefunden",
          `
          <div class="card warn">
            <h2>Benutzerkonto nicht gefunden</h2>
            <p>Für diese E-Mail-Adresse ist kein Benutzerkonto vorhanden.</p>
            <p>Bitte registriere dich zuerst, bevor du dich anmelden kannst.</p>
            <div class="actions">
              <a class="btn" href="/register">Jetzt registrieren</a>
              <a class="btn secondary" href="/login">Zurück zum Login</a>
            </div>
          </div>
          `,
          req
        )
      );
    }

    if (!(await bcrypt.compare(password, member.password_hash))) {
      return res.status(401).send(
        page(
          "Login fehlgeschlagen",
          `
          <div class="card error">
            <h2>Login fehlgeschlagen</h2>
            <p>Das Passwort ist falsch.</p>
            <div class="actions">
              <a class="btn secondary" href="/login">Zurück zum Login</a>
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

      admin: member.admin,
      hasActiveBooking: false
    };

    const loginBooking = await pool.query(
      `SELECT id FROM bookings
       WHERE member_id=$1
         AND used=FALSE
         AND (booking_date + end_time) > NOW()
       LIMIT 1`,
      [member.id]
    );
    req.session.member.hasActiveBooking = loginBooking.rowCount > 0;

    req.session.sessionVersion = Number(member.session_version || 1);


    res.redirect("/");

  } catch (error) {

    console.error(error);

    res.status(500).send(
      "Serverfehler"
    );
  }
});



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
        <form method="post" action="/password" onsubmit="return confirm('Benutzer wirklich endgültig löschen? Der Benutzer muss sich danach neu registrieren.');">
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
    if (!req.session.member.admin && req.session.member.hasActiveBooking) {
      return res.send(page("Platz buchen", `
        <div class="card warn">
          <h2>🎾 Du hast bereits eine aktive Buchung</h2>
          <p>Solange diese Buchung aktiv ist, kannst du keine weitere Buchung vornehmen.</p>
          <div class="actions">
            <a class="btn secondary" href="/my-bookings">Meine Buchungen</a>
          </div>
        </div>
      `, req));
    }

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

            ${req.session.member.admin
              ? `<a class="btn secondary" href="/booking">Weitere Zeiten</a>`
              : `<span class="nav-disabled">Weitere Buchung erst nach Ablauf</span>`}

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



app.get("/api/push/public-key", loginRequired, (req, res) => {
  if (!PUSH_ENABLED) return res.status(503).json({ error: "Push ist noch nicht eingerichtet." });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post("/api/push/subscribe", loginRequired, async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ error: "Ungültige Push-Anmeldung." });
    }
    await pool.query(`INSERT INTO push_subscriptions(member_id,endpoint,subscription,updated_at)
      VALUES($1,$2,$3::jsonb,NOW())
      ON CONFLICT(endpoint) DO UPDATE SET member_id=EXCLUDED.member_id, subscription=EXCLUDED.subscription, updated_at=NOW()`,
      [req.session.member.id, subscription.endpoint, JSON.stringify(subscription)]);
    res.json({ ok: true });
  } catch (error) { console.error("Push speichern:", error); res.status(500).json({ error: "Serverfehler" }); }
});

app.post("/api/push/unsubscribe", loginRequired, async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "");
    if (endpoint) await pool.query("DELETE FROM push_subscriptions WHERE member_id=$1 AND endpoint=$2", [req.session.member.id, endpoint]);
    res.json({ ok: true });
  } catch (error) { console.error("Push entfernen:", error); res.status(500).json({ error: "Serverfehler" }); }
});

app.get("/notifications", loginRequired, async (req, res) => {
  try {
    const active = (await pool.query("SELECT 1 FROM push_subscriptions WHERE member_id=$1 LIMIT 1", [req.session.member.id])).rowCount > 0;
    res.send(page("Benachrichtigungen", `<div class="hero"><h1>🔔 Benachrichtigungen</h1><p>Erhalte neue Nachrichten von TuRU 1880 direkt als Push-Mitteilung.</p></div>
      <div class="card"><h2>Push-Benachrichtigungen</h2><p>${active ? "Auf diesem Konto ist mindestens ein Gerät für Push registriert." : "Push-Benachrichtigungen sind noch nicht aktiviert."}</p>
      ${PUSH_ENABLED ? `<div class="actions"><button class="btn" type="button" onclick="turuEnablePush()">🔔 Push aktivieren</button><button class="btn secondary" type="button" onclick="turuDisablePush()">Push deaktivieren</button></div>` : `<p class="muted">Push wird vom Server noch eingerichtet.</p>`}</div>`, req));
  } catch (error) { console.error("Benachrichtigungen:", error); res.status(500).send("Serverfehler"); }
});

async function sendPushToMembers(memberIds, title, body) {
  if (!PUSH_ENABLED || !memberIds.length) return;
  const result = await pool.query("SELECT id,endpoint,subscription FROM push_subscriptions WHERE member_id = ANY($1::int[])", [memberIds]);
  await Promise.allSettled(result.rows.map(async row => {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url: "/messages" }), { TTL: 60 * 60 * 24 });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pool.query("DELETE FROM push_subscriptions WHERE id=$1", [row.id]);
      } else console.error("Push senden:", error.statusCode || error.message);
    }
  }));
}

app.get("/api/messages/unread-count", loginRequired, async (req, res) => {
  try {
    const member = req.session.member;
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM messages m
       LEFT JOIN message_reads mr
         ON mr.message_id=m.id AND mr.member_id=$1
       LEFT JOIN message_deletions md
         ON md.message_id=m.id AND md.member_id=$1
       WHERE mr.message_id IS NULL
         AND md.message_id IS NULL
         AND (
           m.recipient_type='all'
           OR (m.recipient_type='member' AND m.recipient_member_id=$1)
           OR (m.recipient_type='admins' AND $2::boolean=TRUE)
         )`,
      [member.id, !!member.admin]
    );
    res.json({ count: result.rows[0]?.count || 0 });
  } catch (error) {
    console.error("Fehler ungelesene Nachrichten:", error);
    res.status(500).json({ count: 0 });
  }
});

app.get("/messages", loginRequired, async (req, res) => {
  try {
    const member = req.session.member;
    const result = await pool.query(
      `SELECT m.*, mr.read_at, s.name AS sender_name
       FROM messages m
       LEFT JOIN members s ON s.id=m.sender_id
       LEFT JOIN message_reads mr ON mr.message_id=m.id AND mr.member_id=$1
       LEFT JOIN message_deletions md ON md.message_id=m.id AND md.member_id=$1
       WHERE md.message_id IS NULL
         AND (m.recipient_type='all'
          OR (m.recipient_type='member' AND m.recipient_member_id=$1)
          OR (m.recipient_type='admins' AND $2::boolean=TRUE))
       ORDER BY m.created_at DESC`,
      [member.id, !!member.admin]
    );
    const rows = result.rows.map(m => `
      <div class="card">
        <h2>${esc(m.title)}</h2>
        <p class="muted">Von: ${esc(m.sender_name || "TuRU 1880")} · Gesendet: ${esc(String(m.created_at))}${m.read_at ? ` · Gelesen: ${esc(String(m.read_at))}` : ' · <b>Neu</b>'}</p>
        <p style="white-space:pre-wrap">${esc(m.body)}</p>
        <div class="actions">
          ${!m.read_at ? `<form method="post" action="/messages/${m.id}/read"><button class="btn" type="submit">Als gelesen markieren</button></form>` : ''}
          <form method="post" action="/messages/${m.id}/delete" onsubmit="return confirm('Nachricht wirklich löschen?');">
            <button class="btn secondary" type="submit">🗑️ Löschen</button>
          </form>
        </div>
      </div>`).join("");
    res.send(page("Nachrichten", `
      <div class="hero"><h1>💬 Nachrichten</h1><p>Deine Nachrichten von TuRU 1880.</p>
        <div class="actions"><a class="btn" href="/messages/new">✉️ Nachricht an Admin</a></div>
      </div>
      ${req.query.sent ? '<div class="card ok"><p>✓ Deine Nachricht wurde an die Administratoren gesendet.</p></div>' : ''}
      ${rows || '<div class="card">Keine Nachrichten vorhanden.</div>'}`, req));
  } catch (error) {
    console.error("Fehler Nachrichten:", error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/messages/:id/delete", loginRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const member = req.session.member;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send("Ungültige Nachricht.");
    }

    const visible = await pool.query(
      `SELECT 1 FROM messages
       WHERE id=$1
         AND (
           recipient_type='all'
           OR (recipient_type='member' AND recipient_member_id=$2)
           OR (recipient_type='admins' AND $3::boolean=TRUE)
         )`,
      [id, member.id, !!member.admin]
    );

    if (!visible.rowCount) {
      return res.status(404).send("Nachricht nicht gefunden.");
    }

    await pool.query(
      `INSERT INTO message_deletions(message_id,member_id)
       VALUES($1,$2)
       ON CONFLICT(message_id,member_id) DO NOTHING`,
      [id, member.id]
    );

    res.redirect("/messages");
  } catch (error) {
    console.error("Fehler persönliche Nachricht löschen:", error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/messages/:id/read", loginRequired, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO message_reads(message_id,member_id,read_at) VALUES($1,$2,NOW())
       ON CONFLICT(message_id,member_id) DO NOTHING`,
      [Number(req.params.id), req.session.member.id]
    );
    res.redirect("/messages");
  } catch (error) {
    console.error("Fehler Lesestatus:", error);
    res.status(500).send("Serverfehler");
  }
});

app.get("/messages/new", loginRequired, async (req, res) => {
  res.send(page("Nachricht an Admin", `
    <div class="hero"><h1>✉️ Nachricht an den Admin</h1><p>Du kannst hier direkt eine Nachricht an die TuRU 1880 Administratoren senden.</p></div>
    <div class="card">
      <form method="post" action="/messages/to-admin">
        <label>Titel</label>
        <input name="title" maxlength="200" required>
        <label>Nachricht</label>
        <textarea name="body" rows="8" maxlength="5000" required></textarea>
        <div class="actions">
          <button class="btn" type="submit">Nachricht senden</button>
          <a class="btn secondary" href="/messages">Zurück</a>
        </div>
      </form>
    </div>
  `, req));
});

app.post("/messages/to-admin", loginRequired, async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    if (!title || !body) {
      return res.status(400).send(page("Nachricht", `
        <div class="card error"><h2>Nachricht unvollständig</h2><p>Bitte Titel und Nachricht ausfüllen.</p><a class="btn secondary" href="/messages/new">Zurück</a></div>
      `, req));
    }

    await pool.query(
      `INSERT INTO messages(sender_id,title,body,recipient_type,recipient_member_id)
       VALUES($1,$2,$3,'admins',NULL)`,
      [req.session.member.id, title, body]
    );

    const admins = await pool.query(
      "SELECT id FROM members WHERE status='approved' AND admin=TRUE"
    );
    await sendPushToMembers(admins.rows.map(r => r.id), title, body);

    res.redirect("/messages?sent=1");
  } catch (error) {
    console.error("Fehler Nachricht an Admin:", error);
    res.status(500).send("Serverfehler");
  }
});

app.get("/admin/messages", adminRequired, async (req, res) => {
  try {
    const [messagesResult, membersResult] = await Promise.all([
      pool.query(`SELECT m.*, s.name AS sender_name, s.email AS sender_email, COUNT(mr.member_id)::int AS read_count
                  FROM messages m
                  LEFT JOIN members s ON s.id=m.sender_id
                  LEFT JOIN message_reads mr ON mr.message_id=m.id
                  GROUP BY m.id, s.name, s.email ORDER BY m.created_at DESC`),
      pool.query(`SELECT id,name,email FROM members WHERE status='approved' ORDER BY name,email`)
    ]);
    const options = membersResult.rows.map(m => `<option value="${m.id}">${esc(m.name)} (${esc(m.email)})</option>`).join("");
    const rows = messagesResult.rows.map(m => `<tr>
      <td><b>${esc(m.title)}</b><br><span class="muted">Von: ${esc(m.sender_name || "System")} · ${esc(String(m.created_at))}</span></td>
      <td>${m.recipient_type==='all'?'Alle Nutzer':m.recipient_type==='admins'?'Administratoren':'Einzelner Nutzer'}</td>
      <td>${m.read_count}</td>
      <td><div class="actions">
        <a class="btn" href="/admin/messages/${m.id}/reads">Lesestatus</a>
        <form method="post" action="/admin/messages/${m.id}/delete" onsubmit="return confirm('Nachricht wirklich endgültig löschen?');">
          <button class="btn secondary" type="submit">🗑️ Löschen</button>
        </form>
      </div></td></tr>`).join("");
    res.send(page("Kommunikation", `
      <div class="hero"><h1>📣 Kommunikations-Zentrale</h1><p>Nachrichten senden und Lesestatus prüfen.</p></div>
      <div class="card"><h2>Neue Nachricht</h2>
        <form method="post" action="/admin/messages/send">
          <label>Titel</label><input name="title" maxlength="200" required>
          <label>Nachricht</label><textarea name="body" rows="7" required></textarea>
          <label>Empfänger</label>
          <select name="recipient_type" id="recipient_type" onchange="document.getElementById('singleMember').style.display=this.value==='member'?'block':'none'">
            <option value="all">Alle Nutzer</option><option value="admins">Nur Administratoren</option><option value="member">Einzelner Nutzer</option>
          </select>
          <div id="singleMember" style="display:none"><label>Benutzer auswählen</label><select name="recipient_member_id">${options}</select></div>
          <div class="actions"><button class="btn" type="submit">Nachricht senden</button></div>
        </form>
      </div>
      <div class="card"><h2>Gesendete Nachrichten</h2><table><thead><tr><th>Nachricht</th><th>Empfänger</th><th>Gelesen</th><th>Details</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Noch keine Nachrichten.</td></tr>'}</tbody></table></div>`, req));
  } catch (error) {
    console.error("Fehler Kommunikations-Zentrale:", error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/admin/messages/send", adminRequired, async (req, res) => {
  try {
    const title=String(req.body.title||"").trim(), body=String(req.body.body||"").trim();
    const type=String(req.body.recipient_type||"all");
    const memberId=type==="member"?Number(req.body.recipient_member_id):null;
    if(!title||!body||!["all","admins","member"].includes(type)) return res.status(400).send("Bitte alle Angaben prüfen.");
    if(type==="member" && (!Number.isInteger(memberId)||memberId<=0)) return res.status(400).send("Bitte einen Benutzer auswählen.");
    await pool.query(`INSERT INTO messages(sender_id,title,body,recipient_type,recipient_member_id) VALUES($1,$2,$3,$4,$5)`,
      [req.session.member.id,title,body,type,memberId]);
    let recipientRows;
    if (type === "member") recipientRows = await pool.query("SELECT id FROM members WHERE id=$1 AND status='approved'", [memberId]);
    else if (type === "admins") recipientRows = await pool.query("SELECT id FROM members WHERE status='approved' AND admin=TRUE");
    else recipientRows = await pool.query("SELECT id FROM members WHERE status='approved'");
    await sendPushToMembers(recipientRows.rows.map(r => r.id), title, body);
    res.redirect("/admin/messages");
  } catch(error) { console.error(error); res.status(500).send("Serverfehler"); }
});

app.post("/admin/messages/:id/delete", adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send("Ungültige Nachricht.");
    const result = await pool.query("DELETE FROM messages WHERE id=$1 RETURNING id", [id]);
    if (!result.rowCount) return res.status(404).send("Nachricht nicht gefunden.");
    res.redirect("/admin/messages");
  } catch (error) {
    console.error("Fehler Admin-Nachricht löschen:", error);
    res.status(500).send("Serverfehler");
  }
});

app.get("/admin/messages/:id/reads", adminRequired, async (req,res)=>{
  try {
    const id=Number(req.params.id);
    const [msg,reads]=await Promise.all([
      pool.query("SELECT * FROM messages WHERE id=$1",[id]),
      pool.query(`SELECT m.name,m.email,r.read_at FROM message_reads r JOIN members m ON m.id=r.member_id WHERE r.message_id=$1 ORDER BY r.read_at DESC`,[id])
    ]);
    if(!msg.rowCount) return res.status(404).send("Nachricht nicht gefunden.");
    const rows=reads.rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(String(r.read_at))}</td></tr>`).join("");
    res.send(page("Lesestatus", `<div class="card"><h1>${esc(msg.rows[0].title)}</h1><p style="white-space:pre-wrap">${esc(msg.rows[0].body)}</p></div><div class="card"><h2>Lesestatus</h2><table><thead><tr><th>Name</th><th>E-Mail</th><th>Gelesen am</th></tr></thead><tbody>${rows||'<tr><td colspan="3">Noch niemand.</td></tr>'}</tbody></table><div class="actions"><a class="btn secondary" href="/admin/messages">Zurück</a></div></div>`,req));
  } catch(error) { console.error(error); res.status(500).send("Serverfehler"); }
});

app.get("/admin", adminRequired, async (req, res) => {
  try {
    const [membersResult, bookingsResult, blocksResult, membershipResult, statsResult] =
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
            id, first_name, last_name, street, house_number, postal_code, city,
            birth_date, email, phone, plan, amount_cents, billing_interval, status,
            membership_start, minimum_end_date, cancellation_effective_date,
            iban_masked, account_holder, created_at
          FROM membership_applications
          ORDER BY
            CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'cancelled' THEN 2 ELSE 3 END,
            created_at DESC
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
          : `<form method="post" action="/admin/remove-admin/${member.id}" style="display:inline" onsubmit="return confirm('Wirklich Administratorrechte entfernen?');">
               <button class="btn danger" type="submit">Admin entfernen</button>
             </form>`;
      } else if (member.status === "pending") {
        statusAction =
          `<form method="post" action="/admin/approve/${member.id}" style="display:inline" onsubmit="return confirm('Benutzer wirklich freigeben?');">
             <button class="btn" type="submit">Freigeben</button>
           </form>`;
      } else if (member.status === "approved") {
        statusAction =
          `<form method="post" action="/admin/block/${member.id}" style="display:inline" onsubmit="return confirm('Benutzer wirklich sperren? Der Benutzer wird sofort abgemeldet und kann sich nicht mehr anmelden.');">
             <button class="btn danger" type="submit">Sperren</button>
           </form>`;
      } else {
        statusAction =
          `<span class="badge error">Gesperrt</span>
           <form method="post" action="/admin/approve/${member.id}" style="display:inline" onsubmit="return confirm('Benutzer wirklich freigeben?');">
             <button class="btn secondary" type="submit">Entsperren</button>
           </form>`;
      }

      const adminAction = member.admin
        ? ""
        : `<form method="post" action="/admin/make-admin/${member.id}" style="display:inline" onsubmit="return confirm('Wirklich Administratorrechte vergeben?');">
             <button class="btn secondary" type="submit">Zum Admin machen</button>
           </form>`;

      const deleteAction = member.admin
        ? ""
        : `<form method="post" action="/admin/delete-member/${member.id}" style="display:inline"
                onsubmit="return confirm('Benutzer wirklich endgültig löschen? Der Benutzer muss sich danach neu registrieren.');">
             <button class="btn danger" type="submit">Löschen</button>
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
              ${deleteAction}
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


    const membershipRows = membershipResult.rows.map(application => {
      const planLabel = application.plan === "annual" ? "Jährlich – 250 €" : "Monatlich – 25 €";
      const statusLabels = {
        pending: '<span class="badge warn">Beantragt</span>',
        approved: '<span class="badge ok">Angenommen</span>',
        rejected: '<span class="badge error">Abgelehnt</span>',
        cancelled: '<span class="badge">Gekündigt</span>'
      };
      const forwardSubject = encodeURIComponent(`Mitgliedsantrag – ${application.first_name} ${application.last_name}`);
      const forwardBody = encodeURIComponent(
        `Mitgliedsantrag von ${application.first_name} ${application.last_name}\n` +
        `E-Mail: ${application.email}\n` +
        `Telefon: ${application.phone || "–"}\n` +
        `Adresse: ${application.street} ${application.house_number}, ${application.postal_code} ${application.city}\n` +
        `Geburtsdatum: ${normalizeYmd(application.birth_date)}\n` +
        `Tarif: ${planLabel}\n` +
        `Kontoinhaber: ${application.account_holder}\n` +
        `IBAN: ${application.iban_masked}\n` +
        `Antrag eingegangen: ${normalizeYmd(application.created_at)}`
      );
      let actions = `
        <div class="actions" style="margin-bottom:8px">
          <a class="btn secondary" href="/admin/membership/${application.id}/view">👁️ Öffnen</a>
          <a class="btn secondary" href="/admin/membership/${application.id}/view?print=1" target="_blank">🖨️ PDF/Drucken</a>
          <a class="btn secondary" href="mailto:?subject=${forwardSubject}&body=${forwardBody}">✉️ Weiterleiten</a>
        </div>`;
      if (application.status === "pending") {
        actions += `
          <form method="post" action="/admin/membership/${application.id}/approve" style="display:inline" onsubmit="return confirm('Mitgliedsantrag wirklich annehmen?');">
            <button class="btn" type="submit">Annehmen</button>
          </form>
          <form method="post" action="/admin/membership/${application.id}/reject" style="display:inline" onsubmit="return confirm('Mitgliedsantrag wirklich ablehnen?');">
            <button class="btn danger" type="submit">Ablehnen</button>
          </form>`;
      } else if (application.status === "approved") {
        actions += `
          <form method="post" action="/membership/cancel/${application.id}" style="display:inline" onsubmit="return confirm('Mitgliedschaft wirklich kündigen? Das Wirksamkeitsdatum wird nach dem gewählten Tarif berechnet.');">
            <button class="btn danger" type="submit">Kündigen</button>
          </form>`;
      }
      return `
        <tr>
          <td><b>${esc(application.first_name)} ${esc(application.last_name)}</b><br><span class="muted">${esc(application.email)} · ${esc(application.phone || "–")}</span></td>
          <td>${esc(application.street)} ${esc(application.house_number)}<br>${esc(application.postal_code)} ${esc(application.city)}</td>
          <td>${esc(planLabel)}</td>
          <td>${statusLabels[application.status] || esc(application.status)}</td>
          <td>${application.membership_start ? esc(normalizeYmd(application.membership_start)) : "–"}<br><span class="muted">Mindestende: ${application.minimum_end_date ? esc(normalizeYmd(application.minimum_end_date)) : "–"}</span></td>
          <td>${esc(application.account_holder)}<br><span class="muted">${esc(application.iban_masked)}</span></td>
          <td>${esc(normalizeYmd(application.created_at))}</td>
          <td>${actions || "–"}</td>
        </tr>`;
    }).join("");

    const blockRows = blocksResult.rows.length
      ? blocksResult.rows.map(block => `
        <tr>
          <td>${esc(String(block.start_date).slice(0, 10))}–${esc(String(block.end_date).slice(0, 10))}</td>
          <td>${esc(formatBlockTime(block))}</td>
          <td>${esc(recurrenceLabel(block))}</td>
          <td>${esc(block.reason || "Reserviert")}</td>
          <td>
            <form method="post" action="/admin/block/delete/${block.id}" onsubmit="return confirm('Benutzer wirklich sperren? Der Benutzer wird sofort abgemeldet und kann sich nicht mehr anmelden.');">
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
        
      <div class="card">
        <h2>📣 Kommunikation</h2>
        <p>Nachrichten an alle Nutzer, Administratoren oder einzelne Benutzer senden und Lesestatus prüfen.</p>
        <a class="btn" href="/admin/messages">Kommunikations-Zentrale öffnen</a>
      </div>
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
        <h2>📝 Mitgliedsanträge</h2>
        <p class="muted">Online eingereichte Vereinsmitgliedschaften und deren Bearbeitungsstatus.</p>
        <table>
          <thead><tr>
            <th>Antragsteller</th><th>Adresse</th><th>Tarif</th><th>Status</th>
            <th>Laufzeit</th><th>SEPA-Konto</th><th>Antrag</th><th>Aktion</th>
          </tr></thead>
          <tbody>${membershipRows || '<tr><td colspan="8" class="muted">Noch keine Mitgliedsanträge.</td></tr>'}</tbody>
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




app.get("/admin/membership/:id/view", adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send("Ungültiger Mitgliedsantrag.");
    }

    const result = await pool.query(
      `SELECT *
       FROM membership_applications
       WHERE id=$1`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).send("Mitgliedsantrag nicht gefunden.");
    }

    const a = result.rows[0];
    const planLabel = a.plan === "annual" ? "Jährlich – 250 €" : "Monatlich – 25 €";
    const statusLabels = {
      pending: "Beantragt",
      approved: "Angenommen",
      rejected: "Abgelehnt",
      cancelled: "Gekündigt"
    };

    const printMode = req.query.print === "1";
    const mailSubject = encodeURIComponent(`Mitgliedsantrag – ${a.first_name} ${a.last_name}`);
    const mailBody = encodeURIComponent(
      `Mitgliedsantrag von ${a.first_name} ${a.last_name}\n` +
      `E-Mail: ${a.email}\nTelefon: ${a.phone || "–"}\n` +
      `Adresse: ${a.street} ${a.house_number}, ${a.postal_code} ${a.city}\n` +
      `Geburtsdatum: ${normalizeYmd(a.birth_date)}\n` +
      `Tarif: ${planLabel}\n` +
      `Kontoinhaber: ${a.account_holder}\nIBAN: ${a.iban_masked}\n` +
      `Antrag eingegangen: ${normalizeYmd(a.created_at)}`
    );

    res.send(page("Mitgliedsantrag", `
      <div class="card membership-detail ${printMode ? "print-mode" : ""}">
        <div class="actions no-print">
          <a class="btn secondary" href="/admin">← Zurück</a>
          <button class="btn" type="button" onclick="window.print()">🖨️ Als PDF speichern / Drucken</button>
          <a class="btn secondary" href="mailto:?subject=${mailSubject}&body=${mailBody}">✉️ Weiterleiten</a>
        </div>

        <h1>📝 Mitgliedsantrag</h1>
        <p class="muted">Antragsnummer: ${a.id} · Eingegangen: ${esc(normalizeYmd(a.created_at))}</p>

        <h2>Persönliche Daten</h2>
        <table>
          <tr><th>Vorname</th><td>${esc(a.first_name)}</td></tr>
          <tr><th>Nachname</th><td>${esc(a.last_name)}</td></tr>
          <tr><th>Geburtsdatum</th><td>${esc(normalizeYmd(a.birth_date))}</td></tr>
          <tr><th>E-Mail</th><td>${esc(a.email)}</td></tr>
          <tr><th>Telefon</th><td>${esc(a.phone || "–")}</td></tr>
        </table>

        <h2>Adresse</h2>
        <table>
          <tr><th>Straße</th><td>${esc(a.street)} ${esc(a.house_number)}</td></tr>
          <tr><th>PLZ / Ort</th><td>${esc(a.postal_code)} ${esc(a.city)}</td></tr>
        </table>

        <h2>Mitgliedschaft</h2>
        <table>
          <tr><th>Tarif</th><td>${esc(planLabel)}</td></tr>
          <tr><th>Status</th><td>${esc(statusLabels[a.status] || a.status)}</td></tr>
          <tr><th>Mitgliedschaft ab</th><td>${a.membership_start ? esc(normalizeYmd(a.membership_start)) : "–"}</td></tr>
          <tr><th>Mindestende</th><td>${a.minimum_end_date ? esc(normalizeYmd(a.minimum_end_date)) : "–"}</td></tr>
          <tr><th>Kündigung wirksam</th><td>${a.cancellation_effective_date ? esc(normalizeYmd(a.cancellation_effective_date)) : "–"}</td></tr>
        </table>

        <h2>SEPA-Lastschrift</h2>
        <table>
          <tr><th>Kontoinhaber</th><td>${esc(a.account_holder)}</td></tr>
          <tr><th>IBAN</th><td>${esc(a.iban_masked)}</td></tr>
          <tr><th>SEPA akzeptiert</th><td>${a.sepa_accepted ? "Ja" : "Nein"}</td></tr>
          <tr><th>Antrag akzeptiert</th><td>${a.application_accepted ? "Ja" : "Nein"}</td></tr>
          <tr><th>Unterschrift</th><td>${a.signature_data ? `<img src="${a.signature_data}" alt="Digitale Unterschrift" style="max-width:420px;max-height:140px;border:1px solid #ddd;background:#fff">` : "Nicht vorhanden"}</td></tr>
        </table>

        ${a.notes ? `<h2>Notizen</h2><p style="white-space:pre-wrap">${esc(a.notes)}</p>` : ""}

        <div class="actions no-print" style="margin-top:20px">
          <a class="btn secondary" href="/admin">Zurück zur Administration</a>
        </div>
      </div>
      <style>
        .membership-detail table{width:100%;border-collapse:collapse;margin-bottom:20px}
        .membership-detail th,.membership-detail td{padding:10px;border-bottom:1px solid #ddd;text-align:left}
        .membership-detail th{width:220px;background:#f5f7fa}
        @media print {
          .no-print{display:none!important}
          body{background:#fff!important}
          .membership-detail{box-shadow:none!important;border:0!important}
        }
      </style>
    `, req));
  } catch (error) {
    console.error("Fehler Mitgliedsantrag öffnen:", error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/admin/membership/:id/approve", adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const found = await pool.query(
      "SELECT id,status,plan FROM membership_applications WHERE id=$1 FOR UPDATE",
      [id]
    );
    if (!found.rowCount || found.rows[0].status !== "pending") return res.redirect("/admin");

    const start = berlinDate();
    const minimumEnd = found.rows[0].plan === "annual" ? addMonthsYmd(start, 12) : null;

    await pool.query(
      `UPDATE membership_applications
       SET status='approved',
           membership_start=$2,
           minimum_end_date=$3,
           decided_at=NOW(),
           decided_by=$4,
           updated_at=NOW()
       WHERE id=$1`,
      [id, start, minimumEnd, Number(req.session.member.id)]
    );
    res.redirect("/admin");
  } catch (error) {
    console.error("Fehler Mitgliedsantrag annehmen:", error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/admin/membership/:id/reject", adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(
      `UPDATE membership_applications
       SET status='rejected', decided_at=NOW(), decided_by=$2, updated_at=NOW()
       WHERE id=$1 AND status='pending'`,
      [id, Number(req.session.member.id)]
    );
    res.redirect("/admin");
  } catch (error) {
    console.error("Fehler Mitgliedsantrag ablehnen:", error);
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


app.post("/admin/approve/:id", adminRequired, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const before = await pool.query(
      "SELECT id,name,email,status,admin FROM members WHERE id=$1 AND admin=FALSE",
      [targetId]
    );
    if (!before.rowCount) return res.redirect("/admin");
    const member = before.rows[0];

    if (member.status !== "approved") {
      const count = await pool.query(
        "SELECT COUNT(*)::int AS n FROM members WHERE status='approved' AND admin=FALSE"
      );
      if (count.rows[0].n >= 100) return res.status(409).send("100 Mitglieder erreicht");
    }

    await pool.query(
      "UPDATE members SET status='approved', session_version=session_version+1 WHERE id=$1",
      [targetId]
    );

    await logMemberChange({
      member, action: member.status === "blocked" ? "unblocked" : "approved",
      oldStatus: member.status, newStatus: "approved",
      oldAdmin: member.admin, newAdmin: member.admin,
      changedBy: Number(req.session.member.id)
    });
    res.redirect("/admin");
  } catch (error) {
    console.error("Fehler Statusänderung:", error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/admin/make-admin/:id", adminRequired, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId === Number(req.session.member.id)) return res.redirect("/admin");
    const before = await pool.query("SELECT id,name,email,status,admin FROM members WHERE id=$1",[targetId]);
    if (!before.rowCount) return res.redirect("/admin");
    const member = before.rows[0];

    await pool.query(
      "UPDATE members SET admin=TRUE, status='approved', session_version=session_version+1 WHERE id=$1",
      [targetId]
    );
    await logMemberChange({
      member, action:"made_admin", oldStatus:member.status, newStatus:"approved",
      oldAdmin:member.admin, newAdmin:true, changedBy:Number(req.session.member.id)
    });
    res.redirect("/admin");
  } catch (error) {
    console.error(error); res.status(500).send("Serverfehler");
  }
});

app.post("/admin/remove-admin/:id", adminRequired, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId === Number(req.session.member.id)) return res.redirect("/admin");
    const before = await pool.query("SELECT id,name,email,status,admin FROM members WHERE id=$1",[targetId]);
    if (!before.rowCount) return res.redirect("/admin");
    const member=before.rows[0];
    if (!member.admin) return res.redirect("/admin");
    const count=await pool.query("SELECT COUNT(*)::int AS n FROM members WHERE admin=TRUE");
    if (count.rows[0].n<=1) return res.status(400).send("Letzter Administrator kann nicht entfernt werden.");

    await pool.query("UPDATE members SET admin=FALSE, session_version=session_version+1 WHERE id=$1",[targetId]);
    await logMemberChange({
      member, action:"removed_admin", oldStatus:member.status, newStatus:member.status,
      oldAdmin:true,newAdmin:false,changedBy:Number(req.session.member.id)
    });
    res.redirect("/admin");
  } catch(error){console.error(error);res.status(500).send("Serverfehler");}
});

app.post("/admin/delete-member/:id", adminRequired, async (req,res)=>{
  const targetId=Number(req.params.id);
  if (!Number.isInteger(targetId)||targetId<=0||targetId===Number(req.session.member.id)) return res.status(400).send("Benutzer kann nicht gelöscht werden.");
  try{
    const r=await pool.query("SELECT id,name,email,status,admin FROM members WHERE id=$1",[targetId]);
    if(!r.rowCount) return res.redirect("/admin");
    const member=r.rows[0];
    if(member.admin) return res.status(400).send("Administratorkonten können hier nicht gelöscht werden.");

    await pool.query(
      `UPDATE terms_acceptances
       SET member_id=NULL, member_name=$2, member_email=$3, member_deleted=TRUE, deleted_at=NOW()
       WHERE member_id=$1`,
      [targetId,member.name,member.email]
    );
    await logMemberChange({
      member,action:"deleted",oldStatus:member.status,newStatus:"deleted",
      oldAdmin:false,newAdmin:false,changedBy:Number(req.session.member.id)
    });
    await pool.query("DELETE FROM members WHERE id=$1",[targetId]);
    res.redirect("/admin");
  }catch(error){console.error("Fehler beim Löschen:",error);res.status(500).send("Serverfehler");}
});

app.post("/admin/block/:id", adminRequired, async (req,res)=>{
  try{
    const targetId=Number(req.params.id);
    const r=await pool.query("SELECT id,name,email,status,admin FROM members WHERE id=$1 AND admin=FALSE",[targetId]);
    if(!r.rowCount) return res.redirect("/admin");
    const member=r.rows[0];
    await pool.query("UPDATE members SET status='blocked', session_version=session_version+1 WHERE id=$1",[targetId]);
    // Gesperrte Mitglieder sollen keine weiteren Push-Nachrichten erhalten.
    await pool.query("DELETE FROM push_subscriptions WHERE member_id=$1",[targetId]);
    await logMemberChange({
      member,action:"blocked",oldStatus:member.status,newStatus:"blocked",
      oldAdmin:false,newAdmin:false,changedBy:Number(req.session.member.id)
    });
    res.redirect("/admin");
  }catch(error){console.error("Fehler Sperrung:",error);res.status(500).send("Serverfehler");}
});

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

self.addEventListener("push", event => {
  let data = { title: "TuRU 1880 Padel", body: "Du hast eine neue Nachricht.", url: "/messages" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/turu-logo-v2.png",
    badge: "/turu-logo-v2.png",
    data: { url: data.url || "/messages" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ("focus" in client) { client.navigate(event.notification.data.url); return client.focus(); }
    }
    return clients.openWindow(event.notification.data.url);
  }));
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
