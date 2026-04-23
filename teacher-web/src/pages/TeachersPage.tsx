import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Space, Tag, Tooltip,
  message, Popconfirm, Typography, Select,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../lib/api';

const { Title, Text } = Typography;

interface Teacher {
  id: string;
  name: string;
  username: string;
  role: string;
  createdAt: string;
  _count: { classes: number; lessons: number };
}

const TeachersPage: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/teachers');
      setTeachers(data);
    } catch (e: any) {
      if (e.response?.status !== 403) {
        message.error('无法加载教师列表');
      }
    } finally {
      setLoading(false);
    }
  };

  const openModal = (teacher?: Teacher) => {
    setEditing(teacher || null);
    form.setFieldsValue(
      teacher
        ? { name: teacher.name, username: teacher.username, role: teacher.role, password: '' }
        : { name: '', username: '', role: 'teacher', password: '' }
    );
    setModalOpen(true);
  };

  const save = async () => {
    try {
      const vals = await form.validateFields();
      if (editing) {
        await api.put(`/teachers/${editing.id}`, {
          name: vals.name,
          role: vals.role,
          ...(vals.password ? { password: vals.password } : {}), // only send password if provided
        });
        message.success('教师信息已更新');
      } else {
        await api.post('/teachers', vals);
        message.success('已添加教师');
      }
      setModalOpen(false);
      fetchTeachers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const deleteTeacher = async (id: string) => {
    try {
      await api.delete(`/teachers/${id}`);
      message.success('教师已删除');
      fetchTeachers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const columns = [
    {
      title: '教师姓名', key: 'name',
      render: (_: any, r: Teacher) => <Text strong>{r.name}</Text>,
    },
    {
      title: '用户名', dataIndex: 'username', key: 'username',
    },
    {
      title: '角色', key: 'role',
      render: (_: any, r: Teacher) => 
        r.role === 'superadmin' ? <Tag color="gold">超级管理员</Tag> : <Tag color="green">教师</Tag>,
    },
    {
      title: '负责班级', key: 'classes',
      render: (_: any, r: Teacher) => <Tag color="blue">{r._count.classes} 个</Tag>,
    },
    {
      title: '负责课程', key: 'lessons',
      render: (_: any, r: Teacher) => <Tag color="cyan">{r._count.lessons} 课</Tag>,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: '操作', key: 'ops',
      render: (_: any, r: Teacher) => (
        <Space>
          <Tooltip title="编辑教师">
            <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)} />
          </Tooltip>
          <Popconfirm title="确认删除该教师？此操作不可恢复" onConfirm={() => deleteTeacher(r.id)} okText="删除" cancelText="取消">
            <Button size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>教师管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>添加教师</Button>
      </div>

      <Table dataSource={teachers} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title={editing ? '编辑教师' : '添加教师'}
        open={modalOpen} onOk={save}
        onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="登录用户名" rules={[{ required: !editing, message: '请输入用户名' }]}>
            <Input placeholder="建议使用拼音或姓名拼写" disabled={!!editing} />
          </Form.Item>
          {editing ? (
             <Form.Item name="password" label="新密码（不修改请留空）">
               <Input.Password placeholder="输入新密码可重置该教师密码" />
             </Form.Item>
          ) : (
             <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请设置初始密码' }]}>
              <Input.Password placeholder="请设置登录密码" />
            </Form.Item>
          )}
          <Form.Item name="name" label="姓名/称呼" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="学生和系统显示的名称" />
          </Form.Item>
          <Form.Item name="role" label="权限角色" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="teacher">普通教师 (仅管理自己的资源)</Select.Option>
              <Select.Option value="superadmin">超级管理员 (管理所有资源和教师)</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TeachersPage;
