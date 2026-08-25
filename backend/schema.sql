CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  alias VARCHAR(100),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'member',
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_check CHECK (
    role IN ('member','trainer','team_manager','admin','superadmin')
  )
);

-- Migration für bereits vorhandene Datenbanken
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS alias VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_staff (
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_role VARCHAR(50) NOT NULL DEFAULT 'trainer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(250) NOT NULL,
  body TEXT NOT NULL,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);

-- Nach der ersten Registrierung von Manuel:
-- UPDATE users SET role = 'superadmin' WHERE email = 'DEINE-E-MAIL';


-- Testmannschaften TuRU 1880
INSERT INTO teams (name, description)
VALUES
  ('1. Mannschaft', 'Seniorenmannschaft'),
  ('U19', 'A-Jugend'),
  ('U17', 'B-Jugend'),
  ('U16', 'B-Jugend'),
  ('U15', 'C-Jugend'),
  ('U13', 'D-Jugend'),
  ('U12', 'D-Jugend'),
  ('U10', 'E-Jugend'),
  ('U8', 'F-Jugend'),
  ('U6', 'G-Jugend'),
  ('U4', 'Bambini / Mini-Kicker'),
  ('Inklusionsmannschaft', 'Fußball für alle – gemeinsamer Sport ohne Barrieren')
ON CONFLICT (name) DO NOTHING;


-- =========================================================
-- TuRU 1880 DEMO-DATEN
-- Alle Daten sind später über Admin/Verwaltung änderbar.
-- =========================================================

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  position VARCHAR(100),
  shirt_number INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT REFERENCES teams(id) ON DELETE CASCADE,
  match_date TIMESTAMPTZ NOT NULL,
  competition VARCHAR(150),
  home_team VARCHAR(150) NOT NULL,
  away_team VARCHAR(150) NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  location VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'finished',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_reports (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT REFERENCES matches(id) ON DELETE CASCADE,
  title VARCHAR(250) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(250) NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  location VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sponsors (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  website VARCHAR(500),
  level VARCHAR(100) DEFAULT 'Partner',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vouchers (
  id BIGSERIAL PRIMARY KEY,
  sponsor_id BIGINT REFERENCES sponsors(id) ON DELETE CASCADE,
  title VARCHAR(250) NOT NULL,
  description TEXT,
  code VARCHAR(100),
  valid_until DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TESTSPIELER
INSERT INTO players (team_id, first_name, last_name, position, shirt_number)
SELECT t.id, v.first_name, v.last_name, v.position, v.shirt_number
FROM teams t
JOIN (VALUES
  ('1. Mannschaft','Max','Mustermann','Torwart',1),
  ('1. Mannschaft','Leon','Beispiel','Abwehr',4),
  ('1. Mannschaft','David','Testspieler','Mittelfeld',8),
  ('1. Mannschaft','Tim','Demo','Sturm',9),
  ('U19','Jan','Muster','Torwart',1),
  ('U19','Luca','Beispiel','Abwehr',5),
  ('U17','Noah','Test','Mittelfeld',7),
  ('U17','Emir','Demo','Sturm',11),
  ('U15','Ben','Muster','Abwehr',3),
  ('U13','Finn','Beispiel','Mittelfeld',10),
  ('U10','Paul','Test','Sturm',9),
  ('U8','Milan','Demo','Spieler',7),
  ('Inklusionsmannschaft','Alex','Gemeinsam','Spieler',10)
) AS v(team_name, first_name, last_name, position, shirt_number)
ON t.name = v.team_name
WHERE NOT EXISTS (
  SELECT 1 FROM players p
  WHERE p.first_name = v.first_name AND p.last_name = v.last_name
);

-- TESTSPIELE UND ERGEBNISSE
INSERT INTO matches (team_id, match_date, competition, home_team, away_team, home_score, away_score, location, status)
SELECT t.id, NOW() - INTERVAL '14 days', 'Testliga', 'TuRU 1880', 'FC Beispiel', 3, 1, 'TuRU Platzanlage', 'finished'
FROM teams t WHERE t.name = '1. Mannschaft'
AND NOT EXISTS (SELECT 1 FROM matches WHERE home_team='TuRU 1880' AND away_team='FC Beispiel');

INSERT INTO matches (team_id, match_date, competition, home_team, away_team, home_score, away_score, location, status)
SELECT t.id, NOW() - INTERVAL '7 days', 'Jugendliga', 'TuRU U19', 'Düsseldorf Jugend', 2, 2, 'TuRU Platzanlage', 'finished'
FROM teams t WHERE t.name = 'U19'
AND NOT EXISTS (SELECT 1 FROM matches WHERE home_team='TuRU U19' AND away_team='Düsseldorf Jugend');

INSERT INTO matches (team_id, match_date, competition, home_team, away_team, home_score, away_score, location, status)
SELECT t.id, NOW() + INTERVAL '7 days', 'Meisterschaft', 'TuRU 1880', 'Sportfreunde Test', NULL, NULL, 'TuRU Platzanlage', 'scheduled'
FROM teams t WHERE t.name = '1. Mannschaft'
AND NOT EXISTS (SELECT 1 FROM matches WHERE home_team='TuRU 1880' AND away_team='Sportfreunde Test');

-- TESTBERICHTE
INSERT INTO posts (title, body, author_id, team_id)
SELECT
  'Starker Heimsieg der 1. Mannschaft',
  'TuRU 1880 gewinnt das Testspiel mit 3:1. Nach einer konzentrierten Mannschaftsleistung konnte das Team verdient als Sieger vom Platz gehen.',
  u.id, t.id
FROM users u CROSS JOIN teams t
WHERE t.name='1. Mannschaft'
AND NOT EXISTS (SELECT 1 FROM posts WHERE title='Starker Heimsieg der 1. Mannschaft')
LIMIT 1;

INSERT INTO posts (title, body, author_id, team_id)
SELECT
  'U19 mit spannendem Unentschieden',
  'In einem intensiven Spiel trennte sich unsere U19 mit 2:2. Die Mannschaft zeigte eine starke Moral und kämpfte bis zum Schluss.',
  u.id, t.id
FROM users u CROSS JOIN teams t
WHERE t.name='U19'
AND NOT EXISTS (SELECT 1 FROM posts WHERE title='U19 mit spannendem Unentschieden')
LIMIT 1;

INSERT INTO posts (title, body, author_id, team_id)
SELECT
  'Willkommen bei der TuRU Vereinsplattform',
  'Dies ist ein Testbericht. Später können berechtigte Nutzer, Trainer und Administratoren eigene Berichte und Vereinsnachrichten veröffentlichen.',
  u.id, NULL
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE title='Willkommen bei der TuRU Vereinsplattform')
LIMIT 1;

-- TESTVERANSTALTUNGEN
INSERT INTO events (title, description, event_date, location)
SELECT 'TuRU Saisoneröffnung', 'Gemeinsamer Saisonstart mit Mannschaften, Mitgliedern und Freunden des Vereins.', NOW() + INTERVAL '21 days', 'TuRU Vereinsanlage'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title='TuRU Saisoneröffnung');

INSERT INTO events (title, description, event_date, location)
SELECT 'Unternehmer Club', 'Netzwerkabend für Partner und Unterstützer von TuRU 1880.', NOW() + INTERVAL '35 days', 'TuRU Vereinsheim'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title='Unternehmer Club');

-- TESTSPONSOREN
INSERT INTO sponsors (name, description, website, level)
VALUES
  ('TuRU Hauptpartner', 'Beispiel eines Hauptpartners – später durch echte Sponsoren ersetzbar.', NULL, 'Hauptpartner'),
  ('Premium Partner Düsseldorf', 'Test-Premiumpartner der TuRU Vereinsplattform.', NULL, 'Premium Partner'),
  ('Blau-Weiß Partner', 'Testpartner für die Demo-Ansicht.', NULL, 'Partner')
ON CONFLICT (name) DO NOTHING;

-- TESTGUTSCHEINE
INSERT INTO vouchers (sponsor_id, title, description, code, valid_until)
SELECT s.id, '10 % Partner-Rabatt', 'Testgutschein für TuRU-Mitglieder bei einem Partner.', 'TURU10', CURRENT_DATE + INTERVAL '90 days'
FROM sponsors s
WHERE s.name='TuRU Hauptpartner'
AND NOT EXISTS (SELECT 1 FROM vouchers WHERE title='10 % Partner-Rabatt');

INSERT INTO vouchers (sponsor_id, title, description, code, valid_until)
SELECT s.id, 'Willkommensangebot', 'Testangebot für registrierte Mitglieder.', 'BLAUWEISS', CURRENT_DATE + INTERVAL '60 days'
FROM sponsors s
WHERE s.name='Premium Partner Düsseldorf'
AND NOT EXISTS (SELECT 1 FROM vouchers WHERE title='Willkommensangebot');


-- =========================================================
-- DEMO-USER FÜR ALLE BEREICHE
-- Passwort für alle Demo-Zugänge: Turu1880!
-- bcrypt hash for demo password "Turu1880!"
-- =========================================================

CREATE TABLE IF NOT EXISTS sponsor_users (
  sponsor_id BIGINT NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (sponsor_id, user_id)
);

-- Additional roles used by the demo
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'member';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN (
    'member','player','trainer','team_manager',
    'board','admin','superadmin','sponsor','partner'
  )
);

-- Demo-Benutzer werden beim Start des Backends sicher mit bcrypt angelegt.

INSERT INTO sponsor_users (sponsor_id, user_id)
SELECT s.id, u.id
FROM sponsors s, users u
WHERE s.name='Premium Partner Düsseldorf'
  AND u.email='sponsor@turu1880-demo.de'
ON CONFLICT DO NOTHING;

INSERT INTO sponsor_users (sponsor_id, user_id)
SELECT s.id, u.id
FROM sponsors s, users u
WHERE s.name='Blau-Weiß Partner'
  AND u.email='partner@turu1880-demo.de'
ON CONFLICT DO NOTHING;
