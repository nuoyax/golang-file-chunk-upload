import React from 'react';
import { Card, Row, Col, Statistic, Typography, Alert } from 'antd';
import { FileTextOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/hooks/redux';
import { useAuth } from '@/hooks/useAuth';

const { Title, Paragraph } = Typography;

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { files } = useAppSelector(state => state.upload);
  const { theme } = useAppSelector(state => state.app);

  const completedFiles = files.filter(file => file.status === 'success').length;
  const totalFileSize = files.reduce((total, file) => total + file.size, 0);

  return (
    <div>
      <Title level={2}>欢迎回来, {user?.username}!</Title>
      <Paragraph type="secondary">
        这里是文件上传管理系统，您可以上传、管理您的文件。
      </Paragraph>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总文件数"
              value={files.length}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已完成"
              value={completedFiles}
              prefix={<UploadOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="用户角色"
              value={user?.role}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="当前主题"
              value={theme === 'light' ? '浅色' : '深色'}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message="使用提示"
        description="您可以通过左侧菜单访问不同功能，文件上传支持普通上传和分片上传两种方式。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
    </div>
  );
};

export default HomePage;