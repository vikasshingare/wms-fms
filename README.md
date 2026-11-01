# Service360

A local field service and warehouse application based on your developer design document and purple Service360 design reference. The project contains an Expo / React Native field engineer application, React admin and customer portals, and an Express API with MySQL persistence.

## Open the running applications

| Application | Address | Sign in |
| --- | --- | --- |
| Admin portal | http://localhost:5174 | `admin@service360.local` |
| Customer portal | http://localhost:5174 | `customer@service360.local` |
| Field engineer app, browser preview | http://localhost:8081 | `rahul@service360.local` |
| API health | http://localhost:4000/api/health | No login required |

All local demonstration accounts use the password **`Service360!`**. The portal login offers demo account buttons. The customer account belongs to ACME Retail; the engineer account belongs to Rahul Sharma. The database also contains a second engineer, `priya@service360.local`, for assignment and access-scope testing.

This project is at `C:\xampp\htdocs\service360`. It uses the existing MySQL 8.4 server on port 3306. Apache / PHP does not serve these applications; the launcher runs their Node development servers. The root `.htaccess` prevents Apache from exposing source files and configuration.

## Start and stop

From PowerShell:

```powershell
cd C:\xampp\htdocs\service360
npm start
```

The launcher starts the API, web portals, and Expo web preview as background processes. Output goes to `.runtime/`. It checks the ports, waits for HTTP readiness, and preserves existing data. It does not stop another application's process to free a port.

```powershell
npm run stop
```

To reinstall dependencies or initialize a fresh local database:

```powershell
npm run setup
```

Setup creates only databases named `service360` or `service360_*`. It seeds an empty database and preserves records on subsequent runs. `server/.env` contains the generated database password and JWT signing secret and is excluded from Git. `server/.env.example` documents the settings. If your MySQL administrator credentials differ, supply `DB_ADMIN_USER` and `DB_ADMIN_PASSWORD` in the environment before setup. Do not commit real credentials.

## Run on an Android or iOS phone

The mobile source is a real React Native application using Expo Router. To connect a physical phone, use the same trusted local network as this computer:

```powershell
npm run stop
npm run start:lan
```

The launcher prints the `exp://` address to open with a matching Expo Go version and the LAN API address. It changes the API bind address for this run and supplies `EXPO_PUBLIC_API_URL` to the mobile app. For an interactive QR code, stop the background mobile process and run `npm start` from the `mobile` folder. Follow [Expo's device setup instructions](https://docs.expo.dev/get-started/start-developing/). A physical device cannot reach the PC's API using `localhost`.

No Android device or emulator was connected during initial setup. Browser preview and native source validation are separate from on-device camera, location, and permission testing. No signed APK or IPA is included.

## Try an end-to-end workflow

1. Sign in to the customer portal and raise a request against an ACME site.
2. Sign in as admin, open work orders, and assign the request to Rahul. For an installation or replacement, allocate an appropriate asset held by Rahul.
3. Open the field app as Rahul. Accept the task, start travel, check in, and start work.
4. Scan or enter the appropriate serial, complete the checklist, capture the required evidence, and record customer acceptance. Submit completion.
5. Refresh the portals to see the persisted result and updated asset custody.

For warehouse testing, the seed includes expected and received ASNs and an open putaway task. Receive the exact pre-advised serial list, pass QC, and confirm the staging location and compatible storage bin. Moving a sealed master carton moves its contained inner cartons and serials together. Break the appropriate carton before moving an inner carton or loose asset independently.

Stock transfers reserve, dispatch, then receive assets. An engineer receives only transfers addressed to their stock location. Return requests retain the engineer as holder until a receiving user confirms handover. Asset history provides the movement trail.

## Project layout

```text
service360/
  server/              Express API, MySQL schema and seed
  web/                 React / Vite admin and customer portals
  mobile/              Expo / React Native field application
  docs/api.md          REST payloads and record fields
  docs/requirements.txt  Extracted source specification
  tests/integration.mjs  Real API and MySQL workflow checks
  tools/check.mjs      Isolated test database and API runner
  Start-Service360.ps1
  Stop-Service360.ps1
  Setup-Service360.ps1
```

## Validation

```powershell
npm test
npm run build:web
cd mobile
npx tsc --noEmit
npx expo lint
npx expo export --platform web
```

The integration runner creates a uniquely named test database, starts the test API on port 4001, exercises the workflows, stops that API, and removes only its own test database. Your demonstration database remains unchanged. The tests require local MySQL administrator access to create and remove that temporary database.

API documentation is in [docs/api.md](docs/api.md). Implementation boundaries and production follow-up work are recorded in [docs/implementation-status.md](docs/implementation-status.md).
