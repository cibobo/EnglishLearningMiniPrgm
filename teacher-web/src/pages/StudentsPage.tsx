import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag,
  message, Popconfirm, Typography, Avatar, List, Card, Divider, Grid
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

interface Student {
  id: string; name: string; studentCode: string;
  classes?: { id: string; name: string; teacher?: { name: string } }[];
  _count: { recordingSubmissions: number };
}
interface Class { id: string; name: string; }

const StudentsPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

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
    form.setFieldsValue(student ? { name: student.name, classIds: student.classes?.map(c => c.id) || [] } : { name: '', classIds: [] });
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
          <Avatar style={{ background: '#ff385c' }}>{r.name[0]}</Avatar>
          <div>
            <Text strong>{r.name}</Text>
            <div><Text type="secondary" style={{ fontSize: 12 }}>学生码：{r.studentCode}</Text></div>
          </div>
        </Space>
      ),
    },
    {
      title: '班级', key: 'classes',
      render: (_: any, r: Student) => r.classes && r.classes.length > 0
        ? <Space wrap>{r.classes.map(c => <Tag color="blue" key={c.id}>{c.name}</Tag>)}</Space> 
        : <Tag>未分班</Tag>,
    },
    ...(user?.role === 'superadmin' ? [{ 
      title: '所属教师', key: 'teacher', 
      render: (_: any, r: Student) => {
         const tNames = Array.from(new Set(r.classes?.map(c => c.teacher?.name).filter(Boolean)));
         return tNames.length > 0 ? tNames.join(', ') : '未知';
      }
    }] : []),
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
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row', 
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center', 
        marginBottom: 20, 
        gap: 16 
      }}>
        <Title level={4} style={{ margin: 0 }}>学生管理</Title>
        <Space style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Select
            placeholder="按班级筛选" allowClear style={{ flex: 1, minWidth: 120 }}
            onChange={onFilterChange}
            options={classes.map(c => ({ label: c.name, value: c.id }))}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>添加学生</Button>
        </Space>
      </div>

      {isMobile ? (
        <List
          dataSource={students}
          loading={loading}
          renderItem={(r: Student) => (
            <List.Item style={{ padding: '8px 0' }}>
              <Card size="small" style={{ width: '100%', borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Space>
                    <Avatar style={{ background: '#ff385c' }}>{r.name[0]}</Avatar>
                    <div>
                      <Text strong>{r.name}</Text>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>学生码：{r.studentCode}</Text></div>
                    </div>
                  </Space>
                  {r.studentCode ? <Tag color="orange" style={{ margin: 0 }}>待绑定</Tag> : <Tag color="green" style={{ margin: 0 }}>已绑定</Tag>}
                </div>

                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  <Space split={<Divider type="vertical" />} wrap>
                    <Text type="secondary" style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{marginRight: 4}}>班级:</span>
                      {r.classes && r.classes.length > 0 ? r.classes.map(c => (
                         <div key={c.id} style={{ display: 'inline-block', marginBottom: 4 }}>
                            <Tag color="blue" style={{ margin: 0, marginLeft: 6 }}>{c.name}</Tag>
                            {user?.role === 'superadmin' && c.teacher?.name && <Tag color="purple" style={{ margin: 0, marginLeft: 4 }}>{c.teacher.name}</Tag>}
                         </div>
                      )) : '未分班'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      录音: <Tag color="green" style={{ margin: 0, marginLeft: 6 }}>{r._count.recordingSubmissions} 条</Tag>
                    </Text>
                  </Space>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/students/${r.id}`)}>详情</Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)} />
                  <Popconfirm title="确认删除？录音保留" onConfirm={() => deleteStudent(r.id)} okText="删除" cancelText="取消">
                    <Button size="small" icon={<DeleteOutlined />} danger />
                  </Popconfirm>
                </div>
              </Card>
            </List.Item>
          )}
        />
      ) : (
        <Table dataSource={students} columns={columns} rowKey="id" loading={loading} />
      )}

      <Modal
        title={editing ? '编辑学生' : '添加学生'}
        open={modalOpen} onOk={save}
        onCancel={() => setModalOpen(false)} okText="保存" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="学生姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="学生真实姓名" />
          </Form.Item>
          <Form.Item name="classIds" label="所属班级">
            <Select placeholder="选择班级（可多选）" mode="multiple" allowClear
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
