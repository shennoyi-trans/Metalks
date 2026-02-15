import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // 项目根目录就是 frontend/
    root: '.',

    // 多页入口配置
    build: {
        rollupOptions: {
            input: {
                // 每个 HTML 页面对应一个入口
                chat: resolve(__dirname, 'html/chat.html'),
                auth: resolve(__dirname, 'html/auth.html'),
                dimgaai: resolve(__dirname, 'html/dimgaai.html'),
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
    },

    // 开发服务器：将 /api 请求代理到 FastAPI 后端
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
            },
        },
    },

    // 解析别名（可选，方便导入）
    resolve: {
        alias: {
            '@api': resolve(__dirname, 'js/api'),
            '@utils': resolve(__dirname, 'js/utils.js'),
        },
    },
});
