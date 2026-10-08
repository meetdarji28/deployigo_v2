# Deployigo — Local Prototype Improvement Pack (8 October 2026)

**Project lineage:** This ZIP is an improvement to the *standalone Node.js + JSON + SSH/Docker* prototype that was previously shared. It is **not** the newer TypeScript/PostgreSQL/Redis Deploy I Go monorepo built in the separate Milestone series. Do not merge their databases, sessions or deployment state automatically.

## Direct extraction — no parent directory in ZIP

Back up the current installation first, including `data/`, `.env`, and any other local changes. Stop all three old processes and then extract the ZIP directly into the application root:

```bash
cd /var/www/html/deployigo.com
# Save an external backup before overwriting source files.
unzip -o /path/to/dig-prototype-improvements-flat-2026-10-08.zip
npm run check
npm start
```

**No `.env`, `.env.example`, `.env.*`, database records, Git history, SSH keys or existing projects are packaged.** Your existing `.env` is not edited by application code or by the ZIP. Preserve its values. Do not use `unzip` with commands that delete files before extraction.

The ZIP root contains `frontend/`, `admin/`, `backend/`, `scripts/`, `tests/`, `docs/`, `package.json`, `README.md`, etc., **not** an extra `deployigo/` folder.

## Service URLs

| Mode | Customer | Admin login | Backend health |
|------|----------|-------------|----------------|
| `npm start` | `http://localhost:4300/app/` | `http://localhost:4301/login` | `http://localhost:4302/api/health` |
| `npm run dev` | `http://localhost:4400/app/` | `http://localhost:4401/login` | `http://localhost:4402/api/health` |

Admin dashboard: `http://localhost:4301/admin/`; admin cookie differs from customer cookie. The existing first-registered account with `isAdmin: true` can log in. Normal user sessions cannot access admin APIs.

## Improvements in this build

- **Blank projects:** HTML creates `index.html`; PHP creates a genuine executable `index.php` showing PHP runtime details. HTML runtime uses Nginx (remote); PHP uses the selected CLI Alpine PHP image.
- **Deployment readiness:** Remote preview URLs stay hidden while downloads, extraction, builds or runtime startup are in progress; a worker-side HTTP readiness probe must succeed before status becomes ready. Failures appear in the project's error/status fields and a compact deployment history.
- **Terminal:** Single-command Docker console uses `/usr/share/nginx/html` for HTML/Nginx, `/var/www/html` for PHP. Commands run only when the deployment is ready; no SSH or FTP credentials are exposed. This is *not* an interactive PTY.
- **GitHub:** Public HTTPS clone, and GitHub OAuth/PAT clone with one-time OAuth state/grants and AES-256-GCM encrypted project tokens (requires manual key configuration below). Signed GitHub webhook push sync supports GitHub source types. **No GitLab/Bitbucket OAuth yet.** No GitHub OAuth network round trip was tested in the local automated suite.
- **Databases:** Managed MySQL/PostgreSQL setup, automatic ENV injection, owner-only credentials display, internal-network warning, password rotation, list tables, 50-row read-only preview, small SQL export/import. **Must be verified on your actual Docker worker before use.** MongoDB and externally attached DB browsing are not implemented.
- **Project UX:** Full-viewport project panels with consistent navigation rail instead of small popups; statuses shown in project list and pipeline view; build history and clearer webhook instructions.
- **Admin:** Worker registration/health, CPU load/memory/storage metrics on request, project filtering with per-worker assignment, user listing and suspension/re-activation (never suspend current admin). Worker migration remains *not implemented*.

## Manual configuration in the existing `.env`

The application loads your already-existing `.env` without overwriting it. See `docs/ENV_MANUAL_CHANGES.md` for details and `docs/RELEASE_STATUS_AND_API.md` for routes, user/admin flows, and limitations. Key values to review:

```text
DEPLOY_TARGET=remote-docker         # Required for Docker-backed PHP, DB and terminal
DEPLOY_REMOTE_HOST=192.168.1.167     # Only if this is still the correct worker
DEPLOY_REMOTE_USER=root              # Use your configured SSH user
GITHUB_CLIENT_ID=...                 # Existing GitHub OAuth client ID
GITHUB_CLIENT_SECRET=...             # Existing GitHub OAuth secret
GIT_TOKEN_ENCRYPTION_KEY=...         # New: 32 cryptographically random bytes encoded as 64 hex chars
```

**GitHub OAuth callback to register in GitHub OAuth App:** `http://localhost:4300/api/oauth/github/callback` for the localhost normal-mode origin. If the browser accesses the app through a LAN IP or different port, set the callback to the exact browser-visible scheme/host/port. GitHub OAuth Apps support a configured callback URL, so use one consistent origin while testing. A localhost callback cannot be completed from another device's browser using a different hostname.

Generate the encryption key *privately on your own machine* with `openssl rand -hex 32`, manually add the output to your `.env` and restart the services. **Never share the generated key or your existing `.env` in chat.** Losing/changing this key invalidates saved Git credentials; back it up securely.

For the prototype on a trusted LAN, set `PORTAL_BIND=0.0.0.0` only behind a suitable firewall. Keep `API_BIND=127.0.0.1`, since website portals proxy API requests locally. HTTP LAN mode is **not** suitable for deployment of untrusted tenants or production secrets.

## Validation and known blockers

```bash
npm run check
```

The automated tests validate local API, HTML/PHP template generation, admin login separation, auth isolation, webhook signatures, pending preview gating, database credential visibility and user suspension. **They do not test actual Docker image builds, SSH, PHP 8.1–8.5 extension compatibility, GitHub OAuth's external handshake, sidecar provisioning, terminal execution, SQL import/export, or live webhook reception.** These require a controlled end-to-end run against the worker.

Still missing: multi-worker migration, durable deployment job queue, interactive WebSocket/PTY terminal, MongoDB browser, large database backups, schema editor, remote database exposure, full CI/CD rollback/log streaming, automatic Composer/Laravel dependency installation, WordPress/Next.js/Nuxt/Express support, production hosting hardening. Do **not** describe this build as fully production-ready.
