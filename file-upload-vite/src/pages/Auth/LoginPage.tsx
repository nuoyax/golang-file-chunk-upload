import React from 'react';
import { Form, Input, Button, Card, message, Checkbox, Divider } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from '@/types';

const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/';

  const onFinish = async (values: LoginForm) => {
    try {
      await login(values);
      message.success('登录成功！');
      navigate(from, { replace: true });
    } catch (error: any) {
      message.error(error || '登录失败');
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card
        title="文件上传系统"
        style={{ width: 400 }}
        headStyle={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}
      >
        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名!' }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="用户名" 
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码!' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住我</Checkbox>
            </Form.Item>
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              style={{ width: '100%' }}
              loading={loading}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <Divider>演示账号</Divider>
        
        <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.5' }}>
          <div>管理员: admin / admin123</div>
          <div>普通用户: user / user123</div>
          <div>游客: guest / guest123</div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <span>还没有账号？ </span>
          <Link to="/register">立即注册</Link>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;