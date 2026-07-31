import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSandboxedPath } from './path-sandbox.js';

export interface IFilesystemService {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
}

export class FilesystemService implements IFilesystemService {
  constructor(private readonly rootDir: string) {}

  private resolveSafe(filePath: string): string {
    return resolveSandboxedPath(this.rootDir, filePath);
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(this.resolveSafe(filePath), 'utf8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const full = this.resolveSafe(filePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolveSafe(filePath));
      return true;
    } catch {
      return false;
    }
  }
}
