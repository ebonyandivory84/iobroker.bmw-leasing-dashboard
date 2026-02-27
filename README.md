# BMW Leasing Dashboard (Expo)

React-Native App (Expo SDK 54) fuer dein iobroker Leasing-Dashboard.

## Lokaler Start

1. Abhaengigkeiten installieren:
   ```bash
   npm install
   ```
2. `.env` anlegen:
   ```bash
   cp .env.example .env
   ```
3. Start:
   ```bash
   npm run start:tunnel
   ```

## iPhone Homescreen (schnellster Weg)

1. Web-Build erzeugen:
   ```bash
   npm run build:web
   ```
2. `dist/` auf Vercel oder Netlify deployen.
3. Auf dem iPhone in Safari die URL oeffnen.
4. `Teilen` -> `Zum Home-Bildschirm`.

Damit hast du ein App-Icon direkt auf dem Homescreen (PWA).

## Native iOS App (TestFlight / App Store)

Voraussetzung: Apple Developer Account.

1. Bei Expo einloggen:
   ```bash
   npx eas login
   ```
2. Projekt fuer EAS registrieren:
   ```bash
   npx eas init
   ```
3. Produktions-Build starten:
   ```bash
   npx eas build -p ios --profile production
   ```
4. Build in TestFlight hochladen:
   ```bash
   npx eas submit -p ios --profile production
   ```

## Mac Dashboard

- Als Web-Dashboard im Browser:
  - dieselbe deployte URL oeffnen.
- Als "App" auf macOS:
  - in Safari: `Ablage -> Zum Dock hinzufuegen`.
  - in Chrome: `Installieren` (PWA).

## Web-Dashboard Deploy

### Vercel

1. Repo importieren.
2. Build Command: `npm run build:web`
3. Output Directory: `dist`

### Netlify

1. Repo importieren.
2. Build Command: `npm run build:web`
3. Publish Directory: `dist`

## Erwartete iobroker States

- `0_userdata.0.LeasingBMW.remainingKmTotalRaw`
- `0_userdata.0.LeasingBMW.overKmTotal`
- `0_userdata.0.LeasingBMW.daysLeftLease`
- `0_userdata.0.LeasingBMW.avgKmPerDayFromNow`
- `0_userdata.0.LeasingBMW.dayDeltaKmSigned`
- `0_userdata.0.LeasingBMW.weekDeltaKmSigned`
- `0_userdata.0.LeasingBMW.monthDeltaKmSigned`
- `0_userdata.0.LeasingBMW.usedKmThisWeek`
- `0_userdata.0.LeasingBMW.weekAllowanceAtWeekStart`
- `0_userdata.0.LeasingBMW.usedKmThisMonth`
- `0_userdata.0.LeasingBMW.monthAllowanceAtMonthStart`
- `0_userdata.0.LeasingBMW.usedKmThisDay`
- `0_userdata.0.LeasingBMW.todayAllowance`
- `0_userdata.0.LeasingBMW.drivenKmTotalRaw`

## Hinweise zur simple-api

Die App probiert automatisch mehrere Endpunkte:

- `POST /getBulk` mit `{ "ids": [...] }`
- `GET /getBulk?ids=id1,id2,...`
- `GET /getBulk/id1,id2,...`
- Fallback pro State: `/get/...`, `/get?id=...`, `/getPlainValue/...`
