import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { 
  Layout, 
  Menu, 
  Button, 
  theme,
  Avatar,
  Dropdown,
  Space
} from 'antd'
import { 
  MenuFoldOutlined, 
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  HomeOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import { useAppSelector, useAppDispatch } from '../hooks/redux'
import { toggleSidebar } from '../store/slices/appSlice'
import { useAuth } from '../hooks/useAuth'
import { useNavigate, useLocation } from 'react-router-dom'

const { Header, Sider, Content } = Layout

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const dispatch = useAppDispatch()
  const { theme: currentTheme, sidebarCollapsed } = useAppSelector(state => state.app)
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '首页',
    },
    {
      key: '/about',
      icon: <InfoCircleOutlined />,
      label: '关于',
    },
    {
      key: '/profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
      >
        <div className="demo-logo-vertical" />
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: 0, 
          background: colorBgContainer,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingRight: 24
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
            }}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user?.name}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout