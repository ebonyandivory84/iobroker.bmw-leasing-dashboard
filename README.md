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

Web-Frontend liegt in `frontend/` und die gebauten Dateien liegen im Adapter unter `public/`.

Build ausfuehren:

```bash
cd frontend
npm run build:web
rm -rf ../public
mkdir -p ../public
cp -R dist/. ../public/
```

Das aktualisiert die statischen Dashboard-Dateien fuer den Adapter.

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
3. `common.readme` in `io-package.json` auf deine GitHub-URL setzen.

## Installation im ioBroker

1. Direkt aus GitHub installieren:
   ```bash
   iobroker url https://github.com/ebonyandivory84/iobroker.bmw-leasing-dashboard
   ```
2. Alternativ lokal im Adapter-Ordner:
   ```bash
   npm install --production
   ```
3. Instanz `bmw-leasing-dashboard` in ioBroker starten.
