import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Space, Tag, Tooltip,
  message, Popconfirm, Typography, Card, Upload, List
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  UploadOutlined, BookOutlined
} from '@ant-design/icons';
import api from '../lib/api';

const { Title, Text } = Typography;

interface Class { id: string; name: string; description?: string; _count: { students: number; lessons: number }; }
interface Lesson { id: string; title: string; imageUrl: string; _count: { sentences: number }; }
interface Sentence { text: string; audioUrl?: string; }

const ClassesPage: React.FC = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [lessonModal, setLessonModal] = useState<{ open: boolean; classId: string | null }>({ open: false, classId: null });
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [sentences, setSentences] = useState<Sentence[]>([{ text: '' }]);
  const [uploading, setUploading] = useState(false);
  const [classForm] = Form.useForm();
  const [lessonForm] = Form.useForm();

  useEffect(() => { fetchClasses(); }, []);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/classes');
      setClasses(data);
    } finally { setLoading(false); }
  };

  const fetchLessons = async (classId: string) => {
    const { data } = await api.get(`/lessons?class_id=${classId}`);
    setLessons(prev => ({ ...prev, [classId]: data }));
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

  // ─── Upload helpers ──────────────────────────────────────────────────────────
  const uploadFile = async (file: File, category: string): Promise<string> => {
    // Step 1: 获取上传目标地址
    const { data: presign } = await api.post('/upload/presign', {
      filename: file.name,
      content_type: file.type,
      category,
    });

    // Step 2: 用 multipart/form-data 直传到服务器
    const formData = new FormData();
    formData.append(presign.field_name ?? 'file', file);
    const uploadRes = await fetch(presign.upload_url, {
      method: presign.method ?? 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
      body: formData,
    });
    if (!uploadRes.ok) throw new Error('文件上传失败');
    const { public_url } = await uploadRes.json();
    return public_url;
  };

  // ─── Lesson CRUD ─────────────────────────────────────────────────────────────
  const openLessonModal = (classId: string) => {
    setSentences([{ text: '' }]);
    lessonForm.resetFields();
    setLessonModal({ open: true, classId });
  };

  const saveLesson = async () => {
    const vals = await lessonForm.validateFields();
    if (!vals.imageFile?.fileList?.[0]) { message.error('请上传封面图'); return; }
    if (sentences.some(s => !s.text.trim())) { message.error('每句内容不能为空'); return; }

    setUploading(true);
    try {
      const imageFile = vals.imageFile.fileList[0].originFileObj as File;
      const imageUrl = await uploadFile(imageFile, 'lesson_image');

      const sentencesData: Sentence[] = await Promise.all(
        sentences.map(async (s) => {
          const audioRaw = s.audioUrl as unknown;
          if (audioRaw instanceof File) {
            const url = await uploadFile(audioRaw, 'lesson_audio');
            return { text: s.text, audioUrl: url };
          }
          return { text: s.text, audioUrl: s.audioUrl };
        })
      );

      await api.post('/lessons', {
        classId: lessonModal.classId,
        title: vals.title,
        imageUrl,
        sentences: sentencesData,
      });

      message.success('课程已创建');
      setLessonModal({ open: false, classId: null });
      if (lessonModal.classId) fetchLessons(lessonModal.classId);
      fetchClasses();
    } catch { message.error('上传失败，请重试'); }
    finally { setUploading(false); }
  };

  const addSentence = () => setSentences(prev => [...prev, { text: '' }]);
  const removeSentence = (i: number) => setSentences(prev => prev.filter((_, idx) => idx !== i));
  const updateSentenceText = (i: number, text: string) =>
    setSentences(prev => prev.map((s, idx) => idx === i ? { ...s, text } : s));
  const updateSentenceAudio = (i: number, file: File) =>
    setSentences(prev => prev.map((s, idx) => idx === i ? { ...s, audioUrl: file as any } : s));

  // ─── Table columns ───────────────────────────────────────────────────────────
  const columns = [
    { title: '班级名称', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    { title: '描述', dataIndex: 'description', key: 'desc', render: (v?: string) => v || '-' },
    { title: '学生数', key: 'students', render: (_: any, r: Class) => <Tag color="blue">{r._count.students} 人</Tag> },
    { title: '课程数', key: 'lessons', render: (_: any, r: Class) => <Tag color="green">{r._count.lessons} 课</Tag> },
    {
      title: '操作', key: 'ops', render: (_: any, r: Class) => (
        <Space>
          <Tooltip title="编辑班级">
            <Button size="small" icon={<EditOutlined />} onClick={() => openClassModal(r)} />
          </Tooltip>
          <Tooltip title="添加课程">
            <Button size="small" icon={<BookOutlined />} type="primary" onClick={() => openLessonModal(r.id)} />
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
          onExpand: (expanded, record) => { if (expanded) fetchLessons(record.id); },
          expandedRowRender: (record) => (
            <Card size="small" title="课程列表" extra={
              <Button size="small" icon={<PlusOutlined />} onClick={() => openLessonModal(record.id)}>添加课程</Button>
            }>
              <List
                dataSource={lessons[record.id] || []}
                locale={{ emptyText: '暂无课程' }}
                renderItem={(lesson: Lesson) => (
                  <List.Item>
                    <List.Item.Meta title={lesson.title} description={`${lesson._count.sentences} 句`} />
                  </List.Item>
                )}
              />
            </Card>
          ),
        }}
      />

      {/* Class Modal */}
      <Modal title={editingClass ? '编辑班级' : '新建班级'} open={classModal}
        onOk={saveClass} onCancel={() => setClassModal(false)} okText="保存" cancelText="取消">
        <Form form={classForm} layout="vertical">
          <Form.Item name="name" label="班级名称" rules={[{ required: true }]}>
            <Input placeholder="如：三年级一班" />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <Input.TextArea rows={3} placeholder="班级描述" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Lesson Modal */}
      <Modal title="添加跟读课程" open={lessonModal.open} onOk={saveLesson}
        onCancel={() => setLessonModal({ open: false, classId: null })}
        okText="保存课程" cancelText="取消" confirmLoading={uploading} width={640}>
        <Form form={lessonForm} layout="vertical">
          <Form.Item name="title" label="课程标题" rules={[{ required: true }]}>
            <Input placeholder="如：Lesson 1 - Hello World" />
          </Form.Item>
          <Form.Item name="imageFile" label="封面图（儿童画）" rules={[{ required: true, message: '请上传封面图' }]}>
            <Upload accept="image/*" maxCount={1} beforeUpload={() => false} listType="picture-card">
              <div><UploadOutlined /><div>上传图片</div></div>
            </Upload>
          </Form.Item>
          <Form.Item label="句子列表" required>
            {sentences.map((s, i) => (
              <Card key={i} size="small" style={{ marginBottom: 12 }}
                extra={sentences.length > 1 && <Button size="small" danger onClick={() => removeSentence(i)}>删除</Button>}>
                <Input
                  value={s.text} placeholder={`第 ${i + 1} 句英文内容`}
                  onChange={e => updateSentenceText(i, e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <Upload accept="audio/*" maxCount={1} beforeUpload={(file) => { updateSentenceAudio(i, file); return false; }}>
                  <Button icon={<UploadOutlined />} size="small">上传参考音频（可选）</Button>
                </Upload>
              </Card>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addSentence} block>添加句子</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ClassesPage;
