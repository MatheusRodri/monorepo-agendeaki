// ESM nativo: os scripts rodam o Jest com --experimental-vm-modules.
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Integração com MySQL real: exige instância descartável, rodada por `npm run test:integracao`.
  testPathIgnorePatterns: ['/node_modules/', 'promocoes\.integracao'],
  restoreMocks: true,
  collectCoverageFrom: ['src/**/*.js', '!src/servidor.js'],
  // Código sem importadores no projeto (ativarAssinaturaPremium); fora da meta de cobertura.
  coveragePathIgnorePatterns: ['/node_modules/', 'src/servicos/assinaturas\.js'],
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  // Piso de cobertura: a execução com --coverage falha se cair abaixo disso.
  coverageThreshold: { global: { statements: 99, lines: 99, functions: 99, branches: 99 } },
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],
};
