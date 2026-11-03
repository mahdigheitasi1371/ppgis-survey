#!/usr/bin/env bash
# Keeps server logs that contain IP addresses for at most 7 days (as promised to participants
# and in the ethics application). Safe to run more than once.
#   sudo bash /opt/ppgis-survey/deploy/privacy-logs.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo."; exit 1; }

# 1) Web server (nginx) access and error logs: rotate every day, keep 7 days, then delete.
if [ -d /etc/logrotate.d ]; then
cat > /etc/logrotate.d/nginx <<'CONF'
/var/log/nginx/*.log {
    daily
    rotate 6
    maxage 7
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then kill -USR1 "$(cat /var/run/nginx.pid)"; fi
    endscript
}
CONF
fi

# 2) System journal (contains the survey app's access log with IP addresses): keep 7 days.
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/ppgis-retention.conf <<'CONF'
[Journal]
MaxRetentionSec=7day
MaxFileSec=1day
CONF
systemctl restart systemd-journald
journalctl --vacuum-time=7d >/dev/null 2>&1 || true

# 3) Remove nginx logs that are already older than 7 days.
find /var/log/nginx -type f -mtime +7 -delete 2>/dev/null || true

echo "==> Done. Server logs with IP addresses are now kept for at most 7 days."
