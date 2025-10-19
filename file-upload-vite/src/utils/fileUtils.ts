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

// 新增：格式化上传时间
export const formatUploadTime = (isoString?: string): string => {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '-';
  }
};

// 新增：获取相对时间
export const getRelativeTime = (isoString?: string): string => {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString('zh-CN');
  } catch {
    return '-';
  }
};

// 新增：格式化文件状态
export const formatFileStatus = (status: string): { text: string; color: string } => {
  switch (status) {
    case 'completed':
      return { text: '已完成', color: 'green' };
    case 'in_progress':
      return { text: '进行中', color: 'blue' };
    case 'failed':
      return { text: '失败', color: 'red' };
    case 'success':
      return { text: '成功', color: 'green' };
    case 'uploading':
      return { text: '上传中', color: 'blue' };
    case 'error':
      return { text: '错误', color: 'red' };
    case 'pending':
      return { text: '等待中', color: 'default' };
    default:
      return { text: status, color: 'default' };
  }
};