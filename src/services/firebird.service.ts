import Firebird from 'node-firebird';
import dotenv from 'dotenv';
import axios from 'axios';
import net from 'net';
import mqtt from 'mqtt';

dotenv.config();

const firebirdOptions = {
  host: process.env.FIREBIRD_HOST,
  port: parseInt(process.env.FIREBIRD_PORT || '3050', 10),
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,
};

// Variável global para armazenar a conexão
let dbConnection: any = null;

// Função para obter a conexão persistente
export const openConnection = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (dbConnection) {
      // Se a conexão já existe, retorna ela
      resolve(dbConnection);
    } else {
      // Se não existir, cria uma nova conexão
      Firebird.attach(firebirdOptions, (err, db: any) => {
        if (err) {
          reject(err);
        } else {
          dbConnection = db; // Armazena a conexão globalmente
          resolve(dbConnection);
        }
      });
    }
  });
};

// Função para encerrar a conexão quando o aplicativo terminar
export const closeConnection = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (dbConnection) {
      dbConnection.detach((err: any) => {
        if (err) {
          reject(err);
        } else {
          dbConnection = null; // Limpa a conexão global
          resolve();
        }
      });
    } else {
      resolve(); // Se não houver conexão, resolve imediatamente
    }
  });
};

// Função para executar uma consulta
export const executeQuery = async (query: string): Promise<any> => {
  const db = await openConnection();
  return new Promise((resolve, reject) => {
    db.query(query, (err: any, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Função para cadastrar veículo
export const registerVehicle = async (vehicleData: {
  plate: string;
  brand: string;
  model: string;
  color: string;
  user_seq: string;
  unit_seq: string;
  tag: string
}): Promise<any> => {
  const { plate, brand, model, color, user_seq, unit_seq, tag } = vehicleData;

  const query = `
    INSERT INTO VEICULOS (PLACA, MARCA, MODELO, COR, PROPRIETARIO, SEQUNIDADE, TAGVEICULO)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING SEQUENCIA;
  `;

  const db = await openConnection();
  return new Promise((resolve, reject) => {
    db.query(query, [plate, brand, model, color, user_seq, unit_seq, tag], (err: any, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Função para cadastrar foto do veiculo
export const registerVehiclePhoto = async (accessData: {
  vehicleSequence: number;
  photoTag?: Buffer;
  photoVehicle?: Buffer;
}): Promise<any> => {
  const { vehicleSequence, photoTag, photoVehicle } = accessData;

  const query = `INSERT INTO VEICULOSFOTO (SEQVEICULO, FOTOTAG, FOTO)  VALUES ( ?, ?, ?)`;

  const db = await openConnection();
  return new Promise((resolve, reject) => {
    db.query(query, [vehicleSequence, photoTag, photoVehicle], (err: any, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Função para cadastrar acesso
export const registerAccess = async (accessData: {
  personSequence: number;
  type: string;
  panic: string,
  id2: string,
  user: string,
  vehicleSequence: string
}): Promise<any> => {
  const { personSequence, type, panic, id2, user, vehicleSequence } = accessData;

  const query = `INSERT INTO IDACESSO (SEQPESSOA, TIPO, PANICO, ID2, USR, VEICULO) VALUES ( ?, ?, ?, ?, ?, ?)`;

  const db = await openConnection();
  return new Promise((resolve, reject) => {
    db.query(query, [personSequence, type, panic, id2, user, vehicleSequence], (err: any, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
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
    const imageUrl = 'http://192.168.0.250:8081/FreedomFacialAPI/facial-imagens/passagem-liberada_p.jpg'; // URL da imagem a ser exibida
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

    const db = await openConnection();
    return new Promise((resolve, reject) => {
      db.query(
        query,
        [usuario, quadra, lote, motivo, complemento, seqAutorizador, device, botaoTexto],
        (err: any, result: unknown) => {
          if (err) {
            reject(err);
          } else {
            resolve(deviceData);
          }
        }
      );
    });
  } else {
    throw new Error('Failed to open gate: API response indicates failure.');
  }
};

// Função para abrir portão de veiculos
export const openGateVehicle = async (data: { device: number; usuario: string; quadra: string; lote: number; motivo: string; complemento: string; seqAutorizador: number; botaoTexto: string }): Promise<any> => {
  const { device, usuario, quadra, lote, motivo, complemento, seqAutorizador, botaoTexto } = data;

  // Mapeamento dos DeviceIDs para seus respectivos IPs
  type DeviceMapping = {
    [key: number]: { ip: string, port: number };
  };

  // Define o IP e porta com base no dispositivo
  const devices: DeviceMapping = {
    1: { ip: '192.168.0.236', port: 2022 }, // Portão de entrada
    2: { ip: '192.168.0.237', port: 2023 }, // Portão de saída
  };

  const gate = devices[device];

  // Valida o dispositivo
  if (!gate) {
    throw new Error('Device number is not valid. Use 1 for entrada or 2 for saída.');
  }

  // Pacotes TCP
  const closePacket = Buffer.from([0xCf, 0xFF, 0x00, 0x77, 0x02, 0x01, 0x02, 0x54, 0x5C]);
  const closePacketResp = Buffer.from([0xCF, 0x00, 0x00, 0x77, 0x02, 0x00, 0x01, 0x82, 0x35]);

  const openPacket = Buffer.from([0xCF, 0xFF, 0x00, 0x77, 0x02, 0x02, 0x02, 0x7E, 0x34]);
  const openPacketResp1 = Buffer.from([0xCF, 0x00, 0x00, 0x77, 0x03, 0x00, 0x00, 0x00, 0x63, 0xCF]);
  const openPacketResp2 = Buffer.from([0xCF, 0x00, 0x00, 0x77, 0x03, 0x00, 0x82, 0x82, 0x7B, 0xA9]);

  // Função para enviar pacote TCP e validar resposta
  const sendTcpPacket = (packet: Buffer, validResponses: Buffer[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect(gate.port, gate.ip, () => {
        client.write(packet);
        console.log(`TCP packet sent to ${gate.ip}:${gate.port}`);
      });

      client.on('data', (data) => {
        console.log('Response from gate:', data);
        if (!validResponses.some((resp) => data.equals(resp))) {
          client.destroy();
          return reject(new Error('Invalid response from gate'));
        }
        client.destroy(); // Fecha a conexão após resposta válida
        resolve();
      });

      client.on('error', (err) => {
        console.error('Error connecting to gate:', err);
        client.destroy();
        reject(err);
      });

      client.on('close', () => {
        console.log('Connection to gate closed');
      });
    });

  // Envia os pacotes na sequência: Fechamento -> Abertura -> Fechamento
  await sendTcpPacket(closePacket, [closePacketResp]);
  await sendTcpPacket(openPacket, [openPacketResp1, openPacketResp2]);
  await sendTcpPacket(closePacket, [closePacketResp]);


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

  const db = await openConnection();
  return new Promise((resolve, reject) => {
    db.query(
      query,
      [usuario, quadra, lote, motivo, complemento, seqAutorizador, device + 10, botaoTexto],
      (err: any, result: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve({ device, status: 'Gate opened successfully' });
        }
      }
    );
  });
};

// Função de troca de imagem do facial
export const sendMqttMessage = async (deviceId: number, messagePath: string): Promise<void> => {
  const broker = '192.168.0.250'; // IP do broker MQTT
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
export const verifyAccessById = async (id: string, dispositivo: number, foto: string, sentido: string): Promise<any> => {

  const query = `EXECUTE PROCEDURE ACESSO_DISPOSITIVO (?, ?, ?, ?);`;

  const db = await openConnection();
  return new Promise((resolve, reject) => {
    db.query(
      query,
      [id, dispositivo, foto, sentido],
      (err: any, result: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
  });
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
  const db = await openConnection();

  return new Promise((resolve, reject) => {
    // 👇 Nível de isolamento explicitado
    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err: any, transaction: any) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const currentDateTime = new Date().toISOString().replace('T', ' ').slice(0, 19); // "YYYY-MM-DD HH:mm:ss"

        transaction.query(`
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
          currentDateTime,
          data.origem,
          data.seqIdAcesso,
          data.sentido,
          data.quadra,
          data.lote,
          data.panico,
          data.formaAcesso,
          data.idAcesso,
          data.seqVeiculo
        ], (err1: any, result1: any) => {
          if (err1) {
            transaction.rollback();
            reject(err1);
            return;
          }

          
          const seqCircDisp = result1.SEQUENCIA;

          transaction.query(`
            SELECT SEQUENCIA FROM UNIDADES
            WHERE QUADRA = ? AND LOTE = ?
          `, [
            data.quadra.trim(),
            data.lote.trim()
          ], (err2: any, unidadeResult: any) => {
            if (err2 || unidadeResult.length === 0) {
              transaction.rollback();
              reject(err2 || new Error('Unidade não encontrada'));
              return;
            }
            
            const seqUnidade = unidadeResult[0].SEQUENCIA;

            transaction.query(`
              INSERT INTO CIRCULACAODISPDEST (
                SEQCIRCDISP,
                SEQUNIDADE,
                SEQAUTORIZADOR
              ) VALUES (?, ?, NULL);
            `, [seqCircDisp, seqUnidade], (err3: any) => {
              if (err3) {
                transaction.rollback();
                reject(err3);
              } else {
                transaction.commit((commitErr: any) => {
                  if (commitErr) {
                    reject(commitErr);
                  } else {
                    resolve({ status: 'success', seqCircDisp, seqUnidade });
                  }
                });
              }
            });
          });
        });
      } catch (e) {
        transaction.rollback();
        reject(e);
      }
    });
  });
};



