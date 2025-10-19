import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Table, 
  Tag, 
  Space, 
  Button, 
  Card,
  Input,
  Select,
  Modal,
  Descriptions,
  Pagination,
  message,
  Tabs
} from 'antd';
import { 
  DownloadOutlined, 
  DeleteOutlined, 
  EyeOutlined, 
  SearchOutlined,
  ReloadOutlined 
} from '@ant-design/icons';
import { useAppSelector } from '@/hooks/redux';
import { useAuth } from '@/hooks/useAuth';
import { useFileHistory } from '@/hooks/useFileHistory';
import WithPermission from '@/components/Auth/WithPermission';
import { PERMISSIONS } from '@/constants/permissions';
import { formatFileSize, getFileIcon, formatUploadTime } from '@/utils/fileUtils';

const { Title, Paragraph } = Typography;
const { Search } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const FilesPage: React.FC = () => {
  const { files } = useAppSelector(state => state.upload);
  const { checkPermission } = useAuth();
  const {
    loading,
    fileHistory,
    fetchFileHistory,
    fetchFileDetail,
    deleteFile,
    searchFiles,
  } = useFileHistory();

  const [activeTab, setActiveTab] = useState('current');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  // 加载文件历史
  useEffect(() => {
    if (activeTab === 'history') {
      loadFileHistory();
    }
  }, [activeTab]);

  const loadFileHistory = async (page: number = 1) => {
    await fetchFileHistory({
      page,
      status: statusFilter || undefined,
      keyword: searchKeyword || undefined,
    });
  };

  const handleSearch = (value: string) => {
    setSearchKeyword(value);
    searchFiles(value);
  };

  const handleViewDetail = async (uploadId: string) => {
    try {
      const detail = await fetchFileDetail(uploadId);
      setSelectedFile(detail);
      setDetailModalVisible(true);
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleDeleteHistory = async (uploadId: string, fileName: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文件记录 "${fileName}" 吗？此操作不可恢复。`,
      okText: '确认',
      cancelText: '取消',
      okType: 'danger',
      onOk: () => deleteFile(uploadId),
    });
  };

  const handlePageChange = (page: number) => {
    loadFileHistory(page);
  };

  // 当前上传队列的列定义
  const currentColumns = [
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
        const text = status === 'success' ? '成功' : 
                    status === 'uploading' ? '上传中' : 
                    status === 'error' ? '失败' : '等待中';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: number) => `${progress}%`,
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
            <Button 
              type="link" 
              icon={<DownloadOutlined />} 
              size="small"
              disabled={record.status !== 'success'}
            >
              下载
            </Button>
          </WithPermission>
          
          <WithPermission permission={PERMISSIONS.FILE_DELETE}>
            <Button 
              type="link" 
              icon={<DeleteOutlined />} 
              size="small"
              danger
              disabled={record.status === 'uploading'}
            >
              删除
            </Button>
          </WithPermission>
        </Space>
      ),
    },
  ];

  // 文件历史的列定义
  const historyColumns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (name: string, record: any) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{name}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID: {record.upload_id}
          </div>
        </div>
      ),
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'completed' ? 'green' : 
                     status === 'in_progress' ? 'blue' : 'red';
        const text = status === 'completed' ? '已完成' : 
                    status === 'in_progress' ? '进行中' : '失败';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '分片信息',
      key: 'chunks',
      render: (record: any) => (
        <span>
          {record.total_chunks} 分片
        </span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => formatUploadTime(time),
    },
    {
      title: '完成时间',
      dataIndex: 'completed_at',
      key: 'completed_at',
      render: (time: string) => time ? formatUploadTime(time) : '-',
    },
    {
      title: '操作',
      key: 'actions',
      render: (record: any) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.upload_id)}
            size="small"
          >
            详情
          </Button>
          
          <WithPermission permission={PERMISSIONS.FILE_DOWNLOAD}>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              disabled={record.status !== 'completed'}
              size="small"
            >
              下载
            </Button>
          </WithPermission>

          <WithPermission permission={PERMISSIONS.FILE_DELETE}>
            <Button
              type="link"
              icon={<DeleteOutlined />}
              danger
              onClick={() => handleDeleteHistory(record.upload_id, record.file_name)}
              size="small"
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

      <Card>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          tabBarExtraContent={
            activeTab === 'history' ? (
              <Space>
                <Search
                  placeholder="搜索文件名..."
                  style={{ width: 200 }}
                  onSearch={handleSearch}
                  allowClear
                />
                <Select
                  placeholder="状态筛选"
                  style={{ width: 120 }}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  allowClear
                >
                  <Option value="completed">已完成</Option>
                  <Option value="in_progress">进行中</Option>
                  <Option value="failed">失败</Option>
                </Select>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => loadFileHistory()}
                  loading={loading}
                >
                  刷新
                </Button>
              </Space>
            ) : null
          }
        >
          {/* 当前上传队列 */}
          <TabPane tab={`当前上传 (${files.length})`} key="current">
            <Table
              columns={currentColumns}
              dataSource={files}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              locale={{
                emptyText: '暂无上传任务'
              }}
            />
          </TabPane>

          {/* 文件历史记录 */}
          <TabPane tab="文件历史" key="history">
            <Table
              columns={historyColumns}
              dataSource={fileHistory?.files || []}
              rowKey="upload_id"
              loading={loading}
              pagination={false}
              locale={{
                emptyText: '暂无文件记录'
              }}
            />
            
            {/* 分页 */}
            {fileHistory && fileHistory.total > 0 && (
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Pagination
                  current={fileHistory.page}
                  pageSize={fileHistory.per_page}
                  total={fileHistory.total}
                  onChange={handlePageChange}
                  showSizeChanger={false}
                  showTotal={(total, range) => 
                    `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`
                  }
                />
              </div>
            )}
          </TabPane>
        </Tabs>
      </Card>

      {/* 文件详情弹窗 */}
      <Modal
        title="文件详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {selectedFile && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="文件名">{selectedFile.file_name}</Descriptions.Item>
            <Descriptions.Item label="文件ID">{selectedFile.upload_id}</Descriptions.Item>
            <Descriptions.Item label="文件大小">{formatFileSize(selectedFile.file_size)}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={selectedFile.status === 'completed' ? 'green' : 'blue'}>
                {selectedFile.status === 'completed' ? '已完成' : '进行中'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="分片信息">
              {selectedFile.total_chunks} 个分片 (每个 {formatFileSize(selectedFile.chunk_size)})
            </Descriptions.Item>
            <Descriptions.Item label="存储路径">{selectedFile.final_path || '-'}</Descriptions.Item>
            <Descriptions.Item label="MD5">{selectedFile.md5 || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatUploadTime(selectedFile.created_at)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatUploadTime(selectedFile.updated_at)}</Descriptions.Item>
            {selectedFile.completed_at && (
              <Descriptions.Item label="完成时间">{formatUploadTime(selectedFile.completed_at)}</Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default FilesPage;