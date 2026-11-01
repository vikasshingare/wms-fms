#!/usr/bin/env bash
set -euo pipefail
release="$(cd "$(dirname "$0")/.." && pwd)"
case "$release" in /opt/service360/releases/*) ;; *) echo 'Unexpected release directory'; exit 1;; esac
id service360 >/dev/null 2>&1 || useradd --system --home-dir /opt/service360 --shell /usr/sbin/nologin service360
cd "$release/server"
npm ci --omit=dev --no-audit --no-fund
node "$release/deploy/provision.mjs"
chown root:service360 /etc/service360 /etc/service360/api.env
chmod 750 /etc/service360
chmod 640 /etc/service360/api.env
ln -sfn "$release" /opt/service360/current
install -m 644 "$release/deploy/service360-api.service" /etc/systemd/system/service360-api.service
install -m 644 "$release/deploy/service360.nginx.conf" /etc/nginx/snippets/service360.conf
python3 - <<'PY'
from pathlib import Path
import shutil,time
p=Path('/etc/nginx/conf.d/yard-tracking.conf')
s=p.read_text()
include='    include /etc/nginx/snippets/service360.conf;\n'
if include not in s:
    marker='    location ^~ /yard-api/ {'
    if s.count(marker)!=1: raise RuntimeError('Unexpected nginx layout; no changes made')
    shutil.copy2(p, str(p)+'.service360-backup-'+str(int(time.time())))
    p.write_text(s.replace(marker,include+'\n'+marker,1))
PY
nginx -t
systemctl daemon-reload
systemctl enable --now service360-api
systemctl restart service360-api
for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:4200/api/health; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:4200/api/health
systemctl reload nginx
echo 'Service360 release activated.'
