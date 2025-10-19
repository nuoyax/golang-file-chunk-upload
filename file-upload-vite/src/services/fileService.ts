import { authApi } from './authService';
import { FileHistoryQuery, FileHistoryResponse, FileRecord } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

// 获取文件历史记录
export const getFileHistory = async (query: FileHistoryQuery = {}): Promise<FileHistoryResponse> => {
  try {
    const params = new URLSearchParams();
    
    if (query.page) params.append('page', query.page.toString());
    if (query.per_page) params.append('per_page', query.per_page.toString());
    if (query.status) params.append('status', query.status);
    if (query.keyword) params.append('keyword', query.keyword);
    if (query.sort_by) params.append('sort_by', query.sort_by);
    if (query.order) params.append('order', query.order);

    const response = await authApi.get<FileHistoryResponse>(
      `${API_BASE_URL}/files/history?${params.toString()}`
    );
    return response.data;
  } catch (error: any) {
    console.error('获取文件历史失败:', error);
    throw new Error(error.response?.data?.message || '获取文件历史失败');
  }
};

// 获取文件详情
export const getFileDetail = async (uploadId: string): Promise<FileRecord> => {
  try {
    const response = await authApi.get<FileRecord>(`${API_BASE_URL}/files/${uploadId}`);
    return response.data;
  } catch (error: any) {
    console.error('获取文件详情失败:', error);
    throw new Error(error.response?.data?.message || '获取文件详情失败');
  }
};

// 删除文件记录
export const deleteFile = async (uploadId: string): Promise<void> => {
  try {
    await authApi.delete(`${API_BASE_URL}/files/${uploadId}`);
  } catch (error: any) {
    console.error('删除文件失败:', error);
    throw new Error(error.response?.data?.message || '删除文件失败');
  }
};