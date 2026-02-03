// src/repositories/freedomAccessRepository.ts
import axios from 'axios';
import net from 'net';
import mqtt from 'mqtt';
import { executeQuery, executeTransaction } from '../services/firebird.service';

const freedom = {
  host: process.env.FREEDOM_HOST,
  port: parseInt(process.env.FREEDOM_PORT || '8080', 10),
};

// Função para abrir portão de pedestres
export const openGatePedestrian = async (data: { device: number; usuario: string; quadra: string; lote: number; motivo: string; complemento: string; seqAutorizador: number; botaoTexto: string }): Promise<any> => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = data;

  // Mapeamento dos DeviceIDs para seus respectivos IPs
  type DeviceMapping = {
    [key: number]: { id: number; ip: string };
  };

  const devices: DeviceMapping = {
    1: { id: 1795880, ip: '192.168.0.240' }, //EntradaVeiculo
    2: { id: 1795870, ip: '192.168.0.241' }, //SaidaVeiculo
    3: { id: 1825437, ip: '192.168.0.230' }, //EntradaVisitante
    4: { id: 1983403, ip: '192.168.0.231' }, //SaidaVisitante
    5: { id: 1983310, ip: '192.168.0.232' }, //EntradaMorador
    6: { id: 1983358, ip: '192.168.0.233' }, //SaidaMorador
    7: { id: 1825485, ip: '192.168.0.234' }, //AcessoBicicletario
  };

  const deviceData = devices[device];

  // Valida o dispositivo
  if (!deviceData) {
    throw new Error('Gate number is not valid');
  }

  const url = `http://${deviceData.ip}/action/OpenDoor`;

  // Dados do corpo da requisição
  const requestBody = {
    operator: 'OpenDoor',
    info: {
      DeviceID: deviceData.id.toString(),
      CHN: 0,
      status: 1,
      msg: '',
    },
  };

  // Configuração da autenticação
  const authHeader = `Basic ${Buffer.from('admin:.Facial@2020,').toString('base64')}`;

  // Faz a chamada para a API
  const response = await axios.post(url, requestBody, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
  });

  // Verifica se a resposta foi bem-sucedida
  if (response.status === 200 && response.data.code === 200 && response.data.info.Result === 'Ok') {

    // Transmissão MQTT após sucesso no banco e na abertura do portão
    const imageUrl = `http://${freedom.host}:${freedom.port}/FreedomFacialAPI/facial-imagens/passagem-liberada_p.jpg`; // URL da imagem a ser exibida
    await sendMqttMessage(deviceData.id, imageUrl);

    // Faz o INSERT na tabela BOTOEIRAUSO
    const query = `
      INSERT INTO BOTOEIRAUSO 
      (SEQUENCIA, DATAHORA, USUARIO, QUADRA, LOTE, MOTIVO, COMPLEMENTO, SEQAUTORIZADOR, NUMDISPOSITIVO, BOTAO_TEXTO)
      VALUES (
           GEN_ID(GEN_BOTOEIRAUSO_ID, 1), -- Gera o próximo valor da sequência
          'NOW', -- Firebird aceita a palavra-chave 'NOW' para a data e hora atual
          ?, -- Substituir pelo usuário real
          ?, -- Substituir pelo valor correto
          ?, -- Substituir pelo valor correto
          ?, -- Substituir pelo motivo correto
          ?, -- Substituir pelo complemento correto
          ?, -- Substituir pelo identificador do autorizador
          ?, -- Substituir pelo número do dispositivo
          ? -- Substituir pelo texto do botão
      )
    `;

    await executeQuery(query, [usuario, quadra, lote, motivo, complemento, seqAutorizador, device, botaoTexto]);
    return deviceData;
  } else {
    throw new Error('Failed to open gate: API response indicates failure.');
  }
};

// Função para abrir portão de veiculos
export const openGateVehicle = async (data: { device: number; usuario: string; quadra: string; lote: number; motivo: string; complemento: string; seqAutorizador: number; botaoTexto: string }): Promise<any> => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = data;

  // integraçao com nova-tag

  // Faz o INSERT na tabela BOTOEIRAUSO
  const query = `
    INSERT INTO BOTOEIRAUSO 
    (SEQUENCIA, DATAHORA, USUARIO, QUADRA, LOTE, MOTIVO, COMPLEMENTO, SEQAUTORIZADOR, NUMDISPOSITIVO, BOTAO_TEXTO)
    VALUES (
        GEN_ID(GEN_BOTOEIRAUSO_ID, 1), -- Gera o próximo valor da sequência
        'NOW', -- Firebird aceita a palavra-chave 'NOW' para a data e hora atual
        ?, -- Substituir pelo usuário real
        ?, -- Substituir pelo valor correto
        ?, -- Substituir pelo valor correto
        ?, -- Substituir pelo motivo correto
        ?, -- Substituir pelo complemento correto
        ?, -- Substituir pelo identificador do autorizador
        ?, -- Substituir pelo número do dispositivo
        ? -- Substituir pelo texto do botão
    )
  `;

  await executeQuery(query, [usuario, quadra, lote, motivo, complemento, seqAutorizador, device + 10, botaoTexto]);
  return { device, status: 'Gate opened successfully' };
};

// Função de troca de imagem do facial
export const sendMqttMessage = async (deviceId: number, messagePath: string): Promise<void> => {
  const broker = freedom.host; // IP do broker MQTT
  const port = 1883; // Porta padrão MQTT

  const client = mqtt.connect(`mqtt://${broker}:${port}`);

  const topic = `mqtt/face/${deviceId}`;
  const messageId = `ID:localhost-${Date.now()}`; // Geração do messageId único
  const message = JSON.stringify({
    operator: "EditAD",
    messageId: messageId,
    info: {
      adid: "",
      path: messagePath,
      adslot: "0", // Slot padrão para a exibição
      poltime: "1", // Tempo ou política para exibição
    },
  });

  return new Promise<void>((resolve, reject) => {
    client.on('connect', () => {
      console.log(`Connected to MQTT broker at ${broker}:${port}`);

      // Publica a mensagem no tópico
      client.publish(topic, message, { qos: 0 }, (err) => {
        if (err) {
          console.error('Error publishing MQTT message:', err);
          reject(err);
        } else {
          console.log(`Message published to topic "${topic}":`, message);
          resolve();
        }

        // Fecha a conexão
        client.end();
      });
    });

    client.on('error', (err) => {
      console.error('Error connecting to MQTT broker:', err);
      client.end();
      reject(err);
    });
  });
};

// Função para validar acesso
export const verifyAccessById = async (
  id: string,
  dispositivo: number,
  foto: string | null,
  sentido: string
): Promise<any> => {

  const query = `SELECT * FROM ACESSO_DISPOSITIVO_V2(?, ?, ?, ?);`;

  const result = await executeQuery(query, [id, dispositivo, foto, sentido]);

  if (Array.isArray(result)) {
    for (const row of result) {
      if (row?.FOTO && Buffer.isBuffer(row.FOTO)) {
        row.FOTO = row.FOTO.toString('base64');
      }
    }
  }

  return result;
};

// Função para inserir acesso
export const insertAccess = async (data: {
  dispositivo: number;
  pessoa: number;
  classificacao: number;
  classAutorizado: string;
  autorizacaoLanc: string;
  origem: string;
  seqIdAcesso: number;
  sentido: string;
  quadra: string;
  lote: string;
  panico: string;
  formaAcesso: string;
  idAcesso: string;
  seqVeiculo: number;
}) => {
  return executeTransaction(async (transaction) => {
    const txQuery = (sql: string, params: any[]) =>
      new Promise<any>((resolve, reject) => {
        transaction.query(sql, params, (err: any, result: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });

    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000; // Ajusta o timezone do servidor
    const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');

    const result1 = await txQuery(`
      INSERT INTO CIRCULACAODISP (
        DISPOSITIVO, "PESSOA", CLASSIFICACAO, CLASSAUTORIZADO, AUTORIZACAOLANC,
        DATAHORA, ORIGEM, SEQIDACESSO, SENTIDO, QUADRADEST, LOTEDEST,
        ONOFF, PANICO, FORMAACESSO, IDACESSO, BAIXADO, SEQVEICULO, SINCRONIZAR
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        'ON', ?, ?, ?, 'N', ?, 'S'
      )
      RETURNING SEQUENCIA;
    `, [
      data.dispositivo,
      data.pessoa,
      data.classificacao,
      data.classAutorizado,
      data.autorizacaoLanc,
      localISOTime,
      data.origem,
      data.seqIdAcesso,
      data.sentido,
      data.quadra,
      data.lote,
      data.panico,
      data.formaAcesso,
      data.idAcesso,
      data.seqVeiculo
    ]);

    const seqCircDisp = result1.SEQUENCIA;

    const unidadeResult = await txQuery(`
      SELECT SEQUENCIA FROM UNIDADES
      WHERE QUADRA = ? AND LOTE = ?
    `, [
      data.quadra.trim(),
      data.lote.trim()
    ]);

    if (!unidadeResult || unidadeResult.length === 0) {
      throw new Error('Unidade não encontrada');
    }

    const seqUnidade = unidadeResult[0].SEQUENCIA;

    await txQuery(`
      INSERT INTO CIRCULACAODISPDEST (
        SEQCIRCDISP,
        SEQUNIDADE,
        SEQAUTORIZADOR
      ) VALUES (?, ?, NULL);
    `, [seqCircDisp, seqUnidade]);

    return { status: 'success', seqCircDisp, seqUnidade };
  });
};



