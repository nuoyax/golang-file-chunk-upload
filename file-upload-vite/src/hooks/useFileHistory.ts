import { useState, useCallback } from 'react';
import { message } from 'antd';
import { getFileHistory, getFileDetail, deleteFile } from '@/services/fileService';
import { FileHistoryQuery, FileHistoryResponse, FileRecord } from '@/types';

export const useFileHistory = () => {
  const [loading, setLoading] = useState(false);
  const [fileHistory, setFileHistory] = useState<FileHistoryResponse | null>(null);
  const [fileDetail, setFileDetail] = useState<FileRecord | null>(null);

  // 获取文件历史记录
  const fetchFileHistory = useCallback(async (query: FileHistoryQuery = {}) => {
    try {
      setLoading(true);
      const response = await getFileHistory({
        page: query.page || 1,
        per_page: query.per_page || 20,
        sort_by: query.sort_by || 'created_at',
        order: query.order || 'desc',
        status: query.status,
        keyword: query.keyword,
      });
      setFileHistory(response);
      return response;
    } catch (error: any) {
      console.error('获取文件历史失败:', error);
      message.error(error.message || '获取文件历史失败');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取文件详情
  const fetchFileDetail = useCallback(async (uploadId: string) => {
    try {
      setLoading(true);
      const detail = await getFileDetail(uploadId);
      setFileDetail(detail);
      return detail;
    } catch (error: any) {
      console.error('获取文件详情失败:', error);
      message.error(error.message || '获取文件详情失败');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // 删除文件
  const handleDeleteFile = useCallback(async (uploadId: string) => {
    try {
      setLoading(true);
      await deleteFile(uploadId);
      message.success('删除成功');
      
      // 重新加载文件列表
      if (fileHistory) {
        await fetchFileHistory({
          page: fileHistory.page,
          per_page: fileHistory.per_page,
        });
      }
    } catch (error: any) {
      console.error('删除文件失败:', error);
      message.error(error.message || '删除文件失败');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [fileHistory, fetchFileHistory]);

  // 搜索文件
  const searchFiles = useCallback(async (keyword: string) => {
    return await fetchFileHistory({ keyword });
  }, [fetchFileHistory]);

  // 按状态筛选
  const filterByStatus = useCallback(async (status: string) => {
    return await fetchFileHistory({ status });
  }, [fetchFileHistory]);

  return {
    loading,
    fileHistory,
    fileDetail,
    fetchFileHistory,
    fetchFileDetail,
    deleteFile: handleDeleteFile,
    searchFiles,
    filterByStatus,
  };
};