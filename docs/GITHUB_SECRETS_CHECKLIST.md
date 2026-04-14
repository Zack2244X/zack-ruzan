# GitHub Secrets Checklist

## Why this exists
This checklist makes workflow failures explicit and helps avoid red runs caused by missing repository secrets.

## Required by CI/CD - Build & Deploy to Droplet
Workflow file: `.github/workflows/deploy-droplet.yml`

Required repository secrets:
- `DOCKER_USERNAME`
- `DOCKER_TOKEN`
- `IMAGE_NAME`
- `DROPLET_HOST`
- `DROPLET_USER`
- `SSH_PRIVATE_KEY`
- `REMOTE_APP_DIR`

Optional:
- `APP_HEALTHCHECK_URL` (falls back to `https://zackpro.codes/healthz`)

## Required by DAST Baseline Scan
Workflow file: `.github/workflows/dast.yml`

Required repository secret:
- `DAST_TARGET_URL`

Recommended value guidance:
- Use a staging URL that mirrors production controls.
- Prefer HTTPS.
- Keep auth/rate-limit/proxy behavior enabled to catch realistic runtime issues.

## Required by current Deploy command behavior
Make sure remote host contains:
- `docker-compose` available in PATH.
- Application directory at `REMOTE_APP_DIR`.
- Compose project files and env files already provisioned.

## How to verify quickly
1. Open repository settings -> Secrets and variables -> Actions.
2. Confirm each required secret exists and is non-empty.
3. Trigger `DAST Baseline Scan` manually once.
4. Trigger `CI/CD — Build & Deploy to Droplet` from a safe commit.

## Interpreting red workflow entries in VS Code
A red X in the run list means that workflow run failed. It does not always mean application code is broken.
Common causes:
- Missing or invalid secrets.
- Target host/network issues during deploy.
- External scanner/runtime availability issues.
