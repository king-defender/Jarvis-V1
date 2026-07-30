import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
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

export interface PluginContext {
  log: ILoggingService;
  pluginId: string;
}

export interface PluginModule {
  initialize?(ctx: PluginContext): Promise<void> | void;
  getCommands?(): CommandRegistration[];
  default?: PluginModule;
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
      const pluginRoot = path.join(this.pluginsDir, entry);
      const manifestPath = path.join(pluginRoot, 'manifest.json');
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(raw) as PluginManifest;
        const commands = await this.loadEntry(pluginRoot, manifest);
        this.loaded.push({ manifest, commands });
        this.log.info('Plugin loaded', {
          id: manifest.id,
          version: manifest.version,
          commands: commands.map((c) => c.command),
        });
      } catch (error: unknown) {
        this.log.warn('Failed to load plugin folder', {
          entry,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async loadEntry(
    pluginRoot: string,
    manifest: PluginManifest,
  ): Promise<CommandRegistration[]> {
    const entryPath = path.resolve(pluginRoot, manifest.entry);
    const mod = (await import(pathToFileURL(entryPath).href)) as PluginModule & {
      default?: PluginModule;
    };
    // Support both ESM default export and CJS module.exports
    const plugin = (mod.default ?? mod) as PluginModule;

    await plugin.initialize?.({
      log: this.log,
      pluginId: manifest.id,
    });

    const commands = plugin.getCommands?.() ?? [];
    // Ensure plugin commands are namespaced and schema-backed
    return commands.map((c) => ({
      command: c.command.startsWith(`${manifest.id}.`)
        ? c.command
        : `${manifest.id}.${c.command}`,
      schema: c.schema ?? z.object({}).passthrough(),
      handler: c.handler,
    }));
  }
}
