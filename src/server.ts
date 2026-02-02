// src/server.ts
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import HealthRoutes from './routes/healthRoutes';
import ProansiAccessRoutes from './routes/freedomAccessRoutes';
import ProansiVehicleRoutes from './routes/freedomVehicleRoutes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import { closeConnection } from './services/firebirdService';

const app = express();

app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: '*' ,
}));

// Rotas    
app.use('/api', HealthRoutes);
app.use('/api', ProansiAccessRoutes);
app.use('/api', ProansiVehicleRoutes);

// Swagger
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/apispec_1.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Handler para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada' });
});

// Inicialização do servidor
const port = process.env.PORT || 3000;
const env = process.env.NODE_ENV || 'development';
const server = app.listen(port, () => {
    console.log(`[Server] Servidor iniciado em modo '${env}' na porta ${port}`);
});

// Encerramento do processo - evento 'exit'
process.on('exit', async () => {
    try {
        await closeConnection();
        console.log('[Server] Conexão com o banco encerrada com sucesso');
    } catch (err) {
        console.error('[Server] Erro ao encerrar a conexão com o banco:', err);
    }
});

// Encerramento com Ctrl+C
process.on('SIGINT', async () => {
    try {
        await closeConnection();
        console.log('[Server] Conexão com o banco encerrada com sucesso');
        server.close(() => {
            console.log('[Server] Servidor encerrado corretamente');
            process.exit(0);
        });
    } catch (err) {
        console.error('[Server] Erro ao encerrar a conexão com o banco:', err);
        process.exit(1);
    }
});

// Captura de exceções não tratadas
process.on('uncaughtException', async (err) => {
    console.error('[Server] Erro não tratado:', err);
    try {
        await closeConnection();
        console.log('[Server] Conexão com o banco encerrada com sucesso');
    } catch (closeErr) {
        console.error('[Server] Falha ao encerrar a conexão após erro:', closeErr);
    }
    process.exit(1);
});
