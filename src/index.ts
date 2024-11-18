import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import baseRoutes from './routes/routes';
import swaggerDocument from './config/swagger.json';

const app = express();
const PORT = 3000;

// Configurar CORS
app.use(
  cors({
    origin: ['http://localhost:3000', 'https://api.condominionovaresidence.com'], // Permitir localhost e o domínio público
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
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/swagger`);
});
