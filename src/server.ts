import dotenv from 'dotenv';
import { StartWebServer } from './api/web-server.api';
import { closeConnection } from './services/firebird.service';
import { startExhaustService } from './services/exhaust.service';
import { startAccessControlService } from './services/access-control.service';

// Carrega variáveis de ambiente do arquivo .env
const dotenvResult = dotenv.config();
if (dotenvResult.error) {
    console.error('[Server] Falha ao carregar .env:', dotenvResult.error);
} else {
    console.log('[Server] .env carregado com sucesso');
}

/**
 * Inicializa o serviço web (Express) e as conexões de socket com as antenas RFID (TAG1 e TAG2).
 * Cada instância de AntennaManager gerencia uma antena específica.
 */
async function StartService(): Promise<void> {

    try {

        let shuttingDown = false;

        const shutdown = async (reason: string, error?: unknown) => {
            if (shuttingDown) return;
            shuttingDown = true;

            if (error) {
                console.error(`[Server] Encerrando devido a ${reason}:`, error);
            } else {
                console.log(`[Server] Encerrando devido a ${reason}`);
            }

            try {
                await closeConnection();
                console.log('[Server] Conexão com o banco encerrada com sucesso');
            } catch (closeErr) {
                console.error('[Server] Erro ao encerrar a conexão com o banco:', closeErr);
            } finally {
                process.exit(error ? 1 : 0);
            }
        };

        // Inicializa o serviço web
        await StartWebServer();
        console.log('[Server] Serviço web inicializado.');

        // Inicializa o serviço dos exaustores
        await startExhaustService();
        console.log('[Server] Serviço de exaustores inicializado.');

        // Inicializa o serviço dos controle de acesso
        await startAccessControlService();
        console.log('[Server] Serviço de controle de acesso inicializado.');

        // Encerramento com Ctrl+C
        process.on('SIGINT', () => {
            void shutdown('SIGINT');
        });

        // Encerramento padrão de container/serviço
        process.on('SIGTERM', () => {
            void shutdown('SIGTERM');
        });

        // Captura de exceções não tratadas
        process.on('uncaughtException', (err) => {
            void shutdown('uncaughtException', err);
        });

        // Captura de promessas rejeitadas não tratadas
        process.on('unhandledRejection', (reason) => {
            void shutdown('unhandledRejection', reason);
        });

    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[Server] Erro ao inicializar:`, err);
        process.exit(1);
    }
}

// Inicia o serviço
StartService();

