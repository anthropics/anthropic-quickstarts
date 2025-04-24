module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: false,
  collectCoverageFrom: [
    'app/api/**/*.ts',
    '!**/node_modules/**',
    '!**/vendor/**'
  ],
  transform: {},
};