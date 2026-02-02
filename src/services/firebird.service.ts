// src/services/firebirdService.ts
import Firebird from 'node-firebird';

const firebirdOptions = {
  host: process.env.FIREBIRD_HOST,
  port: parseInt(process.env.FIREBIRD_PORT || '3050', 10),
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,
};

const poolSize = parseInt(process.env.FIREBIRD_POOL_SIZE || '10', 10);
const pool = Firebird.pool(poolSize, firebirdOptions);

/**
 * Obtém uma conexão do pool do Firebird.
 * @returns Conexão ativa com o banco.
 */
export const openConnection = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    pool.get((err: any, db: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(db);
      }
    });
  });
};

/**
 * Encerra todas as conexões do pool do Firebird.
 * @returns Conclusão do encerramento.
 */
export const closeConnection = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    pool.destroy((err: any) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

/**
 * Executa uma consulta SQL no banco Firebird.
 * @param query SQL a ser executado.
 * @param params Parâmetros da consulta.
 * @returns Resultado da consulta.
 */
export const executeQuery = async (query: string, params: any[]): Promise<any> => {
  const db = await openConnection();
  try {
    return await new Promise((resolve, reject) => {
      db.query(query, params, (err: any, result: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  } finally {
    db.detach();
  }
};

/**
 * Executa uma transação com commit/rollback automático.
 * @param callback Função que recebe a transação ativa.
 * @returns Resultado da operação dentro da transação.
 */
export async function executeTransaction<T>(
  callback: (tx: Firebird.Transaction) => Promise<T>
): Promise<T> {
  const db = await openConnection();

  try {
    return await new Promise((resolve, reject) => {
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
          transaction.rollback(() => {
            reject(callbackErr);
          });
        }
      });
    });
  } finally {
    db.detach();
  }
}
