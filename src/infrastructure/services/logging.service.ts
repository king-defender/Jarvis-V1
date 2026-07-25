import pino, { type Logger, type LoggerOptions } from 'pino';
import type { SystemConfig } from '../../config.js';

export interface ILoggingService {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): ILoggingService;
}

export class LoggingService implements ILoggingService {
  private readonly logger: Logger;

  constructor(config: SystemConfig, logger?: Logger) {
    if (logger) {
      this.logger = logger;
      return;
    }

    const options: LoggerOptions = {
      level: config.app.env === 'production' ? 'info' : 'debug',
    };

    if (config.app.env === 'development') {
      options.transport = {
        target: 'pino-pretty',
        options: { colorize: true },
      };
    }

    this.logger = pino(options);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(meta ?? {}, message);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(meta ?? {}, message);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(meta ?? {}, message);
  }

  child(bindings: Record<string, unknown>): ILoggingService {
    return new LoggingServiceProxy(this.logger.child(bindings));
  }
}

class LoggingServiceProxy implements ILoggingService {
  constructor(private readonly logger: Logger) {}

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(meta ?? {}, message);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(meta ?? {}, message);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(meta ?? {}, message);
  }

  child(bindings: Record<string, unknown>): ILoggingService {
    return new LoggingServiceProxy(this.logger.child(bindings));
  }
}
