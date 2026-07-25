import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SystemConfig } from '../../config.js';

export interface AuthUser {
  userId: string;
  subject: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      transactionId?: string;
    }
  }
}

export function createAuthMiddleware(config: SystemConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing Bearer token',
      });
      return;
    }

    const token = header.slice('Bearer '.length).trim();

    try {
      const payload = jwt.verify(token, config.auth.jwtSecret) as jwt.JwtPayload;
      const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
      if (!userId) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Token missing subject',
        });
        return;
      }

      req.user = {
        userId,
        subject: userId,
      };
      next();
    } catch {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }
  };
}

export function createDevToken(config: SystemConfig, userId = 'local-user'): string {
  return jwt.sign({ sub: userId }, config.auth.jwtSecret, { expiresIn: '7d' });
}
