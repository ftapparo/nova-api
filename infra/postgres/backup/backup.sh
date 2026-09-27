#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/backups"
FILE="${BACKUP_DIR}/nova_residence_${TIMESTAMP}.dump"
RCLONE_CONFIG="/config/rclone/rclone.conf"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

echo "[backup] Iniciando dump em ${TIMESTAMP}"

# -Fc = formato custom do pg_dump: compactado e apto para pg_restore
# seletivo (restaurar só uma tabela, por exemplo), diferente do dump em
# texto puro (.sql).
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    -Fc -f "${FILE}"

echo "[backup] Dump local concluído: ${FILE} ($(du -h "${FILE}" | cut -f1))"

if [ -f "${RCLONE_CONFIG}" ]; then
    echo "[backup] Enviando para o Google Drive..."
    rclone copy "${FILE}" gdrive:nova-residence-backups/postgres/ \
        --config "${RCLONE_CONFIG}"
    echo "[backup] Enviado ao Google Drive"

    # Retenção no Drive: mesma janela do local, para não crescer
    # indefinidamente numa conta gratuita.
    rclone delete gdrive:nova-residence-backups/postgres/ \
        --config "${RCLONE_CONFIG}" \
        --min-age "${RETENTION_DAYS}d" || true
else
    echo "[backup] AVISO: rclone.conf não encontrado em ${RCLONE_CONFIG} — backup ficou só local, sem cópia off-site."
fi

# Retenção local.
find "${BACKUP_DIR}" -name "nova_residence_*.dump" -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] Retenção aplicada (${RETENTION_DAYS} dias). Concluído em $(date +%Y%m%d-%H%M%S)."
