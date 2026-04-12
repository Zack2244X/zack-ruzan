#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TS=$(date +'%Y%m%dT%H%M%SZ')
FNAME="mysql-backup-$TS.sql.gz"

echo "Starting MySQL backup: $FNAME"

# Use MYSQL_PWD to prevent password exposure in 'ps aux'
export MYSQL_PWD="${DB_PASSWORD:-}"
mysqldump -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "${DB_USER:-root}" "${DB_NAME:-appdb}" | gzip > "$BACKUP_DIR/$FNAME"
unset MYSQL_PWD

# Keep last 14 backups
find "$BACKUP_DIR" -type f -name 'mysql-backup-*.sql.gz' -mtime +14 -delete

echo "Backup completed: $BACKUP_DIR/$FNAME"
