# Imagem enxuta para o job de backup: cliente do Postgres 16 (mesma major
# version do servidor, evita incompatibilidade de pg_dump/pg_restore),
# rclone para envio ao Google Drive, e dcron para o agendamento.
FROM alpine:3.20

RUN apk add --no-cache postgresql16-client rclone dcron tzdata bash

COPY backup.sh /usr/local/bin/backup.sh
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/backup.sh

# Roda em foreground (-f), log no nível 2 direto no stdout do container —
# assim o Portainer mostra o histórico de execuções nos logs do container.
CMD ["crond", "-f", "-l", "2"]
