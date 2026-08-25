import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL) throw new Error("DATABASE_URL fehlt.");
if (!JWT_SECRET) throw new Error("JWT_SECRET fehlt.");

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
app.use(cors({ origin: true, methods:["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowedHeaders:["Content-Type","Authorization"] }));
app.use(express.json({limit:"1mb"}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runSchema() {
  let sql = fs.readFileSync(path.join(__dirname,"schema.sql"),"utf8");
  // Statements in this schema do not use procedural blocks; execute sequentially.
  const statements = sql.split(/;\s*(?:\r?\n|$)/).map(x=>x.trim()).filter(Boolean);
  for (const statement of statements) {
    try { await pool.query(statement); }
    catch (e) {
      // The legacy role constraint can fail while upgrading an old DB; the explicit migration below fixes it.
      if (!/users_role_check/i.test(statement)) throw e;
    }
  }
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'member'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS alias VARCHAR(100)");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
  await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('member','player','trainer','team_manager','board','admin','superadmin','sponsor','partner'))`);
}

const publicUser = r => ({id:r.id, firstName:r.first_name, alias:r.alias, email:r.email, role:r.role});
const tokenFor = u => jwt.sign({id:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:"7d"});

async function ensureUsersAndPlayers(){
  const password=process.env.ADMIN_INITIAL_PASSWORD || "Turu1880!";
  const hash=await bcrypt.hash(password,12);
  const users=[
    ["Admin","TuRU Admin","admin@turu1880-demo.de","superadmin"],
    ["Vorstand","TuRU Vorstand","vorstand@turu1880-demo.de","board"],
    ["Trainer","Test Trainer","trainer@turu1880-demo.de","trainer"],
    ["Spieler","Test Spieler","spieler@turu1880-demo.de","player"],
    ["Mitglied","Test Mitglied","mitglied@turu1880-demo.de","member"],
    ["Sponsor","Premium Partner","sponsor@turu1880-demo.de","sponsor"],
    ["Partner","TuRU Partner","partner@turu1880-demo.de","partner"]
  ];
  for(const [firstName,alias,email,role] of users){
    await pool.query(`INSERT INTO users(first_name,alias,email,password_hash,role,terms_accepted_at)
      VALUES($1,$2,$3,$4,$5,NOW())
      ON CONFLICT(email) DO UPDATE SET first_name=EXCLUDED.first_name,alias=EXCLUDED.alias,role=EXCLUDED.role`,
      [firstName,alias,email,hash,role]);
  }
  const names=["Lukas","Noah","Ben","Finn","Leon","Paul","Jonas","Emil","Tim","David","Max","Luca","Milan","Elias","Felix","Oskar","Anton","Theo","Moritz","Jan","Nico","Robin","Alex","Sam"];
  const surnames=["Muster","Beispiel","Test","Demo","Klein","Schneider","Wagner","Hoffmann","Koch","Bauer","Richter","König","Neumann","Wolf","Becker","Fischer","Lang","Winter","Sommer","Jung","Kramer","Hartmann","Schulz","Brandt"];
  const positions=["Torwart","Abwehr","Abwehr","Abwehr","Mittelfeld","Mittelfeld","Mittelfeld","Mittelfeld","Sturm","Sturm","Sturm"];
  const teams=await pool.query("SELECT id,name FROM teams ORDER BY name");
  for(const team of teams.rows){
    const count=await pool.query("SELECT COUNT(*)::int AS n FROM players WHERE team_id=$1",[team.id]);
    for(let i=count.rows[0].n;i<24;i++){
      await pool.query(`INSERT INTO players(team_id,first_name,last_name,position,shirt_number)
        VALUES($1,$2,$3,$4,$5)`,
        [team.id,names[i%names.length],`${surnames[i% surnames.length]} ${team.name.replace(/\s/g,"")}`,positions[i%positions.length],i+1]);
    }
  }
}

function auth(req,res,next){
  const h=req.headers.authorization||""; const t=h.startsWith("Bearer ")?h.slice(7):"";
  if(!t)return res.status(401).json({error:"Nicht angemeldet."});
  try{req.user=jwt.verify(t,JWT_SECRET);next();}catch{return res.status(401).json({error:"Sitzung ungültig oder abgelaufen."});}
}
const requireRole=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:"Keine Berechtigung."});

app.get("/",(req,res)=>res.json({name:"TuRU 1880 Backend",status:"online"}));
app.get("/api/health",async(req,res)=>{try{await pool.query("SELECT 1");res.json({ok:true,database:"connected"});}catch{res.status(500).json({ok:false,database:"error"});}});

app.post("/api/auth/register",async(req,res)=>{
 try{
  const firstName=String(req.body.firstName||"").trim(), alias=String(req.body.alias||"").trim()||null;
  const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
  if(!firstName||!email||password.length<8||req.body.terms!==true)return res.status(400).json({error:"Bitte alle Pflichtfelder korrekt ausfüllen."});
  const existing=await pool.query("SELECT id FROM users WHERE email=$1",[email]);
  if(existing.rowCount)return res.status(409).json({error:"Diese E-Mail-Adresse ist bereits registriert."});
  const result=await pool.query(`INSERT INTO users(first_name,alias,email,password_hash,role,terms_accepted_at)
    VALUES($1,$2,$3,$4,'member',NOW()) RETURNING *`,[firstName,alias,email,await bcrypt.hash(password,12)]);
  const user=publicUser(result.rows[0]); res.status(201).json({message:"Registrierung erfolgreich.",user});
 }catch(e){console.error(e);res.status(500).json({error:"Registrierung konnte nicht gespeichert werden."});}
});

app.post("/api/auth/login",async(req,res)=>{
 try{
  const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
  const result=await pool.query("SELECT * FROM users WHERE email=$1",[email]);
  if(!result.rowCount||!(await bcrypt.compare(password,result.rows[0].password_hash)))return res.status(401).json({error:"E-Mail oder Passwort ist falsch."});
  const user=publicUser(result.rows[0]);res.json({token:tokenFor(user),user});
 }catch(e){console.error(e);res.status(500).json({error:"Anmeldung nicht möglich."});}
});

app.post("/api/auth/change-password",auth,async(req,res)=>{
 try{
  const current=String(req.body.currentPassword||""), next=String(req.body.newPassword||"");
  if(next.length<8)return res.status(400).json({error:"Das neue Passwort muss mindestens 8 Zeichen haben."});
  const r=await pool.query("SELECT password_hash FROM users WHERE id=$1",[req.user.id]);
  if(!r.rowCount||!(await bcrypt.compare(current,r.rows[0].password_hash)))return res.status(401).json({error:"Aktuelles Passwort ist falsch."});
  await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[await bcrypt.hash(next,12),req.user.id]);
  res.json({message:"Passwort erfolgreich geändert."});
 }catch(e){console.error(e);res.status(500).json({error:"Passwort konnte nicht geändert werden."});}
});

app.get("/api/teams",async(req,res)=>{const r=await pool.query("SELECT * FROM teams ORDER BY CASE WHEN name='1. Mannschaft' THEN 0 ELSE 1 END,name");res.json(r.rows);});
app.get("/api/teams/:id/players",async(req,res)=>{const r=await pool.query("SELECT * FROM players WHERE team_id=$1 ORDER BY shirt_number",[req.params.id]);res.json(r.rows);});
app.get("/api/posts",async(req,res)=>{const r=await pool.query(`SELECT p.*,t.name team_name FROM posts p LEFT JOIN teams t ON t.id=p.team_id ORDER BY p.created_at DESC LIMIT 20`);res.json(r.rows);});
app.get("/api/matches",async(req,res)=>{const r=await pool.query(`SELECT m.*,t.name team_name FROM matches m LEFT JOIN teams t ON t.id=m.team_id ORDER BY m.match_date DESC LIMIT 30`);res.json(r.rows);});
app.get("/api/events",async(req,res)=>{const r=await pool.query("SELECT * FROM events ORDER BY event_date ASC LIMIT 20");res.json(r.rows);});
app.get("/api/vouchers",async(req,res)=>{const r=await pool.query(`SELECT v.*,s.name sponsor_name FROM vouchers v JOIN sponsors s ON s.id=v.sponsor_id WHERE v.active=true ORDER BY v.created_at DESC`);res.json(r.rows);});

app.use((err,req,res,next)=>{console.error("Unhandled",err);res.status(500).json({error:"Interner Serverfehler."});});

async function start(){
  await runSchema();
  await ensureUsersAndPlayers();
  app.listen(PORT,()=>console.log(`TuRU Backend läuft auf Port ${PORT}`));
}
start().catch(e=>{console.error("Start fehlgeschlagen",e);process.exit(1);});
