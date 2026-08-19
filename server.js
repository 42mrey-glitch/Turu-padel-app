const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.get("/turu-logo.png", (req, res) => res.sendFile(__dirname + "/turu-logo.png"));

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
    maxAge: 1000 * 60 * 60 * 24 * 30
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
</head>
<body>

<header class="topbar">

  <div class="brand">

    <img class="brand-logo" src="/turu-logo.png" alt="TuRU 1880 Düsseldorf">

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

function loginRequired(req, res, next) {
  if (!req.session.member) {
    return res.redirect("/login");
  }

  next();
}

function adminRequired(req, res, next) {
  if (!req.session.member?.admin) {
    return res.status(403).send(
      page(
        "Kein Zugriff",
        nav(req) +
        '<div class="card error">' +
        '<h2>Kein Zugriff</h2>' +
        '<p>Dieser Bereich ist nur für Administratoren verfügbar.</p>' +
        '</div>',
        req
      )
    );
  }

  next();
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

function dateFromYmd(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function weekdayFromYmd(value) {
  return dateFromYmd(value).getUTCDay();
}

function blockTimeOverlaps(block, start, end) {
  if (!block.start_time || !block.end_time) return true;

  const blockStart = String(block.start_time).slice(0, 5);
  const blockEnd = String(block.end_time).slice(0, 5);

  return start < blockEnd && end > blockStart;
}

function blockAppliesToDate(block, date) {
  const current = dateFromYmd(date);
  const startDate = dateFromYmd(block.start_date);
  const endDate = dateFromYmd(block.end_date || block.start_date);

  if (block.recurrence_type === "once") {
    return current >= startDate && current <= endDate;
  }

  const recurrenceEnd = block.recurrence_end_date
    ? dateFromYmd(block.recurrence_end_date)
    : endDate;

  if (current < startDate || current > recurrenceEnd) return false;

  if (block.recurrence_type === "daily") {
    return true;
  }

  if (block.recurrence_type === "weekly") {
    const weekdays = Array.isArray(block.weekdays)
      ? block.weekdays.map(Number)
      : [];

    const selected = weekdays.length
      ? weekdays
      : [startDate.getUTCDay()];

    return selected.includes(current.getUTCDay());
  }

  if (block.recurrence_type === "monthly") {
    return current.getUTCDate() === startDate.getUTCDate();
  }

  return false;
}

async function getActiveBlocksForDate(date) {
  const result = await pool.query(
    `SELECT *
       FROM booking_blocks
      WHERE active=TRUE
        AND start_date <= $1
        AND (
          recurrence_type='once'
          OR recurrence_end_date IS NULL
          OR recurrence_end_date >= $1
        )
      ORDER BY start_date, start_time`,
    [date]
  );

  return result.rows.filter(block => blockAppliesToDate(block, date));
}

async function isSlotBlocked(date, start, end) {
  const blocks = await getActiveBlocksForDate(date);
  return blocks.some(block => blockTimeOverlaps(block, start, end));
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
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
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
          Willkommen auf der Buchungsseite.
        </p>

        <p class="muted">
          Melde dich an, um einen freien Padel-Termin zu buchen.
          Noch kein Konto? Registriere dich einfach.
        </p>

        <div class="actions">

          <a class="btn" href="/login">
            🔐 Mitglieder-Login
          </a>

          <a class="btn secondary" href="/register">
            👤 Jetzt registrieren
          </a>

        </div>

      </section>

      <div class="card">

        <h2>Noch nicht registriert?</h2>

        <p class="muted">
          Erstelle dein Mitgliedskonto. Nach der Registrierung
          wird dein Konto vom Administrator freigeschaltet.
          Danach kannst du freie Termine buchen und deine
          Buchungen verwalten.
        </p>

        <div class="actions">

          <a class="btn" href="/register">
            Mitglied registrieren
          </a>

          <a class="btn secondary" href="/login">
            Zum Login
          </a>

        </div>

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

          <input
            type="password"
            name="password"
            minlength="8"
            required
          >

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

    const password =
      String(req.body.password || "");


    if (!name || !email || password.length < 8) {

      return res.status(400).send(

        page(
          "Fehler",

          nav(req) +

          '<div class="card error">' +
          '<h2>Fehler</h2>' +
          '<p>Bitte alle Angaben ausfüllen. Passwort mindestens 8 Zeichen.</p>' +
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

      "INSERT INTO members(name,email,password_hash,status) VALUES($1,$2,$3,'pending')",

      [
        name,
        email,
        hash
      ]

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


app.get("/booking", loginRequired, async (req, res) => {
  try {

    let date = String(req.query.date || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      date = berlinDate();
    }

    const today = berlinDate();

    // Vergangene Tage automatisch auf heute setzen
    if (date < today) {
      date = today;
    }

    const result = await pool.query(
      "SELECT start_time FROM bookings WHERE booking_date=$1",
      [date]
    );

    const busy = new Set(
      result.rows.map(row =>
        String(row.start_time).slice(0, 5)
      )
    );

    const blocks = await getActiveBlocksForDate(date);

    const html = slots().map(slot => {

      // Vergangene Uhrzeiten sperren
      if (isPastSlot(date, slot.start)) {

        return `
          <div class="slot past">

            <div class="slot-time">
              ${slot.start}-${slot.end}
            </div>

            <div class="slot-status">
              Nicht mehr buchbar
            </div>

          </div>
        `;
      }


      // Vom Administrator gesperrte Zeiten
      if (blocks.some(block => blockTimeOverlaps(block, slot.start, slot.end))) {
        return `
          <div class="slot busy">
            <div class="slot-time">
              ${slot.start}-${slot.end}
            </div>
            <div class="slot-status">
              🔒 Gesperrt
            </div>
          </div>
        `;
      }

      // Bereits belegte Zeiten
      if (busy.has(slot.start)) {

        return `
          <div class="slot busy">

            <div class="slot-time">
              ${slot.start}-${slot.end}
            </div>

            <div class="slot-status">
              Bereits belegt
            </div>

          </div>
        `;
      }


      // Freie Zeit
      return `
        <div class="slot">

          <div class="slot-time">
            ${slot.start}-${slot.end}
          </div>

          <form method="post" action="/book">

            <input
              type="hidden"
              name="date"
              value="${esc(date)}"
            >

            <input
              type="hidden"
              name="start"
              value="${esc(slot.start)}"
            >

            <input
              type="hidden"
              name="end"
              value="${esc(slot.end)}"
            >

            <button
              class="btn"
              type="submit"
            >
              Jetzt buchen
            </button>

          </form>

        </div>
      `;
    }).join("");


    res.send(

      page(

        "Platz buchen",

        `

        <div class="hero">

          <h1>🎾 Platz buchen</h1>

          <p>
            Wähle einen Tag und anschließend
            eine freie Spielzeit.
          </p>

        </div>


        <div class="card">

          <h2>Datum auswählen</h2>

          <label for="bookingDate">
            Spieltag
          </label>

          <input
            type="date"
            id="bookingDate"
            value="${esc(date)}"
            min="${esc(today)}"
            onchange="
              window.location.href=
              '/booking?date='+this.value
            "
          >

          <div class="notice">

            Vergangene Tage und bereits
            vergangene Uhrzeiten sind nicht buchbar.

          </div>

        </div>


        <div class="card">

          <h2>Verfügbare Zeiten</h2>

          <div class="grid">

            ${html}

          </div>

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

  if (await isSlotBlocked(date, start, end)) {
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
        date,
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
                action="/cancel/${booking.id}"
              >

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
          <form method="post" action="/admin/cancel-booking/${booking.id}">
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
      "UPDATE members SET admin=FALSE WHERE id=$1",
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

        "UPDATE members SET status='blocked' WHERE id=$1 AND admin=FALSE",

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
