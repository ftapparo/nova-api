import { Request, Response } from 'express';
import { getAllVehicles, getOneVehicle, registerVehicle, registerVehicleAccess, registerVehiclePhoto, setLockVehicle, setLockVehicleByData, setUnlockVehicle } from '../repositories/vehicle.repository';
import { insertAccess, listRecentAccessByDevice, openGatePedestrian, openGateVehicle, verifyAccessById } from '../repositories/access.repository';

/**
 * Lista todos os veículos.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const getVehicleList = async (req: Request, res: Response) => {

  try {
    const result = await getAllVehicles();
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao consultar veículos:', error.message);
    res.fail('Erro ao consultar veículos', error.status || 500, error.message ?? error);
  }
};

/**
 * Obtém um veículo pelo ID.
 * @param req Requisição HTTP (params.id).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const getVehicle = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    res.fail('ID do veículo é obrigatório.', 400);
    return;
  }

  try {
    const result = await getOneVehicle(id);
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao consultar veículo:', error.message);
    res.fail('Erro ao consultar veículo', error.status || 500, error.message ?? error);
  }
};

/**
 * Cadastra um novo veículo.
 * @param req Requisição HTTP (body com dados do veículo).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const setVehicle = async (req: Request, res: Response) => {

  const {
    plate,
    brand,
    model,
    color,
    user_seq,
    unit_seq,
    tag
  } = req.body;

  if (!plate || !brand || !model || !color || !user_seq || !tag) {
    res.fail('Dados do veículos obrigatórios.', 400);
    return;
  }

  try {
    const result = await registerVehicle({
      plate,
      brand,
      model,
      color,
      user_seq,
      unit_seq,
      tag
    })

    res.ok(result, 201);
  } catch (error: any) {
    console.error('Erro ao registrar veículo:', error.message);
    res.fail('Erro ao registrar veículo', error.status || 500, error.message ?? error);
  }
};

/**
 * Atualiza as imagens do veículo.
 * @param req Requisição HTTP (params.id e files).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const updateVehicleImage = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    res.fail('ID do veículo é obrigatório.', 400);
    return;
  }


  // Recupera os arquivos enviados
  const files = req.files as Express.Multer.File[];

  const photoTagFile = files.find(f => f.fieldname === 'photoTag');
  const photoVehicleFile = files.find(f => f.fieldname === 'photoVehicle');

  const photoTag = photoTagFile?.buffer;
  const photoVehicle = photoVehicleFile?.buffer;

  if (!photoTag && !photoVehicle) {
    res.fail('Arquivos de imagens obrigatórios.', 400);
    return;
  }

  try {
    const result = await registerVehiclePhoto({
      vehicleSequence: Number(id),
      photoTag,
      photoVehicle,
    });
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao registrar fotos do veículo:', error.message);
    res.fail('Erro ao registrar fotos do veículo', error.status || 500, error.message ?? error);
  }
};

/**
 * Atualiza o acesso de um veículo.
 * @param req Requisição HTTP (body com dados de acesso).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const updateVehicleAccess = async (req: Request, res: Response) => {
  const { personSequence, type, panic, id2, useType = 'N', user, vehicleSequence } = req.body;

  if (!personSequence || !type || !panic || !id2 || !user || !vehicleSequence) {
    res.fail('Dados do veículos obrigatórios.', 400);
    return;
  }

  try {
    const result = await registerVehicleAccess({ personSequence, type, panic, id2, useType, user, vehicleSequence });
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao registrar acesso do veículo:', error.message);
    res.fail('Erro ao registrar acesso do veículo', error.status || 500, error.message ?? error);
  }
};

/**
 * Bloqueia o veículo pelo ID.
 * @param req Requisição HTTP (params.id).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const lockVehicle = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    res.fail('ID do veículo é obrigatório.', 400);
    return;
  }

  try {
    const result = await setLockVehicle(id);
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao bloquear veículo:', error.message);
    res.fail('Erro ao bloquear veículo', error.status || 500, error.message ?? error);
  }
};

/**
 * Desbloqueia o veículo pelo ID.
 * @param req Requisição HTTP (params.id).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const unlockVehicle = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    res.fail('ID do veículo é obrigatório.', 400);
    return;
  }

  try {
    const result = await setUnlockVehicle(id);
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao bloquear veículo:', error.message);
    res.fail('Erro ao bloquear veículo', error.status || 500, error.message ?? error);
  }
};

/**
 * Verifica permissão de acesso por ID.
 * @param req Requisição HTTP (query com id/dispositivo/sentido).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const checkAccessPermission = async (req: Request, res: Response) => {
  const { id, dispositivo, sentido, foto } = req.query;

  const dispositivoNumber = Number(dispositivo);
  const fotoValue = foto ? String(foto) : null;

  if (!id || !dispositivo || !sentido) {
    res.fail('Necessário todos os dados obrigatórios', 400);
    return;
  }

  // Verifica se o número do dispositivo é válido
  if (Number.isNaN(dispositivoNumber) || dispositivoNumber < 1) {
    res.fail('Número do dispositivo incorreto', 400);
    return;
  }

  try {
    const result = await verifyAccessById(String(id), dispositivoNumber, fotoValue, String(sentido));
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao verificar acesso:', error.message);
    res.fail('Erro ao verificar acesso', error.status || 500, error.message ?? error);
  }
};

/**
 * Lista os últimos acessos realizados por um dispositivo.
 * @param req Requisição HTTP (query.device / query.dispositivo, query.limit opcional).
 * @param res Resposta HTTP.
 */
export const listAccess = async (req: Request, res: Response) => {
  const deviceParam = req.query.device ?? req.query.dispositivo;
  const limitParam = req.query.limit ?? req.query.qtd;

  if (deviceParam === undefined || deviceParam === null || deviceParam === '') {
    res.fail('Parâmetro device é obrigatório.', 400);
    return;
  }

  const deviceNumber = Number(deviceParam);
  if (!Number.isFinite(deviceNumber) || deviceNumber <= 0) {
    res.fail('Parâmetro device inválido.', 400);
    return;
  }

  let limit = 10;
  if (limitParam !== undefined && limitParam !== null && limitParam !== '') {
    const parsedLimit = Number(limitParam);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      res.fail('Parâmetro limit inválido.', 400);
      return;
    }
    limit = Math.min(Math.floor(parsedLimit), 50);
  }

  try {
    const result = await listRecentAccessByDevice(deviceNumber, limit);
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao listar acessos:', error?.message || error);
    res.fail('Erro ao listar acessos', error?.status || 500, error?.message ?? error);
  }
};

/**
 * Registra um novo acesso.
 * @param req Requisição HTTP (body com dados do acesso).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const registerNewAccess = async (req: Request, res: Response) => {
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

  const missingFields: string[] = [];
  const isMissing = (value: unknown): boolean => value === undefined || value === null || value === '';

  if (isMissing(dispositivo)) missingFields.push('dispositivo');
  if (isMissing(pessoa)) missingFields.push('pessoa');
  if (isMissing(classificacao)) missingFields.push('classificacao');
  if (isMissing(classAutorizado)) missingFields.push('classAutorizado');
  if (isMissing(autorizacaoLanc)) missingFields.push('autorizacaoLanc');
  if (isMissing(origem)) missingFields.push('origem');
  if (isMissing(seqIdAcesso)) missingFields.push('seqIdAcesso');
  if (isMissing(sentido)) missingFields.push('sentido');
  if (isMissing(quadra)) missingFields.push('quadra');
  if (isMissing(lote)) missingFields.push('lote');
  if (isMissing(panico)) missingFields.push('panico');
  if (isMissing(formaAcesso)) missingFields.push('formaAcesso');
  if (isMissing(idAcesso)) missingFields.push('idAcesso');
  if (isMissing(seqVeiculo)) missingFields.push('seqVeiculo');

  if (missingFields.length > 0) {
    res.fail(`Necessario dados obrigatorios: ${missingFields.join(', ')}.`, 400);
    return;
  }

  const invalidFields: string[] = [];
  const isValidNumber = (value: unknown): boolean => Number.isFinite(Number(value));
  const isValidText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

  if (!isValidNumber(dispositivo)) invalidFields.push('dispositivo');
  if (!isValidNumber(pessoa)) invalidFields.push('pessoa');
  if (!isValidNumber(classificacao)) invalidFields.push('classificacao');
  if (!isValidNumber(seqIdAcesso)) invalidFields.push('seqIdAcesso');
  if (!isValidNumber(seqVeiculo)) invalidFields.push('seqVeiculo');

  if (!isValidText(classAutorizado)) invalidFields.push('classAutorizado');
  if (!isValidText(autorizacaoLanc)) invalidFields.push('autorizacaoLanc');
  if (!isValidText(origem)) invalidFields.push('origem');
  if (!isValidText(quadra)) invalidFields.push('quadra');
  if (!isValidText(lote)) invalidFields.push('lote');
  if (!isValidText(panico)) invalidFields.push('panico');
  if (!isValidText(formaAcesso)) invalidFields.push('formaAcesso');
  if (!isValidText(idAcesso)) invalidFields.push('idAcesso');
  if (!isValidText(sentido)) invalidFields.push('sentido');

  const sentidoValue = String(sentido).trim().toUpperCase();
  const panicoValue = String(panico).trim().toUpperCase();
  const classAutorizadoValue = String(classAutorizado).trim().toUpperCase();

  if (sentidoValue !== 'E' && sentidoValue !== 'S') invalidFields.push('sentido');
  if (panicoValue !== 'S' && panicoValue !== 'N') invalidFields.push('panico');
  if (classAutorizadoValue !== 'S' && classAutorizadoValue !== 'N') invalidFields.push('classAutorizado');

  if (invalidFields.length > 0) {
    res.fail(`Dados invalidos: ${[...new Set(invalidFields)].join(', ')}.`, 400);
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
    res.ok(result, 201);
  } catch (error: any) {
    console.error('Erro ao registrar novo acesso:', error.message);
    res.fail('Erro ao registrar novo acesso', error.status || 500, error.message ?? error);
  }
};

/**
 * Libera acesso de pedestre.
 * @param req Requisição HTTP (body com dados da liberação).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const allowPedestrianAccess = async (req: Request, res: Response) => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = req.body;

  // Valida se todos os campos obrigatórios estão presentes
  if (!device || !usuario || !quadra || lote === undefined || !motivo) {
    res.fail('Necessário dados obrigatórios', 400);
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
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao liberar pedestre:', error.message);
    res.fail('Erro ao liberar pedestre', error.status || 500, error.message ?? error);
  }
};

/**
 * Libera acesso de veículo.
 * @param req Requisição HTTP (body com dados da liberação).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const allowvehicleAccess = async (req: Request, res: Response) => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = req.body;

  if (!device || !usuario || !quadra || lote === undefined || !motivo) {
    res.fail('Necessário dados obrigatórios', 400);
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
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao liberar veículo:', error.message);
    res.fail('Erro ao liberar veículo', error.status || 500, error.message ?? error);
  }
};

/**
 * Bloqueia veículos por período sem uso de TAG.
 * @param req Requisição HTTP (body/query.period).
 * @param res Resposta HTTP.
 * @returns Promise<void>.
 */
export const purgeVehicle = async (req: Request, res: Response) => {
  const period = (req.body?.period ?? req.query?.period) as string | number | undefined;

  if (period === undefined || period === null || period === '') {
    res.fail('Período é obrigatório.', 400);
    return;
  }

  try {
    const result = await setLockVehicleByData(period);
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao bloquear veículo:', error.message);
    res.fail('Erro ao bloquear veículo', error.status || 500, error.message ?? error);
  }
};
