# Manual .env instructions — Do NOT include any .env* files in ZIPs

The ZIP does not contain or change environment files. Update your existing `/var/www/html/deployigo.com/.env` **manually**. Keep backups/permissions; do not paste secrets into support messages.

### Required for your remote Docker worker

```dotenv
DEPLOY_TARGET=remote-docker
DEPLOY_REMOTE_HOST=192.168.1.167
DEPLOY_REMOTE_USER=root
DEPLOY_REMOTE_BASE=/opt/deployigo/workspaces
DEPLOY_REMOTE_PORT_START=18080
```

Use the worker's actual host/account and confirm passwordless SSH by a suitably restricted service account. Docker on the worker must already be available.

### Services (optional, defaults shown)

```dotenv
CUSTOMER_PORT=4300
ADMIN_PORT=4301
API_PORT=4302
API_BIND=127.0.0.1
PORTAL_BIND=127.0.0.1
```

Use `PORTAL_BIND=0.0.0.0` **only** on a trusted/firewalled LAN. Avoid exposing the API port directly. `npm run dev` defaults to 4400/4401/4402 and may be overridden with `DEV_CUSTOMER_PORT`, `DEV_ADMIN_PORT`, `DEV_API_PORT`.

### GitHub account connection and private repositories

```dotenv
GITHUB_CLIENT_ID=your-existing-value
GITHUB_CLIENT_SECRET=your-existing-value
GIT_TOKEN_ENCRYPTION_KEY=64-hex-characters-from-openssl-rand-hex-32
```

`GIT_TOKEN_ENCRYPTION_KEY` is **new**, required only for GitHub OAuth/private-token deployments. Generate your own random key with `openssl rand -hex 32`. Never enter a sample or fixed key. The access token is encrypted at rest using AES-256-GCM; rotating the key requires reconnecting affected repositories.

OAuth callback (normal localhost): `http://localhost:4300/api/oauth/github/callback`. Register this in GitHub Developer Settings → OAuth Apps. It must match the hostname+port the browser actually uses. GitHub can list up to 100 repositories in the initial page. OAuth credentials provide no automatic public internet access for Git push webhooks to a local LAN server.

### Restart

From the app root, stop previous processes then run `npm start` or `npm run dev`. `node --watch` dev mode restarts on file changes, not `.env` modifications in every process, so restart manually after `.env` changes.

### Avoid these mistakes

Never delete `data/db.json` to fix admin authentication. Never replace existing `.env` with a template. Never place real credentials inside a ZIP. Do not enable Internet-facing HTTP/SSH or Docker socket access to end-users.
