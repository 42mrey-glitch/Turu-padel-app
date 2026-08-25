# TuRU 1880 – Upload-Paket

## Backend (Render Web Service)
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - optional `ADMIN_INITIAL_PASSWORD` (Standard: `Turu1880!`)

Das Backend führt beim Start automatisch die Datenbank-Migration aus und ergänzt fehlende Spalten wie `users.role`. Es werden außerdem die Testkonten und fehlende Testspieler bis 24 pro Mannschaft angelegt.

## Frontend (Render Static Site)
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment Variable: `VITE_API_URL` = vollständige URL des TuRU-Backend-Service, z.B. `https://turu-vereinsapp.onrender.com`

Nach dem Setzen von `VITE_API_URL` das Frontend neu deployen.

## Admin
E-Mail: `admin@turu1880-demo.de`
Passwort: `Turu1880!`

Das Passwort kann nach dem Login unter **Mein TuRU → Mein Profil** geändert werden.

Weitere Testkonten:
- vorstand@turu1880-demo.de
- trainer@turu1880-demo.de
- spieler@turu1880-demo.de
- mitglied@turu1880-demo.de
- sponsor@turu1880-demo.de
- partner@turu1880-demo.de

Passwort: `Turu1880!`
