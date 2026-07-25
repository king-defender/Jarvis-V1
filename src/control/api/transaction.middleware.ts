import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function transactionIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header('x-transaction-id');
  const transactionId =
    incoming && incoming.length > 0 ? incoming : randomUUID();

  req.transactionId = transactionId;
  res.setHeader('x-transaction-id', transactionId);
  next();
}
