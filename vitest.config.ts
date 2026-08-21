import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // os testes batem no mesmo banco: rodar em serie evita corrida entre arquivos
    fileParallelism: false,
    testTimeout: 30_000,
    env: { NODE_ENV: "test" },
  },
});
