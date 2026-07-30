import type { NextFunction, Request, Response } from 'express';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export function createRequireRoleMiddleware(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req.user?.role as Role | undefined) ?? 'member';
    if ((ROLE_RANK[role] ?? 0) < ROLE_RANK[minRole]) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Requires role ${minRole} or higher`,
      });
      return;
    }
    next();
  };
}

/** Command namespace ACL: viewers can only run system.ping / health-like reads via API. */
export function canExecuteCommand(role: Role | undefined, command: string): boolean {
  const r = role ?? 'member';
  if (r === 'owner' || r === 'admin' || r === 'member') return true;
  return command === 'system.ping' || command.startsWith('platform.classify-error');
}
