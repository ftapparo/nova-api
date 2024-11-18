import { Router } from 'express';
import { executeQuery } from '../services/firebird.service';

const router = Router();

// Rota base
router.get('/', (req, res) => {
  res.send('ok');
});

// Health Checker
router.get('/healthchecker', (req, res) => {
  const currentDateTime = new Date().toISOString();
  res.json({ status: 'healthy', date: currentDateTime });
});

// Rota genérica para queries
router.post('/query', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    res.status(400).json({ error: 'Query is required' });
    return
  }

  // Validação básica para limitar consultas permitidas
  const allowedCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  const command = query.trim().split(' ')[0].toUpperCase();

  if (!allowedCommands.includes(command)) {
    res.status(400).json({ error: 'Invalid or restricted query command' });
    return
  }

  try {
    const result = await executeQuery(query);
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error instanceof Error) {
      res.status(500).json({ status: 'error', message: error.message });
    } else {
      res.status(500).json({ status: 'error', message: 'Unknown error occurred' });
    }
  }
});

export default router;
