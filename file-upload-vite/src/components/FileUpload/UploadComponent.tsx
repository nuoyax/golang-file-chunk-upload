import React, { useRef, useState } from 'react';
import { Upload, Button, message, Space, Progress, List, Card, Modal, Input } from 'antd';
import { 
  UploadOutlined, 
  CloudUploadOutlined, 
  DeleteOutlined,
  PlayCircleOutlined 
} from '@ant-design/icons';
import { useUpload } from '@/hooks/useUpload';
import { useAuth } from '@/hooks/useAuth';
import WithPermission from '@/components/Auth/WithPermission';
import { PERMISSIONS } from '@/constants/permissions';
import { formatFileSize, getFileIcon } from '@/utils/fileUtils';

const UploadComponent: React.FC = () => {
  const { 
    handleFileSelect, 
    startChunkUpload, 
    checkUploadStatus,
    uploading, 
    files, 
    removeFile 
  } = useUpload();
  const { checkPermission } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [uploadId, setUploadId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // 处理文件选择
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      console.log('选择的文件:', fileArray.map(f => ({ name: f.name, size: f.size })));
      setSelectedFiles(prev => [...prev, ...fileArray]);
      handleFileSelect(files);
    }
  };

  // 处理上传
  const handleUpload = async () => {
    console.log('开始上传，选中的文件:', selectedFiles);
    console.log('Redux 中的文件:', files);
    
    const pendingFiles = files.filter(file => file.status === 'pending');
    
    if (pendingFiles.length === 0) {
      message.warning('请先选择文件');
      return;
    }

    if (selectedFiles.length === 0) {
      message.warning('未找到文件对象，请重新选择文件');
      return;
    }

    // 创建文件名到文件对象的映射
    const fileMap = new Map();
    selectedFiles.forEach(file => {
      fileMap.set(file.name, file);
    });

    console.log('文件映射:', fileMap);

    // 依次上传每个待处理文件
    for (const fileItem of pendingFiles) {
      const file = fileMap.get(fileItem.name);
      if (file) {
        console.log(`开始上传文件: ${file.name}, ID: ${fileItem.id}`);
        await startChunkUpload(fileItem.id, file);
      } else {
        console.error(`未找到文件对象: ${fileItem.name}`);
        message.error(`未找到文件: ${fileItem.name}`);
      }
    }
  };

  // 处理断点续传
  const handleResume = async () => {
    if (!uploadId) {
      message.warning('请输入上传ID');
      return;
    }

    try {
      const status = await checkUploadStatus(uploadId);
      message.success(`找到上传记录，已上传 ${status.chunks.length} 个分片`);
      
      // 在实际项目中，这里应该让用户选择对应的文件
      // 现在先提示用户手动选择文件
      message.info('请先选择要续传的文件，然后点击上传按钮');
      setResumeModalVisible(false);
      setUploadId('');
    } catch (error: any) {
      console.error('获取上传状态失败:', error);
      message.error(error.message || '获取上传状态失败');
    }
  };

  // 处理文件删除
  const handleRemoveFile = (fileId: string, fileName: string) => {
    // 从 selectedFiles 中移除对应的文件
    setSelectedFiles(prev => prev.filter(file => file.name !== fileName));
    removeFile(fileId);
  };

  // Antd Upload 配置
  const uploadProps = {
    beforeUpload: (file: File) => {
      console.log('Antd Upload 选择的文件:', file.name);
      // 使用自定义的文件处理逻辑
      setSelectedFiles(prev => [...prev, file]);
      handleFileSelect([file] as any);
      return false; // 阻止默认上传
    },
    multiple: true,
    showUploadList: false,
  };

  // 手动触发文件选择
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ padding: '20px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Card 
          title="文件上传" 
          extra={
            <span>
              已选择 {files.length} 个文件 | 
              待上传: {files.filter(f => f.status === 'pending').length}
            </span>
          }
        >
          {/* Antd 拖拽上传区域 */}
          <Upload.Dragger 
            {...uploadProps} 
            style={{ padding: '20px' }}
            onClick={triggerFileInput} // 点击时触发文件选择
          >
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
            <p className="ant-upload-hint">
              支持大文件分片上传、断点续传
              <br />
              自动分片大小: 1MB
            </p>
          </Upload.Dragger>

          {/* 隐藏的原生文件输入 */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            style={{ display: 'none' }}
          />

          {/* 操作按钮 */}
          <Space style={{ marginTop: 16 }}>
            <WithPermission
              permission={PERMISSIONS.FILE_UPLOAD}
              fallback={
                <Button disabled icon={<UploadOutlined />}>
                  无上传权限
                </Button>
              }
            >
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={handleUpload}
                loading={uploading}
                disabled={files.filter(f => f.status === 'pending').length === 0}
              >
                {uploading ? '上传中...' : '开始上传'}
              </Button>
            </WithPermission>
            
            <Button
              type="dashed"
              icon={<PlayCircleOutlined />}
              onClick={() => setResumeModalVisible(true)}
              disabled={uploading}
            >
              断点续传
            </Button>

            <Button
              type="default"
              onClick={triggerFileInput}
              disabled={uploading}
            >
              选择文件
            </Button>
          </Space>

          {/* 选中的文件预览 */}
          {selectedFiles.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p><strong>已选择的文件:</strong></p>
              <List
                size="small"
                dataSource={selectedFiles}
                renderItem={(file) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<span style={{ fontSize: 16 }}>{getFileIcon(file.type)}</span>}
                      title={file.name}
                      description={formatFileSize(file.size)}
                    />
                  </List.Item>
                )}
              />
            </div>
          )}
        </Card>

        {/* 上传队列 */}
        {files.length > 0 && (
          <Card title="上传队列">
            <List
              dataSource={files}
              renderItem={(file) => (
                <List.Item
                  actions={[
                    <Button
                      key="delete"
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveFile(file.id, file.name)}
                      disabled={file.status === 'uploading'}
                      danger
                    >
                      删除
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<span style={{ fontSize: 24 }}>{getFileIcon(file.type)}</span>}
                    title={file.name}
                    description={
                      <div>
                        <div>{formatFileSize(file.size)} • {file.type || '未知类型'}</div>
                        <div>状态: {file.status} | ID: {file.id}</div>
                      </div>
                    }
                  />
                  <div style={{ width: 200 }}>
                    <Progress
                      percent={file.progress}
                      status={
                        file.status === 'success' ? 'success' :
                        file.status === 'error' ? 'exception' : 'active'
                      }
                    />
                  </div>
                </List.Item>
              )}
            />
          </Card>
        )}

        {/* 断点续传弹窗 */}
        <Modal
          title="断点续传"
          open={resumeModalVisible}
          onOk={handleResume}
          onCancel={() => {
            setResumeModalVisible(false);
            setUploadId('');
          }}
          okText="检查状态"
          cancelText="取消"
        >
          <p>请输入之前的上传ID来检查上传状态：</p>
          <Input
            placeholder="输入上传ID"
            value={uploadId}
            onChange={(e) => setUploadId(e.target.value)}
            onPressEnter={handleResume}
          />
          <p style={{ marginTop: 8, color: '#666', fontSize: '12px' }}>
            注意：检查到上传记录后，您需要选择对应的文件进行续传
          </p>
        </Modal>
      </Space>
    </div>
  );
};

export default UploadComponent;