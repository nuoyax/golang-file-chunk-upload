import React from 'react';
import { Typography } from 'antd';
import UploadComponent from '@/components/FileUpload/UploadComponent';
import WithPermission from '@/components/Auth/WithPermission';
import { PERMISSIONS } from '@/constants/permissions';

const { Title, Paragraph } = Typography;

const UploadPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>文件上传</Title>
      <Paragraph type="secondary">
        上传您的文件，支持大文件分片上传和断点续传。
      </Paragraph>
      
      <WithPermission
        permission={PERMISSIONS.FILE_UPLOAD}
        fallback={
          <div style={{ 
            textAlign: 'center', 
            padding: '50px', 
            background: '#f5f5f5',
            borderRadius: '8px'
          }}>
            <Title level={3} type="warning">权限不足</Title>
            <Paragraph>您没有文件上传的权限，请联系管理员。</Paragraph>
          </div>
        }
      >
        <UploadComponent />
      </WithPermission>
    </div>
  );
};

export default UploadPage;