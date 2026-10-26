import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Dados de conteúdo ficam na raiz do repositório (content/), compartilhados com o backend.
      '@content': fileURLToPath(new URL('../../content', import.meta.url)),
    },
  },
  server: { port: 5173 },
  build: {
    // Phaser é grande; um aviso de chunk acima de 500 kB é esperado.
    chunkSizeWarningLimit: 2000,
  },
});
