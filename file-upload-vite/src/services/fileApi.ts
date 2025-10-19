import { authApi } from './authService';


const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

// 文件统计信息接口类型
export interface FileStatsResponse {
  data: {
    total_count: number;
    completed_count: number;
    total_size: number;
    today_upload_count: number;
    success_rate: number;
    average_file_size: number;
  };
}

export interface TodayStatsResponse {
  data: {
    count: number;
    total_size: number;
  };
}

export interface RecentFilesResponse {
  data: Array<{
    upload_id: string;
    file_name: string;
    file_size: number;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
}

// 获取文件统计信息
export const getFileStats = async (): Promise<FileStatsResponse> => {
  try {
    const response = await authApi.get<FileStatsResponse>(`${API_BASE_URL}/files/stats`);
    return response.data;
  } catch (error: any) {
    console.error('获取文件统计失败:', error);
    throw new Error(error.response?.data?.message || '获取文件统计失败');
  }
};

// 获取今日上传统计
export const getTodayStats = async (): Promise<TodayStatsResponse> => {
  try {
    const response = await authApi.get<TodayStatsResponse>(`${API_BASE_URL}/files/today-stats`);
    return response.data;
  } catch (error: any) {
    console.error('获取今日统计失败:', error);
    throw new Error(error.response?.data?.message || '获取今日统计失败');
  }
};

// 获取最近上传的文件
export const getRecentFiles = async (limit: number = 5): Promise<RecentFilesResponse> => {
  try {
    const response = await authApi.get<RecentFilesResponse>(
      `${API_BASE_URL}/files/recent?limit=${limit}`
    );
    return response.data;
  } catch (error: any) {
    console.error('获取最近文件失败:', error);
    throw new Error(error.response?.data?.message || '获取最近文件失败');
  }
};

// 原有的其他函数保持不变...
export { getFileHistory, getFileDetail, deleteFile };