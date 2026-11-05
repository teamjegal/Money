import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages(https://teamjegal.github.io/Money/)용. 배포 워크플로가 BASE_PATH=/Money/ 로 설정한다.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
