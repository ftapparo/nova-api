import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para desabilitar cache em respostas da API.
 * @param req Requisição HTTP.
 * @param res Resposta HTTP.
 * @param next Função para seguir para o próximo middleware.
 */
export const freedomValidate = (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');

  next();
};
