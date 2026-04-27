/**
 * Enhanced logging system for monitoring agent interactions
 *
 * Configuration via environment variables:
 * - LOG_LEVEL: DEBUG, INFO, WARN, ERROR (default: DEBUG)
 * - LOG_FILE: Enable file logging (default: false)
 * - LOG_DIR: Directory for log files (default: ./logs)
 * - PROVIDER_LOGGING: Separate log files per provider (default: true)
 *
 * Usage:
 * - LOG_LEVEL=INFO LOG_FILE=true LOG_DIR=./logs node dist/agent.js
 */

import fs from 'node:fs';
import path from 'node:path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: keyof typeof LogLevel;
  component: string;
  action?: string;
  duration?: string;
  provider?: string;
  data?: unknown;
}

interface LogConfig {
  level: LogLevel;
  fileLogging: boolean;
  logDir: string;
  providerLogging: boolean;
}

export class Logger {
  private config: LogConfig;
  private levels: typeof LogLevel;

  constructor() {
    this.levels = LogLevel;

    // Parse log level
    const levelStr = (process.env.LOG_LEVEL || 'DEBUG').toUpperCase();
    this.config = {
      level: LogLevel[levelStr as keyof typeof LogLevel] ?? LogLevel.DEBUG,
      fileLogging: process.env.LOG_FILE === 'true' || process.env.LOG_FILE === '1',
      logDir: process.env.LOG_DIR || './logs',
      providerLogging: process.env.PROVIDER_LOGGING !== 'false',
    };

    // Ensure log directory exists
    if (this.config.fileLogging) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    return this.config.level <= level;
  }

  private formatEntry(entry: Omit<LogEntry, 'timestamp'>): string {
    const ts = this.getTimestamp();
    const paddedLevel = entry.level.padStart(5, ' ');
    const provider = entry.provider ? `[${entry.provider}]` : '';
    const component = `[${entry.component}]`;
    const action = entry.action ? ` ${entry.action}` : '';

    return `\x1b[${this.getLevelColor(entry.level)}m[${ts}] ${paddedLevel} ${provider}${component}${action}\x1b[0m`;
  }

  private getLevelColor(level: string): number {
    switch (level) {
      case 'DEBUG':
        return 90; // Gray
      case 'INFO':
        return 36; // Cyan
      case 'WARN':
        return 33; // Yellow
      case 'ERROR':
        return 31; // Red
      default:
        return 37;
    }
  }

  private writeToFile(entry: LogEntry): void {
    if (!this.config.fileLogging) return;

    let filename: string;
    if (this.config.providerLogging && entry.provider) {
      filename = path.join(this.config.logDir, `agent_${entry.provider.toLowerCase()}.log`);
    } else {
      filename = path.join(this.config.logDir, 'agent.log');
    }

    const jsonEntry = {
      timestamp: entry.timestamp,
      level: entry.level,
      component: entry.component,
      action: entry.action,
      duration: entry.duration,
      provider: entry.provider,
      data: entry.data,
    };

    fs.appendFileSync(filename, JSON.stringify(jsonEntry) + '\n');
  }

  private logRaw(entry: Omit<LogEntry, 'timestamp'>): void {
    const entryWithTimestamp: LogEntry = {
      ...entry,
      timestamp: this.getTimestamp(),
    };

    // Console output
    if (this.shouldLog(this.levels[entry.level as keyof typeof LogLevel])) {
      const formatted = this.formatEntry(entry);
      console.log(formatted);

      if (entry.data !== undefined) {
        console.log(JSON.stringify(entry.data, null, 2));
      }
    }

    // File output
    this.writeToFile(entryWithTimestamp);
  }

  /**
   * Log a message at specified level
   */
  private log(level: keyof typeof LogLevel, component: string, data?: unknown, action?: string): void {
    this.logRaw({
      level,
      component,
      data,
      action,
    });
  }

  /**
   * Log DEBUG level message
   */
  debug(component: string, data?: unknown, action?: string): void {
    this.log('DEBUG', component, data, action);
  }

  /**
   * Log INFO level message
   */
  info(component: string, data?: unknown, action?: string): void {
    this.log('INFO', component, data, action);
  }

  /**
   * Log WARN level message
   */
  warn(component: string, data?: unknown, action?: string): void {
    this.log('WARN', component, data, action);
  }

  /**
   * Log ERROR level message
   */
  error(component: string, error: unknown, action?: string): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorData = error instanceof Error ? { message: errorMsg, stack: error.stack } : errorMsg;
    this.log('ERROR', component, errorData, action);
  }

  /**
   * Log API request payload
   */
  logApiRequest(provider: string, endpoint: string, payload: unknown): void {
    const sanitized = this.sanitizePayload(payload);
    this.logRaw({
      level: 'DEBUG',
      component: 'api',
      provider,
      action: `request:${endpoint}`,
      data: {
        direction: 'OUTGOING',
        payload: sanitized,
      },
    });
  }

  /**
   * Log API response
   */
  logApiResponse(provider: string, responseData: unknown, durationMs: number): void {
    const sanitized = this.sanitizePayload(responseData);
    this.logRaw({
      level: 'DEBUG',
      component: 'api',
      provider,
      duration: `${durationMs}ms`,
      action: 'response',
      data: {
        direction: 'INCOMING',
        response: sanitized,
      },
    });
  }

  /**
   * Log tool execution
   */
  logToolExecution(provider: string | undefined, toolName: string, data?: unknown): void {
    this.logRaw({
      level: 'INFO',
      component: 'tools',
      provider,
      action: toolName,
      data,
    });
  }

  /**
   * Log agent interaction
   */
  logAgentInteraction(step: string, data: unknown, provider?: string): void {
    this.logRaw({
      level: 'DEBUG',
      component: 'agent',
      provider,
      action: step,
      data,
    });
  }

  /**
   * Sanitize sensitive data from payloads (API keys, tokens)
   */
  private sanitizePayload(obj: unknown): unknown {
    if (!obj) return obj;

    const sensitiveKeys = [
      'apikey',
      'api_key',
      'authorization',
      'token',
      'password',
      'secret',
      'credentials',
      'key',
    ];

    const sanitize = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(sanitize);
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = sanitize(val);
      }
    }
    return sanitized;
  };

    return sanitize(obj);
  }

  /**
   * Get current log configuration
   */
  getConfig(): LogConfig {
    return { ...this.config };
  }

  /**
   * Check if a specific log level is enabled
   */
  isLevelEnabled(level: keyof typeof LogLevel): boolean {
    return this.shouldLog(this.levels[level]);
  }
}

// Export singleton
export const logger = new Logger();
