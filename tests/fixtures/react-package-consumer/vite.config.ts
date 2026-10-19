import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const sceneDir = process.env.MS_REACT_SCENE_DIR
  ? join(root, process.env.MS_REACT_SCENE_DIR)
  : join(root, 'scene')
const port = Number(process.env.MS_REACT_CONSUMER_PORT || 5174)

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
  resolve: {
    alias: {
      'ms-scene': sceneDir,
      react: join(root, '../../../node_modules/react'),
      'react-dom': join(root, '../../../node_modules/react-dom'),
    },
  },
})
