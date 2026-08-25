# TuRU 1880 Backend

## Dateien
- server.js: Express API
- package.json: Abhängigkeiten und Startbefehl
- schema.sql: Datenbanktabellen für Neon
- .env.example: benötigte Umgebungsvariablen

## Render Backend
1. Neues Web Service aus dem Ordner backend erstellen.
2. Build Command: npm install
3. Start Command: npm start
4. Environment Variables:
   DATABASE_URL = Neon Connection String
   JWT_SECRET = langes zufälliges Geheimnis

## Neon
Den kompletten Inhalt von schema.sql im Neon SQL Editor ausführen.

## Danach
Die Render-URL des Backends wird im Frontend als VITE_API_URL eingetragen.
Beispiel: https://dein-backend.onrender.com

Danach wird neu deployt und Registrierung/Login arbeiten mit Neon.


## Enthaltene Testmannschaften
Nach dem Ausführen von `schema.sql` werden automatisch folgende Mannschaften angelegt:

- 1. Mannschaft
- U19
- U17
- U16
- U15
- U13
- U12
- U10
- U8
- U6
- U4
- Inklusionsmannschaft

Die Einträge können später im Adminbereich bearbeitet oder erweitert werden.


## Demo-Daten zusätzlich enthalten

Nach dem Ausführen von `schema.sql` werden Testdaten angelegt für:

- Spieler und Beispielkader
- Mannschaften von U4 bis 1. Mannschaft
- Inklusionsmannschaft
- Vergangene und kommende Spiele
- Testergebnisse
- Spiel- und Vereinsberichte
- Veranstaltungen
- Sponsoren
- Gutscheine und Partnerangebote

Alle Testdaten sind als Demo-Daten gedacht und können später ersetzt, bearbeitet oder gelöscht werden.
