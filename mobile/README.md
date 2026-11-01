# Service360 field engineer app

Expo SDK 58 / React Native 0.88 / Expo Router. All screens use React Native components and share the Service360 MySQL API with the admin and customer portals.

From this folder:

```powershell
npm install
npm run web
```

The browser preview opens at http://localhost:8081. The local API must be running on IPv4 port 4000. Sign in as `rahul@service360.local` with password `Service360!`.

For an Android or iOS device, use `npm start` and open the Expo development URL with an SDK-compatible Expo Go app or development build. The API host is normally derived from Expo's LAN host. If needed, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the computer's LAN address. A phone cannot use `localhost` or `127.0.0.1` to reach the PC. Both devices must be on the same network, and port 4000 must be reachable. The root PowerShell launcher provides the desktop browser preview; start the mobile process separately with a LAN API URL for a physical device.

```powershell
$env:EXPO_PUBLIC_API_URL='http://192.168.1.10:4000/api'
npm start
```

The app includes assigned tasks, service status transitions, actual barcode scanning with manual entry, site check-in, checklist execution, photo evidence, customer declaration and optional drawn signature, attendance, engineer stock, transfer receipt and return handover.

Offline behavior: the last workspace, per-task drafts and an ordered transaction outbox are saved on the device. A network failure queues an operation with a stable transaction ID. The app clearly labels pending changes; completion does not become successful until the server validates it. Open **More → Offline & sync → Sync now** to retry. Conflicts pause subsequent changes and display the server's reason. Photos are retained locally with the completion transaction and uploaded before completion. Native login tokens use SecureStore; browser tokens use the browser's local storage. Signing out preserves that user's unsent outbox, which is restored after the same user logs in.

Verification commands:

```powershell
npm run typecheck
npm run lint
npm run export
npx expo export --platform android --output-dir dist-android
```

The browser preview cannot verify physical camera, device GPS or native permission prompts. Production rollout still requires device testing, HTTPS and production identity/security configuration. Customer confirmation is a declaration/signature; SMS OTP and enterprise MFA are not connected.
