import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, Typography, Space, Avatar } from 'antd';
import { BankOutlined, TeamOutlined, LogoutOutlined, BookOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';

const { Sider, Content, Header } = AntLayout;
const { Text } = Typography;

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const menuItems = [
    { key: '/classes', icon: <BankOutlined />, label: '班级管理' },
    { key: '/students', icon: <TeamOutlined />, label: '学生管理' },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        width={220}
        theme="dark"
        style={{ background: 'linear-gradient(180deg, #312E81 0%, #1E1B4B 100%)' }}
      >
        {/* Logo */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Space>
            <BookOutlined style={{ fontSize: 24, color: '#A5B4FC' }} />
            <Text style={{ color: '#E0E7FF', fontWeight: 700, fontSize: 16 }}>英语跟读</Text>
          </Space>
          <div style={{ marginTop: 6 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>教师管理平台</Text>
          </div>
        </div>

        {/* Nav */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', border: 'none', marginTop: 8 }}
        />

        {/* User Info */}
        <div style={{
          position: 'absolute', bottom: 0, width: '100%',
          padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <Space>
            <Avatar style={{ background: '#4F46E5' }}>{user?.name?.[0] || 'T'}</Avatar>
            <div>
              <div style={{ color: '#E0E7FF', fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>@{user?.username}</div>
            </div>
          </Space>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{ color: 'rgba(255,255,255,0.45)', marginTop: 8, width: '100%' }}
            size="small"
          >退出登录</Button>
        </div>
      </Sider>

      <AntLayout>
        <Header style={{ background: '#fff', padding: '0 32px', borderBottom: '1px solid #F3F4F6', height: 56, lineHeight: '56px' }}>
          <Text style={{ fontWeight: 700, fontSize: 18, color: '#1F2937' }}>
            {menuItems.find(m => m.key === location.pathname)?.label || '控制面板'}
          </Text>
        </Header>
        <Content style={{ margin: '24px', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
