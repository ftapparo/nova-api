// src/services/firebirdService.ts
import Firebird from 'node-firebird';

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
export const executeQuery = async (query: string, params: any[]): Promise<any> => {
  const db = await openConnection();
  return new Promise((resolve, reject) => {
    db.query(query, params, (err: any, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Função para executar uma transação
export async function executeTransaction<T>(
  callback: (tx: Firebird.Transaction) => Promise<T>
): Promise<T> {
  const db = await openConnection();

  return new Promise((resolve, reject) => {
    db.transaction(Firebird.ISOLATION_READ_COMMITTED, async (err: any, transaction: Firebird.Transaction) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        const result = await callback(transaction);

        transaction.commit((commitErr: any) => {
          if (commitErr) {
            reject(commitErr);
          } else {
            resolve(result);
          }
        });
      } catch (callbackErr) {
        transaction.rollback();
        reject(callbackErr);
      }
    });
  });
}
