// src/controllers/proansiController.ts
import { Request, Response } from 'express';
import { getAllVehicle, getOneVehicle, registerVehicle, registerVehicleAccess, registerVehiclePhoto, setLockVehicle, setLockVehicleByData, setUnlockVehicle } from '../repositories/freedomVehicleRepository';
import { insertAccess, openGatePedestrian, openGateVehicle, verifyAccessById } from '../repositories/freedomAccessRepository';

export const getVehicleList = async (req: Request, res: Response) => {

  try {
    const result = await getAllVehicle();
    res.status(200).json({
            content: result,
            success: true,
            errorMessage: null,
            errors: null,
        });
  } catch (error: any) {
    console.error('Erro ao consultar veículos:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao consultar veículos',
            errors: error.message,
    });
  }
};

export const getVehicle = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
      res.status(400).json({
          content: '',
          success: false,
          errorMessage: 'ID do veículo é obrigatório.',
          errors: null,
      });
      return;
  }

  try {
    const result = await getOneVehicle(id);
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao consultar veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao consultar veículo',
            errors: error.message,
    });
  }
};

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

    console.log(req.body)

    if (!plate || !brand || !model || !color || !user_seq || !tag) {
        res.status(400).json({
            content: '',
            success: false,
            errorMessage: 'Dados do veículos obrigatórios.',
            errors: null,
        });
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

    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao registrar veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao registrar veículo',
            errors: error.message,
    });
  }
};

export const updateVehicleImage = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({
        content: '',
        success: false,
        errorMessage: 'ID do veículo é obrigatório.',
        errors: null,
    });
    return;
  }


  // Recupera os arquivos enviados
  const files = req.files as Express.Multer.File[];

  const photoTagFile = files.find(f => f.fieldname === 'photoTag');
  const photoVehicleFile = files.find(f => f.fieldname === 'photoVehicle');

  const photoTag = photoTagFile?.buffer;
  const photoVehicle = photoVehicleFile?.buffer;

  if (!photoTag && !photoVehicle) {
    res.status(400).json({
        content: '',
        success: false,
        errorMessage: 'Arquivos de imagens obrigatórios.',
        errors: null,
    });
    return;
  }

  try {
    const result = await registerVehiclePhoto({
      vehicleSequence: Number(id),
      photoTag,
      photoVehicle,
    });
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao registrar fotos do veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao registrar fotos do veículo',
            errors: error.message,
    });
  }
};

export const updateVehicleAccess = async (req: Request, res: Response) => {
  const { personSequence, type, panic, id2, useType = 'N', user, vehicleSequence } = req.body;

  if (!personSequence || !type || !panic || !id2 || !user || !vehicleSequence) {
    res.status(400).json({
        content: '',
        success: false,
        errorMessage: 'Dados do veículos obrigatórios.',
        errors: null,
    });
    return;
  }

  try {
    const result = await registerVehicleAccess({ personSequence, type, panic, id2, useType, user, vehicleSequence });
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao registrar acesso do veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao registrar acesso do veículo',
            errors: error.message,
    });
  }
};

export const lockVehicle = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
      res.status(400).json({
          content: '',
          success: false,
          errorMessage: 'ID do veículo é obrigatório.',
          errors: null,
      });
      return;
  }

  try {
    const result = await setLockVehicle(id);
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao bloquear veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao bloquear veículo',
            errors: error.message,
    });
  }
};

export const unlockVehicle = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
      res.status(400).json({
          content: '',
          success: false,
          errorMessage: 'ID do veículo é obrigatório.',
          errors: null,
      });
      return;
  }

  try {
    const result = await setUnlockVehicle(id);
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao bloquear veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao bloquear veículo',
            errors: error.message,
    });
  }
};

export const checkAccessPermission = async (req: Request, res: Response) => {
  const { id, dispositivo, foto = null, sentido } = req.body;

  if (!id || !dispositivo || !sentido) {
    res.status(400).json({
      content: '',
      success: false,
      errorMessage: 'Necessário todos os dados obrigatórios',
      errors: null,
    });
    return;
  }

  // Verifica se o número do dispositivo é válido
  if (dispositivo < 1) {
    res.status(400).json({
      content: '',
      success: false,
      errorMessage: 'Número do dispositivo incorreto',
      errors: null,
    });
    return;
  }

  try {
    const result = await verifyAccessById(id, dispositivo, foto, sentido);
    res.status(200).json({
      content: result,
      success: true,
      errorMessage: null,
      errors: null,
    });
  } catch (error: any) {
    console.error('Erro ao verificar acesso:', error.message);
    res.status(error.status || 500).json({
      content: '',
      success: false,
      errorMessage: 'Erro ao verificar acesso',
      errors: error.message,
    });
  }
};

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
    res.status(400).json({
      content: '',
      success: false,
      errorMessage: 'Necessário dados obrigatórios',
      errors: null,
    });
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
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao registrar novo acesso:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao registrar novo acesso',
            errors: error.message,
    });
  }
};

export const allowPedestrianAccess = async (req: Request, res: Response) => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = req.body;

  // Valida se todos os campos obrigatórios estão presentes
  if (!device || !usuario || !quadra || lote === undefined || !motivo) {
     res.status(400).json({
      content: '',
      success: false,
      errorMessage: 'Necessário dados obrigatórios',
      errors: null,
    });
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
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao liberar pedestre:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao liberar pedestre',
            errors: error.message,
    });
  }
};

export const allowvehicleAccess = async (req: Request, res: Response) => {
const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = req.body;

  if (!device || !usuario || !quadra || lote === undefined || !motivo) {
    res.status(400).json({
      content: '',
      success: false,
      errorMessage: 'Necessário dados obrigatórios',
      errors: null,
    });
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
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao liberar veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao liberar veículo',
            errors: error.message,
    });
  }
};

export const purgeVehicle = async (req: Request, res: Response) => {
  const { period } = req.params;

  if (!period) {
      res.status(400).json({
          content: '',
          success: false,
          errorMessage: 'Período é obrigatório.',
          errors: null,
      });
      return;
  }

  try {
    const result = await setLockVehicleByData(period);
    res.status(200).json({
              content: result,
              success: true,
              errorMessage: null,
              errors: null,
          });
  } catch (error: any) {
    console.error('Erro ao bloquear veículo:', error.message);
    res.status(error.status || 500).json({
            content: '',
            success: false,
            errorMessage: 'Erro ao bloquear veículo',
            errors: error.message,
    });
  }
};
