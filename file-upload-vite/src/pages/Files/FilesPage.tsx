import React from 'react';
import { Typography, Table, Tag, Space, Button } from 'antd';
import { DownloadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/hooks/redux';
import { useAuth } from '@/hooks/useAuth';
import WithPermission from '@/components/Auth/WithPermission';
import { PERMISSIONS } from '@/constants/permissions';
import { formatFileSize, getFileIcon } from '@/utils/fileUtils';

const { Title, Paragraph } = Typography;

const FilesPage: React.FC = () => {
  const { files } = useAppSelector(state => state.upload);
  const { checkPermission } = useAuth();

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <Space>
          <span style={{ fontSize: 16 }}>{getFileIcon(record.type)}</span>
          {name}
        </Space>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'success' ? 'green' : 
                     status === 'uploading' ? 'blue' : 
                     status === 'error' ? 'red' : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      render: (time: Date) => time?.toLocaleString() || '-',
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record: any) => (
        <Space>
          <WithPermission permission={PERMISSIONS.FILE_VIEW}>
            <Button type="link" icon={<EyeOutlined />} size="small">
              查看
            </Button>
          </WithPermission>
          
          <WithPermission permission={PERMISSIONS.FILE_DOWNLOAD}>
            <Button type="link" icon={<DownloadOutlined />} size="small">
              下载
            </Button>
          </WithPermission>
          
          <WithPermission permission={PERMISSIONS.FILE_DELETE}>
            <Button 
              type="link" 
              icon={<DeleteOutlined />} 
              size="small"
              danger
            >
              删除
            </Button>
          </WithPermission>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>文件管理</Title>
      <Paragraph type="secondary">
        管理您已上传的文件，支持查看、下载和删除操作。
      </Paragraph>

      <Table
        columns={columns}
        dataSource={files}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};

export default FilesPage;