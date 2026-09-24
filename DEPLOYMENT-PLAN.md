# Deployigo deployment plan

## Environments

### Local development

- The control plane runs on the developer workstation: Node API, frontend, admin panel, and local database.
- A local Docker Compose worker will run project previews with CPU, memory, disk, network, and process limits.
- PHP projects use a PHP-FPM plus Nginx image; static projects use an Nginx image.
- No project code should execute directly inside the control-plane Node process once the Docker worker is enabled.

### Staging: `root@192.168.1.167`

- The remote host has Docker, Docker Compose v5.1.3, and libvirt/`virsh` installed.
- Existing local PHP and Nginx images are available: `runindia-local/php:local` and `runindia-local/nginx:local`.
- The control plane will connect through the existing SSH key and invoke a restricted deployment worker, not arbitrary shell commands.
- Each project gets its own container, filesystem directory, non-root runtime user, network policy, and resource limits.
- Cloudflare wildcard DNS and SSL route `PROJECTNAME-deployigo.nexuslink.co.in` to the staging gateway.
- Staging database containers and credentials remain per workspace/project.

The host currently has Apache bound to port 80 and approximately 13 GB free on its root filesystem. Deployigo must therefore use a dedicated gateway port or Apache reverse-proxy configuration after disk cleanup and before wildcard DNS is enabled. No existing Apache site or unrelated Docker container should be changed by the deploy worker.

### Live / on-premise

- Use the on-premise server as a separate production cluster, not as the first development target.
- Start with Docker for operational simplicity and repeatable CI/CD.
- Add KVM only when stronger tenant isolation is required or workloads need separate kernels. KVM increases image, networking, storage, and lifecycle complexity.
- Live domains use `PROJECTNAME.deployigo.com` behind a gateway and Cloudflare.

## Why Docker first

Docker gives the first milestone predictable builds, fast project startup, resource quotas, logs, health checks, image versioning, and a direct path from local to staging. KVM is a later isolation option for higher-risk or privileged workloads. The control plane should never run user PHP, Laravel, WordPress, or build scripts directly.

## Deployment boundary

The local Deployigo application is the control plane only: accounts, workspaces, project metadata, source configuration, job state, and audit records. User code must not execute on the control-plane workstation in the staging/live workflow. The remote worker will transfer source to a workspace/project-specific directory and start a bounded Docker runtime on `192.168.1.167`. Local PHP preview remains a development fallback until the remote worker and gateway are enabled.

## Next implementation slice

1. Add Docker Compose project worker locally.
2. Build PHP 8.3 and static-site runtime images.
3. Add deployment job records, logs, health status, and rollback metadata.
4. Add SSH worker on the staging host using a restricted service account and allowlisted commands.
5. Add Cloudflare wildcard routing after container health checks are reliable.

The current MVP intentionally uses a local PHP preview only. It does not connect to the remote host or claim that the staging DNS URL is live.
