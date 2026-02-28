#!/bin/bash
#
# Weekly backup script for Afrikaans Reader
# Backs up configuration and exported data to Proton Drive via rclone
#
# Prerequisites:
#   1. Install rclone: https://rclone.org/install/
#   2. Configure Proton Drive: rclone config
#      - Choose "protondrive" as remote name
#      - Follow prompts for Proton credentials
#
# Usage:
#   ./scripts/backup.sh
#
# Cron (weekly on Sunday at 2am):
#   0 2 * * 0 /path/to/afrikaans-reader/scripts/backup.sh >> /var/log/afrikaans-backup.log 2>&1

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${APP_DIR}/backups"
RCLONE_REMOTE="protondrive"
REMOTE_PATH="Backups/afrikaans-reader"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_NAME="afrikaans-backup-${TIMESTAMP}"
KEEP_LOCAL_DAYS=7

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

# Check for rclone
if ! command -v rclone &> /dev/null; then
    error "rclone is not installed. Install it from https://rclone.org/install/"
    exit 1
fi

# Check if remote is configured
if ! rclone listremotes | grep -q "^${RCLONE_REMOTE}:$"; then
    error "rclone remote '${RCLONE_REMOTE}' not found."
    echo "Configure it with: rclone config"
    echo "  - Name: ${RCLONE_REMOTE}"
    echo "  - Type: protondrive"
    exit 1
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

log "Starting backup: ${BACKUP_NAME}"

# Backup .env file (contains API keys)
if [ -f "${APP_DIR}/.env" ]; then
    cp "${APP_DIR}/.env" "${BACKUP_DIR}/${BACKUP_NAME}/"
    log "Backed up .env"
fi

if [ -f "${APP_DIR}/.env.local" ]; then
    cp "${APP_DIR}/.env.local" "${BACKUP_DIR}/${BACKUP_NAME}/"
    log "Backed up .env.local"
fi

# Backup dictionary data
if [ -f "${APP_DIR}/src/lib/dictionary-data.json" ]; then
    cp "${APP_DIR}/src/lib/dictionary-data.json" "${BACKUP_DIR}/${BACKUP_NAME}/"
    log "Backed up dictionary-data.json"
fi

# Backup any exported data in data directory
if [ -d "${APP_DIR}/data" ]; then
    cp -r "${APP_DIR}/data" "${BACKUP_DIR}/${BACKUP_NAME}/"
    log "Backed up data directory"
fi

# Backup docker-compose and config
cp "${APP_DIR}/docker-compose.yml" "${BACKUP_DIR}/${BACKUP_NAME}/" 2>/dev/null || true
cp "${APP_DIR}/next.config.ts" "${BACKUP_DIR}/${BACKUP_NAME}/" 2>/dev/null || true

# Create tarball
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"

log "Created backup archive: ${BACKUP_NAME}.tar.gz"

# Upload to Proton Drive
log "Uploading to Proton Drive..."
if rclone copy "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "${RCLONE_REMOTE}:${REMOTE_PATH}/" --progress; then
    log "Successfully uploaded to ${RCLONE_REMOTE}:${REMOTE_PATH}/"
else
    error "Failed to upload to Proton Drive"
    exit 1
fi

# Clean up old local backups (keep last N days)
log "Cleaning up local backups older than ${KEEP_LOCAL_DAYS} days..."
find "${BACKUP_DIR}" -name "afrikaans-backup-*.tar.gz" -mtime +${KEEP_LOCAL_DAYS} -delete 2>/dev/null || true

# Clean up old remote backups (keep last 4 weeks)
log "Cleaning up remote backups (keeping last 4)..."
REMOTE_BACKUPS=$(rclone lsf "${RCLONE_REMOTE}:${REMOTE_PATH}/" --files-only 2>/dev/null | sort -r)
BACKUP_COUNT=0
while IFS= read -r backup; do
    BACKUP_COUNT=$((BACKUP_COUNT + 1))
    if [ $BACKUP_COUNT -gt 4 ]; then
        log "Removing old remote backup: ${backup}"
        rclone deletefile "${RCLONE_REMOTE}:${REMOTE_PATH}/${backup}" 2>/dev/null || true
    fi
done <<< "$REMOTE_BACKUPS"

log "Backup complete!"
