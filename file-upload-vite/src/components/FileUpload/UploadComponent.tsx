import React, { useRef, useState } from 'react';
import { Upload, Button, message, Space, Progress, List, Card, Modal, Input } from 'antd';
import { 
  UploadOutlined, 
  CloudUploadOutlined, 
  DeleteOutlined, 
  PauseOutlined,
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
    resumeChunkUpload, 
    checkUploadStatus,
    uploading, 
    files, 
    removeFile 
  } = useUpload();
  const { checkPermission } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [uploadId, setUploadId] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      handleFileSelect(selectedFiles);
      event.target.value = '';
    }
  };

  const handleUpload = async () => {
    const pendingFiles = files.filter(file => file.status === 'pending');
    
    if (pendingFiles.length === 0) {
      message.warning('请先选择文件');
      return;
    }

    for (const fileItem of pendingFiles) {
      // 这里需要真实的 File 对象
      const fileInput = fileInputRef.current;
      if (fileInput && fileInput.files) {
        const file = Array.from(fileInput.files).find(f => f.name === fileItem.name);
        if (file) {
          await startChunkUpload(fileItem.id, file);
        }
      }
    }
  };

  const handleResume = async () => {
    if (!uploadId) {
      message.warning('请输入上传ID');
      return;
    }

    try {
      const status = await checkUploadStatus(uploadId);
      message.info(`找到 ${status.chunks.length} 个已上传分片`);
      
      // 这里需要用户选择对应的文件来续传
      // 简化处理：创建一个新的文件项用于续传
      const resumeFileItem: any = {
        id: Math.random().toString(36).substr(2, 9),
        name: `续传文件_${uploadId}`,
        size: 0, // 实际应该从服务端获取
        type: 'application/octet-stream',
        progress: Math.round((status.chunks.length * 100) / 100), // 简化进度计算
        status: 'pending',
        uploadTime: new Date(),
      };

      // 在实际项目中，这里应该让用户选择文件
      message.info('请选择要续传的文件');
      setResumeModalVisible(false);
      setUploadId('');
    } catch (error) {
      message.error('获取上传状态失败');
    }
  };

  const uploadProps = {
    beforeUpload: (file: File) => {
      handleFileSelect([file] as any);
      return false;
    },
    multiple: true,
    showUploadList: false,
  };

  return (
    <div style={{ padding: '20px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Card title="文件上传">
          <Upload.Dragger {...uploadProps} style={{ padding: '20px' }}>
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
              >
                开始上传
              </Button>
            </WithPermission>
            
            <Button
              type="dashed"
              icon={<PlayCircleOutlined />}
              onClick={() => setResumeModalVisible(true)}
            >
              断点续传
            </Button>
          </Space>
        </Card>

        {files.length > 0 && (
          <Card title="上传队列">
            <List
              dataSource={files}
              renderItem={(file) => (
                <List.Item
                  actions={[
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => removeFile(file.id)}
                      disabled={file.status === 'uploading'}
                    >
                      删除
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<span style={{ fontSize: 24 }}>{getFileIcon(file.type)}</span>}
                    title={file.name}
                    description={`${formatFileSize(file.size)} • ${file.status}`}
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

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          style={{ display: 'none' }}
        />

        {/* 断点续传弹窗 */}
        <Modal
          title="断点续传"
          open={resumeModalVisible}
          onOk={handleResume}
          onCancel={() => setResumeModalVisible(false)}
        >
          <p>请输入之前的上传ID来恢复上传：</p>
          <Input
            placeholder="上传ID"
            value={uploadId}
            onChange={(e) => setUploadId(e.target.value)}
          />
        </Modal>
      </Space>
    </div>
  );
};

export default UploadComponent;