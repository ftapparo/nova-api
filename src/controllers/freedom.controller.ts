import { Request, Response } from 'express';
import { getAllVehicles, getOneVehicle, registerVehicle, registerVehicleAccess, registerVehiclePhoto, setLockVehicle, setLockVehicleByData, setUnlockVehicle } from '../repositories/vehicle.repository';
import { findPrimaryAccessCredentialByPerson, insertAccess, listRecentAccessByDevice, openGatePedestrian, openGateVehicle, verifyAccessById } from '../repositories/access.repository';
import { findPersonByCpf, findVehicleByPlate } from '../repositories/query.repository';

type SearchIdType = 'plate' | 'cpf' | 'tag' | 'shortAccessId' | 'normalizedAccessId';
type VehicleLookupRow = Awaited<ReturnType<typeof findVehicleByPlate>>[number];
type PersonCpfRow = Awaited<ReturnType<typeof findPersonByCpf>>[number];

const LEGACY_PLATE_PATTERN = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_PATTERN = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const CPF_DIGITS_REGEX = /^[0-9]{11}$/;
const TAG_DIGITS_REGEX = /^[0-9]{10}$/;
const SHORT_ACCESS_ID_REGEX = /^[0-9]{1,8}$/;
const NORMALIZED_ACCESS_ID_REGEX = /^898[0-9]{8}787$/;
const INVALID_ID_MESSAGE = 'ID deve ser uma placa válida (AAA1234/AAA1A23), CPF válido, TAG com 10 dígitos, ID numérico com até 8 dígitos ou o ID já formatado (898********787).';

class SearchIdResolutionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SearchIdResolutionError';
    this.status = status;
  }
}

const sanitizeDigits = (value: string): string => value.replace(/\D/g, '');

const isValidCpf = (cpf: string): boolean => {
  if (!CPF_DIGITS_REGEX.test(cpf)) {
    return false;
  }

  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calcDigit = (base: string, factor: number): number => {
    let total = 0;

    for (let index = 0; index < base.length; index += 1) {
      total += Number(base[index]) * (factor - index);
    }

    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calcDigit(cpf.slice(0, 9), 10);
  const secondDigit = calcDigit(cpf.slice(0, 10), 11);

  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
};

const normalizePlate = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const isPlateFormat = (value: string): boolean =>
  value.length === 7 && (LEGACY_PLATE_PATTERN.test(value) || MERCOSUL_PLATE_PATTERN.test(value));

const buildTagCredential = (tagValue: string): string => {
  const digits = sanitizeDigits(tagValue);
  if (!TAG_DIGITS_REGEX.test(digits)) {
    throw new SearchIdResolutionError('Tag inválida. Informe 10 dígitos.', 400);
  }
  return `Y${digits}`;
};

const buildAccessIdCredential = (idValue: string): string => {
  const digits = sanitizeDigits(idValue);
  if (!SHORT_ACCESS_ID_REGEX.test(digits)) {
    throw new SearchIdResolutionError('ID numérico deve conter de 1 a 8 dígitos.', 400);
  }

  const prefix = '898';
  const suffix = '787';
  const bodyLength = 14 - prefix.length - suffix.length;
  const padded = digits.padStart(bodyLength, '0');
  return `${prefix}${padded}${suffix}`;
};

const resolveCredentialByCpf = async (cpfDigits: string): Promise<string> => {
  const personRows: PersonCpfRow[] = await findPersonByCpf(cpfDigits);
  const personRow = personRows[0];

  if (!personRow?.P_SEQUENCIA) {
    throw new SearchIdResolutionError('CPF não localizado na base.', 404);
  }

  const seqPessoa = Number(personRow.P_SEQUENCIA);
  const credential = await findPrimaryAccessCredentialByPerson(seqPessoa);

  if (!credential) {
    throw new SearchIdResolutionError('Nenhum ID vinculado ao CPF informado.', 404);
  }

  const idValue = typeof credential.ID === 'string' ? credential.ID.trim() : null;
  if (idValue) {
    return idValue;
  }

  const tagValue = typeof credential.ID2 === 'string' ? credential.ID2.trim() : null;
  if (tagValue) {
    return buildTagCredential(tagValue);
  }

  throw new SearchIdResolutionError('Nenhum ID ou TAG vinculados ao CPF informado.', 404);
};

const resolveCredentialByPlate = async (plate: string): Promise<string> => {
  const vehicleRows: VehicleLookupRow[] = await findVehicleByPlate(plate);

  if (!Array.isArray(vehicleRows) || vehicleRows.length === 0) {
    throw new SearchIdResolutionError('Placa não localizada.', 404);
  }

  const idRow = vehicleRows.find((row) => typeof row?.I_ID === 'string' && row.I_ID.trim().length > 0);
  if (idRow?.I_ID) {
    return String(idRow.I_ID).trim();
  }

  const tagValue = vehicleRows
    .map((row) => (typeof row?.V_TAGVEICULO === 'string' && row.V_TAGVEICULO.trim().length > 0
      ? row.V_TAGVEICULO
      : row?.I_ID2))
    .find((value) => typeof value === 'string' && value.trim().length > 0);

  if (tagValue) {
    return buildTagCredential(String(tagValue).trim());
  }

  throw new SearchIdResolutionError('Nenhum ID ou TAG vinculados à placa informada.', 404);
};

const detectSearchIdType = (rawValue: string): SearchIdType => {
  const normalizedPlate = normalizePlate(rawValue);
  const digits = sanitizeDigits(rawValue);

  if (isPlateFormat(normalizedPlate)) {
    return 'plate';
  }

  if (digits && isValidCpf(digits)) {
    return 'cpf';
  }

  if (TAG_DIGITS_REGEX.test(digits)) {
    return 'tag';
  }

  if (NORMALIZED_ACCESS_ID_REGEX.test(digits)) {
    return 'normalizedAccessId';
  }

  if (SHORT_ACCESS_ID_REGEX.test(digits)) {
    return 'shortAccessId';
  }

  throw new SearchIdResolutionError(INVALID_ID_MESSAGE, 400);
};

const resolveIdForAccess = async (rawId: string): Promise<string> => {
  const trimmed = rawId?.toString().trim();
  if (!trimmed) {
    throw new SearchIdResolutionError('Informe o identificador para consulta.', 400);
  }

  const type = detectSearchIdType(trimmed.toUpperCase());
  const digits = sanitizeDigits(trimmed);

  switch (type) {
    case 'plate':
      return resolveCredentialByPlate(normalizePlate(trimmed));
    case 'cpf':
      return resolveCredentialByCpf(digits);
    case 'tag':
      return buildTagCredential(digits);
    case 'normalizedAccessId':
      return digits;
    case 'shortAccessId':
      return buildAccessIdCredential(digits);
    default:
      throw new SearchIdResolutionError(INVALID_ID_MESSAGE, 400);
  }
};

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
 * Valida permissão de acesso (TAG, ID, CPF ou PLACA)
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

  const sentidoValue = String(sentido).trim().toUpperCase();
  if (sentidoValue !== 'E' && sentidoValue !== 'S') {
    res.fail('Sentido inválido. Informe "E" (entrada) ou "S" (saída).', 400);
    return;
  }

  try {
    const normalizedId = await resolveIdForAccess(String(id));
    const result = await verifyAccessById(normalizedId, dispositivoNumber, fotoValue, sentidoValue);
    res.ok(result);
  } catch (error: any) {
    if (error instanceof SearchIdResolutionError) {
      res.fail(error.message, error.status);
      return;
    }
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
