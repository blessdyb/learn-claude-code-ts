import { beforeAll, afterAll, vi } from 'vitest';

// Setup file for vitest
// This runs before each test file

// Global test configuration
beforeAll(() => {
  // Set up any global mocks or configurations
  vi.stubEnv('DEBUG', 'false');
  vi.stubEnv('LOG_LEVEL', 'DEBUG');
  vi.stubEnv('LOG_FILE', 'false');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// Extend expect with custom matchers if needed
// expect.extend({
//   toBeValidMessage(received) {
//     // Custom matcher implementation
//     const pass = typeof received === 'object' && received !== null;
//     return {
//       pass,
//       message: () => pass
//         ? 'expected to not be a valid message'
//         : 'expected to be a valid message',
//     };
//   },
// });
