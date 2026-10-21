#!/usr/bin/env bash
# One-command server setup for the PPGIS survey platform.
#
# Run on a fresh Ubuntu server (tested target: Ubuntu 24.04 / 26.04 LTS) as root:
#
#   curl -fsSL https://raw.githubusercontent.com/mahdigheitasi1371/ppgis-survey/main/deploy/setup.sh -o setup.sh
#   bash setup.sh --domain meine-emscher.de --email you@example.org
#
# Options:
#   --domain NAME        main domain for the survey (required)
#   --email ADDRESS      email for Let's Encrypt certificate notices (required for HTTPS)
#   --redirect NAME      old domain that should forward to the new one (optional, repeatable)
#   --no-www             do not also serve www.<domain>
#
# Safe to run again later: it updates the code, keeps data.db, uploads and secrets.

set -euo pipefail

REPO_URL="https://github.com/mahdigheitasi1371/ppgis-survey.git"
APP_DIR="/opt/ppgis-survey"
APP_USER="ppgis"
SERVICE="ppgis-survey"
ENV_FILE="/etc/ppgis-survey.env"
PORT="8000"

DOMAIN=""
EMAIL=""
WWW=1
REDIRECTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)   DOMAIN="$2"; shift 2 ;;
    --email)    EMAIL="$2"; shift 2 ;;
    --redirect) REDIRECTS+=("$2"); shift 2 ;;
    --no-www)   WWW=0; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!  %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Please run as root (or with sudo)."; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Missing --domain. Example: bash setup.sh --domain meine-emscher.de --email you@example.org"; exit 1; }

. /etc/os-release
say "System: $PRETTY_NAME"
[[ "$ID" == "ubuntu" ]] || warn "This script was written for Ubuntu; continuing anyway."

# ---------------------------------------------------------------- packages
say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y python3 python3-venv python3-pip git nginx certbot python3-certbot-nginx \
                   rsync sqlite3 ufw curl
PYV=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
  || { echo "Python $PYV is too old (need 3.10+)."; exit 1; }
say "Python $PYV found"

# ---------------------------------------------------------------- app user + code
id "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"

if [[ -d "$APP_DIR/.git" ]]; then
  say "Updating code in $APP_DIR"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  say "Downloading code to $APP_DIR"
  mkdir -p "$APP_DIR"
  chown "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi
sudo -u "$APP_USER" mkdir -p "$APP_DIR/survey_uploads" "$APP_DIR/audio_uploads"

say "Installing Python packages"
[[ -d "$APP_DIR/venv" ]] || sudo -u "$APP_USER" python3 -m venv "$APP_DIR/venv"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --upgrade pip -q
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt" -q

# ---------------------------------------------------------------- secrets
if [[ ! -f "$ENV_FILE" ]]; then
  say "Secrets (stored only on this server in $ENV_FILE, never on GitHub)"
  while true; do
    read -r -s -p "Choose the ADMIN KEY (your admin dashboard password): " ADMIN_KEY; echo
    [[ ${#ADMIN_KEY} -ge 8 ]] && break
    echo "Please use at least 8 characters."
  done
  read -r -s -p "Anthropic API key for auto-translation (press Enter to skip): " ANTHROPIC_API_KEY; echo
  umask 077
  {
    echo "ADMIN_KEY=$ADMIN_KEY"
    [[ -n "$ANTHROPIC_API_KEY" ]] && echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
  } > "$ENV_FILE"
  umask 022
  chmod 600 "$ENV_FILE"
  unset ADMIN_KEY ANTHROPIC_API_KEY
else
  say "Keeping existing secrets in $ENV_FILE"
fi

# ---------------------------------------------------------------- systemd service
say "Creating the $SERVICE service"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=PPGIS survey platform (FastAPI)
After=network.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$APP_DIR/venv/bin/uvicorn platform_server:app --host 127.0.0.1 --port $PORT --proxy-headers --forwarded-allow-ips 127.0.0.1
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

# ---------------------------------------------------------------- nginx
NAMES="$DOMAIN"
[[ $WWW -eq 1 ]] && NAMES="$DOMAIN www.$DOMAIN"

say "Configuring Nginx for: $NAMES"
cat > /etc/nginx/sites-available/ppgis-survey <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $NAMES;

    # The app accepts photo/audio uploads up to 25 MB
    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF

if [[ ${#REDIRECTS[@]} -gt 0 ]]; then
  RNAMES=""
  for r in "${REDIRECTS[@]}"; do RNAMES="$RNAMES $r www.$r"; done
  cat > /etc/nginx/sites-available/ppgis-redirect <<EOF
# Old domain(s) forward to the new one, keeping the path (old survey links keep working)
server {
    listen 80;
    listen [::]:80;
    server_name$RNAMES;
    return 301 https://$DOMAIN\$request_uri;
}
EOF
  ln -sf /etc/nginx/sites-available/ppgis-redirect /etc/nginx/sites-enabled/ppgis-redirect
fi

ln -sf /etc/nginx/sites-available/ppgis-survey /etc/nginx/sites-enabled/ppgis-survey
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------- firewall
say "Firewall: allowing SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

# ---------------------------------------------------------------- daily backup
say "Installing daily backup (03:15, keeps 14 days in /var/backups/ppgis)"
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/ppgis-backup
echo "15 3 * * * root /usr/local/bin/ppgis-backup >/var/log/ppgis-backup.log 2>&1" > /etc/cron.d/ppgis-backup

# ---------------------------------------------------------------- health check
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  say "App is running"
else
  warn "App did not answer. Check with: journalctl -u $SERVICE -n 50"
fi

# ---------------------------------------------------------------- HTTPS
MYIP=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
CERT_NAMES=()
for n in $NAMES ${REDIRECTS[@]+"${REDIRECTS[@]}"}; do
  if getent ahostsv4 "$n" | awk '{print $1}' | grep -qx "$MYIP"; then
    CERT_NAMES+=("$n")
  fi
done
for r in ${REDIRECTS[@]+"${REDIRECTS[@]}"}; do
  getent ahostsv4 "www.$r" | awk '{print $1}' | grep -qx "$MYIP" && CERT_NAMES+=("www.$r")
done

if [[ -z "$EMAIL" ]]; then
  warn "No --email given, skipping HTTPS. Run the script again with --email when ready."
elif [[ ! " ${CERT_NAMES[*]} " =~ " $DOMAIN " ]]; then
  warn "$DOMAIN does not point to this server ($MYIP) yet, so HTTPS was skipped.
    Set the DNS A record of $DOMAIN to $MYIP, wait a few minutes, then run this script again."
else
  say "Requesting HTTPS certificate for: ${CERT_NAMES[*]}"
  ARGS=()
  for n in "${CERT_NAMES[@]}"; do ARGS+=(-d "$n"); done
  certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" "${ARGS[@]}"
fi

say "Done."
echo "  Survey builder : http://$DOMAIN/   (https once the certificate is issued)"
echo "  Admin          : http://$DOMAIN/admin.html"
echo "  Logs           : journalctl -u $SERVICE -f"
echo "  Next step      : copy your data with deploy/migrate-data.sh (see deploy/README.md)"
