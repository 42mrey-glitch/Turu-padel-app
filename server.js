
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
  const h = Number(parts.find(p => p.type === "hour")?.value || 0);
  const m = Number(parts.find(p => p.type === "minute")?.value || 0);
  return h * 60 + m;
}

function isPastSlot(date, start) {
  const today = berlinDate();
  if (date < today) return true;
  if (date > today) return false;
  const [h, m] = String(start).split(":").map(Number);
  return h * 60 + m <= berlinTimeMinutes();
}

function parseDate(value) {
  const s = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseTime(value) {
  const s = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

function toMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function dateObj(date) {
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dateStringUTC(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = dateObj(date);
  d.setUTCDate(d.getUTCDate() + days);
  return dateStringUTC(d);
}

function dayOfWeek(date) {
  return dateObj(date).getUTCDay(); // 0 Sunday ... 6 Saturday
}

function dateDiffDays(a, b) {
  return Math.round((dateObj(b) - dateObj(a)) / 86400000);
}

function dateWithin(date, start, end) {
  return date >= start && date <= end;
}

function blockAppliesToDate(block, date) {
  const start = String(block.start_date).slice(0, 10);
  const end = String(block.end_date || block.start_date).slice(0, 10);
  const recurrence = String(block.recurrence_type || "once");
  const repeatEnd = String(
    block.recurrence_end_date || end
  ).slice(0, 10);

  if (recurrence === "once") {
    return dateWithin(date, start, end);
  }

  if (date < start || date > repeatEnd) return false;

  if (recurrence === "daily") return true;

  if (recurrence === "weekly") {
    let weekdays = block.weekdays;
    if (typeof weekdays === "string") {
      weekdays = weekdays.replace(/[{}]/g, "")
        .split(",")
        .filter(Boolean)
        .map(Number);
    }
    if (!Array.isArray(weekdays) || !weekdays.length) {
      weekdays = [dayOfWeek(start)];
    }
    return weekdays.includes(dayOfWeek(date));
  }

  if (recurrence === "monthly") {
    const original = dateObj(start);
    const current = dateObj(date);
    return original.getUTCDate() === current.getUTCDate();
  }

  return false;
}

function blockCoversSlot(block, date, slotStart, slotEnd) {
  if (!blockAppliesToDate(block, date)) return false;

  // No times means the whole day is blocked.
  if (!block.start_time || !block.end_time) return true;

  const blockStart = toMinutes(block.start_time);
  const blockEnd = toMinutes(block.end_time);
  const slotS = toMinutes(slotStart);
  const slotE = toMinutes(slotEnd);

  if (blockStart == null || blockEnd == null) return true;

  // Overlap: start < other end AND end > other start.
  return blockStart < slotE && blockEnd > slotS;
}

async function getBlocksForDate(date) {
  const result = await pool.query(`
    SELECT *
    FROM booking_blocks
    WHERE active=TRUE
      AND start_date <= $1
      AND COALESCE(recurrence_end_date, end_date, start_date) >= $1
    ORDER BY start_date, id
  `, [date]);
  return result.rows.filter(block => blockAppliesToDate(block, date));
}

function slots() {
  const result = [];
  for (let minutes = 9 * 60; minutes < 22 * 60; minutes += 90) {
    const formatTime = value =>
      String(Math.floor(value / 60)).padStart(2, "0") +
      ":" + String(value % 60).padStart(2, "0");
    result.push({
      start: formatTime(minutes),
      end: formatTime(minutes + 90)
    });
  }
  return result;
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

function page(title, body, req) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – TuRU 1880 Padel</title>
<style>
:root{--blue:#174b9b;--blue-dark:#123b7c;--blue-light:#edf4ff;--text:#172033;--muted:#667085;--line:#e5eaf2;--bg:#f6f8fc;--white:#fff;--green:#138a55;--orange:#c47b00;--red:#c0392b}
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:var(--bg);color:var(--text)}
a{color:var(--blue);text-decoration:none;font-weight:700}a:hover{text-decoration:underline}
.topbar{background:#fff;border-bottom:1px solid var(--line)}.brand{max-width:1180px;margin:0 auto;padding:24px 22px 18px;display:flex;align-items:center;gap:14px}
.brand-logo{width:48px;height:48px;object-fit:contain;border-radius:12px}.brand-title{font-size:23px;font-weight:900;color:var(--blue);line-height:1.1}.brand-sub{margin-top:4px;color:var(--muted);font-size:13px}
.nav{max-width:1180px;margin:0 auto;padding:0 22px 18px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}.nav a,.nav button{border:1px solid var(--line);background:#fff;color:#334155;padding:9px 13px;border-radius:9px;font-size:14px;font-weight:800;cursor:pointer}.nav .primary{background:var(--blue);color:#fff;border-color:var(--blue)}
main{max-width:1180px;margin:28px auto 60px;padding:0 22px}.hero,.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px;margin-bottom:20px;box-shadow:0 6px 22px rgba(20,40,80,.05)}
.hero{border-radius:18px;padding:30px}.hero h1{margin:0 0 8px;color:var(--blue);font-size:30px}.hero p,.muted{color:var(--muted);line-height:1.6}
.card h2{margin:0 0 16px;color:#18345f;font-size:21px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 17px;border:1px solid var(--blue);border-radius:10px;background:var(--blue);color:#fff!important;font-weight:800;cursor:pointer;text-decoration:none}.btn.secondary{background:#fff;color:var(--blue)!important;border-color:#c9d7ed}.btn.danger{background:#fff;color:var(--red)!important;border-color:#efc7c2}
form{margin:0}label{display:block;margin:14px 0 7px;font-weight:800;color:#344054}input,select,textarea{width:100%;max-width:520px;padding:12px 13px;border:1px solid #cfd7e6;border-radius:10px;background:#fff;color:var(--text);font-size:15px}textarea{min-height:90px}
input[type=date],input[type=time]{max-width:240px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px}
.slot{background:#fff;border:1px solid #dbe4f2;border-radius:13px;padding:16px;text-align:center}.slot-time{font-size:18px;font-weight:900;color:#18345f;margin-bottom:11px}.slot.busy,.slot.past,.slot.blocked{background:#f7f8fa;border-color:#e5e7eb;color:#8a919d}.slot.blocked{background:#fff4f2;border-color:#efc7c2}.slot-status{font-size:13px;font-weight:800;color:#7b8492}
.notice{padding:13px 15px;background:var(--blue-light);border:1px solid #d7e5fb;border-radius:10px;color:#315486;margin-top:15px}.ok{border-left:5px solid var(--green)}.warn{border-left:5px solid var(--orange)}.error{border-left:5px solid var(--red)}
table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--line);border-radius:12px}th{background:#f1f5fb;color:#334155;padding:13px;text-align:left;font-size:13px}td{padding:13px;border-top:1px solid var(--line);vertical-align:middle}
.badge{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:900;background:#eef2f7;color:#667085}.badge.ok{background:#e9f8f0;color:#147a4b}.badge.warn{background:#fff4dc;color:#996000}.badge.error{background:#fff0ee;color:#b33226}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.stat{background:#f7f9fd;border:1px solid var(--line);border-radius:12px;padding:16px}.stat b{display:block;font-size:27px;color:var(--blue);margin-top:5px}
.checks{display:flex;gap:10px;flex-wrap:wrap}.checks label{margin:0;padding:9px 12px;background:#f7f9fd;border:1px solid var(--line);border-radius:9px}.checks input{width:auto;margin-right:5px}
.small{font-size:12px}.scroll{overflow-x:auto}
@media(max-width:700px){.brand{padding:18px 15px 14px}.nav{padding:0 15px 14px}main{padding:0 12px;margin-top:18px}.hero,.card{padding:18px}.hero h1{font-size:25px}table{display:block;overflow-x:auto;white-space:nowrap}}
</style>
</head>
<body>
<header class="topbar">
<div class="brand"><img class="brand-logo" src="/turu-logo.png" alt="TuRU 1880 Düsseldorf"><div><div class="brand-title">TuRU 1880 Padel</div><div class="brand-sub">Blau. Weiß. Düsseldorf.</div></div></div>
${nav(req)}
</header>
<main>${body}</main>
</body>
</html>`;
}

app.get("/turu-logo.png", (req, res) => res.sendFile(__dirname + "/turu-logo.png"));

function loginRequired(req,res,next){
  if(!req.session.member) return res.redirect("/login");
  next();
}
function adminRequired(req,res,next){
  if(!req.session.member?.admin){
    return res.status(403).send(page("Kein Zugriff",`<div class="card error"><h2>Kein Zugriff</h2><p>Dieser Bereich ist nur für Administratoren verfügbar.</p></div>`,req));
  }
  next();
}

async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
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
      UNIQUE(booking_date,start_time)
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_blocks(
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
    )
  `);

  const email = String(process.env.ADMIN_EMAIL || "rey@turu1880.de").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if(!password){
    console.warn("ADMIN_PASSWORD fehlt. Admin wird nicht automatisch angelegt.");
    return;
  }
  const hash = await bcrypt.hash(password,12);
  await pool.query(`
    INSERT INTO members(name,email,password_hash,status,admin)
    VALUES($1,$2,$3,'approved',TRUE)
    ON CONFLICT(email) DO UPDATE SET
      admin=TRUE,status='approved',password_hash=$3
  `,["Administrator",email,hash]);
}

app.get("/",(req,res)=>{
  const body=req.session.member ? `
    <section class="hero"><h1>Willkommen bei TuRU 1880 Padel</h1>
    <p>Hallo <b>${esc(req.session.member.name)}</b>, hier kannst du den Padelplatz einfach und schnell buchen.</p>
    <div class="actions"><a class="btn" href="/booking">🎾 Platz buchen</a><a class="btn secondary" href="/my-bookings">Meine Buchungen</a></div></section>
    <div class="card"><h2>Hinweis</h2><p class="muted">Vergangene Termine können nicht gebucht werden. Gesperrte oder reservierte Zeiten werden im Kalender angezeigt.</p></div>
  ` : `
    <section class="hero"><h1>TuRU 1880 Padel</h1><p>Die Buchungsseite für den Padelplatz von TuRU 1880 Düsseldorf.</p>
    <p>Padelplätze können ausschließlich von freigeschalteten Mitgliedern gebucht werden.</p>
    <div class="actions"><a class="btn" href="/login">Mitglieder-Login</a><a class="btn secondary" href="/register">Mitglied registrieren</a></div></section>
  `;
  res.send(page("Startseite",body,req));
});

app.get("/register",(req,res)=>{
  res.send(page("Registrierung",`
    <div class="card"><h2>Mitglied registrieren</h2><p class="muted">Nach der Registrierung muss der Administrator dein Konto freischalten.</p>
    <form method="post" action="/register">
      <label>Name</label><input name="name" maxlength="100" required>
      <label>E-Mail</label><input type="email" name="email" maxlength="200" required>
      <label>Passwort</label><input type="password" name="password" minlength="8" required>
      <div class="actions"><button class="btn" type="submit">Registrierung senden</button><a class="btn secondary" href="/login">Zum Login</a></div>
    </form></div>`,req));
});

app.post("/register",async(req,res)=>{
  try{
    const name=String(req.body.name||"").trim();
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(!name||!email||password.length<8) return res.status(400).send(page("Fehler",`<div class="card error"><h2>Fehler</h2><p>Bitte alle Angaben ausfüllen. Passwort mindestens 8 Zeichen.</p></div>`,req));
    const existing=await pool.query("SELECT id FROM members WHERE email=$1",[email]);
    if(existing.rowCount) return res.status(409).send(page("Account vorhanden",`<div class="card warn"><h2>Account vorhanden</h2><p>Diese E-Mail ist bereits registriert.</p><a class="btn secondary" href="/login">Zum Login</a></div>`,req));
    const count=await pool.query("SELECT COUNT(*)::int AS n FROM members WHERE status='approved'");
    if(count.rows[0].n>=100) return res.status(409).send(page("Aufnahmestopp",`<div class="card warn"><h2>100 Mitglieder erreicht</h2><p>Momentan können keine weiteren Mitglieder freigeschaltet werden.</p></div>`,req));
    const hash=await bcrypt.hash(password,12);
    await pool.query("INSERT INTO members(name,email,password_hash,status) VALUES($1,$2,$3,'pending')",[name,email,hash]);
    res.send(page("Registrierung",`<div class="card ok"><h2>Registrierung erfolgreich</h2><p>Dein Account wartet jetzt auf die Freischaltung durch den Administrator.</p><a class="btn secondary" href="/login">Zum Login</a></div>`,req));
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.get("/login",(req,res)=>{
  res.send(page("Login",`<div class="card"><h2>Mitglieder-Login</h2>
    <form method="post" action="/login"><label>E-Mail</label><input type="email" name="email" required>
    <label>Passwort</label><input type="password" name="password" required>
    <div class="actions"><button class="btn" type="submit">Anmelden</button><a class="btn secondary" href="/register">Registrieren</a></div></form></div>`,req));
});

app.post("/login",async(req,res)=>{
  try{
    const email=String(req.body?.email||"").trim().toLowerCase();
    const password=String(req.body?.password||"");
    const result=await pool.query("SELECT * FROM members WHERE email=$1",[email]);
    const member=result.rows[0];
    if(!member||!(await bcrypt.compare(password,member.password_hash))) return res.status(401).send(page("Login",`<div class="card error"><h2>Login fehlgeschlagen</h2><p>E-Mail oder Passwort ist falsch.</p></div>`,req));
    if(member.status!=="approved") return res.status(403).send(page("Nicht freigeschaltet",`<div class="card warn"><h2>Noch nicht freigeschaltet</h2><p>Dein Account wartet noch auf die Freischaltung durch den Administrator.</p></div>`,req));
    req.session.member={id:member.id,name:member.name,email:member.email,admin:member.admin};
    res.redirect("/");
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/")));

app.get("/booking",loginRequired,async(req,res)=>{
  try{
    let date=parseDate(req.query.date)||berlinDate();
    const today=berlinDate();
    if(date<today) date=today;

    const [bookingResult,blocks]=await Promise.all([
      pool.query("SELECT start_time,end_time FROM bookings WHERE booking_date=$1",[date]),
      getBlocksForDate(date)
    ]);
    const busy=new Set(bookingResult.rows.map(r=>String(r.start_time).slice(0,5)));
    const html=slots().map(slot=>{
      if(isPastSlot(date,slot.start)) return `<div class="slot past"><div class="slot-time">${slot.start}-${slot.end}</div><div class="slot-status">Nicht mehr buchbar</div></div>`;
      const block=blocks.find(b=>blockCoversSlot(b,date,slot.start,slot.end));
      if(block) return `<div class="slot blocked"><div class="slot-time">${slot.start}-${slot.end}</div><div class="slot-status">🔒 ${esc(block.reason||"Reserviert / gesperrt")}</div></div>`;
      if(busy.has(slot.start)) return `<div class="slot busy"><div class="slot-time">${slot.start}-${slot.end}</div><div class="slot-status">Bereits belegt</div></div>`;
      return `<div class="slot"><div class="slot-time">${slot.start}-${slot.end}</div><form method="post" action="/book"><input type="hidden" name="date" value="${esc(date)}"><input type="hidden" name="start" value="${esc(slot.start)}"><input type="hidden" name="end" value="${esc(slot.end)}"><button class="btn" type="submit">Buchen</button></form></div>`;
    }).join("");

    res.send(page("Platz buchen",`
      <div class="hero"><h1>Padelplatz buchen</h1><p>Ein Platz · 90-Minuten-Slots · 09:00 bis 22:00 Uhr</p>
      <form method="get" action="/booking"><label>Datum</label><input type="date" name="date" value="${esc(date)}"><div class="actions"><button class="btn secondary" type="submit">Tag anzeigen</button></div></form></div>
      <div class="card"><h2>${esc(date)}</h2><div class="grid">${html}</div></div>`,req));
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/book",loginRequired,async(req,res)=>{
  const date=parseDate(req.body.date);
  const start=parseTime(req.body.start);
  const end=parseTime(req.body.end);
  if(!date||!start||!end) return res.status(400).send(page("Buchungsfehler",`<div class="card error"><h2>Buchung nicht möglich</h2><p>Die Buchungsdaten sind unvollständig.</p></div>`,req));
  if(isPastSlot(date,start)) return res.status(409).send(page("Buchung nicht möglich",`<div class="card warn"><h2>Termin nicht mehr buchbar</h2><p>Dieser Termin liegt bereits in der Vergangenheit.</p></div>`,req));

  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const blocks=(await client.query(`
      SELECT * FROM booking_blocks
      WHERE active=TRUE
        AND start_date <= $1
        AND COALESCE(recurrence_end_date,end_date,start_date) >= $1
    `,[date])).rows.filter(b=>blockCoversSlot(b,date,start,end));

    if(blocks.length){
      await client.query("ROLLBACK");
      return res.status(409).send(page("Termin gesperrt",`<div class="card warn"><h2>Termin nicht verfügbar</h2><p>Dieser Zeitraum ist vom Administrator reserviert oder gesperrt.</p><a class="btn" href="/booking?date=${esc(date)}">Zurück zum Kalender</a></div>`,req));
    }

    // Normale Mitglieder dürfen eine aktive zukünftige Buchung haben.
    // Der Administrator ist davon ausdrücklich ausgenommen.
    if(!req.session.member.admin){
      const active=await client.query(`
        SELECT id FROM bookings
        WHERE member_id=$1 AND used=FALSE
        AND (booking_date + start_time) > NOW()
        FOR UPDATE
      `,[req.session.member.id]);
      if(active.rowCount){
        await client.query("ROLLBACK");
        return res.status(409).send(page("Buchung",`<div class="card warn"><h2>Bereits eine aktive Buchung</h2><p>Du hast bereits eine aktive Platzbuchung. Du kannst erst wieder buchen, wenn diese Buchung abgelaufen ist.</p><a class="btn secondary" href="/my-bookings">Meine Buchungen</a></div>`,req));
      }
    }

    await client.query(`INSERT INTO bookings(member_id,booking_date,start_time,end_time) VALUES($1,$2,$3,$4)`,[req.session.member.id,date,start,end]);
    await client.query("COMMIT");
    res.send(page("Buchung bestätigt",`<div class="card ok"><h2>✓ Buchung bestätigt</h2><p>Dein Padelplatz ist erfolgreich gebucht.</p><div class="notice"><b>${esc(date)}</b><br>${esc(start)} – ${esc(end)}</div><div class="actions"><a class="btn" href="/my-bookings">Meine Buchungen</a><a class="btn secondary" href="/booking">Weitere Zeiten</a></div></div>`,req));
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    if(e.code==="23505") return res.status(409).send(page("Termin belegt",`<div class="card error"><h2>Termin bereits belegt</h2><p>Dieser Termin wurde gerade von einem anderen Mitglied gebucht.</p><a class="btn" href="/booking">Andere Zeit auswählen</a></div>`,req));
    console.error(e);res.status(500).send("Serverfehler");
  }finally{client.release();}
});

app.get("/my-bookings",loginRequired,async(req,res)=>{
  try{
    const result=await pool.query(`SELECT * FROM bookings WHERE member_id=$1 ORDER BY booking_date,start_time`,[req.session.member.id]);
    const rows=result.rows.map(b=>{
      const date=String(b.booking_date).slice(0,10),start=String(b.start_time).slice(0,5),end=String(b.end_time).slice(0,5);
      const dt=new Date(`${date}T${start}:00`);
      const status=b.used?"genutzt":dt>new Date()?"gebucht":"abgelaufen";
      const badge=status==="gebucht"?"ok":status==="abgelaufen"?"warn":"";
      const cancel=!b.used&&dt>new Date()?`<form method="post" action="/cancel/${b.id}"><button class="btn danger" type="submit">Stornieren</button></form>`:"";
      return `<tr><td>${esc(date)}</td><td><b>${esc(start)}-${esc(end)}</b></td><td><span class="badge ${badge}">${esc(status)}</span></td><td>${cancel}</td></tr>`;
    }).join("");
    res.send(page("Meine Buchungen",`<div class="hero"><h1>Meine Buchungen</h1><p>Hier findest du deine gebuchten Padelzeiten.</p></div><div class="card">${result.rows.length?`<div class="scroll"><table><thead><tr><th>Datum</th><th>Zeit</th><th>Status</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">Du hast noch keine Buchungen.</p>`}</div>`,req));
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/cancel/:id",loginRequired,async(req,res)=>{
  try{
    const result=await pool.query(`DELETE FROM bookings WHERE id=$1 AND member_id=$2 AND used=FALSE AND (booking_date + start_time)>NOW() RETURNING *`,[req.params.id,req.session.member.id]);
    if(!result.rowCount) return res.status(404).send(page("Stornierung",`<div class="card error"><h2>Stornierung nicht möglich</h2><p>Die Buchung wurde nicht gefunden oder ist bereits abgelaufen.</p></div>`,req));
    res.redirect("/my-bookings");
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

// ---------------- ADMIN ----------------

function dateLabel(v){ return v ? String(v).slice(0,10) : ""; }
function timeLabel(v){ return v ? String(v).slice(0,5) : ""; }
function recurrenceLabel(b){
  const r=String(b.recurrence_type||"once");
  if(r==="once") return "Einmalig";
  if(r==="daily") return "Täglich";
  if(r==="weekly") return "Wöchentlich";
  if(r==="monthly") return "Monatlich";
  return r;
}
function weekdaysLabel(arr){
  const names=["So","Mo","Di","Mi","Do","Fr","Sa"];
  if(!Array.isArray(arr)||!arr.length) return "";
  return arr.map(n=>names[Number(n)]).join(", ");
}

app.get("/admin",adminRequired,async(req,res)=>{
  try{
    const [
      membersResult,
      bookingsResult,
      blocksResult,
      statsResult,
      summaryResult
    ]=await Promise.all([
      pool.query(`SELECT id,name,email,status,admin,created_at FROM members ORDER BY created_at DESC`),
      pool.query(`SELECT b.*,m.name,m.email FROM bookings b JOIN members m ON m.id=b.member_id ORDER BY b.booking_date DESC,b.start_time DESC`),
      pool.query(`SELECT * FROM booking_blocks WHERE active=TRUE ORDER BY start_date,start_time,id`),
      pool.query(`
        SELECT m.id,m.name,m.email,
               COUNT(b.id)::int AS booking_count,
               COUNT(b.id) FILTER (WHERE b.booking_date >= CURRENT_DATE)::int AS future_count,
               MIN(b.booking_date) AS first_booking,
               MAX(b.booking_date) AS last_booking
        FROM members m
        LEFT JOIN bookings b ON b.member_id=m.id
        GROUP BY m.id,m.name,m.email
        ORDER BY booking_count DESC,m.name
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE booking_date >= CURRENT_DATE)::int AS future,
          COUNT(*) FILTER (WHERE booking_date < CURRENT_DATE)::int AS past,
          COUNT(DISTINCT member_id)::int AS users
        FROM bookings
      `)
    ]);

    const approved=membersResult.rows.filter(m=>m.status==="approved").length;
    const pending=membersResult.rows.filter(m=>m.status==="pending").length;
    const summary=summaryResult.rows[0]||{total:0,future:0,past:0,users:0};

    const members=membersResult.rows.map(m=>{
      let action="";
      if(m.admin) action='<span class="badge ok">Administrator</span>';
      else if(m.status==="pending") action=`<form method="post" action="/admin/approve/${m.id}"><button class="btn" type="submit">Freigeben</button></form>`;
      else if(m.status==="approved") action=`<form method="post" action="/admin/block/${m.id}"><button class="btn danger" type="submit">Sperren</button></form>`;
      else action='<span class="badge error">Gesperrt</span>';
      return `<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.status)}</td><td>${action}</td></tr>`;
    }).join("");

    const bookings=bookingsResult.rows.map(b=>`<tr><td>${esc(dateLabel(b.booking_date))}</td><td><b>${esc(timeLabel(b.start_time))}-${esc(timeLabel(b.end_time))}</b></td><td>${esc(b.name)}</td><td>${esc(b.email)}</td><td><form method="post" action="/admin/cancel-booking/${b.id}"><button class="btn danger" type="submit">Stornieren</button></form></td></tr>`).join("");

    const stats=statsResult.rows.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.email)}</td><td><b>${s.booking_count}</b></td><td>${s.future_count}</td><td>${esc(dateLabel(s.first_booking)||"-")}</td><td>${esc(dateLabel(s.last_booking)||"-")}</td></tr>`).join("");

    const blocks=blocksResult.rows.map(b=>{
      const range=`${dateLabel(b.start_date)}${dateLabel(b.end_date)!==dateLabel(b.start_date)?` – ${dateLabel(b.end_date)}`:""}`;
      const times=b.start_time&&b.end_time?`${timeLabel(b.start_time)}–${timeLabel(b.end_time)}`:"Ganzer Tag";
      return `<tr><td>${esc(range)}</td><td>${esc(times)}</td><td>${esc(recurrenceLabel(b))}${b.weekdays?`<br><span class="small muted">${esc(weekdaysLabel(b.weekdays))}</span>`:""}</td><td>${esc(b.reason||"Reserviert / gesperrt")}</td><td><form method="post" action="/admin/delete-block/${b.id}"><button class="btn danger" type="submit">Entfernen</button></form></td></tr>`;
    }).join("");

    res.send(page("Administration",`
      <div class="hero"><h1>Administration</h1><p>Mitglieder, Buchungen, Reservierungen und Platzsperren verwalten.</p></div>

      <div class="card"><h2>Übersicht</h2><div class="stats">
        <div class="stat">Freigeschaltete Mitglieder<b>${approved}</b></div>
        <div class="stat">Wartende Registrierungen<b>${pending}</b></div>
        <div class="stat">Buchungen gesamt<b>${summary.total}</b></div>
        <div class="stat">Zukünftige Buchungen<b>${summary.future}</b></div>
        <div class="stat">Vergangene Buchungen<b>${summary.past}</b></div>
        <div class="stat">Nutzer mit Buchungen<b>${summary.users}</b></div>
      </div></div>

      <div class="card"><h2>🔒 Platz sperren / reservieren</h2>
        <p class="muted">Der Padelplatz kann einmalig oder wiederkehrend für einzelne Zeiträume, ganze Tage oder mehrere Tage reserviert werden. Normale Mitglieder können diese Zeiten nicht buchen.</p>
        <form method="post" action="/admin/create-block">
          <div class="grid">
            <div><label>Von Datum</label><input type="date" name="start_date" required></div>
            <div><label>Bis Datum</label><input type="date" name="end_date" required></div>
            <div><label>Von Uhrzeit</label><input type="time" name="start_time"></div>
            <div><label>Bis Uhrzeit</label><input type="time" name="end_time"></div>
          </div>
          <p class="small muted">Uhrzeit leer lassen = ganzer Tag.</p>
          <label>Wiederholung</label>
          <select name="recurrence_type">
            <option value="once">Einmalig</option>
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
          </select>
          <label>Wochentage (nur bei „Wöchentlich“)</label>
          <div class="checks">
            ${["So","Mo","Di","Mi","Do","Fr","Sa"].map((n,i)=>`<label><input type="checkbox" name="weekdays" value="${i}">${n}</label>`).join("")}
          </div>
          <label>Wiederholung bis</label><input type="date" name="recurrence_end_date">
          <label>Grund / Bezeichnung</label><input name="reason" maxlength="200" placeholder="z. B. Training, Turnier, Vereinsveranstaltung">
          <div class="actions"><button class="btn" type="submit">Sperre / Reservierung speichern</button></div>
        </form>
      </div>

      <div class="card"><h2>Aktive Sperren / Reservierungen</h2>
        ${blocksResult.rows.length?`<div class="scroll"><table><thead><tr><th>Datum</th><th>Zeit</th><th>Wiederholung</th><th>Grund</th><th>Aktion</th></tr></thead><tbody>${blocks}</tbody></table></div>`:`<p class="muted">Keine aktiven Sperren oder Reservierungen.</p>`}
      </div>

      <div class="card"><h2>📊 Buchungsstatistik</h2>
        <p class="muted">Hier siehst du, wer wie oft und in welchem Zeitraum gebucht hat.</p>
        <div class="scroll"><table><thead><tr><th>Mitglied</th><th>E-Mail</th><th>Buchungen gesamt</th><th>Zukünftig</th><th>Erste Buchung</th><th>Letzte Buchung</th></tr></thead><tbody>${stats}</tbody></table></div>
      </div>

      <div class="card"><h2>Mitglieder</h2><div class="scroll"><table><thead><tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Aktion</th></tr></thead><tbody>${members}</tbody></table></div></div>

      <div class="card"><h2>Alle Buchungen</h2><div class="scroll"><table><thead><tr><th>Datum</th><th>Zeit</th><th>Name</th><th>E-Mail</th><th>Aktion</th></tr></thead><tbody>${bookings}</tbody></table></div></div>
    `,req));
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/admin/create-block",adminRequired,async(req,res)=>{
  try{
    const startDate=parseDate(req.body.start_date);
    const endDate=parseDate(req.body.end_date)||startDate;
    const startTime=parseTime(req.body.start_time);
    const endTime=parseTime(req.body.end_time);
    const recurrence=["once","daily","weekly","monthly"].includes(req.body.recurrence_type)?req.body.recurrence_type:"once";
    const reason=String(req.body.reason||"").trim().slice(0,200);
    let weekdays=req.body.weekdays;
    if(!Array.isArray(weekdays)) weekdays=weekdays?[weekdays]:[];
    weekdays=weekdays.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6);

    if(!startDate||!endDate||endDate<startDate) return res.status(400).send(page("Fehler",`<div class="card error"><h2>Ungültiges Datum</h2><p>Bitte prüfen: Bis-Datum muss am oder nach dem Von-Datum liegen.</p></div>`,req));
    if((startTime&&!endTime)||(!startTime&&endTime)) return res.status(400).send(page("Fehler",`<div class="card error"><h2>Ungültige Uhrzeit</h2><p>Bitte beide Uhrzeiten ausfüllen oder beide leer lassen.</p></div>`,req));
    if(startTime&&endTime&&toMinutes(startTime)>=toMinutes(endTime)) return res.status(400).send(page("Fehler",`<div class="card error"><h2>Ungültige Uhrzeit</h2><p>Die Endzeit muss nach der Startzeit liegen.</p></div>`,req));
    if(recurrence!=="once"&&!parseDate(req.body.recurrence_end_date)) return res.status(400).send(page("Fehler",`<div class="card error"><h2>Wiederholungsende fehlt</h2><p>Bei einer wiederkehrenden Reservierung bitte „Wiederholung bis“ angeben.</p></div>`,req));

    let recurrenceEnd=parseDate(req.body.recurrence_end_date);
    if(recurrence==="once") recurrenceEnd=null;
    if(recurrenceEnd&&recurrenceEnd<startDate) return res.status(400).send(page("Fehler",`<div class="card error"><h2>Ungültiges Wiederholungsende</h2><p>Das Wiederholungsende muss am oder nach dem Startdatum liegen.</p></div>`,req));
    if(recurrence==="weekly"&&!weekdays.length) weekdays=[dayOfWeek(startDate)];

    await pool.query(`
      INSERT INTO booking_blocks(start_date,end_date,start_time,end_time,recurrence_type,weekdays,recurrence_end_date,reason,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
    `,[startDate,endDate,startTime,endTime,recurrence,weekdays.length?weekdays:null,recurrenceEnd,reason||null]);

    res.redirect("/admin");
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/admin/delete-block/:id",adminRequired,async(req,res)=>{
  try{
    await pool.query("UPDATE booking_blocks SET active=FALSE WHERE id=$1",[req.params.id]);
    res.redirect("/admin");
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/admin/approve/:id",adminRequired,async(req,res)=>{
  try{
    const count=await pool.query("SELECT COUNT(*)::int AS n FROM members WHERE status='approved'");
    if(count.rows[0].n>=100) return res.status(409).send(page("Admin",`<div class="card warn"><h2>100 Mitglieder erreicht</h2><p>Es können keine weiteren Mitglieder freigeschaltet werden.</p></div>`,req));
    await pool.query("UPDATE members SET status='approved' WHERE id=$1 AND admin=FALSE",[req.params.id]);
    res.redirect("/admin");
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/admin/block/:id",adminRequired,async(req,res)=>{
  try{await pool.query("UPDATE members SET status='blocked' WHERE id=$1 AND admin=FALSE",[req.params.id]);res.redirect("/admin");}
  catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.post("/admin/cancel-booking/:id",adminRequired,async(req,res)=>{
  try{await pool.query("DELETE FROM bookings WHERE id=$1",[req.params.id]);res.redirect("/admin");}
  catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

initDb().then(()=>{
  app.listen(PORT,"0.0.0.0",()=>console.log("TuRU Padel läuft auf Port "+PORT));
}).catch(e=>{
  console.error("Datenbankfehler:",e);
  process.exit(1);
});
