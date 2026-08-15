const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function esc(v = "") {
  return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function page(title, body) {
  return `<!doctype html><html lang="de"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} – TuRU 1880 Padel</title>
  <style>
  body{font-family:Arial,sans-serif;margin:0;background:#f4f7fb;color:#10233f}
  header{background:#102f63;color:white;padding:20px;text-align:center}
  main{max-width:900px;margin:24px auto;padding:0 16px}
  .card{background:white;border-radius:14px;padding:20px;margin:14px 0;box-shadow:0 2px 12px #0001}
  input,button{box-sizing:border-box;width:100%;font-size:16px;padding:12px;margin:6px 0;border-radius:8px;border:1px solid #ccd3df}
  button{background:#102f63;color:white;border:0;font-weight:bold}
  button.danger{background:#b42318}.green{background:#087443}
  .nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:15px}
  .nav a{background:#e9f0fa;padding:10px 14px;border-radius:8px;text-decoration:none;color:#102f63;font-weight:bold}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .slot{padding:14px;background:#e9f0fa;border-radius:8px}
  .busy{background:#ffdede}.ok{background:#dff7e8;padding:12px;border-radius:8px}
  .warn{background:#fff3cd;padding:12px;border-radius:8px}
  .error{background:#ffdede;padding:12px;border-radius:8px}
  table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}
  </style></head><body>
  <header><h1>TuRU 1880 Padel</h1><div>Blau. Weiß. Düsseldorf.</div></header>
  <main>${body}</main></body></html>`;
}

function nav(req) {
  if (!req.session.member)
    return `<div class="nav"><a href="/">Buchung</a><a href="/register">Registrieren</a><a href="/login">Mitglieder-Login</a></div>`;

  return `<div class="nav"><a href="/">Buchung</a><a href="/my-bookings">Meine Buchungen</a>
    ${req.session.member.admin ? '<a href="/admin">Admin</a>' : ""}
    <form method="post" action="/logout" style="margin:0"><button style="width:auto">Abmelden</button></form></div>`;
}

function loginRequired(req,res,next) {
  if (!req.session.member) return res.redirect("/login");
  next();
}

function adminRequired(req,res,next) {
  if (!req.session.member?.admin)
    return res.status(403).send(page("Kein Zugriff", `${nav(req)}<div class="card error"><h2>Kein Zugriff</h2></div>`));
  next();
}

function slots() {
  const out = [];
  for (let m = 9*60; m < 22*60; m += 90) {
    const fmt = x => `${String(Math.floor(x/60)).padStart(2,"0")}:${String(x%60).padStart(2,"0")}`;
    out.push({start:fmt(m), end:fmt(m+90)});
  }
  return out;
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

    CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
  `);

  const email = (process.env.ADMIN_EMAIL || "rey@turu1880.de").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.warn("ADMIN_PASSWORD fehlt. Admin wird nicht automatisch angelegt.");
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(`
    INSERT INTO members(name,email,password_hash,status,admin)
    VALUES($1,$2,$3,'approved',TRUE)
    ON CONFLICT(email)
    DO UPDATE SET admin=TRUE,status='approved'
  `, ["Administrator", email, hash]);
}

app.get("/", (req, res) => {
  res.send(page("Startseite", `${nav(req)}
    <div class="card">
      <h2>TuRU 1880 Padel</h2>
      <p>Willkommen bei der Padel-Buchung von TuRU 1880.</p>

      ${req.session.member
        ? `
          <p>Angemeldet als <b>${esc(req.session.member.name)}</b></p>
          <p>
            <a href="/booking">🎾 Platz buchen</a>
          </p>
          <form method="post" action="/logout">
            <button type="submit">Abmelden</button>
          </form>
        `
        : `
          <p>Padelplätze können ausschließlich von freigeschalteten Mitgliedern gebucht werden.</p>
          <p>
            <a href="/login">🔐 Anmelden</a>
          </p>
          <p>
            <a href="/register">📝 Mitglied registrieren</a>
          </p>
        `
      }
    </div>

    <div class="card">
      <h3>Unsere Buchungsregeln</h3>
      <ul>
        <li>Maximal 100 freigeschaltete Mitglieder.</li>
        <li>Nur freigeschaltete Mitglieder können buchen.</li>
        <li>Eine aktive Buchung pro Mitglied.</li>
        <li>Die Buchungen erfolgen in 90-Minuten-Slots.</li>
        <li>Nach Nutzung kann erneut gebucht werden.</li>
        <li>Eigene Buchungen können storniert werden.</li>
      </ul>
    </div>
  `));
});    

app.get("/register", (req, res) => {
  res.send(page("Registrierung", `
    <div class="card">
      <h2>Mitglied registrieren</h2>
      <p>Nach der Registrierung muss der Administrator dein Konto freischalten.</p>
      <form method="post" action="/register">
        <label>Name</label><br>
        <input name="name" maxlength="100" required><br>

        <label>E-Mail</label><br>
        <input type="email" name="email" maxlength="200" required><br>

        <label>Passwort</label><br>
        <input type="password" name="password" minlength="8" required><br>

        <button type="submit">Registrieren</button>
      </form>
    </div>
  `));
});

app.post("/register",async(req,res)=>{
  try{
    const name=String(req.body.name||"").trim();
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(!name||!email||password.length<8)
      return res.status(400).send(page("Fehler",`${nav(req)}<div class="card error"><h2>Fehler</h2><p>Bitte alle Angaben ausfüllen. Passwort mindestens 8 Zeichen.</p></div>`));

    const existing=await pool.query("SELECT id FROM members WHERE email=$1",[email]);
    if(existing.rowCount)
      return res.status(409).send(page("Account vorhanden",`${nav(req)}<div class="card warn"><h2>Account vorhanden</h2><p>Diese E-Mail ist bereits registriert.</p><a href="/login">Zum Login</a></div>`));

    const count=await pool.query("SELECT COUNT(*)::int AS n FROM members WHERE status='approved'");
    if(count.rows[0].n>=100)
      return res.status(409).send(page("Aufnahmestopp",`${nav(req)}<div class="card warn"><h2>100 Mitglieder erreicht</h2><p>Momentan können keine weiteren Mitglieder freigeschaltet werden.</p></div>`));

    const hash=await bcrypt.hash(password,12);
    await pool.query("INSERT INTO members(name,email,password_hash,status) VALUES($1,$2,$3,'pending')",[name,email,hash]);

    res.send(page("Registrierung",`${nav(req)}<div class="card ok"><h2>✅ Registrierung erfolgreich</h2>
      <p>Dein Account wartet jetzt auf die Freischaltung durch den Administrator.</p></div>`));
  }catch(e){console.error(e);res.status(500).send("Serverfehler");}
});

app.get("/login",(req,res)=>res.send(page("Login", `${nav(req)}
  <div class="card"><h2>Mitglieder-Login</h2>
  <form method="post" action="/login">
    <label>E-Mail</label><input type="email" name="email" required>
    <label>Passwort</label><input type="password" name="password" required>
    <button>Anmelden</button>
  </form>
 <p>Noch nicht registriert? <a href="/register">Registrieren</a></p></div>`)));
`));

app.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const r = await pool.query(
      "SELECT * FROM members WHERE email=$1",
      [email]
    );

    const m = r.rows[0];

    if (!m || !(await bcrypt.compare(password, m.password_hash))) {
      return res
        .status(401)
        .send(
          page(
            "Login",
            "<div class=\"card error\"><h2>Login fehlgeschlagen</h2><p>E-Mail oder Passwort ist falsch.</p><p><a href=\"/login\">Zurück zum Login</a></p></div>"
          )
        );
    }

    if (m.status !== "approved") {
      return res
        .status(403)
        .send(
          page(
            "Nicht freigeschaltet",
            "<div class=\"card\"><h2>Noch nicht freigeschaltet</h2><p>Dein Account wartet noch auf die Freischaltung durch den Administrator.</p></div>"
          )
        );
    }

    req.session.member = {
      id: m.id,
      name: m.name,
      email: m.email,
      admin: m.admin
    };

    res.redirect("/");
  } catch (e) {
    console.error(e);
    res.status(500).send("Serverfehler");
  }
});

app.post("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/")));

app.get("/booking",loginRequired,async(req,res)=>{
  const date=String(req.query.date||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.redirect("/");
  const r=await pool.query("SELECT start_time FROM bookings WHERE booking_date=$1",[date]);
  const busy=new Set(r.rows.map(x=>String(x.start_time).slice(0,5)));

  const html = slots().map(s => {
  if (busy.has(s.start)) {
    return '<div class="slot busy"><b>' +
      s.start + '-' + s.end +
      '</b><br>belegt</div>';
  }

  return '<div class="slot"><b>' +
    s.start + '-' + s.end +
    '</b>' +
    '<form method="post" action="/book">' +
    '<input type="hidden" name="date" value="' + esc(date) + '">' +
    '<input type="hidden" name="start" value="' + s.start + '">' +
    '<input type="hidden" name="end" value="' + s.end + '">' +
    '<button>Buchen</button></form></div>';
}).join("");

 res.send(page("Buchung", nav(req) + '<div class="card"><h2>' + esc(date) + '</h2><div class="grid">' + html + '</div></div>')); 
});

app.post("/book",loginRequired,async(req,res)=>{
  const {date,start,end}=req.body;

  if(!date||!start||!end){
    return res.status(400).send("Fehlende Buchungsdaten");
  }

  const client=await pool.connect();

  try{
    await client.query("BEGIN");

    const active=await client.query(
      "SELECT id FROM bookings WHERE member_id=$1 AND used=FALSE AND (booking_date + start_time) > NOW() FOR UPDATE",
      [req.session.member.id]
    );

    if(active.rowCount){
      await client.query("ROLLBACK");
      return res.status(409).send(
        page(
          "Buchung",
          nav(req) +
          '<div class="card warn"><h2>Bereits eine aktive Buchung</h2><p>Du kannst erst wieder buchen, wenn diese Buchung abgelaufen ist.</p><a href="/my-bookings">Meine Buchungen</a></div>'
        )
      );
    }

    await client.query(
  "INSERT INTO bookings(member_id,booking_date,start_time,end_time) VALUES($1,$2,$3,$4)",
  [req.session.member.id,date,start,end]
);
  await client.query("COMMIT");

res.send(
  page(
    "Buchung bestätigt",
    nav(req) +
    '<div class="card ok"><h2>✅ Buchung bestätigt</h2>' +
    "<p><b>" +
    esc(date) +
    "</b>, " +
    esc(start) +
    "-" +
    esc(end) +
    '</p><a href="/my-bookings">Meine Buchungen</a></div>'
  )
);

}catch(e){
  await client.query("ROLLBACK").catch(()=>{});

  if(e.code==="23505"){
    return res.status(409).send(
      page(
        "Buchung",
        nav(req) +
        '<div class="card error"><h2>Slot bereits belegt</h2>' +
        "<p>Dieser Termin wurde gerade vergeben.</p></div>"
      )
    );
  }
  

  console.error(e);
  res.status(500).send("Serverfehler");
}finally{
  client.release();
}
});

app.get("/my-bookings",loginRequired,async(req,res)=>{
    "SELECT * FROM bookings WHERE member_id=$1 ORDER BY booking_date,start_time",
    [req.session.member.id]
  );

  const rows=r.rows.map(b=>{
    const date=String(b.booking_date).slice(0,10);
    const start=String(b.start_time).slice(0,5);
    const end=String(b.end_time).slice(0,5);
    const dt=new Date(date+"T"+start+":00");
    const canCancel=!b.used&&dt>new Date();

    return "<tr><td>"+esc(date)+"</td><td>"+start+"-"+end+"</td>"+
      "<td>"+(b.used?"genutzt":dt>new Date()?"gebucht":"abgelaufen")+"</td>"+
      "<td>"+(canCancel?
        '<form method="post" action="/cancel/'+b.id+'"><button>Stornieren</button></form>':
        "")+"</td></tr>";
  }).join("");

  res.send(
  page(
    "Meine Buchungen",
    nav(req) +
    '<div class="card"><h2>Meine Buchungen</h2>' +
(
  rows
    ? '<table><tr><th>Datum</th><th>Zeit</th><th>Status</th><th></th></tr>' + rows + '</table>'
    : '<p>Keine Buchungen.</p>'
) +
'</div>'
  )
);
});

app.post("/cancel/:id",loginRequired,async(req,res)=>{
  const r=await pool.query(`
    DELETE FROM bookings WHERE id=$1 AND member_id=$2 AND used=FALSE
    AND (booking_date + start_time)>NOW() RETURNING id
  `,[req.params.id,req.session.member.id]);

  if(!r.rowCount)
    return res.status(404).send(page("Stornierung",`${nav(req)}<div class="card error"><h2>Stornierung nicht möglich</h2><p>Die Buchung wurde nicht gefunden oder ist bereits abgelaufen.</p></div>`));

  res.send(page("Stornierung",`${nav(req)}<div class="card ok"><h2>✅ Buchung storniert</h2><p>Der Termin ist wieder frei.</p></div>`));
});

app.get("/admin",adminRequired,async(req,res)=>{
  const [m,b]=await Promise.all([
    pool.query("SELECT id,name,email,status,admin,created_at FROM members ORDER BY created_at DESC"),
    pool.query("SELECT b.*,m.name,m.email FROM bookings b JOIN members m ON m.id=b.member_id ORDER BY b.booking_date,b.start_time")
  ]);

  const members=m.rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${esc(x.status)}</td><td>
    ${x.admin?"Administrator":x.status==="pending"?`<form method="post" action="/admin/approve/${x.id}"><button class="green">Freischalten</button></form>`
    :x.status==="approved"?`<form method="post" action="/admin/block/${x.id}"><button class="danger">Sperren</button></form>`:""}
  </td></tr>`).join("");

  const bookings=b.rows.map(x=>`<tr><td>${esc(x.booking_date)}</td><td>${String(x.start_time).slice(0,5)}–${String(x.end_time).slice(0,5)}</td>
    <td>${esc(x.name)}</td><td>${esc(x.email)}</td><td><form method="post" action="/admin/cancel-booking/${x.id}"><button class="danger">Stornieren</button></form></td></tr>`).join("");

  const approved=m.rows.filter(x=>x.status==="approved").length;
  const pending=m.rows.filter(x=>x.status==="pending").length;

  res.send(page("Admin",`${nav(req)}
    <div class="card"><h2>Administrator</h2><p><b>${approved}</b> freigeschaltet · <b>${pending}</b> warten auf Freischaltung · maximal 100</p></div>
    <div class="card"><h2>Mitglieder</h2><table><tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Aktion</th></tr>${members}</table></div>
    <div class="card"><h2>Alle Buchungen</h2>${bookings?`<table><tr><th>Datum</th><th>Zeit</th><th>Mitglied</th><th>E-Mail</th><th></th></tr>${bookings}</table>`:"<p>Keine Buchungen.</p>"}</div>`));
});

app.post("/admin/approve/:id",adminRequired,async(req,res)=>{
  const c=await pool.query("SELECT COUNT(*)::int AS n FROM members WHERE status='approved'");
  if(c.rows[0].n>=100) return res.status(409).send(page("Admin",`${nav(req)}<div class="card warn"><h2>100 Mitglieder erreicht</h2></div>`));
  await pool.query("UPDATE members SET status='approved' WHERE id=$1 AND admin=FALSE",[req.params.id]);
  res.redirect("/admin");
});

app.post("/admin/block/:id",adminRequired,async(req,res)=>{
  await pool.query("UPDATE members SET status='blocked' WHERE id=$1 AND admin=FALSE",[req.params.id]);
  res.redirect("/admin");
});

app.post("/admin/cancel-booking/:id",adminRequired,async(req,res)=>{
  await pool.query("DELETE FROM bookings WHERE id=$1",[req.params.id]);
  res.redirect("/admin");
});

initDb().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TuRU Padel läuft auf Port ${PORT}`);
  });
}).catch(err => {
  console.error("Datenbankfehler:", err);
  process.exit(1);
});
  
  process.exit(1);
});
