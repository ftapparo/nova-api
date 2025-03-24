import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import baseRoutes from './routes/routes';
import swaggerDocument from './config/swagger.json';
import { closeConnection } from './services/firebird.service';

const app = express();
const PORT = 3000;

// Configurar CORS
app.use(
  cors({
    origin: '*', // Permitir localhost e o domínio público
    methods: '*', // Permitir todos os métodos HTTP
    allowedHeaders: '*', // Permitir todos os cabeçalhos
  })
);

// Configurar middleware para JSON
app.use(express.json());

// Middleware para desativar o cache no Express
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});


// Configurar middleware Swagger
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Configurar rotas
app.use(baseRoutes);

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/swagger`);
});

// Fechar a conexão quando o processo terminar (ex.: com process.exit)
process.on('exit', async () => {
  try {
    await closeConnection();  // Chama a função para fechar a conexão
    console.log('Conexão fechada com sucesso!');
  } catch (err) {
    console.error('Erro ao fechar a conexão:', err);
  }
});

// Fechar a conexão quando o processo for interrompido (Ctrl + C)
process.on('SIGINT', async () => {
  try {
    await closeConnection();
    console.log('Conexão fechada com sucesso!');
    server.close(() => {  // Fecha o servidor HTTP
      console.log('Servidor HTTP fechado');
      process.exit(0);  // Encerra o processo com sucesso
    });
  } catch (err) {
    console.error('Erro ao fechar a conexão:', err);
    process.exit(1);  // Encerra o processo com erro
  }
});

// Captura de exceções não tratadas
process.on('uncaughtException', async (err) => {
  console.error('Erro inesperado:', err);
  try {
    await closeConnection();
    console.log('Conexão fechada com sucesso!');
  } catch (closeErr) {
    console.error('Erro ao fechar a conexão:', closeErr);
  }
  process.exit(1);  // Encerra o processo com erro
});