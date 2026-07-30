import { randomUUID } from 'node:crypto';
import type { IStorageService } from '../services/storage.service.js';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
}

export class TenantService {
  constructor(private readonly storage: IStorageService) {}

  async ensureDefaultTenant(): Promise<TenantRecord> {
    const existing = await this.storage.collection('tenants').findOne({ slug: 'default' });
    if (existing) {
      return {
        id: String(existing.id),
        name: String(existing.name),
        slug: String(existing.slug),
        createdAt: String(existing.created_at),
      };
    }

    const now = new Date().toISOString();
    const tenant: TenantRecord = {
      id: randomUUID(),
      name: 'Default Tenant',
      slug: 'default',
      createdAt: now,
    };
    await this.storage.collection('tenants').insertOne({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      created_at: now,
      updated_at: now,
    });
    return tenant;
  }

  async createTenant(name: string, slug: string): Promise<TenantRecord> {
    const now = new Date().toISOString();
    const tenant: TenantRecord = {
      id: randomUUID(),
      name,
      slug,
      createdAt: now,
    };
    await this.storage.collection('tenants').insertOne({
      id: tenant.id,
      name,
      slug,
      created_at: now,
      updated_at: now,
    });
    return tenant;
  }

  async listTenants(): Promise<TenantRecord[]> {
    const rows = await this.storage.collection('tenants').find({}).toArray();
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      createdAt: String(r.created_at),
    }));
  }

  async upsertUser(input: {
    tenantId: string;
    email: string;
    displayName: string;
    role?: UserRecord['role'];
  }): Promise<UserRecord> {
    const now = new Date().toISOString();
    const existing = await this.storage.collection('users').findOne({
      tenant_id: input.tenantId,
      email: input.email,
    });
    if (existing) {
      await this.storage.collection('users').updateOne(
        { id: existing.id },
        {
          $set: {
            display_name: input.displayName,
            role: input.role ?? existing.role ?? 'member',
            updated_at: now,
          },
        },
      );
      return {
        id: String(existing.id),
        tenantId: input.tenantId,
        email: input.email,
        displayName: input.displayName,
        role: (input.role ?? existing.role ?? 'member') as UserRecord['role'],
        createdAt: String(existing.created_at),
      };
    }

    const user: UserRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      email: input.email,
      displayName: input.displayName,
      role: input.role ?? 'member',
      createdAt: now,
    };
    await this.storage.collection('users').insertOne({
      id: user.id,
      tenant_id: user.tenantId,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      created_at: now,
      updated_at: now,
    });

    await this.storage.collection('user_profiles').updateOne(
      { user_id: user.id },
      {
        $set: {
          user_id: user.id,
          tenant_id: user.tenantId,
          profile_data: {
            email: user.email,
            displayName: user.displayName,
            role: user.role,
          },
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );

    return user;
  }

  async listUsers(tenantId: string): Promise<UserRecord[]> {
    const rows = await this.storage
      .collection('users')
      .find({ tenant_id: tenantId })
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      tenantId: String(r.tenant_id),
      email: String(r.email),
      displayName: String(r.display_name),
      role: (r.role as UserRecord['role']) ?? 'member',
      createdAt: String(r.created_at),
    }));
  }
}
