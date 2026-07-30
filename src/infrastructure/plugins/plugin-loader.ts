import fs from 'node:fs/promises';
import path from 'node:path';
import type { CommandRegistration } from '../../shared/types/command.types.js';
import type { ILoggingService } from '../services/logging.service.js';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  entry: string;
  permissions?: string[];
  exports?: {
    commands?: string[];
    events?: string[];
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  commands: CommandRegistration[];
}

export class PluginLoader {
  private readonly loaded: LoadedPlugin[] = [];

  constructor(
    private readonly pluginsDir: string,
    private readonly log: ILoggingService,
  ) {}

  list(): PluginManifest[] {
    return this.loaded.map((p) => p.manifest);
  }

  getCommands(): CommandRegistration[] {
    return this.loaded.flatMap((p) => p.commands);
  }

  async loadAll(): Promise<void> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.pluginsDir);
    } catch {
      this.log.info('No plugins directory found; skipping plugin load', {
        pluginsDir: this.pluginsDir,
      });
      return;
    }

    for (const entry of entries) {
      const manifestPath = path.join(this.pluginsDir, entry, 'manifest.json');
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(raw) as PluginManifest;
        this.loaded.push({ manifest, commands: [] });
        this.log.info('Plugin manifest loaded', { id: manifest.id, version: manifest.version });
      } catch {
        // ignore invalid plugin folders
      }
    }
  }
}
