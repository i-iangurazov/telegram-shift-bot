import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/setup/setupEnv.ts"],
  globalSetup: "<rootDir>/tests/setup/globalSetup.js",
  clearMocks: true,
  maxWorkers: 1,
  testTimeout: 30000,
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.test.json"
    }
  }
};

export default config;
