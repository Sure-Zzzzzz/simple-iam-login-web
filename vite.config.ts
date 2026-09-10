import http from 'node:http';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 禁用 keep-alive：后端/nginx 重启后 proxy 不复用死连接（否则窗口期全 502）
const noKeepAlive = () => new http.Agent({ keepAlive: false });

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/app': {
        target: 'http://localhost:5176',
        ws: true
      },
      '/micro': {
        target: 'http://localhost:5175',
        ws: true
      },
      '/iam': { target: 'http://localhost:8179', agent: noKeepAlive() },
      '/oauth2': { target: 'http://localhost:8179', agent: noKeepAlive() }
    }
  }
});
