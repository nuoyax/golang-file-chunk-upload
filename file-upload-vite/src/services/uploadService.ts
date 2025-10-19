import { authApi } from './authService';
import { UploadRequest, UploadResponse, UploadStatusResponse, CompleteResponse, ChunkUploadResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// 初始化上传
export const initUpload = async (file: File, chunkSize: number = 1 * 1024 * 1024): Promise<UploadResponse> => {
  console.log('初始化上传:', file.name, '大小:', file.size);
  
  const request: UploadRequest = {
    file_name: file.name,
    total_size: file.size,
    chunk_size: chunkSize,
  };

  try {
    const response = await authApi.post<UploadResponse>(`${API_BASE_URL}/uploads`, request);
    console.log('初始化响应:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('初始化上传失败:', error);
    throw new Error(error.response?.data?.message || '初始化上传失败');
  }
};

// 上传分片
export const uploadChunk = async (
  uploadId: string,
  chunk: Blob,
  chunkIndex: number,
  onProgress?: (progress: UploadProgress) => void
): Promise<ChunkUploadResponse> => {
  console.log(`上传分片 ${chunkIndex}, 大小: ${chunk.size} bytes`);

  try {
    const response = await authApi.put<ChunkUploadResponse>(
      `${API_BASE_URL}/uploads/${uploadId}/chunks/${chunkIndex}`,
      chunk,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            onProgress({
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percentage: Math.round((progressEvent.loaded * 100) / progressEvent.total),
            });
          }
        },
      }
    );
    console.log(`分片 ${chunkIndex} 上传成功:`, response.data);
    return response.data;
  } catch (error: any) {
    console.error(`分片 ${chunkIndex} 上传失败:`, error);
    throw new Error(error.response?.data?.message || `分片 ${chunkIndex} 上传失败`);
  }
};

// 获取上传状态
export const getUploadStatus = async (uploadId: string): Promise<UploadStatusResponse> => {
  try {
    const response = await authApi.get<UploadStatusResponse>(`${API_BASE_URL}/uploads/${uploadId}`);
    console.log('上传状态:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('获取上传状态失败:', error);
    throw new Error(error.response?.data?.message || '获取上传状态失败');
  }
};

// 完成上传
export const completeUpload = async (uploadId: string): Promise<CompleteResponse> => {
  console.log('完成上传:', uploadId);
  
  try {
    const response = await authApi.post<CompleteResponse>(`${API_BASE_URL}/uploads/${uploadId}/complete`);
    console.log('完成上传响应:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('完成上传失败:', error);
    throw new Error(error.response?.data?.message || '完成上传失败');
  }
};

// 完整的文件上传流程
export const uploadFileWithChunks = async (
  file: File,
  onProgress?: (progress: number) => void,
  chunkSize: number = 1 * 1024 * 1024
): Promise<any> => {
  console.log('开始上传文件:', file.name, '大小:', file.size);

  try {
    // 1. 初始化上传
    console.log('步骤1: 初始化上传...');
    const initResponse = await initUpload(file, chunkSize);
    const { upload_id, total_chunks } = initResponse;

    console.log(`上传ID: ${upload_id}, 总分片数: ${total_chunks}`);

    // 2. 上传所有分片
    console.log('步骤2: 上传分片...');
    for (let chunkIndex = 0; chunkIndex < total_chunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      console.log(`上传分片 ${chunkIndex + 1}/${total_chunks}, 大小: ${chunk.size} bytes`);

      await uploadChunk(upload_id, chunk, chunkIndex, (chunkProgress) => {
        // 计算整体进度
        const overallProgress = Math.round(
          ((chunkIndex * chunkSize + chunkProgress.loaded) * 100) / file.size
        );
        console.log(`分片 ${chunkIndex} 进度: ${chunkProgress.percentage}%, 整体进度: ${overallProgress}%`);
        if (onProgress) {
          onProgress(Math.min(overallProgress, 100));
        }
      });

      // 更新整体进度（确保每个分片上传完成后进度更新）
      const chunkProgress = Math.round(((chunkIndex + 1) * 100) / total_chunks);
      console.log(`分片 ${chunkIndex} 完成，整体进度: ${chunkProgress}%`);
      if (onProgress) {
        onProgress(chunkProgress);
      }
    }

    // 3. 完成上传
    console.log('步骤3: 完成上传...');
    const completeResponse = await completeUpload(upload_id);

    console.log('文件上传完成:', completeResponse);

    return {
      code: 200,
      data: {
        url: completeResponse.final_path,
        filename: file.name,
        size: completeResponse.file_size,
        upload_id: upload_id,
      },
      message: '上传成功',
    };
  } catch (error: any) {
    console.error('上传失败:', error);
    throw new Error(error.message || '上传失败');
  }
};

// 恢复上传（断点续传）
export const resumeUpload = async (
  uploadId: string,
  file: File,
  onProgress?: (progress: number) => void,
  chunkSize: number = 1 * 1024 * 1024
): Promise<any> => {
  try {
    // 1. 获取当前上传状态
    console.log('恢复上传，上传ID:', uploadId);
    const status = await getUploadStatus(uploadId);
    const uploadedChunks = new Set(status.chunks);
    
    const totalChunks = Math.ceil(file.size / chunkSize);
    console.log(`已上传分片: ${status.chunks.length}, 总分片数: ${totalChunks}`);

    // 2. 上传缺失的分片
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (uploadedChunks.has(chunkIndex)) {
        console.log(`跳过已上传分片: ${chunkIndex}`);
        continue; // 跳过已上传的分片
      }

      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      console.log(`续传分片 ${chunkIndex + 1}/${totalChunks}`);

      await uploadChunk(uploadId, chunk, chunkIndex, (chunkProgress) => {
        // 计算整体进度
        const overallProgress = Math.round(
          ((chunkIndex * chunkSize + chunkProgress.loaded) * 100) / file.size
        );
        if (onProgress) {
          onProgress(Math.min(overallProgress, 100));
        }
      });
    }

    // 3. 完成上传
    const completeResponse = await completeUpload(uploadId);

    return {
      code: 200,
      data: {
        url: completeResponse.final_path,
        filename: file.name,
        size: completeResponse.file_size,
        upload_id: uploadId,
      },
      message: '续传成功',
    };
  } catch (error: any) {
    console.error('续传失败:', error);
    throw new Error(error.message || '续传失败');
  }
};