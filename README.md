# Deployigo

Local-first MVP for managing projects and deploying small web workloads.

## Run locally

Requires Node.js 20 or newer.

```bash
npm start
```

Open `http://localhost:4300` for the public site, `/app/` for the user workspace, and `/admin/` for the admin panel. The first registered account is granted admin access for local development.

## MVP scope

- Public homepage with signup and login
- Password hashing with Node's built-in crypto module
- 8-hour cookie sessions and one active session per user
- Workspace and project creation
- PHP technology detection from uploaded project metadata or filename
- Local preview deployment with URL `http://localhost:4300/local/PROJECTNAME/`
- Public GitHub repository URL option (validation and source recording only in this milestone)
- Admin view for users, workspaces, projects, and deployments
- Deployment adapter boundary for a future Docker/KVM SSH worker

The remote host is never contacted by this local MVP. The `deployigo.nexuslink.co.in` staging URL is reserved for the later remote worker. Set `DEPLOY_MODE=ssh` only after that worker has been implemented and reviewed.

## Planned phases

1. Add 2FA after the third login, GitHub/Bitbucket/GitLab OAuth, and account recovery.
2. Replace the mock adapter with an isolated Docker worker on `root@192.168.1.167`, resource limits, build logs, and health checks.
3. Add Cloudflare wildcard routing and custom domains.
4. Add managed MySQL, PostgreSQL, MongoDB, and MSSQL databases.
5. Add jailed SFTP/SSH/FTP credentials using per-project namespaces and audited access.

This is an early local development foundation, not a production hosting control plane.
