import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, Typography, Space, Avatar } from 'antd';
import { BankOutlined, TeamOutlined, LogoutOutlined, BookOutlined, FileTextOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';

const { Sider, Content, Header } = AntLayout;
const { Text } = Typography;

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const menuItems = [
    { key: '/classes', icon: <BankOutlined />, label: '班级管理' },
    { key: '/lessons', icon: <FileTextOutlined />, label: '课程管理' },
    { key: '/students', icon: <TeamOutlined />, label: '学生管理' },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="0"
        width={220}
        theme="light"
        style={{ background: '#ffffff', borderRight: '1px solid rgba(0,0,0,0.02)', zIndex: 10 }}
      >
        {/* Logo */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(0,0,0,0.02)' }}>
          <Space>
            <BookOutlined style={{ fontSize: 24, color: '#ff385c' }} />
            <Text style={{ color: '#222222', fontWeight: 700, fontSize: 16 }}>英语跟读</Text>
          </Space>
          <div style={{ marginTop: 6 }}>
            <Text style={{ color: '#6a6a6a', fontSize: 12 }}>教师管理平台</Text>
          </div>
        </div>

        {/* Nav */}
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', border: 'none', marginTop: 8 }}
        />

        {/* User Info */}
        <div style={{
          position: 'absolute', bottom: 0, width: '100%',
          padding: '16px 20px', borderTop: '1px solid rgba(0,0,0,0.02)',
          background: '#ffffff'
        }}>
          <Space>
            <Avatar style={{ background: '#ff385c' }}>{user?.name?.[0] || 'T'}</Avatar>
            <div>
              <div style={{ color: '#222222', fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
              <div style={{ color: '#6a6a6a', fontSize: 11 }}>@{user?.username}</div>
            </div>
          </Space>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{ color: '#6a6a6a', marginTop: 8, width: '100%' }}
            size="small"
          >退出登录</Button>
        </div>
      </Sider>

      <AntLayout style={{ background: '#ffffff' }}>
        <Header style={{ 
          background: '#ffffff', 
          padding: '0 16px', 
          borderBottom: '1px solid rgba(0,0,0,0.02)', 
          height: 56, 
          lineHeight: '56px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Text style={{ fontWeight: 700, fontSize: 20, color: '#222222', letterSpacing: '-0.18px' }}>
            {menuItems.find(m => m.key === location.pathname)?.label || '控制面板'}
          </Text>
        </Header>
        <Content style={{ 
          margin: '16px', 
          overflow: 'auto',
          background: '#fff', // Optional: if content needs a background
          borderRadius: 8
        }}>
          <div style={{ padding: '0' /* If we have internal padding we want to keep */ }}>
            <Outlet />
          </div>
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
