# BiMola Updater Design

## Understanding

- A small web application runs as a separate container in Portainer CE on a Docker Standalone environment.
- A single authenticated operator can fetch `vyslbysl/BiMola` `main`, build it on the remote Docker host, and replace the `bimola` container.
- The updater uses Portainer's API and does not mount the Docker socket.
- The existing container configuration is preserved.
- A candidate container must become healthy before replacement; a failed final replacement restores the previous container.
- The Portainer HTTPS origin is supplied through `PORTAINER_URL` at deployment time; TLS verification may be disabled for an internal, self-signed endpoint.
- Scheduling, multiple applications, arbitrary repositories and arbitrary shell commands are out of scope.

## Assumptions

- The GitHub repository is public.
- The `deployer` Portainer user can see the target container and will be granted build/create/start/stop/rename/remove permissions through resource ownership.
- Brief downtime during the final container swap is acceptable.
- One operator and one deployment at a time are sufficient.
- In-memory status and bounded logs are sufficient; no database is required.

## Architecture

The updater is a dependency-free Node.js HTTP service. It obtains the latest commit from GitHub, downloads the repository tarball, and forwards it to Docker's build endpoint through Portainer's endpoint proxy. It discovers exactly one accessible environment containing a container named `bimola`.

The service authenticates its own UI with HTTP Basic authentication, applies same-origin validation to the deployment request, limits failed authentication attempts, caps remote downloads, and never accepts a repository URL, Docker endpoint, image name, container name or command from the browser.

Before replacing production, it starts the new image as an isolated candidate and waits for the image health check. It then stops and renames the old container, creates a replacement from an allowlisted copy of its configuration, starts it, and waits for health. On failure it removes the failed replacement, restores the old name, and restarts the old container. The old image remains available after success.

## API

- `GET /health`: unauthenticated process health.
- `GET /api/status`: authenticated current deployment state and bounded logs.
- `POST /api/deploy`: authenticated, same-origin deployment trigger; returns `202`.
- `GET /`: authenticated single-page control panel.

## Decision Log

- Portainer API was selected over Docker socket access to reduce host-level exposure.
- A dedicated `deployer` Portainer user was selected over an administrator token.
- TLS verification can be disabled only for an explicitly configured internal Portainer URL when the installation uses a self-signed certificate.
- The target repository, branch and container are server-side constants/configuration, preventing command injection and SSRF through UI input.
- Preflight health validation and automatic rollback were selected over destructive replacement.
- An external image registry, scheduling, multi-app support and persistent history were deferred.
