import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Typography, 
  Alert, 
  Spin, 
  List,
  Tag,
  Progress,
  Button
} from 'antd';
import { 
  FileTextOutlined, 
  UploadOutlined, 
  UserOutlined, 
  CloudUploadOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  RiseOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useAppSelector } from '@/hooks/redux';
import { useAuth } from '@/hooks/useAuth';
import { getFileStats, getTodayStats, getRecentFiles } from '@/services/fileApi';
import { formatFileSize, formatUploadTime } from '@/utils/fileUtils';

const { Title, Paragraph } = Typography;

// 定义统计数据类型
interface StatsData {
  totalCount: number;
  completedCount: number;
  totalSize: number;
  todayUploadCount: number;
  successRate: number;
  averageFileSize: number;
}

interface TodayStatsData {
  count: number;
  totalSize: number;
}

interface RecentFile {
  upload_id: string;
  file_name: string;
  file_size: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useAppSelector(state => state.app);
  const { files } = useAppSelector(state => state.upload);
  
  const [stats, setStats] = useState<StatsData>({
    totalCount: 0,
    completedCount: 0,
    totalSize: 0,
    todayUploadCount: 0,
    successRate: 0,
    averageFileSize: 0
  });
  const [todayStats, setTodayStats] = useState<TodayStatsData>({
    count: 0,
    totalSize: 0
  });
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [dataFromApi, setDataFromApi] = useState(false);

  // 使用本地数据作为fallback
  const getLocalData = () => {
    const completedFiles = files.filter(file => file.status === 'success').length;
    const totalFileSize = files.reduce((total, file) => total + file.size, 0);
    const averageSize = files.length > 0 ? totalFileSize / files.length : 0;
    const successRate = files.length > 0 ? (completedFiles / files.length) * 100 : 0;

    // 获取最近的文件（按时间倒序）
    const sortedFiles = [...files]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    const localRecentFiles: RecentFile[] = sortedFiles.map(file => ({
      upload_id: file.id,
      file_name: file.name,
      file_size: file.size,
      status: file.status === 'success' ? 'completed' : 'uploading',
      created_at: file.createdAt,
      updated_at: file.updatedAt
    }));

    return {
      stats: {
        totalCount: files.length,
        completedCount: completedFiles,
        totalSize: totalFileSize,
        todayUploadCount: 0, // 本地数据无法准确获取今日上传
        successRate,
        averageFileSize: averageSize
      },
      todayStats: {
        count: 0,
        totalSize: 0
      },
      recentFiles: localRecentFiles
    };
  };

  // 从接口获取统计数据
  const fetchData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError('');
      
      // 并行获取所有数据
      const [statsResponse, todayResponse, recentResponse] = await Promise.all([
        getFileStats(),
        getTodayStats(),
        getRecentFiles(5)
      ]);
      
      setStats({
        totalCount: statsResponse.data.total_count,
        completedCount: statsResponse.data.completed_count,
        totalSize: statsResponse.data.total_size,
        todayUploadCount: statsResponse.data.today_upload_count,
        successRate: statsResponse.data.success_rate,
        averageFileSize: statsResponse.data.average_file_size
      });
      
      setTodayStats({
        count: todayResponse.data.count,
        totalSize: todayResponse.data.total_size
      });
      
      setRecentFiles(recentResponse.data);
      setDataFromApi(true);
      
    } catch (err: any) {
      console.error('获取统计数据失败:', err);
      setError(err.message || '获取统计数据失败，已使用本地数据');
      
      // 使用本地数据作为fallback
      const localData = getLocalData();
      setStats(localData.stats);
      setTodayStats(localData.todayStats);
      setRecentFiles(localData.recentFiles);
      setDataFromApi(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 重新加载数据
  const handleReload = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <Paragraph style={{ marginTop: 16 }}>正在加载统计数据...</Paragraph>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>欢迎回来, {user?.username}!</Title>
          <Paragraph type="secondary">
            这里是文件上传管理系统，您可以上传、管理您的文件。
          </Paragraph>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={handleReload}
          loading={loading}
        >
          刷新数据
        </Button>
      </div>

      {error && (
        <Alert
          message={dataFromApi ? "数据加载异常" : "使用本地数据"}
          description={error}
          type={dataFromApi ? "warning" : "info"}
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button type="link" size="small" onClick={handleReload}>
              重试
            </Button>
          }
        />
      )}

      {!dataFromApi && (
        <Alert
          message="提示"
          description="当前显示的是本地缓存数据，部分统计信息可能不完整。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 主要统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总文件数"
              value={stats.totalCount}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已完成文件"
              value={stats.completedCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日上传"
              value={stats.todayUploadCount}
              prefix={<CloudUploadOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
            {!dataFromApi && (
              <div style={{ fontSize: '12px', color: '#999', marginTop: 8 }}>
                *需连接服务器
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="用户角色"
              value={user?.role || '用户'}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 详细统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总文件大小"
              value={formatFileSize(stats.totalSize)}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均文件大小"
              value={formatFileSize(stats.averageFileSize)}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="上传成功率"
              value={stats.successRate}
              suffix="%"
              precision={1}
              prefix={<UploadOutlined />}
              valueStyle={{ color: stats.successRate >= 90 ? '#52c41a' : '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="当前主题"
              value={theme === 'light' ? '浅色模式' : '深色模式'}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 今日统计和最近文件 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card 
            title="今日上传统计" 
            style={{ height: '100%' }}
            extra={!dataFromApi && <Tag color="orange">本地数据</Tag>}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="上传数量"
                  value={todayStats.count}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="总大小"
                  value={formatFileSize(todayStats.totalSize)}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
            </Row>
       
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card 
            title="最近上传的文件" 
            style={{ height: '100%' }}
            extra={!dataFromApi && <Tag color="orange">本地数据</Tag>}
          >
            <List
              size="small"
              dataSource={recentFiles}
              renderItem={(file) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                          {file.file_name}
                        </span>
                        <Tag color={file.status === 'completed' ? 'green' : 'blue'}>
                          {file.status === 'completed' ? '已完成' : '进行中'}
                        </Tag>
                      </div>
                    }
                    description={
                      <div>
                        <div>{formatFileSize(file.file_size)}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {formatUploadTime(file.created_at)}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无上传文件' }}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message="使用提示"
        description="您可以通过左侧菜单访问不同功能，文件上传支持普通上传和分片上传两种方式。系统会自动统计您的文件数据。"
        type="info"
        showIcon
      />
    </div>
  );
};

export default HomePage;