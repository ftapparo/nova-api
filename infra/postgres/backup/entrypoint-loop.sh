#!/bin/bash
# Plano B para o agendamento, caso "init: true" não resolva o crash loop
# do dcron (setpgid: Operation not permitted). Em vez de um daemon cron,
# um loop simples em shell que dorme até o próximo horário configurado
# (padrão: 3h) e roda o backup. Sem daemon, sem gerenciamento de grupo de
# processo, sem a classe de problema que o crond apresentou.
#
# Para usar: trocar o CMD do Dockerfile de
#   CMD ["crond", "-f", "-l", "2"]
# para
#   CMD ["/usr/local/bin/entrypoint-loop.sh"]
set -euo pipefail

BACKUP_HOUR="${BACKUP_HOUR:-3}"

echo "[entrypoint] Loop de agendamento iniciado. Horário configurado: ${BACKUP_HOUR}h."

while true; do
    NOW_HOUR=$(date +%H | sed 's/^0//')
    NOW_MIN=$(date +%M | sed 's/^0//')

    if [ "${NOW_HOUR}" = "${BACKUP_HOUR}" ] && [ "${NOW_MIN:-0}" -lt 5 ]; then
        echo "[entrypoint] Horário batido ($(date)). Rodando backup..."
        /usr/local/bin/backup.sh || echo "[entrypoint] backup.sh terminou com erro — verificar log acima."
        # Evita rodar de novo na mesma janela de 5 minutos.
        sleep 300
    fi

    sleep 60
done
