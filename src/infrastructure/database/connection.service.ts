import { MongoClient, type Db } from 'mongodb';
import type { SystemConfig } from '../../config.js';
import type { ILoggingService } from '../services/logging.service.js';

const COLLECTIONS = [
  'user_profiles',
  'command_directives',
  'workflows',
  'tasks',
  'rule_groups',
  'rule_conditions',
  'career_profiles',
  'job_listings',
  'resumes',
  'cover_letters',
  'applications',
  'pending_approvals',
  'repositories_audit',
  'competitor_profiles',
  'learning_syllabi',
  'learning_decks',
  'study_progress',
  'financial_expenses',
  'financial_reports',
  'email_threads',
  'sent_notifications',
  'browser_crawl_cache',
  'automation_triggers',
  'tenants',
  'users',
  'outbound_email',
  'notifications',
  'audit_log',
  'decision_log',
  'interview_prep',
] as const;

export class DatabaseService {
  private client: MongoClient | undefined;
  private db: Db | undefined;

  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  async connect(): Promise<void> {
    this.client = new MongoClient(this.config.database.mongoUrl, {
      serverSelectionTimeoutMS: this.config.database.timeoutMs,
    });
    await this.client.connect();
    this.db = this.client.db(this.config.database.dbName);
    this.log.info('MongoDB connected', {
      dbName: this.config.database.dbName,
    });
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  getClient(): MongoClient {
    if (!this.client) {
      throw new Error('Database not connected');
    }
    return this.client;
  }

  /** Ensures collections/indexes exist (Mongo equivalent of SQL migrate). */
  async migrate(): Promise<void> {
    const db = this.getDb();

    for (const name of COLLECTIONS) {
      const existing = await db.listCollections({ name }).hasNext();
      if (!existing) {
        await db.createCollection(name);
      }
    }

    await db.collection('user_profiles').createIndex({ user_id: 1 }, { unique: true });
    await db
      .collection('command_directives')
      .createIndex({ transaction_id: 1 }, { unique: true });
    await db.collection('command_directives').createIndex({ user_id: 1, status: 1 });
    await db.collection('command_directives').createIndex({ command: 1 });
    await db.collection('workflows').createIndex({ status: 1 });
    await db.collection('tasks').createIndex({ workflow_id: 1 });
    await db.collection('tasks').createIndex({ status: 1 });
    await db.collection('rule_conditions').createIndex({ rule_group_id: 1 });
    await db.collection('career_profiles').createIndex({ id: 1 }, { unique: true });
    await db.collection('career_profiles').createIndex({ user_id: 1, platform: 1 });
    await db.collection('job_listings').createIndex({ id: 1 }, { unique: true });
    await db.collection('job_listings').createIndex({ user_id: 1 });
    await db.collection('resumes').createIndex({ id: 1 }, { unique: true });
    await db.collection('cover_letters').createIndex({ id: 1 }, { unique: true });
    await db.collection('applications').createIndex({ id: 1 }, { unique: true });
    await db.collection('applications').createIndex({ user_id: 1, status: 1 });
    await db.collection('pending_approvals').createIndex({ id: 1 }, { unique: true });
    await db.collection('pending_approvals').createIndex({ status: 1 });
    await db.collection('repositories_audit').createIndex({ repo_path: 1 }, { unique: true });
    await db.collection('competitor_profiles').createIndex({ domain_url: 1 }, { unique: true });
    await db.collection('learning_decks').createIndex({ deck_id: 1 }, { unique: true });
    await db.collection('financial_expenses').createIndex({ user_id: 1, transaction_date: 1 });
    await db.collection('sent_notifications').createIndex({ id: 1 }, { unique: true });
    await db.collection('browser_crawl_cache').createIndex({ url_hash: 1 }, { unique: true });
    await db.collection('automation_triggers').createIndex({ id: 1 }, { unique: true });
    await db.collection('tenants').createIndex({ slug: 1 }, { unique: true });
    await db.collection('users').createIndex({ tenant_id: 1, email: 1 }, { unique: true });

    this.log.info('MongoDB collections and indexes are up to date');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client || !this.db) {
      return false;
    }
    await this.client.db('admin').command({ ping: 1 });
    return true;
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
      this.db = undefined;
    }
  }
}
