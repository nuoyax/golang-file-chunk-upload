import axios from 'axios';
import { LoginForm, RegisterForm, AuthResponse, User } from '@/types';

// 使用 Vite 的环境变量
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export const authApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

authApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

authApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  async login(credentials: LoginForm): Promise<AuthResponse> {
    // 模拟登录
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockUser: User = {
          id: '1',
          username: credentials.username,
          email: `${credentials.username}@example.com`,
          role: credentials.username === 'admin' ? 'admin' : 'user',
          permissions: credentials.username === 'admin' 
            ? ['file:upload', 'file:download', 'file:delete', 'file:view', 'user:view'] 
            : ['file:upload', 'file:view']
        };
        
        resolve({
          code: 200,
          data: {
            user: mockUser,
            token: 'mock-jwt-token',
            expiresIn: 3600
          },
          message: '登录成功'
        });
      }, 1000);
    });
  },

  async register(userData: RegisterForm): Promise<AuthResponse> {
    // 模拟注册
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          code: 200,
          data: {
            user: {
              id: '2',
              username: userData.username,
              email: userData.email,
              role: 'user',
              permissions: ['file:upload', 'file:view']
            },
            token: 'mock-jwt-token',
            expiresIn: 3600
          },
          message: '注册成功'
        });
      }, 1000);
    });
  },

  async getCurrentUser(): Promise<{ data: User }> {
    // 模拟获取当前用户
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return { data: JSON.parse(userStr) };
    }
    throw new Error('用户未登录');
  },

  async refreshToken(): Promise<AuthResponse> {
    // 模拟刷新 token
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          code: 200,
          data: {
            user: JSON.parse(localStorage.getItem('user') || '{}'),
            token: 'new-mock-jwt-token',
            expiresIn: 3600
          },
          message: 'Token 刷新成功'
        });
      }, 1000);
    });
  },
};