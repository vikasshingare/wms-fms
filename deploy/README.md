# SSH deployment

The Hostinger deployment uses `https://srv2091881.hstgr.cloud/service360/` for the portals and `/service360/mobile/` for the Expo web app. Its API is `/service360/api/`, proxied to localhost port 4200. Existing applications retain their routes.

Build the web portal with `VITE_API_URL=/service360/api`, `VITE_MOBILE_URL=/service360/mobile/`, `VITE_DEMO_MODE=false`, and `vite build --base=/service360/`.

Build the Expo application with `EXPO_PUBLIC_API_URL=https://srv2091881.hstgr.cloud/service360/api`, `EXPO_PUBLIC_DEMO_MODE=false`, `SERVICE360_WEB_BASE=/service360/mobile`, and `expo export --platform web`. The subpath uses Expo's [baseUrl support](https://docs.expo.dev/more/expo-cli/#hosting-with-sub-paths).

A release under `/opt/service360/releases/<release>/` contains:

```text
server/src/ + package.json + package-lock.json
database/service360.sql
deploy/
public/service360/          web build
public/service360/mobile/   mobile web build
```

Run `bash deploy/install.sh` as root from that release. This script is specific to the inspected Hostinger nginx layout. It creates a dedicated service user, imports only a new database, generates private runtime secrets and account passwords, installs a systemd service, and adds a route include to the existing HTTPS virtual host. It backs up the previous nginx configuration before editing it. A subsequent deployment preserves the database and passwords.

- Runtime environment: `/etc/service360/api.env` (not in Git)
- Initial account passwords: `/root/service360-logins.json` (not in Git)
- Logs: `journalctl -u service360-api`
- Status: `systemctl status service360-api`
- Restart: `systemctl restart service360-api`
- Health: `curl https://srv2091881.hstgr.cloud/service360/api/health`

To roll back application code, change `/opt/service360/current` to the previous release and restart `service360-api`. Database schema changes require a separately reviewed migration and backup; this installer never reimports an existing database.

The published mobile URL is a browser version of the React Native app, not an APK/IPA. The original implementation limitations in `docs/implementation-status.md` still apply.
