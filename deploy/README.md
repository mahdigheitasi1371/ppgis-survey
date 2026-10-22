# Moving the survey platform to a new server and domain

New server: **one.com VPS, Ubuntu 26.04**, IPv4 `85.190.125.93`, IPv6 `2001:880:a:341::92`

Domain: **emschermap.de**

> Secrets (admin key, API key) are typed in on the server only. They are stored in
> `/etc/ppgis-survey.env` on the server and never go to GitHub.

---

## Step 1 – DNS for the new domain

In the DNS settings of the new domain, create:

| Type | Name / Host | Value |
|------|-------------|-------|
| A    | `@`   | `85.190.125.93` |
| A    | `www` | `85.190.125.93` |

Just change the value of the existing A records; keep the MX record (it is for email).
IPv6 (AAAA records to `2001:880:a:341::92`) is optional – skip it for now and add it later
once the site works.
Check after a few minutes: `ping emschermap.de` should show `85.190.125.93`.

## Step 2 – Set up the new server

Log in from your computer (Terminal on Mac/Linux, PowerShell on Windows):

```bash
ssh root@85.190.125.93
```

Then paste:

```bash
curl -fsSL https://raw.githubusercontent.com/mahdigheitasi1371/ppgis-survey/main/deploy/setup.sh -o setup.sh
bash setup.sh --domain emschermap.de --email YOUR@EMAIL --redirect participatorysurvey.site
```

It asks for:
- **ADMIN KEY**: the password for the admin dashboard (you can reuse the old one)
- **Anthropic API key**: only needed for auto-translation in the builder; press Enter to skip

It installs Python, Nginx, the app, a firewall, a daily backup and – if the DNS already
points here – an HTTPS certificate. If the DNS was not ready yet, just run the same
`bash setup.sh ...` line again later; it is safe to repeat.

`--redirect participatorysurvey.site` makes old survey links forward to the new domain
(only once the old domain's DNS also points to `85.190.125.93`, see Step 5). Leave it out
if you don't need it.

## Step 3 – Test copy of the data (old site keeps running)

Still on the new server:

```bash
bash /opt/ppgis-survey/deploy/migrate-data.sh root@OLD_SERVER_IP /path/of/app/on/old/server
```

It asks for the **old** server's password, copies `data.db`, `survey_uploads/` and
`audio_uploads/`, and prints how many surveys, responses and files arrived.
Open `https://emschermap.de/admin.html` and check that everything is there.

## Step 4 – Final switch (about 10 minutes)

1. On the **old** server, stop the app so no new responses arrive there:
   ```bash
   systemctl stop <old-service-name>
   ```
2. On the **new** server, run the copy again (same command as Step 3).
3. Share the new links: `https://emschermap.de/survey.html?slug=...`
   (use **Copy link** in the admin dashboard).

## Step 5 – Old domain participatorysurvey.site

- **Keep it for a while (recommended if links were shared):** point its A record to
  `85.190.125.93` and its AAAA record to `2001:880:a:341::92` (remove any old AAAA), then run
  `bash setup.sh` again with the same options. Old links will forward to the new domain.
- **Drop it:** simply don't renew it.

## Step 6 – Cancel the old server

Wait about a week. Then download a last backup from the **old** server to your computer and cancel it.

---

## Everyday commands (on the new server)

| What | Command |
|------|---------|
| Is the app running? | `systemctl status ppgis-survey` |
| Live logs | `journalctl -u ppgis-survey -f` |
| Restart | `systemctl restart ppgis-survey` |
| Install the latest code from GitHub | `bash setup.sh --domain emschermap.de --email YOUR@EMAIL` |
| Backup now | `ppgis-backup` |
| Copy backups to your computer | `scp -r root@85.190.125.93:/var/backups/ppgis ./ppgis-backups` (run on your computer) |
| Change admin key / API key | `nano /etc/ppgis-survey.env` then `systemctl restart ppgis-survey` |

Files on the server: app in `/opt/ppgis-survey`, database `/opt/ppgis-survey/data.db`,
uploads in `/opt/ppgis-survey/survey_uploads` and `/opt/ppgis-survey/audio_uploads`,
backups in `/var/backups/ppgis` (14 days kept).

## Optional: sharp satellite images worldwide in the 3D map

The 3D map uses free official aerial photos, fetched and cached by this server (no key needed):
- **North Rhine-Westphalia:** Geobasis NRW, 10 cm (Datenlizenz Deutschland Zero 2.0)
- **Spain** (incl. Balearic and Canary Islands): PNOA, Instituto Geográfico Nacional (CC BY 4.0)

Other places show a 10 m satellite image. For sharp images everywhere else you can add an Esri key
(first 2 million map tiles per month at no cost; the account may ask for payment details):

1. Create a free account at https://location.arcgis.com and create an **API key** with the
   privilege **Basemaps** (basemap styles / static basemap tiles).
2. In the key's settings, restrict **Referrers** to `https://emschermap.de`.
3. On the server:
   ```bash
   echo 'ESRI_API_KEY=PASTE_YOUR_KEY_HERE' | sudo tee -a /etc/ppgis-survey.env > /dev/null && sudo systemctl restart ppgis-survey
   ```
Without a key the 3D map still works: official photos in NRW and Spain, 10 m satellite images elsewhere.
Aerial photo tiles are cached in `/opt/ppgis-survey/tile_cache` (safe to delete; they are fetched again).
