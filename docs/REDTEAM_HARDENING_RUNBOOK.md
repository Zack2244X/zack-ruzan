# Red-Team Hardening Runbook

## Objective
Raise platform resilience against realistic red-team activity by combining code, infrastructure, and operational controls.

## 1. Secret Rotation Policy
- Rotate immediately if secrets were ever present in local env files on shared systems.
- Rotate every 30 days for high-value secrets (JWT, DB, OAuth client secret).
- Keep production secrets only in the deployment platform secret store, not in files.

### Mandatory rotation targets
- JWT_SECRET
- DEVICE_FP_SECRET
- DB_PASSWORD and MYSQL_ROOT_PASSWORD
- GOOGLE_CLIENT_SECRET
- NEW_RELIC_API_KEY
- DOCKER_TOKEN and SSH_PRIVATE_KEY in GitHub Secrets

### Post-rotation verification
- Confirm app boot with new secrets.
- Validate login/logout and protected endpoints.
- Invalidate old sessions by bumping token version if needed.

## 2. Edge and Network Controls
- Keep only ports 22, 80, 443 open on host firewall.
- Restrict SSH source IPs to admin ranges when possible.
- Enable fail2ban for SSH with aggressive retry policy.
- Ensure Nginx rate-limit and connection-limit remain enabled.

## 3. Host Hardening Baseline
- Disable password authentication in SSH.
- Disable root SSH login.
- Enable unattended security updates.
- Forward auth and app logs to centralized storage.

## 4. CI Security Gates
- Secret scanning must fail build on leaks.
- CodeQL analysis must run on push and PR.
- Container image scan must fail on HIGH/CRITICAL findings.
- Dependency audit should fail for high severity vulnerabilities.

## 5. Runtime Detection
- Alert on spikes in 401, 403, and rate-limit responses.
- Alert on repeated failed auth attempts by IP/device/user.
- Alert on unusual admin endpoint access patterns.

## 6. Incident Response (First 30 minutes)
1. Block offending source IPs at edge firewall and Nginx.
2. Rotate JWT_SECRET and invalidate active sessions.
3. Rotate DB and OAuth secrets if compromise suspected.
4. Snapshot logs and preserve forensic evidence.
5. Deploy clean build from trusted commit.

## 7. Recovery Checklist
- Confirm all security workflows are green.
- Verify no secrets in tracked git history for latest branch.
- Confirm production environment variables match rotated values.
- Run full test suite and smoke tests.