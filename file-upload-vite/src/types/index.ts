export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'user' | 'guest';
  permissions: string[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

export interface LoginForm {
  username: string;
  password: string;
  remember?: boolean;
}

export interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  code: number;
  data: {
    user: User;
    token: string;
    expiresIn: number;
  };
  message: string;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  url?: string;
  uploadTime?: string; // 改为 string 而不是 Date
}
export interface UploadState {
  files: FileItem[];
  uploading: boolean;
  progress: number;
  error: string | null;
}

export interface AppState {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
}

export interface ChunkUploadInfo {
  chunk: Blob;
  chunkNumber: number;
  totalChunks: number;
  filename: string;
  fileHash: string;
}

export interface UploadResponse {
  code: number;
  data: {
    url: string;
    filename: string;
    size: number;
  };
  message: string;
}

export interface Permission {
  id: string;
  name: string;
  code: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

// 添加上传相关类型
export interface InitRequest {
  file_name: string;
  total_size: number;
  chunk_size: number;
  md5?: string;
}

export interface InitResponse {
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
}

export interface UploadStatus {
  upload_id: string;
  chunks: number[];
}

export interface CompleteResponse {
  status: string;
  final_path: string;
}