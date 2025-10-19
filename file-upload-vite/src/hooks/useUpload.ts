import { useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from './redux';
import {
  addFile,
  removeFile,
  updateFileProgress,
  setFileStatus,
  setUploading,
  setError,
} from '@/store/slices/uploadSlice';
import { uploadFileWithChunks, getUploadStatus } from '@/services/uploadService';
import { FileItem } from '@/types';

export const useUpload = () => {
  const dispatch = useAppDispatch();
  const { files, uploading } = useAppSelector((state) => state.upload);
  
  // 使用 ref 来存储文件对象
  const fileObjectsRef = useRef<Map<string, File>>(new Map());

  const handleFileSelect = useCallback((selectedFiles: FileList) => {
    console.log('选择的文件:', Array.from(selectedFiles).map(f => f.name));
    
    Array.from(selectedFiles).forEach((file) => {
      const fileId = Math.random().toString(36).substr(2, 9);
      
      // 存储文件对象
      fileObjectsRef.current.set(fileId, file);
      
      const fileItem: FileItem = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'pending',
        uploadTime: new Date().toISOString(),
      };
      dispatch(addFile(fileItem));
    });
  }, [dispatch]);

  const startChunkUpload = useCallback(async (fileId: string, file: File) => {
    console.log('开始上传文件:', file.name, 'ID:', fileId, '大小:', file.size);
    
    try {
      dispatch(setUploading(true));
      dispatch(setFileStatus({ id: fileId, status: 'uploading' }));

      await uploadFileWithChunks(file, (progress) => {
        console.log(`文件 ${file.name} 进度: ${progress}%`);
        dispatch(updateFileProgress({ id: fileId, progress }));
      });

      dispatch(setFileStatus({ id: fileId, status: 'success' }));
      console.log('文件上传完成:', file.name);
      
      // 上传完成后移除文件对象引用
      fileObjectsRef.current.delete(fileId);
    } catch (error: any) {
      console.error('上传失败:', error);
      dispatch(setFileStatus({ id: fileId, status: 'error' }));
      dispatch(setError(error.message || '上传失败'));
    } finally {
      dispatch(setUploading(false));
    }
  }, [dispatch]);

  const checkUploadStatus = useCallback(async (uploadId: string) => {
    try {
      const status = await getUploadStatus(uploadId);
      return status;
    } catch (error: any) {
      console.error('获取上传状态失败:', error);
      throw error;
    }
  }, []);

  const removeFileWithCleanup = useCallback((fileId: string) => {
    // 清理文件对象引用
    fileObjectsRef.current.delete(fileId);
    dispatch(removeFile(fileId));
  }, [dispatch]);

  return {
    files,
    uploading,
    handleFileSelect,
    startChunkUpload,
    checkUploadStatus,
    removeFile: removeFileWithCleanup,
    clearError: () => dispatch(setError(null)),
  };
};8080