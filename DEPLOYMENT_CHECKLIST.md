# Deployment Checklist

## Pre-Deployment
- [ ] Run automated tests (`npm run test`) to ensure functionality.
- [ ] Check security vulnerabilities (`npm audit` and static analysis).
- [ ] Take a full database backup (`./scripts/mysql_backup.sh` or equivalent).
- [ ] Ensure all API endpoints are up-to-date in Swagger documentation (`/api-docs`).
- [ ] Check resource usage thresholds using `/api/health`.

## During Deployment
- [ ] Run pending database migrations.
- [ ] Update environment variables if necessary (e.g., `process.env.NODE_ENV = 'production'`).
- [ ] Restart backend services gracefully.
- [ ] Verify TLS certificates via Caddy/Nginx logs.

## Post-Deployment
- [ ] Confirm the Application is accessible over HTTPS.
- [ ] Run functional smoke tests on critical paths (e.g., Auth, Quiz creation).
- [ ] Monitor rate-limits log output to ensure legitimate users are not blocked.
- [ ] Validate `/api/health` indicates `healthy: true`, memory limits are intact, and disk space is sufficient.

## Rollback Plan
- [ ] If `/api/health` fails post-deploy, revert the application container back to the previous tag.
- [ ] Restore DB backup if migration caused data corruption.
