import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { FileItem, UploadState } from '@/types';

const initialState: UploadState = {
  files: [],
  uploading: false,
  progress: 0,
  error: null,
};

const uploadSlice = createSlice({
  name: 'upload',
  initialState,
  reducers: {
    addFile: (state, action: PayloadAction<FileItem>) => {
      state.files.push(action.payload);
    },
    removeFile: (state, action: PayloadAction<string>) => {
      state.files = state.files.filter(file => file.id !== action.payload);
    },
    updateFileProgress: (state, action: PayloadAction<{ id: string; progress: number }>) => {
      const file = state.files.find(f => f.id === action.payload.id);
      if (file) {
        file.progress = action.payload.progress;
        file.status = action.payload.progress === 100 ? 'success' : 'uploading';
      }
    },
    setFileStatus: (state, action: PayloadAction<{ id: string; status: FileItem['status'] }>) => {
      const file = state.files.find(f => f.id === action.payload.id);
      if (file) {
        file.status = action.payload.status;
      }
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.uploading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearFiles: (state) => {
      state.files = [];
    },
  },
});

export const {
  addFile,
  removeFile,
  updateFileProgress,
  setFileStatus,
  setUploading,
  setError,
  clearFiles,
} = uploadSlice.actions;

export default uploadSlice.reducer;