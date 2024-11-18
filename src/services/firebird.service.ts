import Firebird from 'node-firebird';
import dotenv from 'dotenv';

dotenv.config();

const firebirdOptions = {
  host: process.env.FIREBIRD_HOST,
  port: parseInt(process.env.FIREBIRD_PORT || '3050', 10),
  database: process.env.FIREBIRD_DATABASE,
  user: process.env.FIREBIRD_USER,
  password: process.env.FIREBIRD_PASSWORD,
};

export const getConnection = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      Firebird.attach(firebirdOptions, (err, db: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(db);
        }
      });
    });
  };

export const executeQuery = async (query: string): Promise<any> => {
  const db = await getConnection();
  return new Promise((resolve, reject) => {
    db.query(query, (err: any, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
      db.detach(); // Sempre fechar a conexão após a execução
    });
  });
};
