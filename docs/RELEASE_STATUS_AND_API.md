# Deployigo Prototype — Status, Developer Routes and Flow

**Date:** 2026-10-08. This document describes this Node.js/JSON prototype build, *not* the new TypeScript control-plane monorepo.

## Customer workflow

Sign in (customer port 4300) → New project → select **PHP** or **HTML** → choose Blank, ZIP or GitHub → project metadata created → source prepared → Docker deployment scheduled → **deploying / error / ready** status displayed → **URL appears only after readiness check** → open full-screen project workspace → files, terminal, DB, environment, pipeline, logs and settings.

HTML blank `index.html` uses Nginx. PHP blank `index.php` is PHP code displaying PHP_VERSION and time; worker runtime uses selected `php:8.x-cli-alpine`. PHP ZIP import with `composer.json` is detected and Composer installation is suggested, not silently guaranteed. The terminal runs inside the container, not on the worker host.

### Remote deployment state model

1. Create row (`creating`, `extracting`, `downloading`), store source.
2. Background serialized job sets `deploying` and `deploymentReady=false`.
3. Control plane sends tar/SSH, builds Docker image, runs container. PHP runtime readiness requires worker-side HTTP check.
4. Only on successful probe, set `sourceStatus=ready`, `deploymentReady=true`, show URL. On failure set `sourceStatus=error`, record sourceError and failed history entry; URL hidden.
5. Redeploy and updates enqueue a new job; cannot claim successful deployment before probe.

**Caveat:** Deployment processes are in-memory and persist only their resulting records; a process restart during a job can leave a stale status. Multi-process-safe queues, heartbeat recovery and blue/green cutover are future work. Existing project records without `deploymentReady` need a new successful deployment for remote URLs to become visible.

## Administrator workflow

Admin sign-in at port 4301 → role-checked dashboard → platform totals → worker node registrations and per-node capacity on demand → project search/status across users → users and suspend/reactivate non-admins. Suspended sessions are revoked but existing app containers are not stopped automatically. Removing a worker with assigned projects is blocked. Project migration/drain is NOT implemented. Worker health checks may fail without configured SSH permissions.

## API reference (same paths proxied from 4300 customer / 4301 admin)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | Customer auth; first account admin in empty data store |
| POST | `/api/admin/login`, `/api/admin/logout` | Separate admin session |
| GET | `/api/me` | Customer projects; DB/env/Git secrets masked, hidden deployment URL until ready |
| POST | `/api/projects/blank` | Create blank HTML or PHP and enqueue deployment |
| POST | `/api/projects` | ZIP, public GitHub, GitHub OAuth grant or PAT; GitHub private requires configured encryption key |
| GET | `/api/projects/:id/inspect` | Detect source/Composer/Laravel needs |
| GET | `/api/projects/:id/runtime` | Worker-side PHP version, module and Composer check |
| GET | `/api/projects/:id/files` | List files, or `?path` to read one |
| PUT / DELETE | `/api/projects/:id/files?path=...` | Update/delete file with owner check; redeploy |
| POST | `/api/projects/:id/files/upload` / `files/folder` | Upload, create directory |
| PATCH / DELETE | `/api/projects/:id` | Update settings / delete project |
| POST | `/api/projects/:id/rebuild`, `/redeploy`, `/restart`, `/toggle`, `/maintenance` | Project actions, some asynchronous |
| POST | `/api/projects/:id/php-settings`, `/php-modules` | PHP only |
| GET | `/api/projects/:id/logs` | Container logs |
| POST | `/api/projects/:id/composer` | PHP Composer inside running container |
| POST | `/api/projects/:id/terminal/exec` | Single command; correct per-tech workdir, owner+readiness check |
| POST | `/api/projects/:id/database` | Provision MySQL/PostgreSQL or attach existing (no silent overwrite) and populate ENV |
| GET | `/api/projects/:id/database/details` | Explicit owner-only credentials response; no-store |
| POST | `/api/projects/:id/database/rotate-password` | Managed DB password change, queue app redeploy; check response before reuse |
| GET | `/api/projects/:id/database/tables` | Managed DB table list |
| GET | `/api/projects/:id/database/rows?table=...` | Read-only managed DB 50-row preview |
| GET | `/api/projects/:id/database/export` | SQL text backup, max 4 MB |
| POST | `/api/projects/:id/database/import` | Body `{sql}`; 1 MB maximum; destructive SQL possible |
| GET / POST | `/api/projects/:id/env` | Read / write app ENV; managed DB keys preserved on save |
| POST | `/api/projects/:id/cicd` | Save/execute startup build commands during redeploy |
| POST | `/api/projects/:id/webhook/configure` | Rotate and reveal HMAC webhook secret once |
| POST | `/api/webhooks/github/:projectId` | Signed push event; branch/repository/delivery validated |
| GET | `/api/oauth/github/authorize` | Authenticated OAuth initiate, random state, redirect |
| GET | `/api/oauth/github/callback` | Verify state/session; return browser-safe one-time repo grant |
| GET | `/api/admin/summary`, `/api/admin/workers`, `/api/admin/users`, `/api/admin/projects` | Admin role only |
| GET | `/api/admin/workers/:id/health` | Worker CPU load, RAM, storage, running containers |
| POST / DELETE | `/api/admin/workers` / `/api/admin/workers/:id` | Register/remove unassigned node |
| PATCH | `/api/admin/users/:id` | `{suspended: boolean}`; can't suspend admin |
| GET | `/api/health` | Unauthenticated API availability |

## DB behavior and limitations

Managed DB provisioning creates a Docker sidecar on `deployigo-net` and injects DB_HOST/PORT/DATABASE/USERNAME/PASSWORD/DATABASE_URL. **Internal Docker hostname cannot be used from an external computer.** It is not a public MySQL/PG endpoint, and there is no remote-access toggle yet. Database manager offers basic SQL-backed browser, not the complete phpMyAdmin, pgAdmin or MongoDB Compass functionality. SQL import is explicitly destructive; verify on a throwaway database first. Passwords revealed in the browser are sensitive and only provided on an explicit GET details request by the owning user.

## Git and CI/CD caveats

OAuth App callback must be configured on the actual customer origin. OAuth state is single-use and bound to existing customer session. A project stores AES-GCM ciphertext, not a Git token. Git credentials may expire or be revoked, requiring reconnect; token refresh is not implemented. Public GitHub source works without an OAuth client if repo/branch reachable.

Webhooks use HMAC-SHA256 (`X-Hub-Signature-256`), delivery IDs, exact branch/repo matching; user has to register the secret/payload URL in GitHub manually. A LAN-only server **cannot receive GitHub-hosted webhooks** without an authorized secure ingress. In-process jobs, source sync, and startup build commands are not a complete CI/CD engine; no durable distributed queue, full log streaming, blue/green deploy, or rollback.

## Verification checklist (perform on your own worker)

1. Backup `data/` and `.env`; check all three ports, login roles, and users.
2. Create fresh Blank HTML → confirm `index.html` and Nginx responds, terminal `pwd && ls` from `/usr/share/nginx/html`.
3. Create Blank PHP for each PHP 8.1–8.5 → verify PHP_VERSION output, `/runtime`, modules and Composer from Docker; do not assume every extension succeeds.
4. Import simple HTML ZIP and PHP ZIP with/without Composer; verify sourceAnalysis and Docker logs, especially failure paths.
5. Connect public GitHub repo; if key configured, test OAuth and PAT private GitHub clones; verify tokens never occur in project JSON API.
6. Create MySQL and PostgreSQL databases on throwaway projects; wait for ready, reveal owner-only credentials, browse tables, export/import small test data, rotate password, test application connection with injected ENV.
7. Test a signed GitHub webhook using a public ingress or local simulated HMAC; verify branch mismatch ignored and replay delivery deduplicated.
8. Admin: check worker RAM/storage/CPU load, add/remove empty worker, test user suspension and non-admin access. Never test workspace migration with current code.

**Actual external integrations and PHP/DB runtime compatibility were NOT verified by the local automated tests.**
