#!/usr/bin/env bash
# Copy survey data (database, photos, audio) from the OLD server to THIS server.
#
# Run on the NEW server as root, after setup.sh:
#
#   bash /opt/ppgis-survey/deploy/migrate-data.sh root@OLD_SERVER_IP /path/to/app/on/old/server
#
# Example:
#   bash /opt/ppgis-survey/deploy/migrate-data.sh root@203.0.113.10 /root/ppgis-survey
#
# You can run it as often as you like. Run it once to test, then a final time
# right after stopping the app on the old server, so no response is lost.
# The current database on this server is saved to /var/backups/ppgis before it is replaced.

set -euo pipefail

OLD="${1:-}"
OLD_DIR="${2:-}"
APP_DIR="/opt/ppgis-survey"
APP_USER="ppgis"
SERVICE="ppgis-survey"

[[ $EUID -eq 0 ]] || { echo "Please run as root."; exit 1; }
[[ -n "$OLD" && -n "$OLD_DIR" ]] || { sed -n '2,13p' "$0"; exit 1; }

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

SSH_OPTS=(-o ControlMaster=auto -o ControlPath=/tmp/ppgis-migrate-%C -o ControlPersist=120)

say "Connecting to $OLD (you may be asked for the OLD server's password)"
ssh "${SSH_OPTS[@]}" "$OLD" "test -f '$OLD_DIR/data.db'" \
  || { echo "No data.db found in $OLD_DIR on $OLD. Check the path."; exit 1; }

say "Making a consistent copy of the database on the old server"
ssh "${SSH_OPTS[@]}" "$OLD" "python3 - '$OLD_DIR/data.db' /tmp/ppgis-migrate.db" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
PY

say "Stopping the app on this server while copying"
systemctl stop "$SERVICE"

if [[ -f "$APP_DIR/data.db" ]]; then
  mkdir -p /var/backups/ppgis
  cp "$APP_DIR/data.db" "/var/backups/ppgis/before-migrate-$(date +%Y%m%d-%H%M%S).db"
fi

say "Copying database"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$OLD:/tmp/ppgis-migrate.db" "$APP_DIR/data.db"
rm -f "$APP_DIR/data.db-wal" "$APP_DIR/data.db-shm"

for d in survey_uploads audio_uploads; do
  if ssh "${SSH_OPTS[@]}" "$OLD" "test -d '$OLD_DIR/$d'"; then
    say "Copying $d"
    mkdir -p "$APP_DIR/$d"
    rsync -az --info=stats1 -e "ssh ${SSH_OPTS[*]}" "$OLD:$OLD_DIR/$d/" "$APP_DIR/$d/"
  fi
done

ssh "${SSH_OPTS[@]}" "$OLD" "rm -f /tmp/ppgis-migrate.db" || true
ssh "${SSH_OPTS[@]}" -O exit "$OLD" 2>/dev/null || true

chown -R "$APP_USER:$APP_USER" "$APP_DIR/data.db" "$APP_DIR/survey_uploads" "$APP_DIR/audio_uploads"

say "Starting the app again"
systemctl start "$SERVICE"

say "What arrived on this server"
for t in surveys survey_responses survey_media responses; do
  if sqlite3 "$APP_DIR/data.db" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$t'" | grep -q 1; then
    printf '  %-18s %s rows\n' "$t" "$(sqlite3 "$APP_DIR/data.db" "SELECT COUNT(*) FROM $t")"
  fi
done
printf '  %-18s %s files\n' "survey_uploads" "$(find "$APP_DIR/survey_uploads" -type f | wc -l)"
printf '  %-18s %s files\n' "audio_uploads"  "$(find "$APP_DIR/audio_uploads" -type f | wc -l)"
echo
echo "Compare these numbers with the admin dashboard on the old site."
