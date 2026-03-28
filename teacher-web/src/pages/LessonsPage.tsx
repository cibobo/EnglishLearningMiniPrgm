import React, { useState, useEffect } from 'react';
import {
  Button, Modal, Form, Input, Upload, Card, Tag, Tooltip,
  message, Popconfirm, Typography, List, Image, Divider, Empty, Spin,
} from 'antd';
import {
  PlusOutlined, UploadOutlined, EyeOutlined,
  DeleteOutlined, SoundOutlined, EditOutlined,
} from '@ant-design/icons';
import api from '../lib/api';

const { Title, Text, Paragraph } = Typography;

interface Lesson {
  id: string;
  title: string;
  imageUrl: string;
  _count: { sentences: number };
  classLessons: { classId: string }[];
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

interface SentenceForm {
  text: string;
  audioUrl?: string;
}

const LessonsPage: React.FC = () => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sentences, setSentences] = useState<SentenceForm[]>([{ text: '' }]);
  const [detailModal, setDetailModal] = useState<{ open: boolean; lesson: LessonDetail | null }>({ open: false, lesson: null });
  const [form] = Form.useForm();

  useEffect(() => { fetchLessons(); }, []);

  const fetchLessons = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/lessons');
      setLessons(data);
    } finally { setLoading(false); }
  };

  // ─── Upload helper ───────────────────────────────────────────────────────────
  const uploadFile = async (file: File, category: string): Promise<string> => {
    const { data: presign } = await api.post('/upload/presign', {
      filename: file.name,
      content_type: file.type,
      category,
    });
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

  // ─── Create lesson ───────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setSentences([{ text: '' }]);
    form.resetFields();
    setCreateModal(true);
  };

  const saveLesson = async () => {
    const vals = await form.validateFields();
    if (!vals.imageFile?.fileList?.[0]) { message.error('请上传封面图'); return; }
    if (sentences.some(s => !s.text.trim())) { message.error('每句内容不能为空'); return; }

    setUploading(true);
    try {
      const imageFile = vals.imageFile.fileList[0].originFileObj as File;
      const imageUrl = await uploadFile(imageFile, 'lesson_image');

      const sentencesData = await Promise.all(
        sentences.map(async (s) => {
          const audioRaw = s.audioUrl as unknown;
          if (audioRaw instanceof File) {
            const url = await uploadFile(audioRaw, 'lesson_audio');
            return { text: s.text, audioUrl: url };
          }
          return { text: s.text };
        })
      );

      await api.post('/lessons', { title: vals.title, imageUrl, sentences: sentencesData });
      message.success('课程已创建并加入课程库');
      setCreateModal(false);
      fetchLessons();
    } catch {
      message.error('创建失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const deleteLesson = async (id: string) => {
    await api.delete(`/lessons/${id}`);
    message.success('课程已删除');
    fetchLessons();
  };

  const openDetail = async (lesson: Lesson) => {
    const { data } = await api.get(`/lessons/${lesson.id}`);
    setDetailModal({ open: true, lesson: data as LessonDetail });
  };

  const addSentence = () => setSentences(prev => [...prev, { text: '' }]);
  const removeSentence = (i: number) => setSentences(prev => prev.filter((_, idx) => idx !== i));
  const updateSentenceText = (i: number, text: string) =>
    setSentences(prev => prev.map((s, idx) => idx === i ? { ...s, text } : s));
  const updateSentenceAudio = (i: number, file: File) =>
    setSentences(prev => prev.map((s, idx) => idx === i ? { ...s, audioUrl: file as unknown as string } : s));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>课程库</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建课程
        </Button>
      </div>

      {/* Lesson grid */}
      <Spin spinning={loading}>
        {lessons.length === 0 && !loading ? (
          <Empty description="课程库为空，点击「新建课程」开始创建" style={{ marginTop: 80 }} />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            {lessons.map(lesson => (
              <Card
                key={lesson.id}
                hoverable
                style={{ width: 220 }}
                cover={
                  <Image
                    src={lesson.imageUrl}
                    alt={lesson.title}
                    height={140}
                    style={{ objectFit: 'cover' }}
                    preview={false}
                    fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='140'%3E%3Crect width='220' height='140' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23bbb' font-size='14'%3E暂无图片%3C/text%3E%3C/svg%3E"
                  />
                }
                actions={[
                  <Tooltip title="查看详情" key="view">
                    <EyeOutlined onClick={() => openDetail(lesson)} />
                  </Tooltip>,
                  <Tooltip title="编辑（开发中）" key="edit">
                    <EditOutlined style={{ color: '#aaa' }} />
                  </Tooltip>,
                  <Popconfirm
                    key="delete"
                    title="删除后无法恢复，确定删除？"
                    onConfirm={() => deleteLesson(lesson.id)}
                    okText="删除" cancelText="取消"
                  >
                    <Tooltip title="删除课程">
                      <DeleteOutlined style={{ color: '#ff4d4f' }} />
                    </Tooltip>
                  </Popconfirm>,
                ]}
              >
                <Card.Meta
                  title={<Text ellipsis={{ tooltip: lesson.title }}>{lesson.title}</Text>}
                  description={
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      <Tag color="blue">{lesson._count.sentences} 句</Tag>
                      {lesson.classLessons.length > 0 && (
                        <Tag color="green">已分配 {lesson.classLessons.length} 个班级</Tag>
                      )}
                    </div>
                  }
                />
              </Card>
            ))}
          </div>
        )}
      </Spin>

      {/* ── Create Lesson Modal ───────────────────────────────────────────────── */}
      <Modal
        title="新建课程"
        open={createModal}
        onOk={saveLesson}
        onCancel={() => setCreateModal(false)}
        okText="保存到课程库"
        cancelText="取消"
        confirmLoading={uploading}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="课程标题" rules={[{ required: true }]}>
            <Input placeholder="如：Lesson 1 - Hello World" />
          </Form.Item>
          <Form.Item name="imageFile" label="封面图" rules={[{ required: true, message: '请上传封面图' }]}>
            <Upload accept="image/*" maxCount={1} beforeUpload={() => false} listType="picture-card">
              <div><UploadOutlined /><div>上传图片</div></div>
            </Upload>
          </Form.Item>
          <Form.Item label="句子列表" required>
            {sentences.map((s, i) => (
              <Card
                key={i}
                size="small"
                style={{ marginBottom: 12 }}
                extra={sentences.length > 1 && (
                  <Button size="small" danger onClick={() => removeSentence(i)}>删除</Button>
                )}
              >
                <Input
                  value={s.text}
                  placeholder={`第 ${i + 1} 句英文内容`}
                  onChange={e => updateSentenceText(i, e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <Upload
                  accept="audio/*"
                  maxCount={1}
                  beforeUpload={(file) => { updateSentenceAudio(i, file); return false; }}
                >
                  <Button icon={<UploadOutlined />} size="small">上传参考音频（可选）</Button>
                </Upload>
              </Card>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addSentence} block>
              添加句子
            </Button>
          </Form.Item>
        </Form>
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

export default LessonsPage;
