import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',port:5174,strictPort:true,proxy:{'/api':process.env.SERVICE360_API_PROXY||'http://127.0.0.1:4000','/uploads':process.env.SERVICE360_API_PROXY||'http://127.0.0.1:4000'}}});
