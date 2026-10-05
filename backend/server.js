import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import webpush from "web-push";

/*
 * TuRU 1880 Vereinsapp – zentraler API-Server
 *
 * Hinweis:
 * Die Datei enthält bewusst keinen JSX-Code. Sie kann als Server.jsx gespeichert
 * werden, für Node/Render sollte sie aber als server.js gestartet werden.
 * package.json: "start": "node server.js"
 */

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
const VAPID_PUBLIC_KEY = cleanEnv(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = cleanEnv(process.env.VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = cleanEnv(process.env.VAPID_SUBJECT) || "mailto:verein@turu1880.de";
const GEMINI_API_KEY = cleanEnv(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = cleanEnv(process.env.GEMINI_MODEL) || "gemini-3.8-flash";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); }
function cleanEnv(value){ return String(value ?? "").trim(); }
function limitText(value, maxLen){ return String(value ?? "").trim().slice(0, maxLen); }

if (!DATABASE_URL) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error("JWT_SECRET fehlt.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(cors({
  origin: FRONTEND_URL === "*" ? true : FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: false }));

const ROLES = [
  "member", "player", "trainer", "team_manager", "board",
  "admin", "superadmin", "sponsor", "partner"
];

const ADMIN_ROLES = ["admin", "superadmin"];
const CONTENT_ROLES = ["admin", "superadmin", "board", "trainer", "team_manager"];
const ALL_PERMISSIONS = [
  "dashboard", "pages", "news", "teams", "players", "fans",
  "memberships", "users", "partners", "history", "club"
];

function clean(value) {
  return String(value ?? "").trim();
}

function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
}

function requireUuid(value, label = "ID") {
  const id = clean(value);
  if (!isUuid(id)) {
    const error = new Error(`${label} ist keine gültige UUID.`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    alias: row.alias || "",
    email: row.email || "",
    role: row.role || "member",
    membershipType: row.membership_type || "fan",
    membershipStatus: row.membership_status || "pending",
    accountStatus: row.account_status || "active",
    membershipNumber: row.membership_number || null,
    teamId: row.team_id || null,
    teamName: row.team_name || null
  };
}

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Nicht angemeldet." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // UUID-safe: niemals User-IDs mit Number() umwandeln.
    // Wir laden den Benutzer immer frisch aus Neon. Dadurch funktionieren auch
    // bereits vorhandene Sitzungen, deren Token noch eine alte ID-Struktur enthält.
    let row = null;
    if (isUuid(payload.id)) {
      row = await one("SELECT id,email,role,account_status FROM users WHERE id=$1", [payload.id]);
    }
    if (!row && payload.email) {
      row = await one("SELECT id,email,role,account_status FROM users WHERE LOWER(email)=LOWER($1)", [clean(payload.email).toLowerCase()]);
    }
    if (!row) return res.status(401).json({ error: "Benutzer nicht gefunden. Bitte neu anmelden." });
    if (["blocked", "disabled"].includes(row.account_status)) {
      return res.status(403).json({ error: "Dieser Zugang ist gesperrt oder deaktiviert." });
    }
    req.user = { id: row.id, role: row.role, email: row.email };
    next();
  } catch (error) {
    console.error("auth", error);
    return res.status(401).json({ error: "Sitzung ungültig oder abgelaufen." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Keine Berechtigung." });
    }
    next();
  };
}

async function one(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function ensureSchema() {
  // Die bestehende TuRU-Datenbank verwendet UUIDs. Diese Initialisierung
  // erzeugt fehlende Tabellen ebenfalls UUID-kompatibel und verändert keine
  // bestehenden Tabellen/Datensätze.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      alias TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      membership_type TEXT NOT NULL DEFAULT 'fan',
      membership_status TEXT NOT NULL DEFAULT 'pending',
      account_status TEXT NOT NULL DEFAULT 'active',
      membership_number TEXT,
      team_id UUID,
      terms_accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_staff (
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      staff_role TEXT NOT NULL DEFAULT 'trainer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      shirt_number TEXT,
      position TEXT DEFAULT 'Spieler',
      image_url TEXT,
      published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id UUID REFERENCES users(id) ON DELETE SET NULL,
      team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
      image_url TEXT,
      link_url TEXT,
      page_slug TEXT,
      published BOOLEAN NOT NULL DEFAULT TRUE,
      social_requested BOOLEAN NOT NULL DEFAULT FALSE,
      approved BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      nav_label TEXT NOT NULL,
      title TEXT NOT NULL,
      lead TEXT,
      body TEXT,
      image_url TEXT,
      link_url TEXT,
      nav_visible BOOLEAN NOT NULL DEFAULT TRUE,
      published BOOLEAN NOT NULL DEFAULT TRUE,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 100,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS legal_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      published BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fan_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT,
      body TEXT NOT NULL DEFAULT '',
      approved BOOLEAN NOT NULL DEFAULT TRUE,
      image_url TEXT,
      link_url TEXT,
      visibility TEXT DEFAULT 'public',
      published BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT DEFAULT 'published',
      publish_requested BOOLEAN NOT NULL DEFAULT FALSE,
      approved_by UUID,
      approved_at TIMESTAMPTZ,
      author_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fan_votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fan_vote_entries (
      vote_id UUID NOT NULL REFERENCES fan_votes(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      choice TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (vote_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
      opponent TEXT,
      guest_team TEXT,
      match_date TIMESTAMPTZ,
      venue TEXT,
      competition TEXT,
      home_away TEXT DEFAULT 'home',
      status TEXT DEFAULT 'planned',
      result TEXT,
      fupa_url TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      event_date TIMESTAMPTZ,
      location TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sponsors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      level TEXT DEFAULT 'Partner',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sponsor_users (
      sponsor_id UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (sponsor_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sponsor_id UUID REFERENCES sponsors(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      code TEXT,
      valid_until DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
      audience_type TEXT NOT NULL DEFAULT 'all',
      audience_value TEXT,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS message_recipients (
      message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ,
      PRIMARY KEY (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      areas JSONB NOT NULL DEFAULT '[]'::jsonb,
      rights JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS membership_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT NOT NULL,
      membership_type TEXT NOT NULL DEFAULT 'fan',
      requested_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ
    );
  `);

  // Fehlende Felder sicher nachrüsten. Bestehende Werte bleiben erhalten.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS alias TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_type TEXT NOT NULL DEFAULT 'fan';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_number TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by UUID;
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE players ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS display_name_mode TEXT NOT NULL DEFAULT 'full';
    ALTER TABLE players ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE players ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE players ADD COLUMN IF NOT EXISTS alias TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS birth_date DATE;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS height_cm INTEGER;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS nationality TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS strong_foot TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS joined_turu DATE;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS previous_clubs TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_position TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS role_model TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_player TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_team TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_club TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS football_goal TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_food TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_drink TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_music TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_movie_series TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS hobby TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_other_sport TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS favorite_holiday TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS fun_fact TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS about_me TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS about_me_turu TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS link_url TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS social_requested BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS page_slug TEXT;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS home_featured BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_at TIMESTAMPTZ;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS chronology_date DATE;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS fixed_position INTEGER;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'nachricht';
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS show_in_news BOOLEAN NOT NULL DEFAULT TRUE;

    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS content TEXT;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS body TEXT;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS link_url TEXT;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS publish_requested BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS approved_by UUID;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    ALTER TABLE fan_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
    ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS home_featured BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS social_requested BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS review_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_site_pages_sort ON site_pages(sort_order,created_at);
    CREATE INDEX IF NOT EXISTS idx_fan_posts_created ON fan_posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_fan_posts_user ON fan_posts(user_id);
    CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
  `);

  // Standard-Seiten als editierbare Verwaltungseinträge vorbereiten.
  const systemPages = [
    ["home","Start","Ein Verein. Eine Plattform.","Seit 1880 – mehr als Fußball."],
    ["news","News","TuRU News","Aktuelles aus Mannschaften, Jugend, Verein und Fanwelt."],
    ["teams","Mannschaften","Mannschaften","Eigene Mannschaftsseiten, Kader, Berichte und Verwaltungsbereiche."],
    ["history","Geschichte","TuRU Geschichte","Eine vollständige Vereinschronik mit Menschen, Mannschaften, Spielstätten und historischen Dokumenten."],
    ["fans","Fans","Fanbereich","Die digitale Heimat für alle, die TuRU erleben und mitgestalten wollen."],
    ["club","Verein","Der Verein","Mehr als Fußball."],
    ["partners","Partner","Partner & Sponsoren","Gemeinsam Zukunft gestalten."],
    ["integration","Integration","Integration","Beiträge, Projekte und Geschichten rund um Integration und Zusammenhalt."],
    ["login","Mein TuRU","Mein TuRU","Dein persönlicher Bereich innerhalb der Vereinsplattform."]
  ];
  for (const [slug,label,title,lead] of systemPages) {
    await pool.query(
      `INSERT INTO site_pages(slug,nav_label,title,lead,is_system,sort_order) VALUES($1,$2,$3,$4,TRUE,$5)
       ON CONFLICT(slug) DO NOTHING`,
      [slug,label,title,lead,systemPages.findIndex(x=>x[0]===slug)]
    );
  }

  // Nur Standardmannschaften anlegen, wenn die Tabelle leer ist.
  const teamCount = await one("SELECT COUNT(*)::int AS n FROM teams");
  if (Number(teamCount?.n || 0) === 0) {
    const names = [
      "1. Mannschaft", "U19", "U17", "U16", "U15", "U14", "U13",
      "U12", "U10", "U9", "U8", "U7", "U6", "Integration"
    ];
    for (const name of names) {
      await pool.query("INSERT INTO teams(name) VALUES($1) ON CONFLICT(name) DO NOTHING", [name]);
    }
  }

  const demoPassword = process.env.ADMIN_INITIAL_PASSWORD;
  const adminEmail = clean(process.env.ADMIN_EMAIL).toLowerCase();
  if (demoPassword && adminEmail) {
    const hash = await bcrypt.hash(demoPassword, 12);
    await pool.query(
      `INSERT INTO users(first_name,last_name,email,password_hash,role,membership_type,membership_status,account_status,terms_accepted_at)
       VALUES($1,$2,$3,$4,'superadmin','active','approved','active',NOW())
       ON CONFLICT(email) DO UPDATE SET role='superadmin',membership_status='approved',account_status='active'`,
      ["TuRU", "Administrator", adminEmail, hash]
    );
  }


  // Rechtliche Standardseiten für den App-Footer. Inhalte bleiben durch den Superadmin bearbeitbar.
  const legalDefaults = [
    ["impressum", "Impressum", ""],
    ["datenschutz", "Datenschutz", ""],
    ["nutzungsbedingungen", "Nutzungsbedingungen", ""],
    ["foto-medien", "Foto & Medien", ""],
    ["jugendschutz", "Kinder- & Jugendschutz", ""],
    ["community-regeln", "Community-Regeln", ""],
    ["ki-hinweise", "KI-Hinweise", ""],
    ["drittanbieter", "Drittanbieter", `Drittanbieter & externe Dienste\n\nDie App kann Inhalte oder Funktionen externer Anbieter einbinden, insbesondere FuPa sowie Hosting-, Datenbank-, Push- und gegebenenfalls KI-Dienste. Die jeweiligen Anbieter können eigene Datenschutzbestimmungen und Nutzungsbedingungen haben.\n\nFuPa-Widgets werden nach den Vorgaben des jeweiligen Anbieters eingebunden. Externe Inhalte können technisch oder organisatorisch Änderungen unterliegen.`]
  ];
  for (const [slug,title,body] of legalDefaults) {
    await pool.query(
      `INSERT INTO legal_pages(slug,title,body,published) VALUES($1,$2,$3,TRUE) ON CONFLICT(slug) DO NOTHING`,
      [slug,title,body]
    );
  }
  // Die Rechtstext-Seiten starten leer. Bestehende Standard-Mustertexte aus älteren
  // App-Versionen werden einmalig anhand ihrer eindeutigen Einleitung geleert.
  const oldLegalPrefixes = [
    ['impressum','Turn- und Rasensport Union 1880 Düsseldorf e.V.\n\nVerantwortlicher:'],
    ['datenschutz','Datenschutzerklärung der TuRU 1880 Vereinsapp\n\nVerantwortlicher'],
    ['nutzungsbedingungen','Nutzungsbedingungen der TuRU 1880 Vereinsapp\n\n1. Nutzung'],
    ['foto-medien','Foto- und Medienrichtlinie\n\nFotos, Videos'],
    ['jugendschutz','Kinder- & Jugendschutz\n\nDie TuRU 1880 Vereinsapp'],
    ['community-regeln','Community-Regeln\n\nRespektvoller Umgang'],
    ['ki-hinweise','KI-Hinweise\n\nDie Vereinsapp kann KI-Unterstützung'],
    ['drittanbieter','Drittanbieter & externe Dienste\n\nDie App kann Inhalte oder Funktionen']
  ];
  for (const [slug,prefix] of oldLegalPrefixes) {
    await pool.query(`UPDATE legal_pages SET body='' WHERE slug=$1 AND body LIKE $2`, [slug, prefix+'%']);
  }

  const voteCount = await one("SELECT COUNT(*)::int AS n FROM fan_votes WHERE active=true");
  if (Number(voteCount?.n || 0) === 0) {
    await pool.query(
      "INSERT INTO fan_votes(question,option_a,option_b) VALUES($1,$2,$3)",
      ["Welches Thema interessiert dich am meisten?", "Mannschaften", "Vereinsleben"]
    );
  }
}

app.get("/", (req, res) => {
  res.json({ name: "TuRU 1880 Backend", status: "online", version: "2.0" });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("health", error);
    res.status(500).json({ ok: false, database: "error" });
  }
});

/* AUTH */
app.post("/api/auth/register", async (req, res) => {
  try {
    const firstName = clean(req.body.firstName);
    const lastName = clean(req.body.lastName);
    const alias = clean(req.body.alias) || null;
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const terms = bool(req.body.terms);
    const membershipType = ["active", "passive", "fan"].includes(req.body.memberType)
      ? req.body.memberType : "fan";
    const teamId = req.body.teamId ? clean(req.body.teamId) : null;

    if (!firstName || !email || password.length < 8 || !terms) {
      return res.status(400).json({ error: "Bitte alle Pflichtfelder korrekt ausfüllen und die Nutzungsbedingungen akzeptieren." });
    }

    if (teamId) {
      const team = await one("SELECT id FROM teams WHERE id=$1", [teamId]);
      if (!team) return res.status(400).json({ error: "Die ausgewählte Mannschaft existiert nicht." });
    }

    const exists = await one("SELECT id FROM users WHERE LOWER(email)=LOWER($1)", [email]);
    if (exists) return res.status(409).json({ error: "Diese E-Mail-Adresse ist bereits registriert." });

    const hash = await bcrypt.hash(password, 12);
    const membershipStatus = membershipType === "fan" ? "approved" : "pending";
    const result = await pool.query(
      `INSERT INTO users(first_name,last_name,alias,email,password_hash,role,membership_type,membership_status,account_status,team_id,terms_accepted_at)
       VALUES($1,$2,$3,$4,$5,'member',$6,$7,'active',$8,NOW())
       RETURNING id,first_name,last_name,alias,email,role,membership_type,membership_status,account_status,membership_number,team_id`,
      [firstName,lastName,alias,email,hash,membershipType,membershipStatus,teamId]
    );

    const user = publicUser(result.rows[0]);
    res.status(201).json({ message: "Registrierung erfolgreich.", user });
  } catch (error) {
    console.error("register", error);
    res.status(500).json({ error: "Registrierung konnte nicht gespeichert werden." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const row = await one(
      `SELECT u.*, t.name AS team_name
       FROM users u LEFT JOIN teams t ON t.id=u.team_id
       WHERE LOWER(u.email)=LOWER($1)`,
      [email]
    );

    if (!row || !row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
    }
    if (row.account_status === "blocked" || row.account_status === "disabled") {
      return res.status(403).json({ error: "Dieser Zugang ist gesperrt oder deaktiviert." });
    }
    if (row.membership_status === "pending" && !ADMIN_ROLES.includes(row.role)) {
      return res.status(403).json({ error: "Dein Zugang wartet noch auf die Bestätigung durch den Verein." });
    }

    const user = publicUser(row);
    res.json({ token: tokenFor(user), user });
  } catch (error) {
    console.error("login", error);
    res.status(500).json({ error: "Anmeldung nicht möglich." });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const row = await one(
      `SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id=u.team_id WHERE u.id=$1`,
      [req.user.id]
    );
    if (!row) return res.status(404).json({ error: "Benutzer nicht gefunden." });
    res.json({ user: publicUser(row) });
  } catch (error) {
    console.error("auth/me", error);
    res.status(500).json({ error: "Benutzer konnte nicht geladen werden." });
  }
});

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    let row = null;
    if (isUuid(payload.id)) row = await one("SELECT id,email,role,account_status FROM users WHERE id=$1", [payload.id]);
    if (!row && payload.email) row = await one("SELECT id,email,role,account_status FROM users WHERE LOWER(email)=LOWER($1)", [clean(payload.email).toLowerCase()]);
    if (row && !["blocked","disabled"].includes(row.account_status)) req.user = row;
  } catch (_) {}
  next();
}

/* TEAMS */
app.get("/api/teams", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id,t.name,t.description,t.created_at,COUNT(p.id)::int AS player_count
       FROM teams t LEFT JOIN players p ON p.team_id=t.id AND p.published=true
       GROUP BY t.id ORDER BY t.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("teams", error);
    res.status(500).json({ error: "Mannschaften konnten nicht geladen werden." });
  }
});

app.get("/api/teams/:id", optionalAuth, async (req, res) => {
  try {
    const team = await one("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!team) return res.status(404).json({ error: "Mannschaft nicht gefunden." });
    const players = await pool.query(
      `SELECT * FROM players WHERE team_id=$1 AND (published=true OR $2::boolean=true) ORDER BY shirt_number NULLS LAST,last_name,first_name`,
      [req.params.id, Boolean(req.user)]
    );
    const posts = await pool.query(
      `SELECT p.id,p.title,p.body,p.created_at,p.team_id,COALESCE(u.alias,u.first_name,'TuRU 1880') AS author_name
       FROM posts p LEFT JOIN users u ON u.id=p.author_id
       WHERE p.team_id=$1 AND p.published=true AND p.approved=true
       ORDER BY p.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ team, players: players.rows, posts: posts.rows });
  } catch (error) {
    console.error("team detail", error);
    res.status(500).json({ error: "Mannschaft konnte nicht geladen werden." });
  }
});

app.put("/api/teams/:id", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const id = requireUuid(req.params.id, "Mannschafts-ID");
    const name = clean(req.body.name);
    const description = clean(req.body.description) || null;
    if (!name) return res.status(400).json({ error: "Name der Mannschaft fehlt." });
    const result = await pool.query("UPDATE teams SET name=$1,description=$2 WHERE id=$3 RETURNING *", [name,description,id]);
    if (!result.rowCount) return res.status(404).json({ error: "Mannschaft nicht gefunden." });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("team update", error);
    if (error.code === "23505") return res.status(409).json({ error: "Diese Mannschaft existiert bereits." });
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Mannschaft konnte nicht geändert werden." });
  }
});

app.delete("/api/teams/:id", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const id = requireUuid(req.params.id, "Mannschafts-ID");
    const result = await pool.query("DELETE FROM teams WHERE id=$1 RETURNING id", [id]);
    if (!result.rowCount) return res.status(404).json({ error: "Mannschaft nicht gefunden." });
    res.json({ ok: true });
  } catch (error) {
    console.error("team delete", error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Mannschaft konnte nicht gelöscht werden." });
  }
});

app.get("/api/teams/:id/manage", auth, async (req, res) => {
  try {
    const teamId = requireUuid(req.params.id, "Mannschafts-ID");
    res.json({ allowed: await canManageTeam(req.user.id, req.user.role, teamId) });
  } catch (error) {
    console.error("team manage", error);
    res.json({ allowed: false });
  }
});

app.post("/api/teams", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const name = clean(req.body.name);
    const description = clean(req.body.description) || null;
    if (!name) return res.status(400).json({ error: "Name der Mannschaft fehlt." });
    const result = await pool.query(
      `INSERT INTO teams(name,description,created_by) VALUES($1,$2,$3) RETURNING *`,
      [name,description,req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Diese Mannschaft existiert bereits." });
    console.error("team create", error);
    res.status(500).json({ error: "Mannschaft konnte nicht angelegt werden." });
  }
});

/* PLAYERS */
app.get("/api/players", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*,t.name AS team_name FROM players p LEFT JOIN teams t ON t.id=p.team_id
       WHERE p.published=true ORDER BY t.name,p.shirt_number NULLS LAST,p.last_name,p.first_name`
    );
    res.json(result.rows.map(p => {
      const birth = p.birth_date ? new Date(p.birth_date) : null;
      let age = null;
      if (birth && !Number.isNaN(birth.getTime())) { const now=new Date(); age=now.getFullYear()-birth.getFullYear(); if (now < new Date(now.getFullYear(),birth.getMonth(),birth.getDate())) age--; }
      const vis = p.profile_visibility?.visibility || "public";
      const filled=[p.alias,p.height_cm,p.nationality,p.strong_foot,p.joined_turu,p.previous_clubs,p.favorite_position,p.role_model,p.favorite_player,p.favorite_team,p.favorite_club,p.football_goal,p.favorite_food,p.favorite_drink,p.favorite_music,p.favorite_movie_series,p.hobby,p.favorite_other_sport,p.favorite_holiday,p.fun_fact,p.about_me,p.about_me_turu].filter(v=>v!==null&&v!==undefined&&String(v).trim()!=="").length;
      return {...p,profile_data:{alias:p.alias||"",height:p.height_cm?`${p.height_cm} cm`:"",age,birthDate:p.birth_date||"",nationality:p.nationality||"",strongFoot:p.strong_foot||"",joinedTuru:p.joined_turu||"",previousClubs:p.previous_clubs||"",favoritePosition:p.favorite_position||"",roleModel:p.role_model||"",favoritePlayer:p.favorite_player||"",favoriteTeam:p.favorite_team||"",favoriteClub:p.favorite_club||"",footballGoal:p.football_goal||"",favoriteFood:p.favorite_food||"",favoriteDrink:p.favorite_drink||"",favoriteMusic:p.favorite_music||"",favoriteMovieSeries:p.favorite_movie_series||"",hobby:p.hobby||"",favoriteOtherSport:p.favorite_other_sport||"",favoriteHoliday:p.favorite_holiday||"",funFact:p.fun_fact||"",aboutMe:p.about_me||"",aboutMeTuru:p.about_me_turu||"",visibility:vis,visibilityLabel:vis==="private"?"Privat":vis==="team"?"Mannschaft & Betreuer":"Öffentlich",profilePercent:Math.round(filled/22*100)}};
    }));
  } catch (error) {
    console.error("players", error);
    res.status(500).json({ error: "Spieler konnten nicht geladen werden." });
  }
});

async function canManageTeam(userId, role, teamId) {
  if (ADMIN_ROLES.includes(role)) return true;
  // Mannschafts-Admins können entweder über team_staff oder über die
  // direkte Mannschaftszuordnung des Benutzers berechtigt sein.
  const row = await one(
    `SELECT 1
       FROM users u
      WHERE u.id=$1
        AND u.team_id=$2
        AND u.role IN ('trainer','team_manager','board')
      UNION ALL
     SELECT 1
       FROM team_staff ts
      WHERE ts.team_id=$2
        AND ts.user_id=$1
        AND ts.staff_role IN ('trainer','team_manager','board')
      LIMIT 1`,
    [userId,teamId]
  );
  return Boolean(row);
}

app.post("/api/teams/:teamId/players", auth, async (req, res) => {
  try {
    const teamId = requireUuid(req.params.teamId, "Mannschafts-ID");
    if (!(await canManageTeam(req.user.id, req.user.role, teamId))) return res.status(403).json({ error: "Keine Berechtigung für diese Mannschaft." });
    const firstName = clean(req.body.firstName);
    const lastName = clean(req.body.lastName);
    if (!firstName) return res.status(400).json({ error: "Vorname des Spielers fehlt." });
    const result = await pool.query(
      `INSERT INTO players(
        team_id,first_name,last_name,alias,shirt_number,position,image_url,published,display_name_mode,
        birth_date,height_cm,nationality,strong_foot,joined_turu,previous_clubs,
        favorite_position,role_model,favorite_player,favorite_team,favorite_club,football_goal,
        favorite_food,favorite_drink,favorite_music,favorite_movie_series,hobby,
        favorite_other_sport,favorite_holiday,fun_fact,about_me,about_me_turu,profile_visibility
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32) RETURNING *`,
      [teamId,firstName,lastName,clean(req.body.alias)||null,clean(req.body.shirtNumber)||null,clean(req.body.position)||"Spieler",clean(req.body.imageUrl)||null,bool(req.body.published,true),["first","alias","full","full_alias"].includes(clean(req.body.displayNameMode))?clean(req.body.displayNameMode):"full",clean(req.body.birthDate)||null,req.body.height?Number(req.body.height):null,clean(req.body.nationality)||null,clean(req.body.strongFoot)||null,clean(req.body.joinedTuru)||null,clean(req.body.previousClubs)||null,clean(req.body.favoritePosition)||null,clean(req.body.roleModel)||null,clean(req.body.favoritePlayer)||null,clean(req.body.favoriteTeam)||null,clean(req.body.favoriteClub)||null,clean(req.body.footballGoal)||null,clean(req.body.favoriteFood)||null,clean(req.body.favoriteDrink)||null,clean(req.body.favoriteMusic)||null,clean(req.body.favoriteMovieSeries)||null,clean(req.body.hobby)||null,clean(req.body.favoriteOtherSport)||null,clean(req.body.favoriteHoliday)||null,clean(req.body.funFact)||null,clean(req.body.aboutMe)||null,clean(req.body.aboutMeTuru)||null,JSON.stringify({visibility:clean(req.body.visibility)||"public"})]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("player create", error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : (error.message || "Spieler konnte nicht gespeichert werden.") });
  }
});

app.put("/api/players/:id", auth, async (req, res) => {
  try {
    const id = requireUuid(req.params.id, "Spieler-ID");
    const old = await one("SELECT * FROM players WHERE id=$1", [id]);
    if (!old) return res.status(404).json({ error: "Spieler nicht gefunden." });
    if (!(await canManageTeam(req.user.id, req.user.role, old.team_id))) return res.status(403).json({ error: "Keine Berechtigung für diesen Spieler." });
    const teamId = clean(req.body.teamId || old.team_id);
    if (!(await canManageTeam(req.user.id, req.user.role, teamId))) return res.status(403).json({ error: "Keine Berechtigung für die Zielmannschaft." });
    const result = await pool.query(
      `UPDATE players SET team_id=$1,first_name=$2,last_name=$3,alias=$4,shirt_number=$5,position=$6,image_url=$7,published=$8,display_name_mode=$10,
       birth_date=$11,height_cm=$12,nationality=$13,strong_foot=$14,joined_turu=$15,previous_clubs=$16,
       favorite_position=$17,role_model=$18,favorite_player=$19,favorite_team=$20,favorite_club=$21,football_goal=$22,
       favorite_food=$23,favorite_drink=$24,favorite_music=$25,favorite_movie_series=$26,hobby=$27,
       favorite_other_sport=$28,favorite_holiday=$29,fun_fact=$30,about_me=$31,about_me_turu=$32,profile_visibility=$33,updated_at=NOW()
       WHERE id=$34 RETURNING *`,
      [teamId,clean(req.body.firstName),clean(req.body.lastName),clean(req.body.alias)||null,clean(req.body.shirtNumber)||null,clean(req.body.position)||"Spieler",clean(req.body.imageUrl)||null,bool(req.body.published,true),["first","alias","full","full_alias"].includes(clean(req.body.displayNameMode))?clean(req.body.displayNameMode):(old.display_name_mode||"full"),clean(req.body.birthDate)||null,req.body.height?Number(req.body.height):null,clean(req.body.nationality)||null,clean(req.body.strongFoot)||null,clean(req.body.joinedTuru)||null,clean(req.body.previousClubs)||null,clean(req.body.favoritePosition)||null,clean(req.body.roleModel)||null,clean(req.body.favoritePlayer)||null,clean(req.body.favoriteTeam)||null,clean(req.body.favoriteClub)||null,clean(req.body.footballGoal)||null,clean(req.body.favoriteFood)||null,clean(req.body.favoriteDrink)||null,clean(req.body.favoriteMusic)||null,clean(req.body.favoriteMovieSeries)||null,clean(req.body.hobby)||null,clean(req.body.favoriteOtherSport)||null,clean(req.body.favoriteHoliday)||null,clean(req.body.funFact)||null,clean(req.body.aboutMe)||null,clean(req.body.aboutMeTuru)||null,JSON.stringify({visibility:clean(req.body.visibility)||"public"}),id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("player update", error);
    res.status(500).json({ error: "Spieler konnte nicht geändert werden." });
  }
});

app.delete("/api/players/:id", auth, async (req, res) => {
  try {
    const id = requireUuid(req.params.id, "Spieler-ID");
    const old = await one("SELECT team_id FROM players WHERE id=$1", [id]);
    if (!old) return res.status(404).json({ error: "Spieler nicht gefunden." });
    if (!(await canManageTeam(req.user.id, req.user.role, old.team_id))) return res.status(403).json({ error: "Keine Berechtigung für diesen Spieler." });
    await pool.query("DELETE FROM players WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("player delete", error);
    res.status(500).json({ error: "Spieler konnte nicht gelöscht werden." });
  }
});

/* KI-HILFE FÜR RECHTSTEXTE – nur Superadmin, Entwurf ohne automatische Veröffentlichung */
app.post("/api/admin/legal/:id/ai", auth, requireRole("superadmin"), async (req,res)=>{
  try {
    if (!GEMINI_API_KEY) return res.status(503).json({error:"KI ist noch nicht eingerichtet. GEMINI_API_KEY im Backend setzen."});
    const id=requireUuid(req.params.id,"Rechtstext-ID");
    const page=await one("SELECT id,slug,title FROM legal_pages WHERE id=$1",[id]);
    if(!page) return res.status(404).json({error:"Rechtstext nicht gefunden."});
    const prompt=String(req.body?.prompt||"").trim().slice(0,4000);
    const facts=String(req.body?.facts||"").trim().slice(0,6000);
    const userPrompt=`Erstelle einen redaktionellen Entwurf für die Rechtstext-Seite „${page.title}" der TuRU 1880 Düsseldorf Vereinsapp.\n\nAnforderungen des Superadmins:\n${prompt||"Erstelle eine klare, gut strukturierte Seite passend zum Titel. Verwende Platzhalter, wenn konkrete Vereins- oder Dienstleisterangaben fehlen."}\n\nBekannte Angaben/Fakten:\n${facts||"Keine zusätzlichen Angaben."}`;
    const system=`Du bist ein redaktioneller Assistent für Vereins-Rechtstexte. Erstelle ausschließlich einen ENTWURF auf Deutsch. Behaupte nicht, dass der Text rechtlich geprüft, vollständig oder abmahnsicher ist. Erfinde keine Registerdaten, Adressen, Verantwortliche, Rechtsgrundlagen, Dienstleister oder Vertragsdetails. Fehlende Angaben als [BITTE EINTRAGEN] markieren. Verwende klare Überschriften und Absätze. Gib nur den fertigen Entwurf als reinen Text zurück, ohne Markdown-Codeblock.`;
    const models=[GEMINI_MODEL,"gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash","gemini-3.1-flash-lite"].filter((m,i,a)=>m&&a.indexOf(m)===i);
    let raw="",lastErr="";
    for(const model of models){
      try{
        const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:userPrompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:6000}})});
        const data=await r.json().catch(()=>({}));
        if(!r.ok){lastErr=data?.error?.message||`HTTP ${r.status}`;continue;}
        raw=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim()||"";
        if(raw)break;
      }catch(e){lastErr=e.message||String(e);}
    }
    if(!raw) return res.status(502).json({error:lastErr||"KI konnte keinen Entwurf erstellen."});
    res.json({ok:true,body:raw});
  }catch(error){console.error("legal AI",error);res.status(error.statusCode||500).json({error:error.statusCode?error.message:"KI-Rechtstext konnte nicht erstellt werden."});}
});

/* KI-REDAKTION – Google Gemini */
const aiRate = new Map();
app.post("/api/ai/generate", auth, requireRole(...CONTENT_ROLES), async (req, res) => {
  try {
    if (!GEMINI_API_KEY) return res.status(503).json({ error: "KI ist noch nicht eingerichtet. GEMINI_API_KEY im Backend setzen." });
    const now=Date.now();
    const key=String(req.user.id);
    const bucket=aiRate.get(key)||{start:now,count:0};
    if(now-bucket.start>60*60*1000){bucket.start=now;bucket.count=0;}
    if(bucket.count>=20)return res.status(429).json({error:"KI-Limit erreicht. Bitte später erneut versuchen."});
    bucket.count++; aiRate.set(key,bucket);
    const { type="Nachricht", contentType="nachricht", section="", team="", opponent="", date="", result="", topic="", length="mittel", scorers="", cards="", lineup="", events="", coachComment="", notes="" } = req.body || {};
    for (const [name,value,max] of [["section",section,160],["team",team,120],["opponent",opponent,120],["topic",topic,600],["scorers",scorers,1200],["cards",cards,1200],["lineup",lineup,1800],["events",events,5000],["coachComment",coachComment,2500],["notes",notes,5000]]) {
      if(String(value??"").length>max)return res.status(400).json({error:`Das Feld ${name} ist zu lang.`});
    }
    const isMatch = String(contentType||type||"").toLowerCase().includes("spielbericht") || String(type||"").toLowerCase().includes("spielbericht");
    const user = `Erstelle einen Entwurf für die TuRU 1880 Düsseldorf.
Beitragsart: ${type}
Technischer Typ: ${contentType}
Bereich: ${section}
${isMatch ? `Mannschaft: ${team}\nGegner: ${opponent}\nDatum: ${date}\nErgebnis: ${result}\nTorschützen / wichtige Spieler: ${scorers}\nKarten: ${cards}\nAufstellung: ${lineup}\nSpielverlauf / Ereignisse: ${events}\nTrainerstimme: ${coachComment}` : `Für diese Beitragsart KEINE Spielbericht-Struktur verwenden. Es handelt sich nicht um einen Spielbericht. Keine Pflichtfelder für Mannschaft, Gegner, Ergebnis oder Torschützen ergänzen. Inhalt / Stichpunkte: ${notes}`}
Thema: ${topic}
Länge: ${length}
Weitere Fakten: ${notes}`;
    const system = `Du bist der redaktionelle KI-Assistent von TuRU 1880 Düsseldorf. Schreibe sachlich, positiv und vereinsnah auf Deutsch. Unterscheide strikt nach Beitragsart. Bei Nachricht, Info, Mitteilung, Vereinsnachricht, Jugendbericht, Sponsoren-/Partnernachricht, Veranstaltung/Event oder Social-Media-Beitrag darfst du KEINE erfundenen Spielbericht-Felder einbauen und nicht automatisch Mannschaft, Gegner, Ergebnis oder Torschützen nennen. Nur bei Beitragsart Spielbericht darfst du eine klassische Spielberichtsstruktur verwenden. Verwende ausschließlich Informationen aus den gelieferten Daten. Erfinde keine Spieler, Tore, Ergebnisse, Zitate, Termine oder Fakten. Wenn Angaben fehlen, formuliere neutral oder lasse sie weg. Erstelle einen direkt bearbeitbaren Entwurf, aber veröffentliche niemals selbst. Gib ausschließlich gültiges JSON mit den Feldern title, excerpt, body, social, push zurück. body darf Absätze mit Leerzeilen enthalten. social ist ein kurzer Social-Media-Text, push maximal 180 Zeichen.`;
    const payload = {contents:[{role:"user",parts:[{text:`${system}\n\n${user}`}]}],generationConfig:{responseMimeType:"application/json",temperature:0.6,maxOutputTokens:1800}};
    const models = [GEMINI_MODEL,"gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash","gemini-3.1-flash-lite"].filter((m,i,a)=>m && a.indexOf(m)===i);
    let r=null, data={}, usedModel=null;
    for (const model of models) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
      });
      data = await r.json().catch(()=>({}));
      if (r.ok) { usedModel=model; break; }
      const code=Number(r.status);
      const retryable=code===429 || code===500 || code===502 || code===503 || /high demand|overloaded|temporar|capacity|rate limit/i.test(String(data?.error?.message||""));
      if (!retryable) break;
    }
    if(!r?.ok) return res.status(502).json({error:data?.error?.message||"Gemini-KI-Anfrage fehlgeschlagen."});
    const raw = data?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim();
    let draft;
    try { draft = JSON.parse(raw); } catch { return res.status(502).json({error:"Die KI hat kein gültiges JSON geliefert."}); }
    if(!draft?.title || !draft?.body) return res.status(502).json({error:"Die KI hat keinen gültigen Beitragsentwurf geliefert."});
    res.json({title:limitText(draft.title,220),excerpt:limitText(draft.excerpt,500),body:limitText(draft.body,12000),social:limitText(draft.social,2500),push:limitText(draft.push,180),model:usedModel||GEMINI_MODEL});
  } catch(e) {
    console.error("KI-Entwurf Fehler:", e);
    res.status(500).json({error:"KI-Entwurf konnte nicht erstellt werden."});
  }
});

/* NEWS */
app.get("/api/posts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id,p.title,p.body,p.image_url,p.link_url,p.page_slug,p.created_at,p.updated_at,p.team_id,p.published,p.social_requested,p.approved,p.home_featured,p.review_at,p.chronology_date,p.fixed_position,p.is_fixed,p.content_type,p.show_in_news,
              COALESCE(u.alias,u.first_name,'TuRU 1880') AS author_name,t.name AS team_name
       FROM posts p LEFT JOIN users u ON u.id=p.author_id LEFT JOIN teams t ON t.id=p.team_id
       WHERE p.published=true AND p.approved=true AND COALESCE(p.archived,false)=false
         AND ($1::text IS NULL OR p.page_slug=$1 OR ($1='news' AND p.page_slug IS NULL))
         AND ($1::text <> 'news' OR COALESCE(p.show_in_news,true)=true)
       ORDER BY p.created_at DESC LIMIT 100`
    , [req.query.pageSlug ? clean(req.query.pageSlug) : null]);
    res.json(result.rows);
  } catch (error) {
    console.error("posts", error);
    res.status(500).json({ error: "News konnten nicht geladen werden." });
  }
});

app.post("/api/posts", auth, requireRole(...CONTENT_ROLES), async (req, res) => {
  try {
    const title = clean(req.body.title);
    const body = clean(req.body.body);
    const teamId = req.body.teamId ? clean(req.body.teamId) : null;
    const pageSlug = req.body.pageSlug ? clean(req.body.pageSlug) : null;
    const published = bool(req.body.published ?? req.body.publishRequested, true);
    const social = bool(req.body.socialPublishRequested ?? req.body.socialRequested, false);
    const contentType = clean(req.body.contentType || req.body.content_type || "nachricht") || "nachricht";
    const showInNews = bool(req.body.showInNews ?? req.body.show_in_news, true);
    if (!title || !body) return res.status(400).json({ error: "Titel und Bericht sind erforderlich." });

    if (teamId && !(await canManageTeam(req.user.id, req.user.role, teamId))) {
      return res.status(403).json({ error: "Du bist für diese Mannschaft nicht freigeschaltet." });
    }

    const approved = ADMIN_ROLES.includes(req.user.role) || published;
    const result = await pool.query(
      `INSERT INTO posts(title,body,author_id,team_id,image_url,link_url,page_slug,published,social_requested,approved,archived,home_featured,review_at,chronology_date,fixed_position,is_fixed,content_type,show_in_news,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW()) RETURNING *`,
      [title,body,req.user.id,teamId,clean(req.body.imageUrl ?? req.body.image_url)||null,clean(req.body.linkUrl ?? req.body.link_url)||null,pageSlug,published,social,approved,bool(req.body.archived,false),bool(req.body.homeFeatured,false),req.body.reviewAt?new Date(req.body.reviewAt):null,req.body.chronologyDate?new Date(req.body.chronologyDate):null,req.body.fixedPosition?Math.max(1,parseInt(req.body.fixedPosition,10)||1):null,bool(req.body.isFixed,false),contentType,showInNews]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("post create", error);
    res.status(500).json({ error: "Beitrag konnte nicht gespeichert werden." });
  }
});

app.put("/api/posts/:id", auth, requireRole(...CONTENT_ROLES), async (req, res) => {
  try {
    const id = requireUuid(req.params.id, "Beitrags-ID");
    const existing = await one("SELECT * FROM posts WHERE id=$1", [id]);
    if (!existing) return res.status(404).json({ error: "Beitrag nicht gefunden." });
    const title = clean(req.body.title);
    const body = clean(req.body.body ?? req.body.content);
    const teamId = req.body.teamId ? clean(req.body.teamId) : existing.team_id;
    const pageSlug = req.body.pageSlug !== undefined ? (req.body.pageSlug ? clean(req.body.pageSlug) : null) : existing.page_slug;
    const published = bool(req.body.published ?? req.body.publishRequested, existing.published);
    const social = bool(req.body.socialPublishRequested ?? req.body.socialRequested, existing.social_requested);
    const contentType = req.body.contentType !== undefined ? (clean(req.body.contentType || "nachricht") || "nachricht") : (existing.content_type || "nachricht");
    const showInNews = req.body.showInNews !== undefined || req.body.show_in_news !== undefined ? bool(req.body.showInNews ?? req.body.show_in_news, true) : (existing.show_in_news !== false);
    if (!title || !body) return res.status(400).json({ error: "Titel und Bericht sind erforderlich." });
    // Beim Bearbeiten eines bestehenden Beitrags darf die vorhandene Mannschaftszuordnung
    // unverändert bleiben. Die Mannschaftsberechtigung wird nur geprüft, wenn der Client
    // die Team-Zuordnung ausdrücklich ändern möchte. Das ist wichtig für ältere Beiträge,
    // die bereits einer Mannschaft zugeordnet sind und von einem Seiten-/Content-Admin
    // bearbeitet werden sollen.
    if (req.body.teamId !== undefined && teamId && !(await canManageTeam(req.user.id, req.user.role, teamId))) {
      return res.status(403).json({ error: "Du bist für diese Mannschaft nicht freigeschaltet." });
    }
    const approved = ADMIN_ROLES.includes(req.user.role) ? bool(req.body.approved, existing.approved) : existing.approved;
    const result = await pool.query(
      `UPDATE posts SET title=$1,body=$2,team_id=$3,image_url=$4,link_url=$5,page_slug=$6,published=$7,social_requested=$8,approved=$9,archived=$10,home_featured=$11,review_at=$12,chronology_date=$13,fixed_position=$14,is_fixed=$15,content_type=$16,show_in_news=$17,updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [title,body,teamId,clean(req.body.imageUrl ?? req.body.image_url)||null,clean(req.body.linkUrl ?? req.body.link_url)||null,pageSlug,published,social,approved,bool(req.body.archived,existing.archived),bool(req.body.homeFeatured,existing.home_featured),req.body.reviewAt?new Date(req.body.reviewAt):existing.review_at,req.body.chronologyDate?new Date(req.body.chronologyDate):existing.chronology_date,req.body.fixedPosition!==undefined?(req.body.fixedPosition?Math.max(1,parseInt(req.body.fixedPosition,10)||1):null):existing.fixed_position,req.body.isFixed!==undefined?bool(req.body.isFixed,false):existing.is_fixed,contentType,showInNews,id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("post update", error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Beitrag konnte nicht geändert werden." });
  }
});

app.patch("/api/admin/posts/:id/archive", auth, requireRole(...CONTENT_ROLES), async (req,res)=>{
  try{
    const id=requireUuid(req.params.id,"Beitrags-ID");
    const archived=bool(req.body.archived,true);
    const result=await pool.query("UPDATE posts SET archived=$1,updated_at=NOW() WHERE id=$2 RETURNING *",[archived,id]);
    if(!result.rowCount)return res.status(404).json({error:"Beitrag nicht gefunden."});
    res.json(result.rows[0]);
  }catch(error){console.error("post archive",error);res.status(error.statusCode||500).json({error:error.statusCode?error.message:"Beitrag konnte nicht archiviert werden."});}
});

app.delete("/api/posts/:id", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const id = requireUuid(req.params.id, "Beitrags-ID");
    const result = await pool.query("DELETE FROM posts WHERE id=$1 RETURNING id", [id]);
    if (!result.rowCount) return res.status(404).json({ error: "Beitrag nicht gefunden." });
    res.json({ ok: true });
  } catch (error) {
    console.error("post delete", error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Beitrag konnte nicht gelöscht werden." });
  }
});

app.post("/api/admin/posts/:id/publish", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const id = requireUuid(req.params.id, "Beitrags-ID");
    const result = await pool.query(
      "UPDATE posts SET approved=true,published=true,updated_at=NOW() WHERE id=$1 RETURNING *", [id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Beitrag nicht gefunden." });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("post publish", error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Beitrag konnte nicht veröffentlicht werden." });
  }
});

app.get("/api/admin/posts/pending", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const result = await pool.query(
    `SELECT p.*,COALESCE(u.alias,u.first_name,'TuRU') AS author_name FROM posts p
     LEFT JOIN users u ON u.id=p.author_id WHERE p.approved=false ORDER BY p.created_at DESC`
  );
  res.json(result.rows);
});

app.post("/api/admin/posts/:id/approve", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const result = await pool.query("UPDATE posts SET approved=true,published=true WHERE id=$1 RETURNING *", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Beitrag nicht gefunden." });
  res.json(result.rows[0]);
});

/* FANBEREICH */
app.get("/api/fans/posts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id,f.title,COALESCE(NULLIF(f.body,''),f.content,'') AS body,
              f.image_url,f.link_url,f.created_at,f.updated_at,f.approved,
              f.published,f.status,f.visibility,
              COALESCE(u.alias,u.first_name,'Fan') AS author_name
       FROM fan_posts f LEFT JOIN users u ON u.id=f.user_id
       WHERE f.approved=true AND COALESCE(f.published,true)=true
       ORDER BY f.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("fan posts", error);
    res.status(500).json({ error: "Fanbeiträge konnten nicht geladen werden." });
  }
});

app.get("/api/fans/posts/mine", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*,COALESCE(NULLIF(f.body,''),f.content,'') AS content_for_edit
       FROM fan_posts f WHERE f.user_id=$1 ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("fan posts mine", error);
    res.status(500).json({ error: "Eigene Fanbeiträge konnten nicht geladen werden." });
  }
});

app.post("/api/fans/posts", auth, async (req, res) => {
  try {
    const title = clean(req.body.title);
    const body = clean(req.body.body ?? req.body.content);
    const imageUrl = clean(req.body.imageUrl ?? req.body.image_url) || null;
    const linkUrl = clean(req.body.linkUrl ?? req.body.link_url) || null;
    if (!title || !body) return res.status(400).json({ error: "Titel und Beitrag sind erforderlich." });

    const result = await pool.query(
      `INSERT INTO fan_posts(title,body,content,user_id,approved,published,status,publish_requested,image_url,link_url,updated_at)
       VALUES($1,$2,$2,$3,true,true,'published',false,$4,$5,NOW()) RETURNING *`,
      [title,body,req.user.id,imageUrl,linkUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("fan post create", error);
    res.status(500).json({ error: "Fanbeitrag konnte nicht gespeichert werden." });
  }
});

app.put("/api/fans/posts/:id", auth, async (req, res) => {
  try {
    const existing = await one("SELECT * FROM fan_posts WHERE id=$1", [req.params.id]);
    if (!existing) return res.status(404).json({ error: "Fanbeitrag nicht gefunden." });
    if (String(existing.user_id) !== String(req.user.id) && !ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: "Keine Berechtigung." });
    }
    const title = clean(req.body.title);
    const body = clean(req.body.body ?? req.body.content);
    if (!title || !body) return res.status(400).json({ error: "Titel und Beitrag sind erforderlich." });
    const result = await pool.query(
      `UPDATE fan_posts SET title=$1,body=$2,content=$2,image_url=$3,link_url=$4,updated_at=NOW() WHERE id=$5 RETURNING *`,
      [title,body,clean(req.body.imageUrl ?? req.body.image_url)||null,clean(req.body.linkUrl ?? req.body.link_url)||null,req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("fan post update", error);
    res.status(500).json({ error: "Fanbeitrag konnte nicht geändert werden." });
  }
});

app.delete("/api/fans/posts/:id", auth, async (req, res) => {
  try {
    const existing = await one("SELECT user_id FROM fan_posts WHERE id=$1", [req.params.id]);
    if (!existing) return res.status(404).json({ error: "Fanbeitrag nicht gefunden." });
    if (String(existing.user_id) !== String(req.user.id) && !ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: "Keine Berechtigung." });
    }
    await pool.query("DELETE FROM fan_posts WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("fan post delete", error);
    res.status(500).json({ error: "Fanbeitrag konnte nicht gelöscht werden." });
  }
});

app.get("/api/fans/vote", async (req, res) => {
  try {
    const vote = await one(
      `SELECT v.id,v.question,v.option_a,v.option_b,
              COUNT(e.*) FILTER (WHERE e.choice='a')::int AS votes_a,
              COUNT(e.*) FILTER (WHERE e.choice='b')::int AS votes_b
       FROM fan_votes v LEFT JOIN fan_vote_entries e ON e.vote_id=v.id
       WHERE v.active=true GROUP BY v.id ORDER BY v.created_at DESC LIMIT 1`
    );
    res.json(vote ? {
      id: vote.id, question: vote.question, option_a: vote.option_a, option_b: vote.option_b,
      votes_a: vote.votes_a || 0, votes_b: vote.votes_b || 0
    } : null);
  } catch (error) {
    console.error("vote", error);
    res.status(500).json({ error: "Abstimmung konnte nicht geladen werden." });
  }
});

app.post("/api/fans/vote/:id", auth, async (req, res) => {
  const choice = clean(req.body.choice).toLowerCase();
  const voteId = clean(req.params.id);
  if (!["a","b"].includes(choice)) return res.status(400).json({ error: "Ungültige Auswahl." });
  try {
    await pool.query(
      `INSERT INTO fan_vote_entries(vote_id,user_id,choice) VALUES($1,$2,$3)`,
      [voteId,req.user.id,choice]
    );
    res.json({ ok: true });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Du hast bereits abgestimmt." });
    console.error("vote save", error);
    res.status(500).json({ error: "Stimme konnte nicht gespeichert werden." });
  }
});

/* Matchcenter-Erweiterungen fuer bestehende Installationen */

async function removeAllPlayersOnce(){
  await pool.query(`CREATE TABLE IF NOT EXISTS app_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const r = await pool.query(
    `INSERT INTO app_migrations(name) VALUES ('remove-all-sample-players-2026-10-02')
     ON CONFLICT (name) DO NOTHING RETURNING name`
  );
  if (r.rowCount) {
    const result = await pool.query('DELETE FROM players');
    console.log(`Musterspieler-Bereinigung: ${result.rowCount} Spieler gelöscht.`);
  }
}

async function ensureMatchesSchema(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
      opponent TEXT,
      guest_team TEXT,
      match_date TIMESTAMPTZ,
      venue TEXT,
      competition TEXT,
      home_away TEXT DEFAULT 'home',
      status TEXT DEFAULT 'planned',
      result TEXT,
      fupa_url TEXT,
      source TEXT DEFAULT 'manual',
      show_on_home BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS opponent TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS guest_team TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS opponent_logo_url TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_date TIMESTAMPTZ;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS venue TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_away TEXT DEFAULT 'home';
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planned';
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS result TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS fupa_url TEXT;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN DEFAULT TRUE;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
}
(async()=>{
  try {
    await ensureMatchesSchema();
    await removeAllPlayersOnce();
  } catch(e){
    console.error('startup migration',e);
  }
})();

/* MATCHES / EVENTS / PARTNERS */
app.get("/api/matches", async (req, res) => {
  try {
    await ensureMatchesSchema();
    const teamId = clean(req.query.teamId) || null;
    if (teamId && !isUuid(teamId)) return res.status(400).json({error:'Mannschaft-ID ist ungültig.'});
    const result = await pool.query(
      `SELECT m.*,t.name AS team_name FROM matches m LEFT JOIN teams t ON t.id=m.team_id
       WHERE ($1::uuid IS NULL OR m.team_id=$1::uuid)
       ORDER BY m.match_date ASC NULLS LAST LIMIT 200`, [teamId]
    );
    res.json(result.rows);
  } catch(e){ console.error('match list',e); res.status(500).json({error:'Spiele konnten nicht geladen werden.'}); }
});

async function canManageMatchTeam(userId, role, teamId) {
  return canManageTeam(userId, role, teamId);
}

app.post("/api/admin/matches", auth, async (req, res) => {
  const b=req.body||{};
  const teamId=clean(b.teamId)||null;
  try {
    await ensureMatchesSchema();
    if(teamId && !isUuid(teamId)) return res.status(400).json({error:'Mannschaft-ID ist ungültig.'});
    if(!(await canManageMatchTeam(req.user.id, req.user.role, teamId))) return res.status(403).json({error:'Du kannst nur Spiele deiner zugewiesenen Mannschaft verwalten.'});
    if(!clean(b.opponent)) return res.status(400).json({error:'Bitte einen Gegner eintragen.'});
    const r=await pool.query(`INSERT INTO matches(team_id,opponent,guest_team,opponent_logo_url,match_date,venue,competition,home_away,status,result,fupa_url,source,show_on_home) VALUES($1,$2,$3,$4,$5::timestamp AT TIME ZONE 'Europe/Berlin',$6,$7,$8,$9,$10,$11,'manual',$12) RETURNING *`,[teamId,clean(b.opponent),clean(b.opponent),clean(b.opponentLogoUrl),b.matchDate||null,clean(b.venue),clean(b.competition),clean(b.homeAway)||'home',clean(b.status)||'planned',clean(b.result),clean(b.fupaUrl),b.showOnHome!==false]);
    res.status(201).json(r.rows[0]);
  } catch(e){ console.error('match create',e); res.status(500).json({error:`Spiel konnte nicht gespeichert werden${e?.message?`: ${e.message}`:''}.`}); }
});

app.put("/api/admin/matches/:id", auth, async (req, res) => {
  const b=req.body||{};
  try {
    await ensureMatchesSchema();
    const id=requireUuid(req.params.id,'Spiel-ID');
    const old=await one(`SELECT team_id FROM matches WHERE id=$1`,[id]);
    if(!old) return res.status(404).json({error:'Spiel nicht gefunden.'});
    const teamId=clean(b.teamId)||null;
    if(teamId && !isUuid(teamId)) return res.status(400).json({error:'Mannschaft-ID ist ungültig.'});
    if(!(await canManageMatchTeam(req.user.id, req.user.role, old.team_id)) || !(await canManageMatchTeam(req.user.id, req.user.role, teamId))) return res.status(403).json({error:'Du kannst nur Spiele deiner zugewiesenen Mannschaft verwalten.'});
    const r=await pool.query(`UPDATE matches SET team_id=$1,opponent=$2,guest_team=$2,opponent_logo_url=$3,match_date=$4::timestamp AT TIME ZONE 'Europe/Berlin',venue=$5,competition=$6,home_away=$7,status=$8,result=$9,fupa_url=$10,show_on_home=$11,source='manual' WHERE id=$12 RETURNING *`,[teamId,clean(b.opponent),clean(b.opponentLogoUrl),b.matchDate||null,clean(b.venue),clean(b.competition),clean(b.homeAway)||'home',clean(b.status)||'planned',clean(b.result),clean(b.fupaUrl),b.showOnHome!==false,id]);
    res.json(r.rows[0]);
  } catch(e){ console.error('match update',e); res.status(500).json({error:`Spiel konnte nicht gespeichert werden${e?.message?`: ${e.message}`:''}.`}); }
});

app.delete("/api/admin/matches/:id", auth, async (req, res) => {
  try {
    const id=requireUuid(req.params.id,'Spiel-ID');
    const old=await one(`SELECT team_id FROM matches WHERE id=$1`,[id]);
    if(!old) return res.status(404).json({error:'Spiel nicht gefunden.'});
    if(!(await canManageMatchTeam(req.user.id, req.user.role, old.team_id))) return res.status(403).json({error:'Du kannst nur Spiele deiner zugewiesenen Mannschaft verwalten.'});
    await pool.query('DELETE FROM matches WHERE id=$1',[id]);
    res.json({ok:true});
  } catch(e){ console.error('match delete',e); res.status(500).json({error:'Spiel konnte nicht gelöscht werden.'}); }
});

app.get("/api/events", async (req, res) => {
  const result = await pool.query("SELECT * FROM events ORDER BY event_date ASC NULLS LAST LIMIT 100");
  res.json(result.rows);
});

app.get("/api/sponsors", async (req, res) => {
  const result = await pool.query("SELECT * FROM sponsors WHERE active=true ORDER BY level,name");
  res.json(result.rows);
});

app.get("/api/vouchers", async (req, res) => {
  const result = await pool.query(
    `SELECT v.*,s.name AS sponsor_name FROM vouchers v LEFT JOIN sponsors s ON s.id=v.sponsor_id
     WHERE v.active=true ORDER BY v.valid_until ASC NULLS LAST,v.created_at DESC`
  );
  res.json(result.rows);
});

/* MEIN TuRU */
app.get("/api/me/dashboard", auth, async (req, res) => {
  const row = await one(
    `SELECT u.*,t.name AS team_name FROM users u LEFT JOIN teams t ON t.id=u.team_id WHERE u.id=$1`,
    [req.user.id]
  );
  if (!row) return res.status(404).json({ error: "Benutzer nicht gefunden." });
  const typeLabels = { active: "Aktives Mitglied", passive: "Passives Mitglied", fan: "Fan" };
  const statusLabels = { pending: "Wartet auf Bestätigung", approved: "Bestätigt", rejected: "Abgelehnt" };
  res.json({
    membershipTypeLabel: typeLabels[row.membership_type] || row.membership_type,
    membershipStatusLabel: statusLabels[row.membership_status] || row.membership_status,
    requestedTeamName: row.team_name || null,
    membershipNumber: row.membership_number || null
  });
});

/* MESSAGES */
app.get("/api/me/messages", auth, async (req, res) => {
  const result = await pool.query(
    `SELECT m.id,m.title,m.body,m.created_at,mr.read_at
     FROM message_recipients mr JOIN messages m ON m.id=mr.message_id
     WHERE mr.user_id=$1 ORDER BY m.created_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json(result.rows);
});

app.get("/api/me/messages/unread-count", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM message_recipients WHERE user_id=$1 AND read_at IS NULL",
    [req.user.id]
  );
  res.json({ count: result.rows[0]?.count || 0 });
});

app.patch("/api/me/messages/:id/read", auth, async (req, res) => {
  const result = await pool.query(
    "UPDATE message_recipients SET read_at=COALESCE(read_at,NOW()) WHERE message_id=$1 AND user_id=$2 RETURNING *",
    [req.params.id,req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Nachricht nicht gefunden." });
  res.json({ ok: true });
});

/* PUSH-BENACHRICHTIGUNGEN */
app.get("/api/push/public-key", auth, async (req, res) => {
  res.json({ enabled: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY), publicKey: VAPID_PUBLIC_KEY || null });
});

app.post("/api/push/subscribe", auth, async (req, res) => {
  const sub = req.body || {};
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return res.status(400).json({ error: "Ungültige Push-Subscription." });
  await pool.query(
    `INSERT INTO push_subscriptions(user_id,endpoint,subscription,updated_at) VALUES($1,$2,$3::jsonb,NOW())
     ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription,updated_at=NOW()`,
    [req.user.id, sub.endpoint, JSON.stringify(sub)]
  );
  res.json({ ok: true });
});

app.delete("/api/push/subscribe", auth, async (req, res) => {
  if (req.body?.endpoint) await pool.query("DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2", [req.user.id, req.body.endpoint]);
  res.json({ ok: true });
});

/* ADMIN – MEMBERS */
app.get("/api/admin/members", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const result = await pool.query(
    `SELECT u.id,u.first_name,u.last_name,u.alias,u.email,u.role,u.membership_type,u.membership_status,
            u.account_status,u.membership_number,u.team_id,u.created_at,t.name AS team_name
     FROM users u LEFT JOIN teams t ON t.id=u.team_id ORDER BY LOWER(u.last_name),LOWER(u.first_name)`
  );
  res.json(result.rows);
});

app.patch("/api/admin/members/:id", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET first_name=$1,last_name=$2,alias=$3,email=$4,membership_type=$5,
       membership_number=$6,team_id=$7,account_status=$8 WHERE id=$9
       RETURNING id,first_name,last_name,alias,email,role,membership_type,membership_status,account_status,membership_number,team_id`,
      [clean(req.body.firstName),clean(req.body.lastName),clean(req.body.alias)||null,clean(req.body.email).toLowerCase(),
       clean(req.body.membershipType)||"fan",clean(req.body.membershipNumber)||null,req.body.teamId||null,clean(req.body.accountStatus)||"active",req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Mitglied nicht gefunden." });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Diese E-Mail-Adresse ist bereits vergeben." });
    console.error("member update", error);
    res.status(500).json({ error: "Mitglied konnte nicht gespeichert werden." });
  }
});

app.post("/api/admin/members/:id/status", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const allowed = ["active","inactive","blocked","disabled","archived"];
  const status = clean(req.body.status);
  if (!allowed.includes(status)) return res.status(400).json({ error: "Ungültiger Zugangsstatus." });
  const result = await pool.query(
    "UPDATE users SET account_status=$1 WHERE id=$2 RETURNING id,account_status",
    [status,req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Mitglied nicht gefunden." });
  res.json(result.rows[0]);
});

/* ADMIN – MEMBERSHIP REQUESTS */
app.get("/api/admin/memberships", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const result = await pool.query(
    `SELECT r.*,t.name AS requested_team_name FROM membership_requests r
     LEFT JOIN teams t ON t.id=r.requested_team_id ORDER BY r.created_at DESC`
  );
  res.json(result.rows);
});

app.post("/api/admin/memberships/:id/decide", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const decision = clean(req.body.decision);
  if (!["approve","reject"].includes(decision)) return res.status(400).json({ error: "Ungültige Entscheidung." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = (await client.query("SELECT * FROM membership_requests WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
    if (!request) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Mitgliedsantrag nicht gefunden." }); }
    const status = decision === "approve" ? "approved" : "rejected";
    await client.query("UPDATE membership_requests SET status=$1,decided_at=NOW() WHERE id=$2", [status,req.params.id]);
    if (request.user_id) {
      await client.query(
        "UPDATE users SET membership_status=$1,account_status='active' WHERE id=$2",
        [status,request.user_id]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, status });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("membership decide", error);
    res.status(500).json({ error: "Mitgliedsantrag konnte nicht bearbeitet werden." });
  } finally {
    client.release();
  }
});



/* LEGAL PAGES */
app.get("/api/legal", async (req,res)=>{
  try {
    const result=await pool.query(`SELECT id,slug,title,body,published,updated_at FROM legal_pages WHERE published=true ORDER BY created_at`);
    res.json(result.rows);
  } catch(error) { console.error("legal",error); res.status(500).json({error:"Rechtstexte konnten nicht geladen werden."}); }
});

app.get("/api/admin/legal", auth, requireRole("superadmin"), async (req,res)=>{
  try {
    const result=await pool.query(`SELECT id,slug,title,body,published,updated_at,created_at FROM legal_pages ORDER BY created_at`);
    res.json(result.rows);
  } catch(error) { console.error("admin legal",error); res.status(500).json({error:"Rechtstexte konnten nicht geladen werden."}); }
});

app.patch("/api/admin/legal/:id", auth, requireRole("superadmin"), async (req,res)=>{
  try {
    const id=requireUuid(req.params.id,"Rechtstext-ID");
    const title=limitText(req.body.title,200);
    const body=String(req.body.body ?? "").trim();
    if(!title) return res.status(400).json({error:"Titel ist erforderlich."});
    const result=await pool.query(`UPDATE legal_pages SET title=$1,body=$2,published=$3,updated_at=NOW() WHERE id=$4 RETURNING id,slug,title,body,published,updated_at,created_at`,[title,body,bool(req.body.published,true),id]);
    if(!result.rowCount)return res.status(404).json({error:"Rechtstext nicht gefunden."});
    res.json(result.rows[0]);
  } catch(error) { console.error("admin legal update",error); res.status(error.statusCode||500).json({error:error.statusCode?error.message:"Rechtstext konnte nicht gespeichert werden."}); }
});

/* EDITABLE PAGES / NAVIGATION */
app.get("/api/pages", async (req,res)=>{
  try{
    const result=await pool.query(`SELECT id,slug,nav_label,title,lead,body,image_url,link_url,nav_visible,published,archived,is_system,sort_order,home_featured,social_requested,review_at,updated_at FROM site_pages WHERE published=true AND archived=false ORDER BY sort_order,nav_label`);
    res.json(result.rows);
  }catch(error){console.error("pages",error);res.status(500).json({error:"Seiten konnten nicht geladen werden."});}
});

app.get("/api/admin/pages", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try{const result=await pool.query(`SELECT * FROM site_pages ORDER BY sort_order,nav_label`);res.json(result.rows);}
  catch(error){console.error("admin pages",error);res.status(500).json({error:"Seiten konnten nicht geladen werden."});}
});

app.post("/api/admin/pages", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try{
    const label=clean(req.body.navLabel||req.body.title);
    const slug=clean(req.body.slug||label.toLowerCase().replace(/[^a-z0-9äöüß]+/gi,"-").replace(/^-|-$/g,"")).replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss");
    if(!label||!slug)return res.status(400).json({error:"Reitername und Seitenkennung sind erforderlich."});
    const result=await pool.query(`INSERT INTO site_pages(slug,nav_label,title,lead,body,image_url,link_url,nav_visible,published,archived,is_system,sort_order,home_featured,social_requested,review_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13,$14) RETURNING *`,[slug,label,clean(req.body.title)||label,clean(req.body.lead),clean(req.body.body),clean(req.body.imageUrl)||null,clean(req.body.linkUrl)||null,bool(req.body.navVisible,true),bool(req.body.published,true),bool(req.body.archived,false),Number(req.body.sortOrder||100),bool(req.body.homeFeatured,false),bool(req.body.socialRequested,false),req.body.reviewAt?new Date(req.body.reviewAt):null]);
    res.status(201).json(result.rows[0]);
  }catch(error){if(error.code==="23505")return res.status(409).json({error:"Diese Seitenkennung existiert bereits."});console.error("admin page create",error);res.status(500).json({error:"Seite konnte nicht angelegt werden."});}
});

app.patch("/api/admin/pages/:id", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try{
    const id=requireUuid(req.params.id,"Seiten-ID");
    const result=await pool.query(`UPDATE site_pages SET nav_label=$1,title=$2,lead=$3,body=$4,image_url=$5,link_url=$6,nav_visible=$7,published=$8,archived=$9,sort_order=$10,home_featured=$11,social_requested=$12,review_at=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,[clean(req.body.navLabel),clean(req.body.title),clean(req.body.lead),clean(req.body.body),clean(req.body.imageUrl)||null,clean(req.body.linkUrl)||null,bool(req.body.navVisible,true),bool(req.body.published,true),bool(req.body.archived,false),Number(req.body.sortOrder||100),bool(req.body.homeFeatured,false),bool(req.body.socialRequested,false),req.body.reviewAt?new Date(req.body.reviewAt):null,id]);
    if(!result.rowCount)return res.status(404).json({error:"Seite nicht gefunden."});
    res.json(result.rows[0]);
  }catch(error){console.error("admin page update",error);res.status(error.statusCode||500).json({error:error.statusCode?error.message:"Seite konnte nicht geändert werden."});}
});

app.delete("/api/admin/pages/:id", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try{const id=requireUuid(req.params.id,"Seiten-ID");const row=await one("SELECT is_system FROM site_pages WHERE id=$1",[id]);if(!row)return res.status(404).json({error:"Seite nicht gefunden."});if(row.is_system)return res.status(400).json({error:"Systemseiten können nicht gelöscht werden. Sie können ausgeblendet oder archiviert werden."});await pool.query("DELETE FROM site_pages WHERE id=$1",[id]);res.json({ok:true});}
  catch(error){console.error("admin page delete",error);res.status(error.statusCode||500).json({error:error.statusCode?error.message:"Seite konnte nicht gelöscht werden."});}
});

/* ADMIN – FULL CONTROL HELPERS */
app.get("/api/admin/players", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try {
    const result=await pool.query(`SELECT p.*,t.name AS team_name FROM players p LEFT JOIN teams t ON t.id=p.team_id ORDER BY t.name,p.shirt_number NULLS LAST,p.last_name,p.first_name`);
    res.json(result.rows);
  } catch(error){ console.error("admin players",error); res.status(500).json({error:"Spieler konnten nicht geladen werden."}); }
});

app.get("/api/admin/posts", auth, requireRole(...CONTENT_ROLES), async (req,res)=>{
  try {
    const result=await pool.query(`SELECT p.id,p.title,p.body,p.image_url,p.link_url,p.page_slug,p.created_at,p.updated_at,p.team_id,p.published,p.social_requested,p.approved,p.archived,p.home_featured,p.review_at,p.content_type,p.show_in_news,COALESCE(u.alias,u.first_name,'TuRU 1880') AS author_name,t.name AS team_name FROM posts p LEFT JOIN users u ON u.id=p.author_id LEFT JOIN teams t ON t.id=p.team_id WHERE ($1::text IS NULL OR p.page_slug=$1 OR ($1='news' AND p.page_slug IS NULL))
       ORDER BY p.created_at DESC LIMIT 500`, [req.query.pageSlug ? clean(req.query.pageSlug) : null]);
    res.json(result.rows);
  } catch(error){ console.error("admin posts",error); res.status(500).json({error:"Beiträge konnten nicht geladen werden."}); }
});

/* ADMIN – USERS / ROLES / RIGHTS */
app.get("/api/admin/users", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const result = await pool.query(
    "SELECT id,first_name,last_name,alias,email,role,membership_type,created_at FROM users ORDER BY created_at DESC"
  );
  res.json(result.rows.map(publicUser));
});

app.post("/api/admin/users", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const firstName = clean(req.body.firstName);
    const lastName = clean(req.body.lastName);
    const alias = clean(req.body.alias) || null;
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const role = ROLES.includes(req.body.role) ? req.body.role : "member";
    if (!firstName || !email || password.length < 8) return res.status(400).json({ error: "Vorname, E-Mail und ein Passwort mit mindestens 8 Zeichen sind erforderlich." });
    const exists = await one("SELECT id FROM users WHERE LOWER(email)=LOWER($1)",[email]);
    if (exists) return res.status(409).json({ error: "Diese E-Mail-Adresse ist bereits registriert." });
    const hash = await bcrypt.hash(password,12);
    const result = await pool.query(
      `INSERT INTO users(first_name,last_name,alias,email,password_hash,role,membership_type,membership_status,account_status,terms_accepted_at)
       VALUES($1,$2,$3,$4,$5,$6,'fan','approved','active',NOW())
       RETURNING id,first_name,last_name,alias,email,role,membership_type,membership_status,account_status`,
      [firstName,lastName,alias,email,hash,role]
    );
    res.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error("admin user create", error);
    res.status(500).json({ error: "Benutzer konnte nicht angelegt werden." });
  }
});


app.patch("/api/admin/users/:id", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try {
    const id=requireUuid(req.params.id,"Benutzer-ID");
    const result=await pool.query(`UPDATE users SET first_name=$1,last_name=$2,alias=$3,email=$4,membership_type=$5,membership_number=$6,team_id=$7,account_status=$8 WHERE id=$9 RETURNING id,first_name,last_name,alias,email,role,membership_type,membership_status,account_status,membership_number,team_id`,[
      clean(req.body.firstName),clean(req.body.lastName),clean(req.body.alias)||null,clean(req.body.email).toLowerCase(),clean(req.body.membershipType)||"fan",clean(req.body.membershipNumber)||null,req.body.teamId||null,clean(req.body.accountStatus)||"active",id]);
    if(!result.rowCount)return res.status(404).json({error:"Benutzer nicht gefunden."});
    res.json({user:publicUser(result.rows[0])});
  } catch(error){ if(error.code==="23505")return res.status(409).json({error:"Diese E-Mail-Adresse ist bereits vergeben."}); console.error("admin user update",error); res.status(500).json({error:"Benutzer konnte nicht geändert werden."}); }
});

app.post("/api/admin/users/:id/password", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try{
    const id=requireUuid(req.params.id,"Benutzer-ID");
    const password=String(req.body.password||"");
    if(password.length<8)return res.status(400).json({error:"Das Passwort muss mindestens 8 Zeichen haben."});
    const hash=await bcrypt.hash(password,12);
    const result=await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id",[hash,id]);
    if(!result.rowCount)return res.status(404).json({error:"Benutzer nicht gefunden."});
    res.json({ok:true});
  }catch(error){console.error("admin password",error);res.status(500).json({error:"Passwort konnte nicht zurückgesetzt werden."});}
});

app.delete("/api/admin/users/:id", auth, requireRole(...ADMIN_ROLES), async (req,res)=>{
  try{
    const id=requireUuid(req.params.id,"Benutzer-ID");
    if(String(id)===String(req.user.id))return res.status(400).json({error:"Der eigene Admin-Zugang kann nicht gelöscht werden."});
    const result=await pool.query("DELETE FROM users WHERE id=$1 RETURNING id",[id]);
    if(!result.rowCount)return res.status(404).json({error:"Benutzer nicht gefunden."});
    res.json({ok:true});
  }catch(error){console.error("admin user delete",error);res.status(500).json({error:"Benutzer konnte nicht gelöscht werden."});}
});

app.patch("/api/admin/users/:id/role", auth, requireRole("superadmin"), async (req, res) => {
  const role = clean(req.body.role);
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Ungültige Rolle." });
  if (String(req.params.id) === String(req.user.id) && role !== "superadmin") {
    return res.status(400).json({ error: "Der eigene Superadmin-Zugang kann hier nicht herabgestuft werden." });
  }
  const result = await pool.query(
    `UPDATE users SET role=$1 WHERE id=$2 RETURNING id,first_name,last_name,alias,email,role,membership_type,membership_status,account_status`,
    [role,req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Benutzer nicht gefunden." });
  res.json({ user: publicUser(result.rows[0]) });
});

app.get("/api/admin/users/:id/permissions", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const row = await one("SELECT areas,rights FROM user_permissions WHERE user_id=$1", [req.params.id]);
  res.json({ areas: row?.areas || [], rights: row?.rights || [] });
});

app.post("/api/admin/users/:id/permissions", auth, requireRole("superadmin"), async (req, res) => {
  const areas = Array.isArray(req.body.areas) ? req.body.areas.filter(x => ALL_PERMISSIONS.includes(x)) : [];
  const rights = Array.isArray(req.body.rights) ? req.body.rights.slice(0,200) : [];
  await pool.query(
    `INSERT INTO user_permissions(user_id,areas,rights,updated_at) VALUES($1,$2::jsonb,$3::jsonb,NOW())
     ON CONFLICT(user_id) DO UPDATE SET areas=EXCLUDED.areas,rights=EXCLUDED.rights,updated_at=NOW()`,
    [req.params.id,JSON.stringify(areas),JSON.stringify(rights)]
  );
  res.json({ ok: true, areas, rights });
});

app.post("/api/admin/teams/:teamId/staff", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const teamId = clean(req.params.teamId);
  const userId = clean(req.body.userId);
  const staffRole = clean(req.body.staffRole) || "trainer";
  if (!teamId || !userId) return res.status(400).json({ error: "Mannschaft und Benutzer sind erforderlich." });
  await pool.query(
    `INSERT INTO team_staff(team_id,user_id,staff_role) VALUES($1,$2,$3)
     ON CONFLICT(team_id,user_id) DO UPDATE SET staff_role=EXCLUDED.staff_role`,
    [teamId,userId,staffRole]
  );
  res.status(201).json({ ok: true });
});

/* ADMIN – DASHBOARD */
app.get("/api/admin/dashboard", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const [teams, users, posts, players] = await Promise.all([
    pool.query("SELECT * FROM teams ORDER BY name"),
    pool.query("SELECT id,first_name,last_name,alias,email,role FROM users ORDER BY created_at DESC"),
    pool.query("SELECT p.*,COALESCE(u.alias,u.first_name,'TuRU') AS author_name FROM posts p LEFT JOIN users u ON u.id=p.author_id ORDER BY p.created_at DESC LIMIT 100"),
    pool.query("SELECT COUNT(*)::int AS n FROM players")
  ]);
  res.json({ teams: teams.rows, users: users.rows, posts: posts.rows, playerCount: players.rows[0]?.n || 0 });
});

/* ADMIN – COMMUNICATION */
async function recipientIds(audienceType, audienceValue) {
  if (audienceType === "team") {
    const result = await pool.query("SELECT id FROM users WHERE team_id=$1 AND account_status='active'", [audienceValue]);
    return result.rows.map(x => x.id);
  }
  if (audienceType === "membership_type") {
    const result = await pool.query("SELECT id FROM users WHERE membership_type=$1 AND account_status='active'", [audienceValue]);
    return result.rows.map(x => x.id);
  }
  if (audienceType === "role") {
    const result = await pool.query("SELECT id FROM users WHERE role=$1 AND account_status='active'", [audienceValue]);
    return result.rows.map(x => x.id);
  }
  if (audienceType === "user") return audienceValue ? [audienceValue] : [];
  const result = await pool.query("SELECT id FROM users WHERE membership_status='approved' AND account_status='active'");
  return result.rows.map(x => x.id);
}

app.get("/api/admin/communication", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const result = await pool.query(
    `SELECT m.*,COALESCE(u.alias,u.first_name,'Admin') AS sender_name FROM messages m
     LEFT JOIN users u ON u.id=m.sender_id ORDER BY m.created_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

app.post("/api/admin/communication", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const title = clean(req.body.title);
  const body = clean(req.body.body);
  const audienceType = clean(req.body.audienceType) || "all";
  const audienceValue = clean(req.body.audienceValue) || null;
  const pushRequested = bool(req.body.pushRequested, false);
  if (!title || !body) return res.status(400).json({ error: "Titel und Nachricht sind erforderlich." });
  const validTypes = ["all","team","membership_type","role","user"];
  if (!validTypes.includes(audienceType)) return res.status(400).json({ error: "Ungültige Zielgruppe." });
  if (audienceType !== "all" && !audienceValue) return res.status(400).json({ error: "Bitte eine Zielgruppe auswählen." });

  const ids = [...new Set((await recipientIds(audienceType,audienceValue)).map(clean).filter(Boolean))];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const message = (await client.query(
      `INSERT INTO messages(title,body,sender_id,audience_type,audience_value,recipient_count)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title,body,req.user.id,audienceType,audienceValue,ids.length]
    )).rows[0];
    for (const userId of ids) {
      await client.query(
        "INSERT INTO message_recipients(message_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [message.id,userId]
      );
    }
    await client.query("COMMIT");
    let pushSent = 0;
    if (pushRequested && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && ids.length) {
      const subs = (await pool.query("SELECT id,user_id,subscription FROM push_subscriptions WHERE user_id = ANY($1::uuid[])",[ids])).rows;
      for (const row of subs) {
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify({title: message.title,body: message.body,url: "/",messageId: message.id}));
          pushSent++;
        } catch (error) {
          if (error?.statusCode === 404 || error?.statusCode === 410) await pool.query("DELETE FROM push_subscriptions WHERE id=$1",[row.id]).catch(()=>{});
        }
      }
    }
    res.status(201).json({ ...message, recipientCount: ids.length, pushRequested, pushSent, pushConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("communication", error);
    res.status(500).json({ error: "Nachricht konnte nicht gesendet werden." });
  } finally {
    client.release();
  }
});

/* Padel – kompatible JSON-API für die bestehende Buchungsfunktion */
function slots() {
  const result = [];
  for (let minutes = 9 * 60; minutes < 22 * 60; minutes += 90) {
    const fmt = value => `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
    result.push({ start: fmt(minutes), end: fmt(minutes + 90) });
  }
  return result;
}

function berlinDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Berlin", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
}

function isPastSlot(date, start) {
  const today = berlinDate();
  if (date < today) return true;
  if (date > today) return false;
  const [h,m] = String(start).split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Berlin", hour:"2-digit", minute:"2-digit", hour12:false }).formatToParts(new Date());
  const hour = Number(parts.find(p => p.type === "hour")?.value || 0);
  const minute = Number(parts.find(p => p.type === "minute")?.value || 0);
  return h * 60 + m <= hour * 60 + minute;
}

app.get("/api/padel/slots", auth, async (req, res) => {
  const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(clean(req.query.date)) ? clean(req.query.date) : berlinDate();
  const result = await pool.query(
    `SELECT booking_date,start_time,end_time FROM bookings WHERE booking_date=$1 ORDER BY start_time`,
    [date]
  ).catch(() => ({ rows: [] }));
  const busy = new Set(result.rows.map(x => String(x.start_time).slice(0,5)));
  res.json(slots().map(x => ({ ...x, past:isPastSlot(date,x.start), busy:busy.has(x.start) })));
});

/* Global error handling */
app.use((err, req, res, next) => {
  console.error("unhandled", err);
  if (res.headersSent) return next(err);
  res.status(err?.statusCode || 500).json({ error: err?.statusCode ? err.message : "Interner Serverfehler." });
});

async function start() {
  await pool.query("SELECT 1");
  await ensureSchema();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TuRU Backend läuft auf Port ${PORT}`);
  });
}

start().catch(error => {
  console.error("Start fehlgeschlagen:", error);
  process.exit(1);
});