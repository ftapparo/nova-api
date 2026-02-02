import { Request, Response } from 'express';
import { getAllVehicles, getOneVehicle, registerVehicle, registerVehicleAccess, registerVehiclePhoto, setLockVehicle, setLockVehicleByData, setUnlockVehicle } from '../repositories/vehicle.repository';
import { insertAccess, openGatePedestrian, openGateVehicle, verifyAccessById } from '../repositories/access.repository';

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
  const { id, dispositivo, sentido } = req.query;

  const dispositivoNumber = Number(dispositivo);

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
    const result = await verifyAccessById(String(id), dispositivoNumber, String(sentido));
    res.ok(result);
  } catch (error: any) {
    console.error('Erro ao verificar acesso:', error.message);
    res.fail('Erro ao verificar acesso', error.status || 500, error.message ?? error);
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

  if (!dispositivo || !pessoa || !sentido || !idAcesso) {
    res.fail('Necessário dados obrigatórios', 400);
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
