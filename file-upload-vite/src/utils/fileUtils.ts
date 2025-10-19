export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileIcon = (fileType: string): string => {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎬';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📕';
  if (fileType.includes('word')) return '📄';
  if (fileType.includes('excel')) return '📊';
  if (fileType.includes('zip')) return '📦';
  return '📄';
};

export const validateFile = (file: File, maxSize: number = 100 * 1024 * 1024): string | null => {
  if (file.size > maxSize) {
    return `文件大小不能超过 ${formatFileSize(maxSize)}`;
  }
  return null;
};