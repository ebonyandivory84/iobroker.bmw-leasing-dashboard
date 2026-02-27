# ioBroker BMW Leasing Dashboard Adapter

## Zweck

Dieser Adapter hostet das gebaute Web-Dashboard selbst und liest die Werte direkt ueber den js-controller.

## Start URL

- `http://<iobroker-host>:8099/`

## Konfiguration (Admin)

- `bind`: Standard `0.0.0.0`
- `port`: Standard `8099`
- `stateIds`: Datenpunkte (eine Zeile pro State-ID)

## API

- `GET/POST /api/getBulk`
- `GET /api/getBulk/:ids`
- `GET /api/get/:id`
- `GET /api/get?id=...`
- `GET /api/getPlainValue/:id`
- `GET /api/dashboard`

## Build-Workflow

Im Root-Projekt:

```bash
npm run adapter:web
```

Das baut das Web-Frontend und synchronisiert die Dateien nach `adapter/public`.

## GitHub Publish

1. Repository erstellen, z. B. `iobroker.bmw-leasing-dashboard`
2. Im Projektroot:
   ```bash
   git init
   git add .
   git commit -m "Initial adapter + dashboard"
   git branch -M main
   git remote add origin git@github.com:<DEIN_USER>/iobroker.bmw-leasing-dashboard.git
   git push -u origin main
   ```
3. In `adapter/io-package.json` den Platzhalter in `common.readme` von `CHANGE-ME` auf deinen GitHub-User anpassen.

## Installation im ioBroker

1. Adapter-Ordner auf den ioBroker-Host kopieren oder via GitHub als Custom Adapter einbinden.
2. Im Adapter-Ordner:
   ```bash
   npm install --production
   ```
3. Instanz in ioBroker starten.
