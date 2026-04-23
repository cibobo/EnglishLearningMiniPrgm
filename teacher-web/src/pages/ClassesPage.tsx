import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Space, Tag, Tooltip,
  message, Popconfirm, Typography, Card, List, Image, Divider, Checkbox, Tabs, Select,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  LinkOutlined, EyeOutlined, SoundOutlined, UserAddOutlined,
} from '@ant-design/icons';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

const { Title, Text, Paragraph } = Typography;

interface Class {
  id: string;
  name: string;
  description?: string;
  teacherId?: string;
  teacher?: { name: string };
  _count: { students: number; lessons: number };
}

interface Lesson {
  id: string;
  title: string;
  imageUrl: string;
  _count: { sentences: number };
}

interface Sentence {
  id: string;
  text: string;
  audioUrl?: string;
  orderIndex: number;
}

interface LessonDetail extends Lesson {
  sentences: Sentence[];
}

interface Student {
  id: string;
  name: string;
  studentCode: string;
}

const ClassesPage: React.FC = () => {
  const { user } = useAuthStore();
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  // 班级内已分配课程和学生
  const [classLessons, setClassLessons] = useState<Record<string, Lesson[]>>({});
  const [classStudents, setClassStudents] = useState<Record<string, Student[]>>({});

  // 分配课程弹窗
  const [assignModal, setAssignModal] = useState<{ open: boolean; classId: string | null; className: string }>({
    open: false, classId: null, className: '',
  });
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  // 课程详情弹窗
  const [detailModal, setDetailModal] = useState<{ open: boolean; lesson: LessonDetail | null }>({ open: false, lesson: null });

  // 快速添加学生弹窗
  const [addStudentModal, setAddStudentModal] = useState<{ open: boolean; classId: string; className: string }>({ open: false, classId: '', className: '' });
  const [studentForm] = Form.useForm();

  const [classForm] = Form.useForm();

  useEffect(() => { 
    fetchClasses(); 
    if (user?.role === 'superadmin') {
      api.get('/teachers').then(res => setTeachers(res.data)).catch(console.error);
    }
  }, [user?.role]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/classes');
      setClasses(data);
    } finally { setLoading(false); }
  };

  const fetchClassLessons = async (classId: string) => {
    const { data } = await api.get(`/classes/${classId}/lessons`);
    setClassLessons(prev => ({ ...prev, [classId]: data }));
  };

  const fetchClassStudents = async (classId: string) => {
    const { data } = await api.get(`/students?classId=${classId}`);
    setClassStudents(prev => ({ ...prev, [classId]: data }));
  };

  // ─── Class CRUD ─────────────────────────────────────────────────────────────
  const openClassModal = (cls?: Class) => {
    setEditingClass(cls || null);
    classForm.setFieldsValue(cls || { name: '', description: '', teacherId: user?.role === 'superadmin' ? user.id : undefined });
    setClassModal(true);
  };

  const saveClass = async () => {
    const vals = await classForm.validateFields();
    try {
      if (editingClass) {
        await api.put(`/classes/${editingClass.id}`, vals);
        message.success('班级已更新');
      } else {
        await api.post('/classes', vals);
        message.success('班级已创建');
      }
      setClassModal(false);
      fetchClasses();
    } catch { message.error('操作失败'); }
  };

  const deleteClass = async (id: string) => {
    await api.delete(`/classes/${id}`);
    message.success('班级已删除');
    fetchClasses();
  };

  // ─── Add Student & Remove Student Quick Actions ──────────────────────────────
  const openAddStudentModal = (classId: string, className: string) => {
    studentForm.resetFields();
    setAddStudentModal({ open: true, classId, className });
  };

  const handleAddStudent = async () => {
    const vals = await studentForm.validateFields();
    try {
      const { data } = await api.post('/students', { name: vals.name, classId: addStudentModal.classId });
      setAddStudentModal({ open: false, classId: '', className: '' });
      fetchClasses();
      fetchClassStudents(addStudentModal.classId);
      Modal.success({
        title: '学生添加成功',
        content: (
          <div>
            <p>学生 <b>{vals.name}</b> 已成功加入班级 <b>{addStudentModal.className}</b>！</p>
            <p>系统自动生成的学生码为：<Text copyable strong style={{fontSize: 20, color: '#1677ff'}}>{data.studentCode}</Text></p>
            <p style={{color: '#999', fontSize: 13}}>请将此学生码告知家长，学生首次微信登录时输入此码即可绑定。</p>
          </div>
        )
      });
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const unlinkStudent = async (student: Student, classId: string) => {
    try {
      await api.put(`/students/${student.id}`, { name: student.name, classId: null });
      message.success('已将学生移出班级');
      fetchClassStudents(classId);
      fetchClasses();
    } catch {
      message.error('移出学生失败');
    }
  };

  // ─── Assign lessons to class ─────────────────────────────────────────────────
  const openAssignModal = async (cls: Class) => {
    const { data } = await api.get('/lessons');
    setAllLessons(data);
    // 预选已分配的
    const assigned = classLessons[cls.id] || [];
    setSelectedLessonIds(assigned.map(l => l.id));
    setAssignModal({ open: true, classId: cls.id, className: cls.name });
  };

  const confirmAssign = async () => {
    const { classId } = assignModal;
    if (!classId) return;
    setAssigning(true);
    try {
      // 计算新增和移除的
      const current = (classLessons[classId] || []).map(l => l.id);
      const toAdd = selectedLessonIds.filter(id => !current.includes(id));
      const toRemove = current.filter(id => !selectedLessonIds.includes(id));

      await Promise.all([
        ...(toAdd.length > 0 ? [api.post(`/classes/${classId}/lessons`, { lessonIds: toAdd })] : []),
        ...toRemove.map(id => api.delete(`/classes/${classId}/lessons/${id}`)),
      ]);

      message.success('课程分配已更新');
      setAssignModal({ open: false, classId: null, className: '' });
      fetchClassLessons(classId);
      fetchClasses();
    } catch {
      message.error('操作失败');
    } finally {
      setAssigning(false);
    }
  };

  const openLessonDetail = async (lesson: Lesson) => {
    const { data } = await api.get(`/lessons/${lesson.id}`);
    setDetailModal({ open: true, lesson: data as LessonDetail });
  };

  const removeLesson = async (lessonId: string, classId: string) => {
    await api.delete(`/classes/${classId}/lessons/${lessonId}`);
    message.success('课程已从班级移除');
    fetchClassLessons(classId);
    fetchClasses();
  };

  // ─── Table columns ───────────────────────────────────────────────────────────
  const columns = [
    { title: '班级名称', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    { title: '描述', dataIndex: 'description', key: 'desc', render: (v?: string) => v || '-' },
    ...(user?.role === 'superadmin' ? [{ title: '负责教师', dataIndex: 'teacher', key: 'teacher', render: (_: any, r: Class) => r.teacher?.name || '未知' }] : []),
    { title: '学生数', key: 'students', render: (_: unknown, r: Class) => <Tag color="blue">{r._count.students} 人</Tag> },
    { title: '课程数', key: 'lessons', render: (_: unknown, r: Class) => <Tag color="green">{r._count.lessons} 课</Tag> },
    {
      title: '操作', key: 'ops', render: (_: unknown, r: Class) => (
        <Space>
          <Tooltip title="编辑班级">
            <Button size="small" icon={<EditOutlined />} onClick={() => openClassModal(r)} />
          </Tooltip>
          <Tooltip title="分配课程">
            <Button size="small" icon={<LinkOutlined />} type="primary" onClick={() => openAssignModal(r)} />
          </Tooltip>
          <Popconfirm title="确认删除此班级？" onConfirm={() => deleteClass(r.id)} okText="删除" cancelText="取消">
            <Button size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];



  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>班级管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openClassModal()}>新建班级</Button>
      </div>

      <Table
        dataSource={classes} columns={columns} rowKey="id" loading={loading}
        expandable={{
          onExpand: (expanded, record) => { 
            if (expanded) {
              fetchClassLessons(record.id);
              fetchClassStudents(record.id);
            } 
          },
          expandedRowRender: (record) => (
            <div style={{ background: '#f2f2f2', padding: '16px 24px', margin: '-16px -16px -16px 48px', borderRadius: 8 }}>
              <Tabs defaultActiveKey="lessons" style={{ minHeight: 200 }}>
                {/* ── 已分配课程 Tab ── */}
                <Tabs.TabPane tab={<Space><LinkOutlined /> 已分配课程 ({record._count.lessons})</Space>} key="lessons">
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => openAssignModal(record)}>
                      管理课程分配
                    </Button>
                  </div>
                  {(classLessons[record.id] || []).length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: '24px 0' }}>
                      暂无分配的课程，请点击上方「管理课程分配」添加
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                      {(classLessons[record.id] || []).map((lesson) => (
                        <Card
                          key={lesson.id} hoverable style={{ width: 200 }}
                          cover={
                            <Image
                              src={lesson.imageUrl} alt={lesson.title} height={120} style={{ objectFit: 'cover' }}
                              preview={false} fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect width='200' height='120' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23bbb' font-size='13'%3E暂无图片%3C/text%3E%3C/svg%3E"
                            />
                          }
                          actions={[
                            <Tooltip title="查看详情" key="view"><EyeOutlined onClick={() => openLessonDetail(lesson)} /></Tooltip>,
                            <Popconfirm
                              key="remove" title="从该班级移除此课程？"
                              onConfirm={() => removeLesson(lesson.id, record.id)} okText="移除" cancelText="取消"
                            >
                              <Tooltip title="移除课程"><DeleteOutlined style={{ color: '#ff4d4f' }} /></Tooltip>
                            </Popconfirm>,
                          ]}
                        >
                          <Card.Meta title={<Text ellipsis={{ tooltip: lesson.title }}>{lesson.title}</Text>} description={<Tag color="blue">{lesson._count.sentences} 句</Tag>} />
                        </Card>
                      ))}
                    </div>
                  )}
                </Tabs.TabPane>

                {/* ── 学生名单 Tab ── */}
                <Tabs.TabPane tab={<Space><UserAddOutlined /> 学生名单 ({record._count.students})</Space>} key="students">
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="small" type="primary" icon={<UserAddOutlined />} onClick={() => openAddStudentModal(record.id, record.name)}>
                      添加学生
                    </Button>
                  </div>
                  <Table
                    size="small"
                    dataSource={classStudents[record.id] || []}
                    rowKey="id"
                    pagination={false}
                    locale={{ emptyText: '该班级暂无学生' }}
                    columns={[
                      { title: '学生姓名', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
                      { title: '学生码', dataIndex: 'studentCode', key: 'code', render: (v: string) => <Text copyable strong style={{ color: '#1677ff' }}>{v}</Text> },
                      { title: '绑定状态', key: 'bound', render: (_, r: Student) => r.studentCode ? <Tag color="orange">待首次登录</Tag> : <Tag color="green">已绑定</Tag> },
                      { 
                        title: '操作', key: 'act', render: (_, r: Student) => (
                          <Popconfirm title="从班级移除该学生？该学生数据将被保留为【未分班】状态。" onConfirm={() => unlinkStudent(r, record.id)} okText="移除" cancelText="取消">
                            <Button size="small" danger type="link">移除</Button>
                          </Popconfirm>
                        )
                      }
                    ]}
                  />
                </Tabs.TabPane>
              </Tabs>
            </div>
          ),
        }}
      />

      {/* ── Class Edit Modal ──────────────────────────────────────────────────── */}
      <Modal
        title={editingClass ? '编辑班级' : '新建班级'}
        open={classModal}
        onOk={saveClass}
        onCancel={() => setClassModal(false)}
        okText="保存" cancelText="取消"
      >
        <Form form={classForm} layout="vertical">
          <Form.Item name="name" label="班级名称" rules={[{ required: true }]}>
            <Input placeholder="如：三年级一班" />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <Input.TextArea rows={3} placeholder="班级描述" />
          </Form.Item>
          {user?.role === 'superadmin' && (
            <Form.Item name="teacherId" label="分配给教师" rules={[{ required: true }]}>
              <Select options={teachers.map(t => ({ label: t.name, value: t.id }))} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={`分配课程 — ${assignModal.className}`}
        open={assignModal.open}
        onOk={confirmAssign}
        onCancel={() => setAssignModal({ open: false, classId: null, className: '' })}
        okText="确认分配" cancelText="取消"
        confirmLoading={assigning}
        width={600}
      >
        <p style={{ color: '#666', marginBottom: 16 }}>
          请勾选要分配给该班级的课程。一个课程可以同时分配给多个班级，取消勾选即从班级中移除。
        </p>
        {allLessons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            课程库暂无课程，请先在「课程管理」中新建课程
          </div>
        ) : (
          <Checkbox.Group 
            style={{ width: '100%' }} 
            value={selectedLessonIds} 
            onChange={(vals) => setSelectedLessonIds(vals as string[])}
          >
            <div style={{ 
              maxHeight: 400, 
              overflowY: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 12, 
              paddingRight: 8 
            }}>
              {allLessons.map(l => (
                <div 
                  key={l.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '12px 16px', 
                    border: '1px solid rgba(0,0,0,0.04)', 
                    borderRadius: 6,
                    background: selectedLessonIds.includes(l.id) ? 'rgba(255,56,92,0.05)' : '#ffffff',
                    transition: 'all 0.3s'
                  }}
                >
                  <Checkbox value={l.id}>
                    <Typography.Text strong style={{ marginLeft: 8 }}>{l.title}</Typography.Text>
                  </Checkbox>
                  <Tag color="cyan">{l._count.sentences} 句</Tag>
                </div>
              ))}
            </div>
          </Checkbox.Group>
        )}
      </Modal>

      {/* ── Lesson Detail Modal ───────────────────────────────────────────────── */}
      <Modal
        title={detailModal.lesson?.title}
        open={detailModal.open}
        onCancel={() => setDetailModal({ open: false, lesson: null })}
        footer={<Button onClick={() => setDetailModal({ open: false, lesson: null })}>关闭</Button>}
        width={600}
      >
        {detailModal.lesson && (
          <>
            <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <Image
                src={detailModal.lesson.imageUrl}
                alt={detailModal.lesson.title}
                style={{ width: '100%', maxHeight: 240, objectFit: 'cover' }}
                preview={{ mask: '点击放大' }}
              />
            </div>
            <Divider>句子列表（{detailModal.lesson.sentences.length} 句）</Divider>
            <List
              dataSource={detailModal.lesson.sentences}
              renderItem={(s, i) => (
                <List.Item
                  style={{ padding: '8px 0' }}
                  extra={
                    s.audioUrl && (
                      <Tooltip title="播放参考音频">
                        <Button
                          size="small"
                          icon={<SoundOutlined />}
                          onClick={() => new Audio(s.audioUrl!).play()}
                        />
                      </Tooltip>
                    )
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tag color="red">{i + 1}</Tag>
                    <Paragraph style={{ margin: 0 }}>{s.text}</Paragraph>
                  </div>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>

      {/* ── Quick Add Student Modal ───────────────────────────────────────────── */}
      <Modal
        title={`添加学生到班级 — ${addStudentModal.className}`}
        open={addStudentModal.open}
        onOk={handleAddStudent}
        onCancel={() => setAddStudentModal({ open: false, classId: '', className: '' })}
        okText="添加保存" cancelText="取消"
      >
        <Form form={studentForm} layout="vertical">
          <Form.Item name="name" label="学生姓名" rules={[{ required: true, message: '请输入真实姓名' }]}>
            <Input placeholder="输入学生真实姓名，如：张小明" />
          </Form.Item>
        </Form>
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '12px 16px', marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            💡 首期添加支持快速录入。添加成功后系统会为该学生自动生成 6位的专属防伪「学生码」。
          </Text>
        </div>
      </Modal>
    </div>
  );
};

export default ClassesPage;
