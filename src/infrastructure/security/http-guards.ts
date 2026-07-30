import type { NextFunction, Request, Response } from 'express';
import type { IStorageService } from '../services/storage.service.js';

export function createRateLimitMiddleware(options: {
  windowMs: number;
  max: number;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.header('x-forwarded-for') || 'local';
    const now = Date.now();
    const current = hits.get(key);
    if (!current || now > current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > options.max) {
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }
    next();
  };
}

export function createAuditMiddleware(storage: IStorageService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = Date.now();
    res.on('finish', () => {
      void storage.collection('audit_log').insertOne({
        id: crypto.randomUUID(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        user_id: req.user?.userId ?? null,
        transaction_id: req.transactionId ?? null,
        duration_ms: Date.now() - started,
        created_at: new Date().toISOString(),
      });
    });
    next();
  };
}
