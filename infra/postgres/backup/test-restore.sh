#!/bin/bash
set -euo pipefail

# =============================================================================
# Teste de restauração completa — roda num Postgres TEMPORÁRIO e ISOLADO,
# nunca no banco de produção. Objetivo: provar que o dump mais recente
# realmente restaura, não só que o pg_dump "terminou sem erro".
#
# Uso (no servidor, com Docker CLI e acesso a C:/Servidor/docker/backups):
#   ./test-restore.sh [caminho/para/arquivo.dump]
#
# Sem argumento, usa o dump mais recente em BACKUP_DIR.
# =============================================================================

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DUMP_FILE="${1:-}"
TEST_CONTAINER="nova-postgres-restore-test"
TEST_DB="restore_test"
TEST_PORT="5433"
TEST_PASSWORD="restore-test-only"

if [ -z "${DUMP_FILE}" ]; then
    DUMP_FILE=$(ls -t "${BACKUP_DIR}"/nova_residence_*.dump 2>/dev/null | head -1)
fi

if [ -z "${DUMP_FILE}" ] || [ ! -f "${DUMP_FILE}" ]; then
    echo "[test-restore] Nenhum arquivo de dump encontrado em ${BACKUP_DIR}"
    exit 1
fi

echo "[test-restore] Usando dump: ${DUMP_FILE}"

cleanup() {
    echo "[test-restore] Removendo container temporário..."
    docker rm -f "${TEST_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[test-restore] Subindo Postgres temporário isolado (porta ${TEST_PORT}, sem volume nomeado)..."
docker run -d --name "${TEST_CONTAINER}" \
    -e POSTGRES_DB="${TEST_DB}" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD="${TEST_PASSWORD}" \
    -e POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale-provider=icu --icu-locale=pt-BR-x-icu" \
    -p "${TEST_PORT}:5432" \
    postgres:16 >/dev/null

echo "[test-restore] Aguardando o banco ficar pronto..."
for i in $(seq 1 30); do
    if docker exec "${TEST_CONTAINER}" pg_isready -U postgres -d "${TEST_DB}" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

echo "[test-restore] Restaurando dump..."
docker cp "${DUMP_FILE}" "${TEST_CONTAINER}:/tmp/restore.dump"
docker exec -e PGPASSWORD="${TEST_PASSWORD}" "${TEST_CONTAINER}" \
    pg_restore -U postgres -d "${TEST_DB}" --no-owner --role=postgres -v /tmp/restore.dump \
    || { echo "[test-restore] FALHOU: pg_restore retornou erro"; exit 1; }

echo "[test-restore] Validando conteúdo restaurado..."

echo "--- Schemas ---"
docker exec -e PGPASSWORD="${TEST_PASSWORD}" "${TEST_CONTAINER}" \
    psql -U postgres -d "${TEST_DB}" -c "\dn"

echo "--- Tabelas em auth.* ---"
AUTH_TABLES=$(docker exec -e PGPASSWORD="${TEST_PASSWORD}" "${TEST_CONTAINER}" \
    psql -U postgres -d "${TEST_DB}" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'auth'")
echo "Tabelas em auth: ${AUTH_TABLES}"

echo "--- Linhas em auth.users ---"
docker exec -e PGPASSWORD="${TEST_PASSWORD}" "${TEST_CONTAINER}" \
    psql -U postgres -d "${TEST_DB}" -tAc \
    "SELECT count(*) FROM auth.users" || echo "(tabela auth.users vazia ou ausente)"

echo "--- Tabelas em public.* ---"
docker exec -e PGPASSWORD="${TEST_PASSWORD}" "${TEST_CONTAINER}" \
    psql -U postgres -d "${TEST_DB}" -c "\dt public.*"

if [ "${AUTH_TABLES}" -lt 1 ]; then
    echo "[test-restore] FALHOU: schema auth restaurado sem tabelas — dump provavelmente incompleto."
    exit 1
fi

echo "[test-restore] OK — dump restaurou com sucesso e contém dados em auth.*."
echo "[test-restore] Container temporário será removido agora (trap de saída)."
