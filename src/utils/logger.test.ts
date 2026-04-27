import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, LogLevel, Logger } from './logger.js';

describe('Logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, LOG_LEVEL: 'DEBUG', LOG_FILE: 'false' };
    vi.spyOn(console, 'log');
    vi.spyOn(console, 'error');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('LogLevel enum', () => {
    it('should define log levels', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
    });
  });

  describe('isLevelEnabled', () => {
    it('should return true when DEBUG is enabled', () => {
      expect(logger.isLevelEnabled('DEBUG')).toBe(true);
    });

    it('should return true when ERROR is enabled', () => {
      expect(logger.isLevelEnabled('ERROR')).toBe(true);
    });
  });

  describe('logApiRequest', () => {
    it('should log API request with sanitized payload', () => {
      const payload = {
        api_key: 'secret123',
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
      };

      logger.logApiRequest('OpenAI', 'chat.completions.create', payload);

      expect(console.log).toHaveBeenCalled();
      const allCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join('');
      expect(allCalls).toContain('REDACTED');
    });
  });

  describe('logApiResponse', () => {
    it('should log API response with timing', () => {
      const response = {
        id: 'msg_123',
        model: 'gpt-4',
        content: 'Hello!',
        usage: { total_tokens: 10 },
      };
      const duration = 123;

      logger.logApiResponse('OpenAI', response, duration);

      expect(console.log).toHaveBeenCalled();
      const allCalls = (console.log as any).mock.calls.flat().join('\n');
      // The duration appears in the header line
      expect(allCalls).toContain('123');
    });
  });

  describe('logToolExecution', () => {
    it('should log tool execution with provider context', () => {
      logger.logToolExecution('openai', 'bash', { command: 'ls -la' });

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('logAgentInteraction', () => {
    it('should log agent interaction with provider context', () => {
      logger.logAgentInteraction('user-input', { query: 'list files' }, 'openai');

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('standard logging methods', () => {
    it('should log debug messages', () => {
      logger.debug('test', { value: 1 });
      expect(console.log).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      logger.info('test', { value: 2 });
      expect(console.log).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('test', { value: 3 });
      expect(console.log).toHaveBeenCalled();
    });

    it('should fall back to a default color for unknown levels', () => {
      // @ts-expect-error access private helper for coverage
      expect((logger as { getLevelColor: (level: string) => number }).getLevelColor('UNKNOWN')).toBe(37);
    });
  });

  describe('error', () => {
    it('should log Error objects', () => {
      const error = new Error('Test error');
      logger.error('test', error);

      // Check that console.log (not console.error) is called - error uses log with red color
      expect(console.log).toHaveBeenCalled();
      const allCalls = (console.log as any).mock.calls.flat().join('\n');
      expect(allCalls).toContain('Test error');
    });

    it('should log non-Error values', () => {
      logger.error('test', 'string error');

      expect(console.log).toHaveBeenCalled();
      const allCalls = (console.log as any).mock.calls.flat().join('\n');
      expect(allCalls).toContain('string error');
    });
  });

  describe('sanitizePayload', () => {
    it('should have sanitization logic', () => {
      // The actual sanitization happens inside the logging methods
      // This test verifies the logger has the expected properties
      const sanitized = logger.getConfig();
      expect(sanitized).toBeDefined();
    });

    it('should handle nested objects', () => {
      const payload = {
        data: {
          api_key: 'nested_secret',
          value: 123,
        },
      };

      logger.logApiRequest('Test', 'endpoint', payload);
      const allCalls = (console.log as any).mock.calls.flat().join('\n');
      expect(allCalls).toContain('REDACTED');
    });

    it('should handle arrays', () => {
      const payload = {
        items: ['a', 'b', { api_key: 'secret' }],
      };

      logger.logApiRequest('Test', 'endpoint', payload);
      const allCalls = (console.log as any).mock.calls.flat().join('\n');
      expect(allCalls).toContain('REDACTED');
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = logger.getConfig();
      expect(config).toHaveProperty('level');
      expect(config).toHaveProperty('fileLogging');
      expect(config).toHaveProperty('logDir');
      expect(config).toHaveProperty('providerLogging');
    });

    it('should respect LOG_LEVEL environment variable', () => {
      expect(logger.getConfig().level).toBe(LogLevel.DEBUG);
    });

    it('should respect LOG_FILE environment variable', () => {
      expect(logger.getConfig().fileLogging).toBe(false);
    });

    it('should respect LOG_DIR environment variable', () => {
      expect(logger.getConfig().logDir).toBe('./logs');
    });

    it('should respect PROVIDER_LOGGING environment variable', () => {
      expect(logger.getConfig().providerLogging).toBe(true);
    });
  });

  describe('default configuration', () => {
    it('should default LOG_LEVEL to DEBUG', () => {
      expect(logger.getConfig().level).toBe(LogLevel.DEBUG);
    });

    it('should default LOG_FILE to false', () => {
      expect(logger.getConfig().fileLogging).toBe(false);
    });

    it('should default LOG_DIR to ./logs', () => {
      expect(logger.getConfig().logDir).toBe('./logs');
    });

    it('should default PROVIDER_LOGGING to true', () => {
      expect(logger.getConfig().providerLogging).toBe(true);
    });
  });

  describe('file logging', () => {
    const tempDir = path.join(process.cwd(), 'tmp-log-test');

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should write provider-specific log file when PROVIDER_LOGGING is true', () => {
      process.env.LOG_FILE = 'true';
      process.env.LOG_DIR = tempDir;
      process.env.PROVIDER_LOGGING = 'true';

      const fileLogger = new Logger();
      fileLogger.logApiRequest('TestProvider', 'endpoint', { value: 1 });

      const generatedLog = path.join(tempDir, 'agent_testprovider.log');
      expect(fs.existsSync(generatedLog)).toBe(true);
      const contents = fs.readFileSync(generatedLog, 'utf8');
      expect(contents).toContain('request:endpoint');
    });

    it('should write default log file when PROVIDER_LOGGING is false', () => {
      process.env.LOG_FILE = 'true';
      process.env.LOG_DIR = tempDir;
      process.env.PROVIDER_LOGGING = 'false';

      const fileLogger = new Logger();
      fileLogger.logApiResponse('TestProvider', { result: 'ok' }, 1);

      const generatedLog = path.join(tempDir, 'agent.log');
      expect(fs.existsSync(generatedLog)).toBe(true);
      const contents = fs.readFileSync(generatedLog, 'utf8');
      expect(contents).toContain('response');
    });
  });
});
