#!/usr/bin/env bash
# Daily backup of the survey database and uploaded files.
# Installed by setup.sh as /usr/local/bin/ppgis-backup and run every night at 03:15.
# Run by hand any time:  sudo ppgis-backup
#
# Backups land in /var/backups/ppgis and are kept for 14 days.
# To copy them to your own computer:
#   scp -r root@SERVER_IP:/var/backups/ppgis ./ppgis-backups

set -euo pipefail

APP_DIR="/opt/ppgis-survey"
DEST="/var/backups/ppgis"
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DEST"
chmod 700 "$DEST"

# Consistent copy even while the app is running
python3 - "$APP_DIR/data.db" "$DEST/data-$STAMP.db" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
PY
gzip "$DEST/data-$STAMP.db"

tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$APP_DIR" survey_uploads audio_uploads 2>/dev/null || true

find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup ok: $DEST/data-$STAMP.db.gz"
