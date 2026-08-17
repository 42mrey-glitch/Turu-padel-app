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

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(title, body) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – TuRU 1880 Padel</title>
<style>
body{
  font-family:Arial,sans-serif;
  margin:0;
  background:#f3f6fb;
  color:#172b4d;
}

header{
  background:#163b73;
  color:white;
  padding:28px 20px;
  text-align:center;
}

main{
  max-width:1100px;
  margin:30px auto;
  padding:0 20px;
}

.card{
  background:white;
  padding:24px;
  margin-bottom:24px;
  border-radius:14px;
  box-shadow:0 4px 14px rgba(0,0,0,.08);
}

h1,h2{
  color:#163b73;
}

table{
  width:100%;
  border-collapse:collapse;
  margin-top:15px;
}

th{
  background:#163b73;
  color:white;
  padding:12px;
  text-align:left;
}

td{
  padding:12px;
  border-bottom:1px solid #ddd;
}

button{
  background:#163b73;
  color:white;
  border:0;
  padding:9px 16px;
  border-radius:7px;
  cursor:pointer;
  font-weight:bold;
}

button:hover{
  background:#24549a;
}

@media(max-width:700px){
  main{
    padding:0 10px;
  }

  .card{
    padding:15px;
    overflow-x:auto;
  }

  table{
    min-width:650px;
  }
}
</style>
</head>
<body>
<header>
<h1>TuRU 1880 Padel</h1>
<div>Blau. Weiß. Düsseldorf.</div>
</header>
<main>${body}</main>
</body>
</html>`;
}

function nav(req) {
  if (!req.session.member) {
    return `<div class="nav">
      <a href="/">Buchung</a>
      <a href="/register">Registrieren</a>
      <a href="/login">Mitglieder-Login</a>
    </div>`;
  }

  return `<div class="nav">
    <a href="/">Buchung</a>
    <a href="/my-bookings">Meine Buchungen</a>
    ${req.session.member.admin ? '<a href="/admin">Admin</a>' : ""}
    <form method="post" action="/logout" style="margin:0">
      <button style="width:auto">Abmelden</button>
    </form>
  </div>`;
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
        '<div class="card error"><h2>Kein Zugriff</h2></div>'
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
      <div class="card">
        <h2>TuRU 1880 Padel</h2>
        <p>Angemeldet als <b>${esc(req.session.member.name)}</b></p>
        <p><a href="/booking">🎾 Platz buchen</a></p>
      </div>
    `
    : `
      <div class="card">
        <h2>TuRU 1880 Padel</h2>
        <p>Willkommen bei der Padel-Buchung von TuRU 1880.</p>
        <p>Padelplätze können ausschließlich von freigeschalteten Mitgliedern gebucht werden.</p>
        <p><a href="/login">🔐 Anmelden</a></p>
        <p><a href="/register">📝 Mitglied registrieren</a></p>
      </div>
    `;

  res.send(page("Startseite", nav(req) + content));
});

app.get("/register", (req, res) => {
  res.send(page("Registrierung", nav(req) + `
    <div class="card">
      <h2>Mitglied registrieren</h2>
      <p>Nach der Registrierung muss der Administrator dein Konto freischalten.</p>

      <form method="post" action="/register">
        <label>Name</label>
        <input name="name" maxlength="100" required>

        <label>E-Mail</label>
        <input type="email" name="email" maxlength="200" required>

        <label>Passwort</label>
        <input type="password" name="password" minlength="8" required>

        <button type="submit">Registrieren</button>
      </form>
    </div>
  `));
});

app.post("/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || password.length < 8) {
      return res.status(400).send(
        page(
          "Fehler",
          nav(req) +
          '<div class="card error"><h2>Fehler</h2>' +
          '<p>Bitte alle Angaben ausfüllen. Passwort mindestens 8 Zeichen.</p></div>'
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
          '<div class="card warn"><h2>Account vorhanden</h2>' +
          '<p>Diese E-Mail ist bereits registriert.</p>' +
          '<a href="/login">Zum Login</a></div>'
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
          '<div class="card warn"><h2>100 Mitglieder erreicht</h2>' +
          '<p>Momentan können keine weiteren Mitglieder freigeschaltet werden.</p></div>'
        )
      );
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      "INSERT INTO members(name,email,password_hash,status) VALUES($1,$2,$3,'pending')",
      [name, email, hash]
    );

    res.send(
      page(
        "Registrierung",
        nav(req) +
        '<div class="card ok"><h2>✅ Registrierung erfolgreich</h2>' +
        '<p>Dein Account wartet jetzt auf die Freischaltung durch den Administrator.</p></div>'
      )
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});

app.get("/login", (req, res) => {
  res.send(page("Login", nav(req) + `
    <div class="card">
      <h2>Mitglieder-Login</h2>

      <form method="post" action="/login">
        <label>E-Mail</label>
        <input type="email" name="email" required>

        <label>Passwort</label>
        <input type="password" name="password" required>

        <button type="submit">Anmelden</button>
      </form>

      <p>Noch nicht registriert?
        <a href="/register">Registrieren</a>
      </p>
    </div>
  `));
});

app.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const result = await pool.query(
      "SELECT * FROM members WHERE email=$1",
      [email]
    );

    const member = result.rows[0];

    if (
      !member ||
      !(await bcrypt.compare(password, member.password_hash))
    ) {
      return res.status(401).send(
        page(
          "Login",
          '<div class="card error">' +
          '<h2>Login fehlgeschlagen</h2>' +
          '<p>E-Mail oder Passwort ist falsch.</p>' +
          '<p><a href="/login">Zurück zum Login</a></p>' +
          '</div>'
        )
      );
    }

    if (member.status !== "approved") {
      return res.status(403).send(
        page(
          "Nicht freigeschaltet",
          '<div class="card warn">' +
          '<h2>Noch nicht freigeschaltet</h2>' +
          '<p>Dein Account wartet noch auf die Freischaltung durch den Administrator.</p>' +
          '</div>'
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
    res.status(500).send("Serverfehler");
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
      date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
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
      if (busy.has(slot.start)) {
        return `
          <div class="slot busy">
            <b>${slot.start}-${slot.end}</b>
            <br>
            <span>belegt</span>
          </div>
        `;
      }

      return `
        <div class="slot">
          <b>${slot.start}-${slot.end}</b>
          <form method="post" action="/book">
            <input type="hidden" name="date" value="${esc(date)}">
            <input type="hidden" name="start" value="${esc(slot.start)}">
            <input type="hidden" name="end" value="${esc(slot.end)}">
            <button type="submit">Buchen</button>
          </form>
        </div>
      `;
    }).join("");

    res.send(
      page(
        "Buchung",
        nav(req) +
        `
        <div class="card">
          <h2>🎾 Platz buchen</h2>

          <label for="bookingDate">
            <b>Datum auswählen</b>
          </label>

          <input
            type="date"
            id="bookingDate"
            value="${esc(date)}"
            min="${esc(date)}"
            onchange="window.location.href='/booking?date='+this.value"
          >

          <p>
            <b>Gewählter Tag:</b> ${esc(date)}
          </p>
        </div>

        <div class="card">
          <h2>Verfügbare Zeiten</h2>

          <div class="grid">
            ${html}
          </div>
        </div>
        `
      )
    );

  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/book", loginRequired, async (req, res) => {
  const date = String(req.body.date || "");
  const start = String(req.body.start || "");
  const end = String(req.body.end || "");

  if (!date || !start || !end) {
    return res.status(400).send("Fehlende Buchungsdaten");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const active = await client.query(
      `SELECT id
       FROM bookings
       WHERE member_id=$1
       AND used=FALSE
       AND (booking_date + start_time) > NOW()
       FOR UPDATE`,
      [req.session.member.id]
    );

    if (active.rowCount) {
      await client.query("ROLLBACK");

      return res.status(409).send(
        page(
          "Buchung",
          nav(req) +
          '<div class="card warn">' +
          '<h2>Bereits eine aktive Buchung</h2>' +
          '<p>Du kannst erst wieder buchen, wenn diese Buchung abgelaufen ist.</p>' +
          '<a href="/my-bookings">Meine Buchungen</a>' +
          '</div>'
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

    await client.query("COMMIT");

    res.send(
      page(
        "Buchung bestätigt",
        nav(req) +
        '<div class="card ok">' +
        '<h2>✅ Buchung bestätigt</h2>' +
        '<p><b>' +
        esc(date) +
        '</b>, ' +
        esc(start) +
        '-' +
        esc(end) +
        '</p>' +
        '<a href="/my-bookings">Meine Buchungen</a>' +
        '</div>'
      )
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    if (error.code === "23505") {
      return res.status(409).send(
        page(
          "Buchung",
          nav(req) +
          '<div class="card error">' +
          '<h2>Slot bereits belegt</h2>' +
          '<p>Dieser Termin wurde gerade vergeben.</p>' +
          '</div>'
        )
      );
    }

    console.error(error);
    res.status(500).send("Serverfehler");
  } finally {
    client.release();
  }
});
app.get("/my-bookings", loginRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM bookings
       WHERE member_id=$1
       ORDER BY booking_date,start_time`,
      [req.session.member.id]
    );

    const now = new Date();

const rows = result.rows.map(booking => {
 const date = booking.booking_date instanceof Date
  ? booking.booking_date.toISOString().slice(0, 10)
  : String(booking.booking_date).slice(0, 10);
  const start = String(booking.start_time).slice(0, 5);
  const end = String(booking.end_time).slice(0, 5);
const bookingDate = new Date(`${date}T${start}:00`);
console.log("BOOKING DEBUG:", {
  date,
  start,
  bookingDate: bookingDate.toString(),
  now: now.toString(),
  comparison: bookingDate > now
});  const status = booking.used
    ? "genutzt"
    : bookingDate > now
    ? "gebucht"
    : "abgelaufen";
      const cancelButton =
        !booking.used && bookingDate > now
          ? '<form method="post" action="/cancel/' +
            booking.id +
            '"><button type="submit">Stornieren</button></form>'
          : "";

      return (
        "<tr>" +
        "<td>" + esc(date) + "</td>" +
        "<td>" + esc(start) + "-" + esc(end) + "</td>" +
        "<td>" + status + "</td>" +
        "<td>" + cancelButton + "</td>" +
        "</tr>"
      );
    }).join("");

    const table = rows
      ? '<table>' +
        '<tr><th>Datum</th><th>Zeit</th><th>Status</th><th></th></tr>' +
        rows +
        "</table>"
      : "<p>Keine Buchungen.</p>";

    res.send(
      page(
        "Meine Buchungen",
        nav(req) +
        '<div class="card">' +
        '<h2>Meine Buchungen</h2>' +
        table +
        "</div>"
      )
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
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
          nav(req) +
          '<div class="card error">' +
          '<h2>Stornierung nicht möglich</h2>' +
          '<p>Die Buchung wurde nicht gefunden oder ist bereits abgelaufen.</p>' +
          '</div>'
        )
      );
    }

    res.redirect("/my-bookings");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});

app.get("/admin", adminRequired, async (req, res) => {
  try {
    const [membersResult, bookingsResult] =
      await Promise.all([
        pool.query(
          `SELECT id,name,email,status,admin,created_at
           FROM members
           ORDER BY created_at DESC`
        ),
        pool.query(
          `SELECT b.*,m.name,m.email
           FROM bookings b
           JOIN members m ON m.id=b.member_id
           ORDER BY b.booking_date,b.start_time`
        )
      ]);

    const members = membersResult.rows.map(member => {
      let action = "";

      if (member.admin) {
        action = "Administrator";
      } else if (member.status === "pending") {
        action =
          '<form method="post" action="/admin/approve/' +
          member.id +
          '">' +
          '<button type="submit">Freigeben</button>' +
          "</form>";
      } else if (member.status === "approved") {
        action =
          '<form method="post" action="/admin/block/' +
          member.id +
          '">' +
          '<button type="submit">Sperren</button>' +
          "</form>";
      } else {
        action = "Gesperrt";
      }

      return (
        "<tr>" +
        "<td>" + esc(member.name) + "</td>" +
        "<td>" + esc(member.email) + "</td>" +
        "<td>" + esc(member.status) + "</td>" +
        "<td>" + action + "</td>" +
        "</tr>"
      );
    }).join("");

    const bookings = bookingsResult.rows.map(booking => {
      return (
        "<tr>" +
        "<td>" + esc(booking.booking_date) + "</td>" +
        "<td>" +
        String(booking.start_time).slice(0, 5) +
        "-" +
        String(booking.end_time).slice(0, 5) +
        "</td>" +
        "<td>" + esc(booking.name) + "</td>" +
        "<td>" + esc(booking.email) + "</td>" +
        "<td>" +
        '<form method="post" action="/admin/cancel-booking/' +
        booking.id +
        '">' +
        '<button type="submit">Stornieren</button>' +
        "</form>" +
        "</td>" +
        "</tr>"
      );
    }).join("");

    const approved =
      membersResult.rows.filter(
        member => member.status === "approved"
      ).length;

    const pending =
      membersResult.rows.filter(
        member => member.status === "pending"
      ).length;

    res.send(
      page(
        "Admin",
        nav(req) +
        '<div class="card">' +
        "<h2>Administrator</h2>" +
        "<p>Freigegeben: <b>" +
        approved +
        "</b> | Wartend: <b>" +
        pending +
        "</b></p>" +
        "</div>" +

        '<div class="card">' +
        "<h2>Mitglieder</h2>" +
        "<table>" +
        "<tr><th>Name</th><th>E-Mail</th><th>Status</th><th>Aktion</th></tr>" +
        members +
        "</table>" +
        "</div>" +

        '<div class="card">' +
        "<h2>Alle Buchungen</h2>" +
        "<table>" +
        "<tr><th>Datum</th><th>Zeit</th><th>Name</th><th>E-Mail</th><th>Aktion</th></tr>" +
        bookings +
        "</table>" +
        "</div>"
      )
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/admin/approve/:id", adminRequired, async (req, res) => {
  try {
    const count = await pool.query(
      "SELECT COUNT(*)::int AS n FROM members WHERE status='approved'"
    );

    if (count.rows[0].n >= 100) {
      return res.status(409).send(
        page(
          "Admin",
          nav(req) +
          '<div class="card warn">' +
          "<h2>100 Mitglieder erreicht</h2>" +
          "</div>"
        )
      );
    }

    await pool.query(
      "UPDATE members SET status='approved' WHERE id=$1 AND admin=FALSE",
      [req.params.id]
    );

    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/admin/block/:id", adminRequired, async (req, res) => {
  try {
    await pool.query(
      "UPDATE members SET status='blocked' WHERE id=$1 AND admin=FALSE",
      [req.params.id]
    );

    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});

app.post("/admin/cancel-booking/:id", adminRequired, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM bookings WHERE id=$1",
      [req.params.id]
    );

    res.redirect("/admin");
  } catch (error) {
    console.error(error);
    res.status(500).send("Serverfehler");
  }
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        "TuRU Padel läuft auf Port " + PORT
      );
    });
  })
  .catch(error => {
    console.error("Datenbankfehler:", error);
    process.exit(1);
  });
