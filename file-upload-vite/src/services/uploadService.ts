import { authApi } from './authService';
import { ChunkUploadInfo, UploadResponse, InitRequest, InitResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadStatus {
  upload_id: string;
  chunks: number[];
}

// 初始化上传
export const initUpload = async (file: File, chunkSize: number = 1 * 1024 * 1024): Promise<InitResponse> => {
  const request: InitRequest = {
    file_name: file.name,
    total_size: file.size,
    chunk_size: chunkSize,
  };

  const response = await authApi.post<InitResponse>(`${API_BASE_URL}/upload/init`, request);
  return response.data;
};

// 上传分片
export const uploadChunk = async (
  uploadId: string,
  chunk: Blob,
  chunkIndex: number,
  onProgress?: (progress: UploadProgress) => void
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', chunk);

  const response = await authApi.put(
    `${API_BASE_URL}/upload/${uploadId}/chunk?index=${chunkIndex}`,
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

  return response.data;
};

// 获取上传状态
export const getUploadStatus = async (uploadId: string): Promise<UploadStatus> => {
  const response = await authApi.get<UploadStatus>(`${API_BASE_URL}/upload/${uploadId}/status`);
  return response.data;
};

// 完成上传
export const completeUpload = async (uploadId: string): Promise<any> => {
  const response = await authApi.post(`${API_BASE_URL}/upload/${uploadId}/complete`);
  return response.data;
};

// 完整的文件上传流程
export const uploadFileWithChunks = async (
  file: File,
  onProgress?: (progress: number) => void,
  chunkSize: number = 1 * 1024 * 1024
): Promise<UploadResponse> => {
  try {
    // 1. 初始化上传
    console.log('初始化上传...');
    const initResponse = await initUpload(file, chunkSize);
    const { upload_id, total_chunks } = initResponse;

    console.log(`上传ID: ${upload_id}, 总分片数: ${total_chunks}`);

    // 2. 上传所有分片
    for (let chunkIndex = 0; chunkIndex < total_chunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      console.log(`上传分片 ${chunkIndex + 1}/${total_chunks}`);

      await uploadChunk(upload_id, chunk, chunkIndex, (chunkProgress) => {
        // 计算整体进度
        const overallProgress = Math.round(
          ((chunkIndex * chunkSize + chunkProgress.loaded) * 100) / file.size
        );
        if (onProgress) {
          onProgress(Math.min(overallProgress, 100));
        }
      });

      // 更新整体进度
      const chunkProgress = Math.round(((chunkIndex + 1) * 100) / total_chunks);
      if (onProgress) {
        onProgress(chunkProgress);
      }
    }

    // 3. 完成上传
    console.log('完成上传...');
    const completeResponse = await completeUpload(upload_id);

    return {
      code: 200,
      data: {
        url: completeResponse.final_path,
        filename: file.name,
        size: file.size,
      },
      message: '上传成功',
    };
  } catch (error: any) {
    console.error('上传失败:', error);
    throw new Error(error.response?.data?.message || '上传失败');
  }
};

// 恢复上传（断点续传）
export const resumeUpload = async (
  uploadId: string,
  file: File,
  onProgress?: (progress: number) => void,
  chunkSize: number = 1 * 1024 * 1024
): Promise<UploadResponse> => {
  try {
    // 1. 获取当前上传状态
    const status = await getUploadStatus(uploadId);
    const uploadedChunks = new Set(status.chunks);
    
    const totalChunks = Math.ceil(file.size / chunkSize);

    // 2. 上传缺失的分片
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (uploadedChunks.has(chunkIndex)) {
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
        size: file.size,
      },
      message: '上传成功',
    };
  } catch (error: any) {
    console.error('续传失败:', error);
    throw new Error(error.response?.data?.message || '续传失败');
  }
};