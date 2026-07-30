import type { ClientSession, Collection, Db, Document, MongoClient } from 'mongodb';

export interface IStorageService {
  getDb(): Db;
  collection<T extends Document = Document>(name: string): Collection<T>;
  startSession(): Promise<ClientSession>;
}

export class StorageService implements IStorageService {
  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
  ) {}

  getDb(): Db {
    return this.db;
  }

  collection<T extends Document = Document>(name: string): Collection<T> {
    return this.db.collection<T>(name);
  }

  startSession(): Promise<ClientSession> {
    return Promise.resolve(this.client.startSession());
  }
}
