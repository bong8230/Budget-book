import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  // e2e/ 는 Playwright 가 실행한다
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
