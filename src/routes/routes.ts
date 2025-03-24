import { Router } from 'express';
import {
  executeQuery,
  registerVehicle,
  registerVehiclePhoto,
  registerAccess,
  openGatePedestrian,
  openGateVehicle,
  verifyAccessById,
  insertAccess
} from '../services/firebird.service';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configuração do multer
const storage = multer.memoryStorage(); // Armazena os arquivos na memória
const upload = multer({ storage });

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
    return;
  }

  const date = new Date();
  const brazilTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const formattedDate = brazilTime.toISOString().slice(0, 10) + ' ' + brazilTime.toTimeString().slice(0, 5);
  console.log('-------------------------------------------------------------------------------');
  console.log('Query recebida em: ', formattedDate);
  console.log(query);

  // Validação básica para limitar consultas permitidas
  const allowedCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  const command = query.trim().split(' ')[0].toUpperCase();

  if (!allowedCommands.includes(command)) {
    res.status(400).json({ error: 'Invalid or restricted query command' });
    return;
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

// Rota para cadastrar veículo
router.post('/registerVehicle', async (req, res) => {
  const { plate, brand, model, color, user_seq, unit_seq, tag } = req.body;

  if (!plate || !brand || !model || !color || !user_seq || !unit_seq || !tag) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const result = await registerVehicle({ plate, brand, model, color, user_seq, unit_seq, tag });
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erro ao registrar veículo:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Rota para registrar fotos do veículo
router.post('/registerVehiclePhoto', upload.fields([
  { name: 'photoTag', maxCount: 1 },
  { name: 'photoVehicle', maxCount: 1 },
]), async (req, res) => {
  const { vehicleSequence } = req.body;

  if (!vehicleSequence) {
    res.status(400).json({ error: 'Vehicle sequence is required' });
    return;
  }

  // Recupera os arquivos enviados
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const photoTag = files['photoTag'] ? files['photoTag'][0].buffer : undefined;
  const photoVehicle = files['photoVehicle'] ? files['photoVehicle'][0].buffer : undefined;

  if (!photoTag && !photoVehicle) {
    res.status(400).json({ error: 'At least one photo is required' });
    return;
  }

  try {
    // Salva as fotos no banco de dados
    const result = await registerVehiclePhoto({
      vehicleSequence: parseInt(vehicleSequence, 10),
      photoTag,
      photoVehicle,
    });
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erro ao registrar foto do veículo:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Rota para cadastrar acesso
router.post('/registerAccess', async (req, res) => {
  const { personSequence, type, panic, id2, user, vehicleSequence } = req.body;

  if (!personSequence || !type || !panic || !id2 || !user || !vehicleSequence) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const result = await registerAccess({ personSequence, type, panic, id2, user, vehicleSequence });
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erro ao registrar acesso:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Rota para liberar pedestres
router.post('/releasePedestrian', async (req, res) => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = req.body;

  // Valida se todos os campos obrigatórios estão presentes
  if (!device || !usuario || !quadra || lote === undefined || !motivo) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Verifica se o número do dispositivo é válido
  if (device > 7 || device < 1) {
    res.status(400).json({ error: 'Field value unknown' });
    return;
  }

  try {
    // Chama a função openGate passando os parâmetros recebidos
    const result = await openGatePedestrian({
      device,
      usuario,
      quadra,
      lote,
      motivo,
      complemento: complemento || '',
      seqAutorizador: seqAutorizador || 0,
      botaoTexto: botaoTexto || '',
    });

    // Retorna o resultado
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erro ao liberar pedestre:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Rota para liberar veículos
router.post('/releaseVehicles', async (req, res) => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = req.body;

  // Valida se todos os campos obrigatórios estão presentes
  if (!device || !usuario || !quadra || lote === undefined || !motivo) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Verifica se o número do dispositivo é válido
  if (device > 6) {
    res.status(400).json({ error: 'Field value unknown' });
    return;
  }

  try {
    // Chama a função openGateVehicles passando os parâmetros recebidos
    const result = await openGateVehicle({
      device,
      usuario,
      quadra,
      lote,
      motivo,
      complemento: complemento || '',
      seqAutorizador: seqAutorizador || 0,
      botaoTexto: botaoTexto || '',
    });

    // Retorna o resultado
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erro ao liberar veículo:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Rota para validar acesso
router.post('access/verify', async (req, res) => {
  const { id, dispositivo, foto, sentido } = req.body;

  // Valida se todos os campos obrigatórios estão presentes
  if (!id || !dispositivo || sentido === undefined) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Verifica se o número do dispositivo é válido
  if (dispositivo > 10 || dispositivo < 1) {
    res.status(400).json({ error: 'Field value unknown' });
    return;
  }

  try {
    // Chama a função validateAccess passando os parâmetros recebidos
    const result = await verifyAccessById(id, dispositivo, foto, sentido);

    // Retorna o resultado
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erro ao validar acesso:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Rota para registrar acesso
router.post('access/register', async (req, res) => {
  const {
    dispositivo,
    pessoa,
    classificacao,
    classAutorizado,
    autorizacaoLanc,
    origem,
    seqIdAcesso,
    sentido,
    quadra,
    lote,
    panico,
    formaAcesso,
    idAcesso,
    seqVeiculo
  } = req.body;

  if (!dispositivo || !pessoa || !sentido || !idAcesso) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const result = await insertAccess({
      dispositivo,
      pessoa,
      classificacao,
      classAutorizado,
      autorizacaoLanc,
      origem,
      seqIdAcesso,
      sentido,
      quadra,
      lote,
      panico,
      formaAcesso,
      idAcesso,
      seqVeiculo
    });

    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Erro ao registrar passagem:', error);
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});


export default router;