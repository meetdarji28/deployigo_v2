> **Architecture update (2026-10-08):** The older single-server port URLs and `backend/src/server.js` paths described below are historical. This release runs **customer :4300**, **admin :4301**, **API :4302** (`npm start`), or **:4400/:4401/:4402** (`npm run dev`). Admin uses its **own** `admin/login.html` and `POST /api/admin/login` and separate `deployigo_admin_session` cookie; admin logout uses `POST /api/admin/logout`. Current code paths are `backend/api/server.js` and `backend/portals/server.js`. See `README.md` first. Feature statuses below may refer to the prior single-server structure.

---

# Deployigo developer status, architecture and API
**Reviewed against the uploaded legacy `dig.zip` and updated source on 8 October 2026.**

## 1 — Important baseline distinction

The archive contains a **single Node.js CommonJS HTTP server** (`backend/src/server.js`), vanilla HTML/JS frontend, file-based JSON metadata (`data/db.json`), and SSH-to-Docker worker integration. It is **not** the newer TypeScript monorepo architecture with PostgreSQL, Redis/MFA and Vitest milestone numbers. No schema migrations or modern monorepo tests were imported into this older codebase. The earlier 20-slide HTML presentation is a specification/reference, not an independently verified functional test report.

### Environment

| Component | Current code | Verification |
|---|---|---|
| Control plane | Node.js >=20 `node:http`, cookie-based sessions | HTTP integration-tested in isolated local mode |
| Storage | `data/db.json`, `data/projects/<id>` | Local test only, not concurrency-safe DB |
| Local static preview | `/local/<projectName>/`, HTTP | Tested for HTML |
| PHP execution | remote `php:<version>-cli-alpine` runtime generation | **Not tested on Docker worker**; host PHP explicitly disabled |
| HTML Docker worker | Nginx Alpine container generation | **Not tested on Docker worker** |
| Worker channel | control plane → SSH → Docker | Optional explicit remote mode; no live SSH test |
| Git import | `git clone` with public HTTPS GitHub URL | URL validation tested; live clone untested |
| Databases | MySQL/PostgreSQL Docker sidecars in remote deployment branch | Unverified; remote-only and manager UI incomplete |
| Admin portal | real authenticated `/api/admin/summary` + worker registration/health | Summary/CRUD tested; live worker health untested |

## 2 — Regular user flow (implementation)

1. User visits `/signup.html` or `/login.html`, sends `POST /api/auth/signup` or `/api/auth/login`; receives `deployigo_session` HttpOnly cookie. Local account created by first signup receives `isAdmin`.
2. In `/app/` choose **PHP** or **HTML** and **Blank**, **ZIP**, or **Git** source. Supported created projects are restricted to PHP/HTML, so planned frameworks are not misrepresented as deployed.
3. Blank HTML sends `POST /api/projects/blank` with `{name,technology:'html',initialHtml?}`; writes `index.html`. Blank PHP uses `{technology:'php',phpVersion:'8.2'}`; writes `index.php`. HTML no longer receives `index.php`.
4. ZIP sends multipart `POST /api/projects` with `sourceType=zip`, `technology`, and `source` archive. A ZIP parser validates central-directory paths, member sizes, symlinks, entry points before deployment. Bad archive surfaces `sourceStatus=error` and `sourceError` in project details.
5. Git **public** sends `{sourceType:'github', repoUrl:'https://github.com/owner/repo.git',repoBranch:'main',technology}`. Repository is cloned into a staging directory before replacing existing source; errors are visible. Private PAT/OAuth are explicitly `501 Not Implemented`: tokens are not stored in this version.
6. Edit project files using Files tab. Environment keys can be saved by owner. `/api/me` masks secret ENV values; the owner's `GET /api/projects/:id/env` provides values for editing and sets `Cache-Control: no-store`.
7. `GET /api/projects/:id/inspect` shows entry point, Composer/Laravel suggestions, status/errors. `GET /api/projects/:id/runtime` executes PHP, module and Composer probes **only on a connected Docker worker**.
8. With `DEPLOY_TARGET=local-preview`, HTML is viewable through `/local/<name>/`; PHP files are never executed on the Node host. With explicit `DEPLOY_TARGET=remote-docker`, code is transferred to remote Docker and PHP/Nginx runs there. Validate runtime and live URL after build.
9. Public GitHub source can be connected to signed push webhook. Click **Configure GitHub Webhook** to receive one-time secret; register URL/secret in GitHub. Each matching main/selected-branch push is HMAC-verified and queued. Requires securely reachable ingress outside LAN.
10. The **Command Console** button opens an authenticated single-command runner within the remote project Docker container. This is not SFTP/FTP/SSH credential sharing and **not** full PTY/WebSocket interactive terminal. In local preview it explicitly reports unavailable.

## 3 — Admin flow (implementation and future)

1. Admin signs in, accesses `/admin/` and authenticated `GET /api/admin/summary`. Non-admin receives HTTP 403.
2. Summary shows users, projects, enabled projects, configured workers, and **local control-plane** RAM totals (not worker RAM).
3. Admin registers a worker using `POST /api/admin/workers` `{host,user}`; this stores metadata, not SSH credentials and **does not schedule projects onto that node**.
4. Admin may explicitly check worker health with `GET /api/admin/workers/:id/health`, which connects over internally configured SSH and reads Docker status, `free`, `df`, CPU core count and Linux load averages. Parsed RAM/disk used/free/total, load average, and container count appear in the dashboard; CPU load is not CPU usage %. No polling of worker nodes occurs during normal local-mode tests.
5. Admin can `DELETE /api/admin/workers/:id` only if no projects are assigned to the target, otherwise receives 409. Removal is administrative metadata only; does not destroy the host.
6. **NOT IMPLEMENTED:** automatic worker scheduling, balancing, drain, workspace/database migration, data reconciliation, zero-downtime proxy cutover, rollback and admin user suspension. Moving live workspaces needs a designed multi-node scheduler, persistent storage, DB backup/restore, cutover, health probes and rollback — never promise invisible zero-downtime migration with this old prototype.

## 4 — PHP version and extension reality

| Runtime selection | Input accepted | Remote image build | PHP/extensions/composer verified live |
|---|---|---|---|
| PHP 8.1 | YES | Dockerfile generated with `php:8.1-cli-alpine` | **NOT VERIFIED** |
| PHP 8.2 | YES | Dockerfile generated with `php:8.2-cli-alpine` | **NOT VERIFIED** |
| PHP 8.3 | YES | Dockerfile generated with `php:8.3-cli-alpine` | **NOT VERIFIED** |
| PHP 8.4 | YES | Dockerfile generated with `php:8.4-cli-alpine` | **NOT VERIFIED** |
| PHP 8.5 | YES | Dockerfile generated with `php:8.5-cli-alpine` | **NOT VERIFIED** |

The code supports PHP configuration validation and extension toggles but does **not** demonstrate every combination successfully compiles. Run a fresh remote project per PHP version, invoke `GET /api/projects/:id/runtime`, inspect `php -v`, `php -m`, `composer --version`, load an actual PHP page and test configured extensions. PECL packages, `gd`, `imagick`, `memcached` and MongoDB drivers may require version-specific build fixes. PHP 8.1 may also be past security support in 2026; don't treat availability as security suitability.

Composer detection reads `composer.json`, with Laravel hint if `artisan` + `public/index.php` exist. **Composer is not automatically installed at source import**, and Laravel migrations are not auto-run. User can invoke Composer manually on a running remote PHP container; migration commands must remain explicit. Build steps set through `/cicd` run at container startup with `set -e`; failures should not silently be ignored. Worker-side behavior still requires testing.

## 5 — API routes implemented in this archive

All routes under `/api/` except auth and signed public webhook require a login session. All project access is owner-scoped; admin routes require `isAdmin`.

| Method | Route | Notes |
|---|---|---|
| POST | `/api/auth/signup` | Register, first-ever user admin in local DB |
| POST | `/api/auth/login` | Sets HttpOnly session cookie; no password hash returned |
| POST | `/api/auth/logout` | Clears session |
| GET | `/api/me` | Own projects, masked ENV keys, status/usage |
| POST | `/api/projects/blank` | PHP/HTML selection, chosen PHP version, optional `initialHtml` |
| POST | `/api/projects` | Multipart ZIP or JSON public GitHub source; private/OAuth 501 |
| GET | `/api/projects/:id/inspect` | File entry point and Composer/Laravel diagnostics |
| GET | `/api/projects/:id/runtime` | Remote PHP version/module/Composer verification, remote-only |
| GET | `/api/projects/:id/files` | File tree / optional `?path=...` to read |
| PUT | `/api/projects/:id/files?path=...` | Save code; schedules redeploy |
| DELETE | `/api/projects/:id/files?path=...` | Delete file/folder |
| POST | `/api/projects/:id/files/upload` | Individual multipart file |
| POST | `/api/projects/:id/files/folder` | Create directory |
| PATCH | `/api/projects/:id` | Update project/PHP metadata or switch to public Git |
| DELETE | `/api/projects/:id` | Remove project and remote runtime if configured |
| POST | `/api/projects/:id/rebuild` | Manual rebuild (ZIP re-import or public Git clone) |
| POST | `/api/projects/:id/redeploy` | Remote-only redeploy |
| POST | `/api/projects/:id/restart` | Remote-only container restart request |
| POST | `/api/projects/:id/toggle` | Enable/disable project |
| POST | `/api/projects/:id/maintenance` | Maintenance mode |
| POST/PATCH | `/api/projects/:id/php-settings` | Validated PHP ini directives; PHP-only |
| POST/PATCH | `/api/projects/:id/php-modules` | PHP extension selection; PHP-only |
| GET | `/api/projects/:id/logs` | Remote Docker logs, remote-only |
| POST | `/api/projects/:id/composer` | Remote Composer command, PHP-only |
| POST | `/api/projects/:id/database` | Remote-only DB provision or config; asynchronous, not full DB manager |
| GET | `/api/projects/:id/env` | Owner-only current environment keys/values (no-cache) |
| POST | `/api/projects/:id/env` | Validate and update ENV map; local or remote |
| POST | `/api/projects/:id/cicd` | Save startup build-step commands; no deployment history |
| POST | `/api/projects/:id/terminal/exec` | Authenticated one-command Docker console (no PTY) |
| POST | `/api/projects/:id/webhook/configure` | Create/rotate HMAC secret for public GitHub source; returns secret once |
| POST | `/api/webhooks/github/:projectId` | Public signed GitHub push receiver, HMAC-SHA256, branch+repo validation, delivery dedupe |
| GET | `/api/admin/summary` | Admin counts/project overview |
| GET | `/api/admin/workers` | Admin worker registry |
| POST | `/api/admin/workers` | Admin worker registration |
| DELETE | `/api/admin/workers/:id` | Admin remove unassigned node only |
| GET | `/api/admin/workers/:id/health` | Explicit SSH health/resource probe |

The original `/api/oauth/*` handlers are disabled with `501` because the token-handshake/state binding and secure clone integration are incomplete. `GET /api/admin/summary` was previously referenced by UI but missing in server; it now exists.

### Example API request

```json
POST /api/projects/blank
{"name":"sample-html","technology":"html","initialHtml":"<!doctype html><h1>Hello!</h1>"}
```

### Signed GitHub push setup

1. Create public GitHub project. Choose correct branch.
2. Call `POST /api/projects/:id/webhook/configure` as owner; copy **path** and **secret**. This replaces any previous secret.
3. GitHub repository → Settings → Webhooks: URL = trusted externally reachable control-plane origin + path, content type `application/json`, secret = issued secret, event `push`.
4. Receiver checks header `X-Hub-Signature-256=sha256=<hex>`, repo URL, selected branch, and `X-GitHub-Delivery`; then enqueues a fresh public clone and deploy.
5. Confirm `/api/me` status and open project page. A `202` response means **accepted/queued**, not completed successfully.

## 6 — Database and ENV behavior

Managed MySQL and PostgreSQL options are present in the remote worker code; MongoDB is **not supported**. New DB credentials are generated when password field is empty; database credentials and custom ENV are kept in project metadata (the old JSON DB) and injected as Docker environment variables. In new managed databases, DB containers are on a shared Docker network and database ports are not published by default in this update. Persistent Docker named volumes are used. Existing external DB support is configuration-only; no connectivity validation has been tested. Never assume DB setup succeeded until inspecting source status, remote logs and a real test query.

**Missing:** database schema/tables/rows UI (phpMyAdmin-like), PostgreSQL query browser, Mongo collection browser, SQL/JSON import/export, backup/restore, schema-level permissions, secrets vault and database migration. These need driver-based access with strict authorization and limits, rather than allowing unrestricted host command composition.

**ENV:** `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DATABASE_URL` are injected when DB is configured. Custom keys can be added in the ENV modal; invalid key names and newline injection are rejected. `GET /api/me` masks ENV secrets; owner-only `/env` returns values to edit. They remain plaintext in the legacy JSON store and Docker process environment; this is **not secure at multi-tenant production scale**.

## 7 — Known risks / unverified portions

- **Security (high):** legacy flat-file auth/metadata, first registrant admin, no MFA/CSRF hardening equivalent to newer monorepo, session cookies not fully production-ready, remote container permissions. Not suitable for anonymous public users.
- **Secrets (high):** original ZIP includes credentials and account records. Updated ZIP sanitizes supplied data, but revoke leaked tokens and scrub any published Git history. Worker DB credentials remain in old JSON/process env until secrets manager redesign.
- **Git private integration:** disabled, **not solved**. PAT must never be embedded in persistent clone URL or logs; implement server-side encrypted credential store + safe one-shot `GIT_ASKPASS`/credential broker, per-user scope and OAuth `state` verification.
- **CI/CD:** signed GitHub push webhook and per-project async queue added; no public ingress in LAN, no durable queue across crashes, status streaming, step-by-step deployment records, rollback or concurrency locks across multiple processes.
- **PHP runtime:** user-selectable images generated but no live Docker verification for PHP 8.1–8.5 or all 20+ extensions. Do not label all as working without matrix tests.
- **Terminal:** restricted to one authenticated project container but still executes arbitrary commands inside that container. Before public access: non-root runtime identity, sandbox policies, filesystem/volume hardening, resource quotas, audit trails, proper PTY multiplexing and session revocation.
- **Multi-worker:** admin registry and metrics display only. Scheduler, migration and user-transparent cutover are planned, not operational.
- **File and host isolation:** file-based preview does not execute PHP on control plane; remote Docker SSH templates/volume mounts still require audit, escaping tests, rootless worker approach and container escape protection.
- **Build failure semantics:** worker output/error handling improved but no real live worker probe was permitted, so don't assume rollback or zero downtime. Existing redeploy removes old container before replacement.

## 8 — Prioritized next milestones / acceptance criteria

**P0 — Prove worker execution on a disposable LAN Docker host:** build PHP 8.1 through 8.5 and HTML static, view real pages, test Composer/critical modules, repeat with extension toggles, verify failed builds leave clear project status; capture real log evidence. Test a worker with non-root, scoped credentials. Do not touch production services or existing project data.

**P1 — Reliable Git & CI/CD:** state-bound OAuth + credential storage for private repos, event-driven durable queue, job history/streaming, checksummed source checkout, webhook replay limits, GitHub push end-to-end with an approved ingress, retained working deployment on failed build, deployment diff and rollback.

**P2 — Managed DB & ENV:** health checks on provision, audited migrations, connection testing, credential rotation, private container networking, true SQL/collections viewer, paginated rows, import/export with quotas and explicit confirmation, backups; use a secure vault instead of flat JSON.

**P3 — Full browser terminal:** WebSocket + PTY attached to non-root isolated app container only, idle timeout, terminal resize, connection revocation, audit and explicit security review. Never distribute SSH/FTP credentials to customers.

**P4 — Admin worker pool:** heartbeat, CPU/RAM/disk sampling (used/free), quota-aware placement, worker drain, project+DB snapshot, verified restore to target, health-checked cutover, rollback, admin-only logs; only claim zero downtime when stable reverse proxy is in place.

**P5 — Runtime template catalog:** WordPress, Laravel and Laravel+Vue/React, Node.js/Next/Nuxt/Express; auto-detect `composer.json`, `artisan`, `package.json`, framework output directories and build commands. Preserve manual override and explicit consent for destructive DB migrations.

Keep the local-IP prototype until correctness/security gates pass. Domains, TLS, edge proxy and hosted multi-tenant deployment are separate later work.

## 9 — Admin page URL and login navigation fix (Oct 8, 2026)

- Admin HTML UI route: `GET /admin/` (also `/admin/index.html`). `GET /admin` permanently redirects to `/admin/`.
- Guests are sent to `/login.html?next=%2Fadmin%2F`; after login, this safe allowlisted return path is honored instead of unconditionally opening `/app/`.
- An authenticated administrator receives HTTP 200. An authenticated non-admin receives HTTP 403 with an access-denied page, not a workspace redirect.
- `GET /api/me` now includes `user.isAdmin`, and the regular app exposes **Admin Console** in its navigation only for admins. Server-side `/api/admin/*` access controls remain enforced.
- API integration tests confirm admin access, unauthenticated redirect, non-admin denial, trailing-slash normalization and account-role signaling.
- This archive is a legacy prototype, not the newer DIG control plane with organizations and PostgreSQL/Redis.
