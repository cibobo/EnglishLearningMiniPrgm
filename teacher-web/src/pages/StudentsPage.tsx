import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag,
  message, Popconfirm, Typography, Avatar
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const { Title, Text } = Typography;

interface Student {
  id: string; name: string; studentCode: string;
  classId?: string;
  class?: { id: string; name: string };
  _count: { recordingSubmissions: number };
}
interface Class { id: string; name: string; }

const StudentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [filterClass, setFilterClass] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchStudents = async (classId?: string) => {
    setLoading(true);
    try {
      const params = classId ? `?classId=${classId}` : '';
      const { data } = await api.get(`/students${params}`);
      setStudents(data);
    } finally { setLoading(false); }
  };

  const fetchClasses = async () => {
    const { data } = await api.get('/classes');
    setClasses(data);
  };

  const openModal = (student?: Student) => {
    setEditing(student || null);
    form.setFieldsValue(student ? { name: student.name, classId: student.classId } : { name: '', classId: undefined });
    setModalOpen(true);
  };

  const save = async () => {
    const vals = await form.validateFields();
    try {
      if (editing) {
        await api.put(`/students/${editing.id}`, vals);
        message.success('学生信息已更新');
      } else {
        await api.post('/students', vals);
        message.success('学生已创建，请将学生码告知家长');
      }
      setModalOpen(false);
      fetchStudents(filterClass);
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const deleteStudent = async (id: string) => {
    await api.delete(`/students/${id}`);
    message.success('学生已删除');
    fetchStudents(filterClass);
  };

  const onFilterChange = (val?: string) => {
    setFilterClass(val);
    fetchStudents(val);
  };

  const columns = [
    {
      title: '学生', key: 'student',
      render: (_: any, r: Student) => (
        <Space>
          <Avatar style={{ background: '#4F46E5' }}>{r.name[0]}</Avatar>
          <div>
            <Text strong>{r.name}</Text>
            <div><Text type="secondary" style={{ fontSize: 12 }}>学生码：{r.studentCode}</Text></div>
          </div>
        </Space>
      ),
    },
    {
      title: '班级', dataIndex: ['class', 'name'], key: 'class',
      render: (v?: string) => v ? <Tag color="blue">{v}</Tag> : <Tag>未分班</Tag>,
    },
    {
      title: '录音提交', key: 'recordings',
      render: (_: any, r: Student) => <Tag color="green">{r._count.recordingSubmissions} 条</Tag>,
    },
    {
      title: '绑定状态', key: 'bound',
      render: (_: any, r: Student) => r.studentCode
        ? <Tag color="orange">待绑定</Tag>
        : <Tag color="green">已绑定</Tag>,
    },
    {
      title: '操作', key: 'ops',
      render: (_: any, r: Student) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/students/${r.id}`)}>查看进度</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)} />
          <Popconfirm title="确认删除？录音数据将保留" onConfirm={() => deleteStudent(r.id)} okText="删除" cancelText="取消">
            <Button size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>学生管理</Title>
        <Space>
          <Select
            placeholder="按班级筛选" allowClear style={{ width: 180 }}
            onChange={onFilterChange}
            options={classes.map(c => ({ label: c.name, value: c.id }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>添加学生</Button>
        </Space>
      </div>

      <Table dataSource={students} columns={columns} rowKey="id" loading={loading} />

      <Modal
        title={editing ? '编辑学生' : '添加学生'}
        open={modalOpen} onOk={save}
        onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="学生姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="学生真实姓名" />
          </Form.Item>
          <Form.Item name="classId" label="所属班级">
            <Select placeholder="选择班级（可后续分配）" allowClear
              options={classes.map(c => ({ label: c.name, value: c.id }))} />
          </Form.Item>
        </Form>
        {!editing && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '12px 16px', marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              💡 添加后系统会生成 6 位学生码，请将学生码告知家长。学生首次微信登录时输入此码即可绑定账号。
            </Text>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StudentsPage;
