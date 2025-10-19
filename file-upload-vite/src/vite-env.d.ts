/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_NAME: string
  // 更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}