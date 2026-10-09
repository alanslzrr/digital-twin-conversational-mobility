#!/bin/sh
# Explicit maintenance operation on the future VM; never called by CI or a timer.
set -eu
umask 077
[ "$(id -u)" -eq 0 ] || { echo "Run as root on the deployment host." >&2; exit 1; }
cd /opt/mobai
[ -f .env.local ] && [ -d /etc/mobai ] && [ -d /srv/mobai/workflow ]
[ -d /srv/mobai/data ] && [ -f /etc/mobai/master.key ]
out="/srv/mobai/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p /srv/mobai/backups
mkdir "$out.incomplete"
was_active=false
if systemctl is-active --quiet mobai; then
  was_active=true
  systemctl stop mobai
fi
resume() { if "$was_active"; then systemctl start mobai; fi; }
trap resume EXIT
# Database and files are captured with Web/EVE/Core/worker stopped together.
docker compose --env-file .env.local -f infra/oci/compose.yaml --profile oci exec -T postgres   sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$out.incomplete/database.dump"
test -s "$out.incomplete/database.dump"
tar -czf "$out.incomplete/state-and-config.tar.gz"   --exclude=data/backups -C /srv/mobai workflow data   -C /opt/mobai .env.local apps/eve-web/.env.local apps/mobility-core/.env.local   -C /etc mobai
git rev-parse HEAD > "$out.incomplete/commit.txt"
(cd "$out.incomplete" && sha256sum database.dump state-and-config.tar.gz commit.txt > SHA256SUMS)
mv "$out.incomplete" "$out"
printf '%s\n' "Backup completed: $out. Copy to private off-host storage; contains secrets."
