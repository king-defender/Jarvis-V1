import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SystemConfig } from '../../config.js';

export type AuthRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthUser {
  userId: string;
  subject: string;
  role: AuthRole;
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

      const roleRaw = typeof payload.role === 'string' ? payload.role : 'member';
      const role: AuthRole =
        roleRaw === 'owner' || roleRaw === 'admin' || roleRaw === 'viewer'
          ? roleRaw
          : 'member';

      req.user = {
        userId,
        subject: userId,
        role,
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

export function createDevToken(
  config: SystemConfig,
  userId = 'local-user',
  role: AuthRole = 'owner',
): string {
  return jwt.sign({ sub: userId, role }, config.auth.jwtSecret, { expiresIn: '7d' });
}
