import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SystemConfig } from '../../config.js';

export type AuthRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthUser {
  userId: string;
  subject: string;
  role: AuthRole;
  authMethod: 'jwt' | 'api_key';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      transactionId?: string;
    }
  }
}

function parseRole(roleRaw: unknown): AuthRole {
  return roleRaw === 'owner' || roleRaw === 'admin' || roleRaw === 'viewer'
    ? roleRaw
    : 'member';
}

export function createAuthMiddleware(config: SystemConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    const apiKeyHeader = req.header('x-api-key');

    if (apiKeyHeader && config.auth.apiKeyHash) {
      const hash = createHash('sha256').update(apiKeyHeader).digest('hex');
      if (hash === config.auth.apiKeyHash) {
        req.user = {
          userId: 'api-key-user',
          subject: 'api-key-user',
          role: 'admin',
          authMethod: 'api_key',
        };
        next();
        return;
      }
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid API key',
      });
      return;
    }

    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing Bearer token or x-api-key',
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
        role: parseRole(payload.role),
        authMethod: 'jwt',
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

/** Helper for generating API_KEY_HASH from a plaintext key. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
