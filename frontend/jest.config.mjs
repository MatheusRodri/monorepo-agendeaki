// Os .js de utils são ESM por utils/package.json; o restante do projeto Next segue sem "type".
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/tests/**/*.test.mjs'],
  restoreMocks: true,
  collectCoverageFrom: ['utils/**/*.{js,mjs}', 'components/**/*.mjs', '!utils/here.js'],
  coverageProvider: 'v8',
  coverageThreshold: { global: { statements: 99, lines: 99, functions: 99, branches: 98 } },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],
};
