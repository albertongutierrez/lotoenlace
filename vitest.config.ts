import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./resources/js',import.meta.url))}},test:{include:['tests/frontend/*.test.tsx']},oxc:{jsx:{runtime:'automatic'}}});
