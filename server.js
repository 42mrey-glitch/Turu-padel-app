const express = require("express");
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended:true}));

const PORT = process.env.PORT || 10000;
const bookings = [];
const members = [
  {id:1,name:"Admin",email:"admin@turu1880.de",password:"REPLACE_ADMIN_PASSWORD",admin:true}
];

function page(title, body){
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} – TuRU 1880 Padel</title>
  <style>
  body{font-family:Arial,sans-serif;margin:0;background:#f4f7fb;color:#10233f}
  header{background:#102f63;color:white;padding:18px;text-align:center}
  main{max-width:900px;margin:24px auto;padding:0 16px}
  .card{background:white;border-radius:14px;padding:20px;margin:14px 0;box-shadow:0 2px 12px #0001}
  input,select,button{font-size:16px;padding:12px;margin:6px 0;border-radius:8px;border:1px solid #ccd3df}
  button{background:#102f63;color:white;border:0;padding:12px 18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .slot{padding:12px;background:#e9f0fa;border-radius:8px}.busy{background:#ffdede}
  a{color:#102f63;font-weight:bold}
  </style></head><body><header><h1>TuRU 1880 Padel</h1><div>Blau. Weiß. Düsseldorf.</div></header>
  <main>${body}</main></body></html>`;
}

app.get("/", (req,res)=>res.send(page("Buchung",`
<div class="card"><h2>Padelplatz buchen</h2>
<p>Mitglieder buchen in 90-Minuten-Slots von 09:00 bis 22:00 Uhr.</p>
<form method="get" action="/booking">
<label>Datum</label><br><input type="date" name="date" required><br>
<label>Mitglieds-E-Mail</label><br><input type="email" name="email" required><br>
<button>Verfügbarkeit anzeigen</button></form></div>
<div class="card"><h3>Regeln</h3><ul><li>Maximal 100 Mitglieder.</li><li>Eine aktive Buchung pro Mitglied.</li><li>Nach Nutzung kann erneut gebucht werden.</li></ul></div>`)));

app.get("/booking",(req,res)=>{
  const date=req.query.date, email=req.query.email;
  const slots=[];
  for(let h=9; h<=20; h+=1.5){
    const hour=Math.floor(h), min=(h%1)*60;
    const start=`${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
    const endMin=hour*60+min+90, eh=Math.floor(endMin/60), em=endMin%60;
    const end=`${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}`;
    const busy=bookings.some(b=>b.date===date && b.start===start);
    slots.push(`<div class="slot ${busy?"busy":""}"><b>${start}–${end}</b>
    ${busy?"<br>belegt":`<form method="post" action="/book"><input type="hidden" name="date" value="${date}">
    <input type="hidden" name="email" value="${email}"><input type="hidden" name="start" value="${start}">
    <input type="hidden" name="end" value="${end}"><button>Buchen</button></form>`}</div>`);
  }
  res.send(page("Buchung",`<div class="card"><h2>${date}</h2><div class="grid">${slots.join("")}</div><p><a href="/">Zurück</a></p></div>`));
});

app.post("/book",(req,res)=>{
  const {date,email,start,end}=req.body;
  if(!date||!email||!start||!end) return res.status(400).send("Fehlende Angaben");
  if(bookings.some(b=>b.date===date&&b.start===start)) return res.status(409).send("Dieser Slot ist bereits belegt.");
  const active=bookings.find(b=>b.email.toLowerCase()===email.toLowerCase() && b.date>=new Date().toISOString().slice(0,10) && !b.used);
  if(active) return res.status(409).send(page("Buchung",`<div class="card"><h2>Keine weitere Buchung möglich</h2><p>Du hast bereits eine aktive Buchung.</p><a href="/">Zurück</a></div>`));
  bookings.push({date,email,start,end,used:false});
  res.send(page("Buchung bestätigt",`<div class="card"><h2>✅ Buchung bestätigt</h2><p><b>${date}</b>, ${start}–${end}</p><p>${email}</p><a href="/">Neue Buchung</a></div>`));
});

app.get("/admin",(req,res)=>res.send(page("Admin",`
<div class="card"><h2>Admin-Bereich</h2>
<p>Aktuelle Test-Buchungen: <b>${bookings.length}</b></p>
${bookings.map((b,i)=>`<p>${i+1}. ${b.date} ${b.start}–${b.end} – ${b.email}</p>`).join("")||"<p>Noch keine Buchungen.</p>"}
</div>`)));

app.listen(PORT,()=>console.log("TuRU Padel läuft auf Port "+PORT));
