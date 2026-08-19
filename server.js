const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || "turu-padel-change-this-secret";

if (!DATABASE_URL) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

const SLOT_MINUTES = 90;
const OPEN_HOUR = 9;
const CLOSE_HOUR = 22;
const SLOT_STARTS = [
  "09:00","10:30","12:00","13:30",
  "15:00","16:30","18:00","19:30","21:00"
];

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pad(n) { return String(n).padStart(2, "0"); }

function dateOnly(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function parseDate(s) {
  const [y,m,d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function formatDateDE(s) {
  return parseDate(s).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
}

function formatTime(t) {
  return String(t || "").slice(0,5);
}

function timeToMinutes(t) {
  const [h,m] = String(t).slice(0,5).split(":").map(Number);
  return h * 60 + m;
}

function slotEnd(start) {
  return minutesToTime(timeToMinutes(start) + SLOT_MINUTES);
}

function minutesToTime(min) {
  return `${pad(Math.floor(min/60))}:${pad(min%60)}`;
}

function todayString() {
  return dateOnly(new Date());
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function isPastSlot(date, start) {
  if (date < todayString()) return true;
  if (date > todayString()) return false;
  return timeToMinutes(start) <= nowMinutes();
}

function requireLogin(req, res, next) {
  if (!req.session.member) return res.redirect("/login");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.member?.admin) return res.status(403).send(page("Kein Zugriff", req, `
    <div class="card"><h2>Kein Zugriff</h2><p>Dieser Bereich ist nur für Administratoren.</p></div>
  `));
  next();
}

function nav(req, active) {
  const member = req.session.member;
  const items = [
    ["/", "Startseite", "home"],
    ["/book", "Platz buchen", "book"],
    ["/my-bookings", "Meine Buchungen", "mine"],
    ["/password", "Passwort ändern", "password"],
  ];
  if (member?.admin) items.push(["/admin", "Administration", "admin"]);

  return `<nav class="nav">
    <div class="brand">
      <div class="logo-mark">T</div>
      <div><strong>TuRU 1880 Padel</strong><small>Blau. Weiß. Düsseldorf.</small></div>
    </div>
    <div class="nav-links">
      ${items.map(([href,label,key]) => `
        <a class="${active === key ? "active" : ""}" href="${href}">${esc(label)}</a>
      `).join("")}
      <a href="/logout">Abmelden</a>
    </div>
  </nav>`;
}

function page(title, req, content, active = "") {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – TuRU 1880 Padel</title>
<style>
:root{
 --blue:#123b91;--blue2:#0d2d70;--light:#f4f7fc;--border:#dce4f0;
 --green:#16834b;--red:#c93434;--yellow:#b77900;--text:#172033;--muted:#6b7280;
}
*{box-sizing:border-box}body{margin:0;background:var(--light);color:var(--text);
font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px}
a{text-decoration:none;color:inherit}.nav{height:76px;background:#fff;border-bottom:1px solid var(--border);
display:flex;align-items:center;justify-content:space-between;padding:0 34px;position:sticky;top:0;z-index:20}
.brand{display:flex;align-items:center;gap:12px}.brand strong{display:block;font-size:18px;color:var(--blue)}
.brand small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.logo-mark{width:42px;height:42px;border:3px solid var(--blue);border-radius:50%;display:grid;place-items:center;
font-weight:900;color:var(--blue)}
.nav-links{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.nav-links a{padding:10px 14px;border-radius:9px;
font-weight:650;font-size:13px}.nav-links a:hover{background:#eef3fb}.nav-links a.active{background:var(--blue);color:#fff}
.container{max-width:1450px;margin:28px auto;padding:0 22px}.hero,.card{background:#fff;border:1px solid var(--border);
border-radius:16px;box-shadow:0 5px 18px rgba(20,40,80,.05)}.hero{padding:30px;margin-bottom:18px}
.hero h1{margin:0 0 8px;color:var(--blue);font-size:30px}.hero p{margin:0;color:var(--muted)}
.card{padding:20px;margin-bottom:18px}.card h2,.card h3{margin:0 0 14px;color:var(--blue)}
.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:9px;padding:10px 15px;
font-weight:750;cursor:pointer;background:var(--blue);color:#fff}.btn:hover{background:var(--blue2)}
.btn.secondary{background:#edf2fa;color:var(--blue)}.btn.danger{background:#fff0f0;color:var(--red);border:1px solid #f1caca}
.btn.green{background:var(--green)}.btn.small{padding:7px 10px;font-size:12px}
label{font-weight:700;font-size:13px;display:block;margin-bottom:6px}input,select,textarea{width:100%;
border:1px solid #cfd8e7;border-radius:9px;padding:10px;background:#fff;font:inherit}textarea{min-height:80px}
.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.full{grid-column:1/-1}
.notice{padding:12px 14px;border-radius:10px;background:#eef5ff;color:var(--blue);margin:12px 0}
.alert{padding:12px 14px;border-radius:10px;background:#fff0f0;color:#a52424;margin:12px 0}
.tabs{display:flex;gap:8px;margin-bottom:16px}.tabs a{padding:9px 14px;border:1px solid var(--border);border-radius:9px;
background:#fff;font-weight:750;color:var(--blue)}.tabs a.active{background:var(--blue);color:#fff}
.calendar-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
.calendar-head h2{margin:0}.calendar-actions{display:flex;gap:7px}.calendar-actions a{padding:8px 11px;border:1px solid var(--border);border-radius:8px}
.day-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.slot{border:1px solid var(--border);border-radius:12px;
padding:14px;background:#fff;display:flex;justify-content:space-between;align-items:center;gap:10px}
.slot .time{font-weight:800;color:var(--blue)}.status{font-size:12px;font-weight:800;padding:6px 9px;border-radius:999px}
.free .status{background:#e8f7ef;color:var(--green)}.busy .status{background:#fff0f0;color:var(--red)}
.blocked .status{background:#fff5dd;color:var(--yellow)}
.week{display:grid;grid-template-columns:80px repeat(7,1fr);border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#fff}
.week>div{min-height:58px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);padding:8px}
.week .head{background:#f4f7fc;text-align:center;font-weight:800;color:var(--blue)}.week .hour{font-weight:800;color:#667085}
.wcell{border-radius:8px;text-align:center;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;min-height:40px}
.wfree{background:#e8f7ef;color:var(--green)}.wbusy{background:#fff0f0;color:var(--red)}.wblocked{background:#fff5dd;color:var(--yellow)}
.month{display:grid;grid-template-columns:repeat(7,1fr);border:1px solid var(--border);background:#fff;border-radius:12px;overflow:hidden}
.month .mh{background:#f4f7fc;padding:10px;text-align:center;font-weight:800;color:var(--blue)}
.mday{min-height:120px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);padding:10px}.mday.muted{background:#fafbfc;color:#b0b6c2}
.mday a{display:block;height:100%}.mnum{font-weight:900}.dots{display:flex;gap:4px;margin-top:12px}.dot{width:9px;height:9px;border-radius:50%}.dg{background:#16834b}.dr{background:#c93434}.dy{background:#b77900}
table{width:100%;border-collapse:collapse}th,td{padding:11px 10px;border-bottom:1px solid var(--border);text-align:left}th{background:#f4f7fc;color:var(--blue);font-size:12px}
.badge{padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800;background:#e9f0ff;color:var(--blue)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.stat{padding:18px;border:1px solid var(--border);border-radius:13px;background:#fff}
.stat .num{font-size:28px;font-weight:900;color:var(--blue)}.stat small{color:var(--muted)}
@media(max-width:900px){.nav{height:auto;padding:14px;align-items:flex-start;gap:10px;flex-direction:column}.nav-links{width:100%;overflow:auto;flex-wrap:nowrap}.container{padding:0 12px}.form-grid,.day-grid{grid-template-columns:1fr}.week{font-size:10px;grid-template-columns:50px repeat(7,minmax(60px,1fr));overflow:auto}.month{min-width:700px}.month-wrap{overflow:auto}.stats{grid-template-columns:repeat(2,1fr)}}
</style></head>
<body>
${req.session.member ? nav(req, active) : ""}
<main class="container">${content}</main>
</body></html>`;
}

function statusForSlot(date, start, end, bookings, blocks) {
  const sm = timeToMinutes(start), em = timeToMinutes(end);
  const booking = bookings.find(b => timeToMinutes(b.start_time) < em && timeToMinutes(b.end_time) > sm);
  const block = blocks.find(b => {
    const bs = b.start_time ? timeToMinutes(b.start_time) : 0;
    const be = b.end_time ? timeToMinutes(b.end_time) : 1440;
    return bs < em && be > sm;
  });
  if (block) return { type:"blocked", label:"Gesperrt", reason:block.reason || "Reserviert" };
  if (booking) return { type:"busy", label:"Gebucht", reason:booking.name || "Belegt" };
  return { type:"free", label:"Frei" };
}

async function getBookingsForDate(date) {
  const { rows } = await pool.query(`
    SELECT b.id,b.booking_date,b.start_time,b.end_time,b.member_id,m.name
    FROM bookings b LEFT JOIN members m ON m.id=b.member_id
    WHERE b.booking_date=$1
    ORDER BY b.start_time
  `,[date]);
  return rows;
}

async function getBlocksForDate(date) {
  const { rows } = await pool.query(`
    SELECT * FROM booking_blocks
    WHERE active=true
      AND start_date <= $1
      AND (end_date IS NULL OR end_date >= $1)
      AND (recurrence_end_date IS NULL OR recurrence_end_date >= $1)
    ORDER BY start_time
  `,[date]);
  const d = parseDate(date);
  const isoDay = d.getDay() === 0 ? 7 : d.getDay();
  const dayOfMonth = d.getDate();
  return rows.filter(b => {
    const type = b.recurrence_type || "once";
    if (type === "once") return date >= dateOnly(new Date(b.start_date)) && (!b.end_date || date <= dateOnly(new Date(b.end_date)));
    if (type === "daily") return true;
    if (type === "weekly") {
      const days = Array.isArray(b.weekdays) ? b.weekdays.map(Number) : [];
      return days.length ? days.includes(isoDay) : isoDay === (parseDate(dateOnly(new Date(b.start_date))).getDay() || 7);
    }
    if (type === "monthly") return dayOfMonth === parseDate(dateOnly(new Date(b.start_date))).getDate();
    return false;
  });
}

async function getCalendarData(date) {
  const bookings = await getBookingsForDate(date);
  const blocks = await getBlocksForDate(date);
  return { bookings, blocks };
}

async function slotState(date,start) {
  const end = slotEnd(start);
  const { bookings, blocks } = await getCalendarData(date);
  return statusForSlot(date,start,end,bookings,blocks);
}

app.get("/", (req,res) => {
  if (!req.session.member) return res.redirect("/login");
  res.send(page("Startseite",req,`
    <section class="hero">
      <h1>TuRU 1880 Padel</h1>
      <p>Willkommen ${esc(req.session.member.name)}. Buche deinen Padelplatz schnell und übersichtlich.</p>
      <div style="margin-top:18px"><a class="btn" href="/book">Platz buchen</a></div>
    </section>
    <div class="card"><h2>Kalender</h2><p>Wähle Tag, Woche oder Monat und sehe sofort, wann der Platz frei, gebucht oder gesperrt ist.</p></div>
  `,"home"));
});

app.get("/login",(req,res)=>res.send(page("Anmelden",req,`
  <section class="hero"><h1>TuRU 1880 Padel</h1><p>Mitgliederbereich</p></section>
  <div class="card" style="max-width:500px;margin:auto">
    <h2>Anmelden</h2>
    ${req.query.error ? `<div class="alert">${esc(req.query.error)}</div>` : ""}
    <form method="post" action="/login">
      <label>E-Mail</label><input name="email" type="email" required>
      <label style="margin-top:12px">Passwort</label><input name="password" type="password" required>
      <button class="btn" style="margin-top:16px;width:100%">Anmelden</button>
    </form>
  </div>
`));

app.post("/login",async(req,res)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const {rows}=await pool.query(`SELECT id,name,email,password_hash,status,admin FROM members WHERE lower(email)=lower($1) LIMIT 1`,[email]);
    const m=rows[0];
    if(!m || m.status!=="approved" || !(await bcrypt.compare(String(req.body.password||""),m.password_hash)))
      return res.redirect("/login?error=E-Mail oder Passwort falsch");
    req.session.member={id:m.id,name:m.name,email:m.email,admin:!!m.admin};
    res.redirect("/");
  }catch(e){console.error(e);res.status(500).send("Login-Fehler");}
});

app.get("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/login")));

app.get("/book",requireLogin,async(req,res)=>{
  const view=["day","week","month"].includes(req.query.view)?req.query.view:"week";
  const date=req.query.date || todayString();
  let content=`<section class="hero"><h1>📅 Platz buchen</h1><p>Tag, Woche oder Monat auswählen und freie Zeiten buchen.</p></section>
  <div class="card">
    <div class="tabs">
      <a class="${view==="day"?"active":""}" href="/book?view=day&date=${date}">Tag</a>
      <a class="${view==="week"?"active":""}" href="/book?view=week&date=${date}">Woche</a>
      <a class="${view==="month"?"active":""}" href="/book?view=month&date=${date}">Monat</a>
    </div>
    <form method="get" style="display:flex;gap:10px;max-width:420px;margin-bottom:18px">
      <input type="hidden" name="view" value="${view}">
      <input type="date" name="date" value="${esc(date)}">
      <button class="btn">Anzeigen</button>
    </form>`;

  if(view==="day"){
    const {bookings,blocks}=await getCalendarData(date);
    const d=parseDate(date);
    content+=`<div class="calendar-head"><h2>${d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</h2>
      <div class="calendar-actions"><a href="/book?view=day&date=${dateOnly(addDays(d,-1))}">‹</a><a href="/book?view=day&date=${dateOnly(addDays(d,1))}">›</a></div></div>
      <div class="day-grid">`;
    for(const s of SLOT_STARTS){
      const e=slotEnd(s), st=statusForSlot(date,s,e,bookings,blocks);
      const past=isPastSlot(date,s);
      const disabled=st.type!=="free"||past;
      content+=`<div class="slot ${disabled ? st.type==="free"?"busy":st.type : "free"}">
        <div><div class="time">${s}–${e}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">${past?"Vergangen":st.reason||"Ein Platz"}</div></div>
        ${disabled
          ? `<span class="status">${past?"Vergangen":esc(st.label)}</span>`
          : `<form method="post" action="/book"><input type="hidden" name="date" value="${date}"><input type="hidden" name="start_time" value="${s}"><input type="hidden" name="end_time" value="${e}"><button class="btn small">Jetzt buchen</button></form>`}
      </div>`;
    }
    content+=`</div>`;
  }

  if(view==="week"){
    const start=startOfWeek(parseDate(date));
    const days=Array.from({length:7},(_,i)=>addDays(start,i));
    content+=`<div class="calendar-head"><h2>${formatDateDE(dateOnly(start))} – ${formatDateDE(dateOnly(addDays(start,6)))}</h2>
      <div class="calendar-actions"><a href="/book?view=week&date=${dateOnly(addDays(start,-7))}">‹</a><a href="/book?view=week&date=${dateOnly(addDays(start,7))}">›</a></div></div>
      <div class="week"><div class="head">Zeit</div>${days.map(d=>`<div class="head">${d.toLocaleDateString("de-DE",{weekday:"short"})}<br>${pad(d.getDate())}.${pad(d.getMonth()+1)}.</div>`).join("")}`;
    for(const s of SLOT_STARTS){
      content+=`<div class="hour">${s}</div>`;
      for(const d of days){
        const ds=dateOnly(d); const {bookings,blocks}=await getCalendarData(ds); const st=statusForSlot(ds,s,slotEnd(s),bookings,blocks);
        const past=isPastSlot(ds,s);
        let cellClass=past?"wbusy":st.type==="free"?"wfree":st.type==="blocked"?"wblocked":"wbusy";
        const label=past?"Vorbei":st.type==="free"?"Frei":st.type==="blocked"?"Gesperrt":"Belegt";
        content+=`<div><a class="wcell ${cellClass}" href="${st.type==="free"&&!past?`/book?view=day&date=${ds}`:`/book?view=day&date=${ds}`}">${label}</a></div>`;
      }
    }
    content+=`</div><div class="notice" style="margin-top:14px">🟢 Frei &nbsp; 🔴 Belegt &nbsp; 🟡 Gesperrt</div>`;
  }

  if(view==="month"){
    const base=parseDate(date); const first=new Date(base.getFullYear(),base.getMonth(),1); const last=new Date(base.getFullYear(),base.getMonth()+1,0);
    const gridStart=startOfWeek(first); const gridEnd=addDays(startOfWeek(last),6);
    content+=`<div class="calendar-head"><h2>${base.toLocaleDateString("de-DE",{month:"long",year:"numeric"})}</h2>
      <div class="calendar-actions"><a href="/book?view=month&date=${base.getFullYear()}-${pad(base.getMonth())}-01">‹</a><a href="/book?view=month&date=${base.getFullYear()}-${pad(base.getMonth()+2)}-01">›</a></div></div>
      <div class="month-wrap"><div class="month">${["Mo","Di","Mi","Do","Fr","Sa","So"].map(x=>`<div class="mh">${x}</div>`).join("")}`;
    for(let d=new Date(gridStart);d<=gridEnd;d=addDays(d,1)){
      const ds=dateOnly(d), inMonth=d.getMonth()===base.getMonth();
      const {bookings,blocks}=await getCalendarData(ds);
      const free=SLOT_STARTS.filter(s=>statusForSlot(ds,s,slotEnd(s),bookings,blocks).type==="free"&&!isPastSlot(ds,s)).length;
      const blocked=SLOT_STARTS.filter(s=>statusForSlot(ds,s,slotEnd(s),bookings,blocks).type==="blocked").length;
      const busy=SLOT_STARTS.length-free-blocked;
      content+=`<div class="mday ${inMonth?"":"muted"}"><a href="/book?view=day&date=${ds}">
        <div class="mnum">${d.getDate()}</div><div class="dots">
          ${free?`<span class="dot dg" title="${free} frei"></span>`:""}${busy?`<span class="dot dr"></span>`:""}${blocked?`<span class="dot dy"></span>`:""}
        </div><div style="font-size:11px;color:#6b7280;margin-top:8px">${free} frei · ${busy} belegt</div>
      </a></div>`;
    }
    content+=`</div></div><div class="notice" style="margin-top:14px">🟢 freie Zeiten &nbsp; 🔴 belegte Zeiten &nbsp; 🟡 Sperren</div>`;
  }

  content+=`</div>`;
  res.send(page("Platz buchen",req,content,"book"));
});

app.post("/book",requireLogin,async(req,res)=>{
  const date=String(req.body.date||"");
  const start=String(req.body.start_time||"");
  const end=String(req.body.end_time||"");
  try{
    if(!date || !start || !end || isPastSlot(date,start)) return res.status(400).send(page("Buchung",req,`<div class="alert">Diese Zeit kann nicht gebucht werden.</div>`,"book"));
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const {rows:blocks}=await client.query(`SELECT * FROM booking_blocks WHERE active=true AND start_date <= $1 AND (end_date IS NULL OR end_date >= $1) AND (recurrence_end_date IS NULL OR recurrence_end_date >= $1)`,[date]);
      const d=parseDate(date), iso=d.getDay()===0?7:d.getDay();
      const matching=blocks.filter(b=>{
        const type=b.recurrence_type||"once";
        if(type==="once") return true;
        if(type==="daily") return true;
        if(type==="weekly"){const days=Array.isArray(b.weekdays)?b.weekdays.map(Number):[];return days.includes(iso);}
        if(type==="monthly") return d.getDate()===parseDate(dateOnly(new Date(b.start_date))).getDate();
        return false;
      });
      const sm=timeToMinutes(start),em=timeToMinutes(end);
      const conflict=matching.find(b=>(!b.start_time || timeToMinutes(b.start_time)<em)&&(!b.end_time||timeToMinutes(b.end_time)>sm));
      if(conflict){await client.query("ROLLBACK");return res.status(409).send(page("Buchung",req,`<div class="alert">Dieser Zeitraum ist vom Administrator gesperrt: ${esc(conflict.reason||"Reserviert")}.</div><a class="btn" href="/book?view=day&date=${date}">Zurück zum Kalender</a>`,"book"));}
      const {rows:existing}=await client.query(`SELECT id FROM bookings WHERE booking_date=$1 AND start_time < $3 AND end_time > $2 FOR UPDATE`,[date,start,end]);
      if(existing.length){await client.query("ROLLBACK");return res.status(409).send(page("Buchung",req,`<div class="alert">Diese Zeit ist bereits gebucht.</div><a class="btn" href="/book?view=day&date=${date}">Zurück</a>`,"book"));}
      await client.query(`INSERT INTO bookings(member_id,booking_date,start_time,end_time,used) VALUES($1,$2,$3,$4,false)`,[req.session.member.id,date,start,end]);
      await client.query("COMMIT");
    }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    res.redirect(`/my-bookings?success=${encodeURIComponent("Buchung erfolgreich")}`);
  }catch(e){console.error(e);res.status(500).send("Buchungsfehler");}
});

app.get("/my-bookings",requireLogin,async(req,res)=>{
  const {rows}=await pool.query(`SELECT * FROM bookings WHERE member_id=$1 ORDER BY booking_date DESC,start_time DESC`,[req.session.member.id]);
  res.send(page("Meine Buchungen",req,`
    <section class="hero"><h1>Meine Buchungen</h1><p>Hier findest du deine gebuchten Padelzeiten.</p></section>
    <div class="card">${req.query.success?`<div class="notice">${esc(req.query.success)}</div>`:""}
    <table><thead><tr><th>Datum</th><th>Zeit</th><th>Status</th><th>Aktion</th></tr></thead><tbody>
    ${rows.length?rows.map(b=>{const past=`${b.booking_date}`<todayString()||(`${b.booking_date}`===todayString()&&timeToMinutes(b.end_time)<=nowMinutes());return `<tr><td>${formatDateDE(b.booking_date)}</td><td><b>${formatTime(b.start_time)}–${formatTime(b.end_time)}</b></td><td><span class="badge">${past?"abgelaufen":"gebucht"}</span></td><td>${!past?`<form method="post" action="/cancel-booking"><input type="hidden" name="id" value="${b.id}"><button class="btn danger small">Stornieren</button></form>`:""}</td></tr>`}).join(""):`<tr><td colspan="4">Noch keine Buchungen.</td></tr>`}
    </tbody></table></div>
  `,"mine"));
});

app.post("/cancel-booking",requireLogin,async(req,res)=>{
  await pool.query(`DELETE FROM bookings WHERE id=$1 AND member_id=$2 AND (booking_date>$3 OR (booking_date=$3 AND end_time>$4))`,[req.body.id,req.session.member.id,todayString(),new Date().toTimeString().slice(0,5)]);
  res.redirect("/my-bookings");
});

app.get("/password",requireLogin,(req,res)=>res.send(page("Passwort ändern",req,`
  <div class="card" style="max-width:600px"><h2>Passwort ändern</h2>
  ${req.query.error?`<div class="alert">${esc(req.query.error)}</div>`:""}${req.query.ok?`<div class="notice">Passwort wurde geändert.</div>`:""}
  <form method="post" action="/password"><label>Aktuelles Passwort</label><input type="password" name="old" required>
  <label style="margin-top:12px">Neues Passwort</label><input type="password" name="new" minlength="6" required>
  <label style="margin-top:12px">Neues Passwort wiederholen</label><input type="password" name="confirm" minlength="6" required>
  <button class="btn" style="margin-top:16px">Passwort ändern</button></form></div>
`,"password")));

app.post("/password",requireLogin,async(req,res)=>{
  const {rows}=await pool.query(`SELECT password_hash FROM members WHERE id=$1`,[req.session.member.id]);
  if(!rows[0]||!(await bcrypt.compare(req.body.old,rows[0].password_hash))) return res.redirect("/password?error=Aktuelles+Passwort+ist+falsch");
  if(req.body.new!==req.body.confirm) return res.redirect("/password?error=Passwörter+stimmen+nicht+überein");
  await pool.query(`UPDATE members SET password_hash=$1 WHERE id=$2`,[await bcrypt.hash(req.body.new,12),req.session.member.id]);
  res.redirect("/password?ok=1");
});

app.get("/admin",requireAdmin,async(req,res)=>{
  const [members,bookings,blocks,stats]=await Promise.all([
    pool.query(`SELECT id,name,email,status,admin,created_at FROM members ORDER BY name`),
    pool.query(`SELECT b.*,m.name,m.email FROM bookings b LEFT JOIN members m ON m.id=b.member_id ORDER BY booking_date DESC,start_time DESC`),
    pool.query(`SELECT * FROM booking_blocks WHERE active=true ORDER BY start_date DESC,start_time`),
    pool.query(`SELECT m.name,m.email,COUNT(b.id)::int AS count,MIN(b.booking_date) AS first_booking,MAX(b.booking_date) AS last_booking FROM members m LEFT JOIN bookings b ON b.member_id=m.id GROUP BY m.id,m.name,m.email ORDER BY count DESC,m.name`)
  ]);
  const total=bookings.rows.length;
  const upcoming=bookings.rows.filter(b=>String(b.booking_date)>=todayString()).length;
  res.send(page("Administration",req,`
  <section class="hero"><h1>Administration</h1><p>Mitglieder, Buchungen, Sperren und Statistiken verwalten.</p></section>
  <div class="stats"><div class="stat"><small>Mitglieder</small><div class="num">${members.rows.length}</div></div>
  <div class="stat"><small>Buchungen gesamt</small><div class="num">${total}</div></div>
  <div class="stat"><small>Kommende Buchungen</small><div class="num">${upcoming}</div></div>
  <div class="stat"><small>Aktive Sperren</small><div class="num">${blocks.rows.length}</div></div></div>

  <div class="card"><h2>Mitglied manuell anlegen</h2>
  <form method="post" action="/admin/member" class="form-grid">
    <div><label>Name</label><input name="name" required></div>
    <div><label>E-Mail</label><input name="email" type="email" required></div>
    <div><label>Startpasswort</label><input name="password" type="password" minlength="6" required></div>
    <div><label><input type="checkbox" name="admin" value="1" style="width:auto"> Als Administrator anlegen</label></div>
    <div class="full"><button class="btn">Mitglied anlegen</button></div>
  </form></div>

  <div class="card"><h2>Mitglieder</h2><table><thead><tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Rolle</th><th>Aktion</th></tr></thead><tbody>
  ${members.rows.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.status)}</td><td>${m.admin?"Administrator":"Mitglied"}</td><td>
  ${m.id!==req.session.member.id?`<form method="post" action="/admin/toggle-admin" style="display:inline"><input type="hidden" name="id" value="${m.id}"><button class="btn secondary small">${m.admin?"Admin entfernen":"Zum Admin machen"}</button></form>`:"Eigener Account"}
  </td></tr>`).join("")}</tbody></table></div>

  <div class="card"><h2>Platz sperren / reservieren</h2>
  <form method="post" action="/admin/block" class="form-grid">
    <div><label>Von</label><input type="date" name="start_date" required></div>
    <div><label>Bis</label><input type="date" name="end_date" required></div>
    <div><label>Wiederholung</label><select name="recurrence_type"><option value="once">Einmalig</option><option value="daily">Täglich</option><option value="weekly">Wöchentlich</option><option value="monthly">Monatlich</option></select></div>
    <div><label>Von Uhrzeit</label><input type="time" name="start_time"></div>
    <div><label>Bis Uhrzeit</label><input type="time" name="end_time"></div>
    <div><label>Wiederholung endet am</label><input type="date" name="recurrence_end_date"></div>
    <div class="full"><label>Wochentage für wöchentliche Wiederholung</label>
      ${["Mo","Di","Mi","Do","Fr","Sa","So"].map((x,i)=>`<label style="display:inline-flex;margin-right:14px;font-weight:500"><input type="checkbox" name="weekdays" value="${i+1}" style="width:auto;margin-right:5px">${x}</label>`).join("")}
    </div>
    <div class="full"><label>Grund / Bezeichnung</label><input name="reason" placeholder="z. B. Training, Turnier, Wartung" required></div>
    <div class="full"><button class="btn">Sperre speichern</button></div>
  </form></div>

  <div class="card"><h2>Aktive Sperren / Reservierungen</h2><table><thead><tr><th>Zeitraum</th><th>Zeit</th><th>Wiederholung</th><th>Grund</th><th></th></tr></thead><tbody>
  ${blocks.rows.length?blocks.rows.map(b=>`<tr><td>${formatDateDE(b.start_date)}${b.end_date?" – "+formatDateDE(b.end_date):""}</td><td>${b.start_time?formatTime(b.start_time)+"–"+formatTime(b.end_time):"Ganztägig"}</td><td>${esc(b.recurrence_type)}</td><td>${esc(b.reason||"")}</td><td><form method="post" action="/admin/delete-block"><input type="hidden" name="id" value="${b.id}"><button class="btn danger small">Entfernen</button></form></td></tr>`).join(""):`<tr><td colspan="5">Keine aktiven Sperren.</td></tr>`}
  </tbody></table></div>

  <div class="card"><h2>Alle Buchungen</h2><table><thead><tr><th>Datum</th><th>Zeit</th><th>Mitglied</th><th>E-Mail</th></tr></thead><tbody>
  ${bookings.rows.length?bookings.rows.map(b=>`<tr><td>${formatDateDE(b.booking_date)}</td><td>${formatTime(b.start_time)}–${formatTime(b.end_time)}</td><td>${esc(b.name||"")}</td><td>${esc(b.email||"")}</td></tr>`).join(""):`<tr><td colspan="4">Keine Buchungen.</td></tr>`}
  </tbody></table></div>

  <div class="card"><h2>📊 Buchungsstatistik</h2><p style="color:#6b7280">Wer wie oft und wann gebucht hat.</p>
  <table><thead><tr><th>Mitglied</th><th>Buchungen</th><th>Erste Buchung</th><th>Letzte Buchung</th></tr></thead><tbody>
  ${stats.rows.map(s=>`<tr><td><b>${esc(s.name)}</b><br><small>${esc(s.email)}</small></td><td><b>${s.count}</b></td><td>${s.first_booking?formatDateDE(s.first_booking):"–"}</td><td>${s.last_booking?formatDateDE(s.last_booking):"–"}</td></tr>`).join("")}
  </tbody></table></div>
  `,"admin"));
});

app.post("/admin/member",requireAdmin,async(req,res)=>{
  try{
    const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
    if(!name||!email||password.length<6)return res.status(400).send("Name, E-Mail und ein Passwort mit mindestens 6 Zeichen sind erforderlich.");
    const hash=await bcrypt.hash(password,12);
    await pool.query(`INSERT INTO members(name,email,password_hash,status,admin) VALUES($1,$2,$3,'approved',$4)`,[name,email,hash,req.body.admin==="1"]);
    res.redirect("/admin");
  }catch(e){console.error(e);res.status(500).send("Mitglied konnte nicht angelegt werden. E-Mail eventuell bereits vorhanden.");}
});

app.post("/admin/toggle-admin",requireAdmin,async(req,res)=>{
  if(String(req.body.id)===String(req.session.member.id))return res.redirect("/admin");
  await pool.query(`UPDATE members SET admin=NOT admin WHERE id=$1`,[req.body.id]);
  res.redirect("/admin");
});

app.post("/admin/block",requireAdmin,async(req,res)=>{
  try{
    const weekdays=Array.isArray(req.body.weekdays)?req.body.weekdays.map(Number):(req.body.weekdays?[Number(req.body.weekdays)]:[]);
    await pool.query(`
      INSERT INTO booking_blocks(start_date,end_date,start_time,end_time,recurrence_type,weekdays,recurrence_end_date,reason,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)
    `,[
      req.body.start_date,req.body.end_date||req.body.start_date,req.body.start_time||null,req.body.end_time||null,
      req.body.recurrence_type||"once",weekdays,req.body.recurrence_end_date||null,req.body.reason||"Reserviert"
    ]);
    res.redirect("/admin");
  }catch(e){console.error(e);res.status(500).send("Sperre konnte nicht gespeichert werden.");}
});

app.post("/admin/delete-block",requireAdmin,async(req,res)=>{
  await pool.query(`UPDATE booking_blocks SET active=false WHERE id=$1`,[req.body.id]);
  res.redirect("/admin");
});

app.get("/health",async(req,res)=>{
  try{await pool.query("SELECT 1");res.json({ok:true});}catch(e){res.status(500).json({ok:false});}
});

app.listen(PORT,()=>console.log(`TuRU Padel läuft auf Port ${PORT}`));
