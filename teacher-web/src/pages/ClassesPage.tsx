import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Space, Tag, Tooltip,
  message, Popconfirm, Typography, Card, List, Image, Divider, Transfer,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  LinkOutlined, EyeOutlined, SoundOutlined,
} from '@ant-design/icons';
import api from '../lib/api';

const { Title, Text, Paragraph } = Typography;

interface Class {
  id: string;
  name: string;
  description?: string;
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

const ClassesPage: React.FC = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  // 班级内已分配课程
  const [classLessons, setClassLessons] = useState<Record<string, Lesson[]>>({});

  // 分配课程弹窗
  const [assignModal, setAssignModal] = useState<{ open: boolean; classId: string | null; className: string }>({
    open: false, classId: null, className: '',
  });
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  // 课程详情弹窗
  const [detailModal, setDetailModal] = useState<{ open: boolean; lesson: LessonDetail | null }>({ open: false, lesson: null });

  const [classForm] = Form.useForm();

  useEffect(() => { fetchClasses(); }, []);

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

  // ─── Class CRUD ─────────────────────────────────────────────────────────────
  const openClassModal = (cls?: Class) => {
    setEditingClass(cls || null);
    classForm.setFieldsValue(cls || { name: '', description: '' });
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

  // Transfer data source
  const transferDataSource = allLessons.map(l => ({
    key: l.id,
    title: l.title,
    description: `${l._count.sentences} 句`,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>班级管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openClassModal()}>新建班级</Button>
      </div>

      <Table
        dataSource={classes} columns={columns} rowKey="id" loading={loading}
        expandable={{
          onExpand: (expanded, record) => { if (expanded) fetchClassLessons(record.id); },
          expandedRowRender: (record) => (
            <Card
              size="small"
              title={<Text strong>已分配课程</Text>}
              extra={
                <Button size="small" icon={<LinkOutlined />} type="primary" onClick={() => openAssignModal(record)}>
                  管理课程分配
                </Button>
              }
              style={{ background: '#fafafa' }}
            >
              {(classLessons[record.id] || []).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '24px 0' }}>
                  暂无分配课程，点击右上角「管理课程分配」
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {(classLessons[record.id] || []).map((lesson) => (
                    <Card
                      key={lesson.id}
                      hoverable
                      style={{ width: 200 }}
                      cover={
                        <Image
                          src={lesson.imageUrl}
                          alt={lesson.title}
                          height={120}
                          style={{ objectFit: 'cover' }}
                          preview={false}
                          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect width='200' height='120' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23bbb' font-size='13'%3E暂无图片%3C/text%3E%3C/svg%3E"
                        />
                      }
                      actions={[
                        <Tooltip title="查看详情" key="view">
                          <EyeOutlined onClick={() => openLessonDetail(lesson)} />
                        </Tooltip>,
                        <Popconfirm
                          key="remove"
                          title="从该班级移除此课程？"
                          onConfirm={() => removeLesson(lesson.id, record.id)}
                          okText="移除" cancelText="取消"
                        >
                          <Tooltip title="移除课程">
                            <DeleteOutlined style={{ color: '#ff4d4f' }} />
                          </Tooltip>
                        </Popconfirm>,
                      ]}
                    >
                      <Card.Meta
                        title={<Text ellipsis={{ tooltip: lesson.title }}>{lesson.title}</Text>}
                        description={<Tag color="blue">{lesson._count.sentences} 句</Tag>}
                      />
                    </Card>
                  ))}
                </div>
              )}
            </Card>
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
        </Form>
      </Modal>

      {/* ── Assign Lessons Modal ──────────────────────────────────────────────── */}
      <Modal
        title={`分配课程 — ${assignModal.className}`}
        open={assignModal.open}
        onOk={confirmAssign}
        onCancel={() => setAssignModal({ open: false, classId: null, className: '' })}
        okText="确认分配" cancelText="取消"
        confirmLoading={assigning}
        width={700}
      >
        <p style={{ color: '#666', marginBottom: 16 }}>
          从课程库中选择要分配给该班级的课程。左侧为课程库，右侧为已选中。
        </p>
        <Transfer
          dataSource={transferDataSource}
          titles={['课程库', '已分配']}
          targetKeys={selectedLessonIds}
          onChange={(keys) => setSelectedLessonIds(keys as string[])}
          render={item => (
            <span>
              {item.title}
              <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>{item.description}</Tag>
            </span>
          )}
          listStyle={{ width: 280, height: 360 }}
          showSearch
          filterOption={(input, item) =>
            (item.title ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
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
                    <Tag color="purple">{i + 1}</Tag>
                    <Paragraph style={{ margin: 0 }}>{s.text}</Paragraph>
                  </div>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default ClassesPage;
