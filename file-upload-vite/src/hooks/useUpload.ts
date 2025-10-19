import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './redux';
import {
  addFile,
  removeFile,
  updateFileProgress,
  setFileStatus,
  setUploading,
  setError,
} from '@/store/slices/uploadSlice';
import { 
  uploadFileWithChunks, 
  resumeUpload, 
  getUploadStatus,
  InitResponse 
} from '@/services/uploadService';
import { FileItem } from '@/types';

export const useUpload = () => {
  const dispatch = useAppDispatch();
  const { files, uploading } = useAppSelector((state) => state.upload);

  const handleFileSelect = useCallback((selectedFiles: FileList) => {
    Array.from(selectedFiles).forEach((file) => {
      const fileItem: FileItem = {
        id: Math.random().toString(36).substr(2, 9),
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
    try {
      dispatch(setUploading(true));
      dispatch(setFileStatus({ id: fileId, status: 'uploading' }));

      await uploadFileWithChunks(file, (progress) => {
        dispatch(updateFileProgress({ id: fileId, progress }));
      });

      dispatch(setFileStatus({ id: fileId, status: 'success' }));
    } catch (error: any) {
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
    } catch (error) {
      console.error('获取上传状态失败:', error);
      throw error;
    }
  }, []);

  const resumeChunkUpload = useCallback(async (fileId: string, file: File, uploadId: string) => {
    try {
      dispatch(setUploading(true));
      dispatch(setFileStatus({ id: fileId, status: 'uploading' }));

      await resumeUpload(uploadId, file, (progress) => {
        dispatch(updateFileProgress({ id: fileId, progress }));
      });

      dispatch(setFileStatus({ id: fileId, status: 'success' }));
    } catch (error: any) {
      dispatch(setFileStatus({ id: fileId, status: 'error' }));
      dispatch(setError(error.message || '续传失败'));
    } finally {
      dispatch(setUploading(false));
    }
  }, [dispatch]);

  return {
    files,
    uploading,
    handleFileSelect,
    startChunkUpload,
    resumeChunkUpload,
    checkUploadStatus,
    removeFile: (fileId: string) => dispatch(removeFile(fileId)),
    clearError: () => dispatch(setError(null)),
  };
};