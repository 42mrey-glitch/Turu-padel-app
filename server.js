const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();

app.use(express.json());
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

.nav .primary{
  background:var(--blue);
  color:#fff;
  border-color:var(--blue);
}

.nav .primary:hover{
  background:var(--blue-dark);
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
        Blau. Weiß. Düsseldorf.
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
  if (!req?.session?.member) {
    return `<nav class="nav">
      <a class="primary" href="/">Startseite</a>
      <a href="/login">Mitglieder-Login</a>
      <a href="/register">Registrieren</a>
    </nav>`;
  }

  return `<nav class="nav">
    <a class="primary" href="/booking">Platz buchen</a>
    <a href="/my-bookings">Meine Buchungen</a>
    ${req.session.member.admin ? '<a href="/admin">Administration</a>' : ""}
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

async function initDb() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bookings(
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      booking_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(booking_date,start_time)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_member
    ON bookings(member_id);

    CREATE INDEX IF NOT EXISTS idx_bookings_date
    ON bookings(booking_date);
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
      String(req.body.email || "")
        .trim()
        .toLowerCase();

    const password =
      String(req.body.password || "");


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


    // Prüfen, ob das Mitglied bereits
    // eine aktive Buchung besitzt.

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

    const [
      membersResult,
      bookingsResult
    ] = await Promise.all([

      pool.query(

        `SELECT
          id,
          name,
          email,
          status,
          admin,
          created_at
         FROM members
         ORDER BY created_at DESC`

      ),

      pool.query(

        `SELECT
          b.*,
          m.name,
          m.email
         FROM bookings b
         JOIN members m
         ON m.id=b.member_id
         ORDER BY
          b.booking_date,
          b.start_time`

      )

    ]);


    const members =
      membersResult.rows.map(member => {

        let action = "";


        if (member.admin) {

          action =
            '<span class="badge ok">' +
            'Administrator' +
            '</span>';

        }

        else if (
          member.status === "pending"
        ) {

          action =

            '<form method="post" action="/admin/approve/' +
            member.id +
            '">' +

            '<button class="btn" type="submit">' +
            'Freigeben' +
            '</button>' +

            '</form>';

        }

        else if (
          member.status === "approved"
        ) {

          action =

            '<form method="post" action="/admin/block/' +
            member.id +
            '">' +

            '<button class="btn danger" type="submit">' +
            'Sperren' +
            '</button>' +

            '</form>';

        }

        else {

          action =
            '<span class="badge error">' +
            'Gesperrt' +
            '</span>';

        }


        return (

          "<tr>" +

          "<td>" +
          esc(member.name) +
          "</td>" +

          "<td>" +
          esc(member.email) +
          "</td>" +

          "<td>" +
          esc(member.status) +
          "</td>" +

          "<td>" +
          action +
          "</td>" +

          "</tr>"

        );

      }).join("");


    const bookings =
      bookingsResult.rows.map(booking => {

        return (

          "<tr>" +

          "<td>" +
          esc(booking.booking_date) +
          "</td>" +

          "<td><b>" +

          String(
            booking.start_time
          ).slice(0, 5) +

          "-" +

          String(
            booking.end_time
          ).slice(0, 5) +

          "</b></td>" +

          "<td>" +
          esc(booking.name) +
          "</td>" +

          "<td>" +
          esc(booking.email) +
          "</td>" +

          "<td>" +

          '<form method="post" action="/admin/cancel-booking/' +
          booking.id +
          '">' +

          '<button class="btn danger" type="submit">' +
          'Stornieren' +
          '</button>' +

          "</form>" +

          "</td>" +

          "</tr>"

        );

      }).join("");


    const approved =
      membersResult.rows.filter(
        member =>
          member.status === "approved"
      ).length;


    const pending =
      membersResult.rows.filter(
        member =>
          member.status === "pending"
      ).length;


    res.send(

      page(

        "Administration",

        `

        <div class="hero">

          <h1>Administration</h1>

          <p>
            Mitglieder und Buchungen verwalten.
          </p>

        </div>


        <div class="card">

          <h2>Übersicht</h2>

          <p>

            <b>${approved}</b>
            freigeschaltete Mitglieder

            ·

            <b>${pending}</b>
            wartende Registrierungen

          </p>

        </div>


        <div class="card">

          <h2>Mitglieder</h2>

          <table>

            <thead>

              <tr>

                <th>Name</th>
                <th>E-Mail</th>
                <th>Status</th>
                <th>Aktion</th>

              </tr>

            </thead>

            <tbody>

              ${members}

            </tbody>

          </table>

        </div>


        <div class="card">

          <h2>Alle Buchungen</h2>

          <table>

            <thead>

              <tr>

                <th>Datum</th>
                <th>Zeit</th>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Aktion</th>

              </tr>

            </thead>

            <tbody>

              ${bookings}

            </tbody>

          </table>

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
