import React, { useState, useEffect } from 'react';
import {
  Button, Modal, Form, Input, Upload, Card, Tag, Tooltip, Popover,
  message, Popconfirm, Typography, List, Image, Divider, Empty, Spin,
  Tabs, Collapse, Checkbox, Space
} from 'antd';
import {
  PlusOutlined, UploadOutlined, EyeOutlined,
  DeleteOutlined, EditOutlined, PlayCircleOutlined, PauseCircleOutlined,
  FolderOpenOutlined, AppstoreOutlined, FolderOutlined
} from '@ant-design/icons';
import api from '../lib/api';

const { Title, Text, Paragraph } = Typography;

interface Lesson {
  id: string;
  title: string;
  imageUrl: string;
  masterAudioUrl?: string | null;
  _count: { sentences: number };
  classLessons: { classId: string }[];
  lessonGroupItems?: { groupId: string }[];
}

interface LessonGroup {
  id: string;
  name: string;
}

interface Sentence {
  id: string;
  text: string;
  audioUrl?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  imageUrl?: string | null;
  orderIndex: number;
}

interface LessonDetail extends Lesson {
  sentences: Sentence[];
}

interface SentenceForm {
  text: string;
  audioUrl?: string | File | null;
  startTime?: number | null;
  endTime?: number | null;
  imageUrl?: string | File | null;
}

const LessonsPage: React.FC = () => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sentences, setSentences] = useState<SentenceForm[]>([{ text: '' }]);
  const [detailModal, setDetailModal] = useState<{ open: boolean; lesson: LessonDetail | null }>({ open: false, lesson: null });
  const [form] = Form.useForm();

  // ----- Lesson Groups State -----
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [groupModal, setGroupModal] = useState<{ open: boolean; } & Partial<LessonGroup>>({ open: false });
  const [groupForm] = Form.useForm();
  
  const [assignGroupModal, setAssignGroupModal] = useState<{ open: boolean; lessonId: string | null; selectedGroups: string[] }>({ 
    open: false, lessonId: null, selectedGroups: [] 
  });
  // ------------------------------

  const masterAudioUrl = Form.useWatch('masterAudioUrl', form);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!createModal) {
      audioRef.current?.pause();
      setPlayingIndex(null);
    }
  }, [createModal]);

  const handlePlaySegment = (index: number) => {
    if (!masterAudioUrl) {
      message.warning('主音频未上传，无法播放');
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;

    if (playingIndex === index) {
      audio.pause();
      setPlayingIndex(null);
    } else {
      const sentence = sentences[index];
      if (sentence.startTime != null && sentence.endTime != null) {
        audio.currentTime = sentence.startTime;
        audio.play().catch(e => console.error("音频播放失败", e));
        setPlayingIndex(index);
      }
    }
  };

  useEffect(() => { 
    fetchLessons(); 
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const { data } = await api.get('/lesson-groups');
      setGroups(data);
    } catch {
      message.error('获取分组失败');
    }
  };

  const fetchLessons = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/lessons');
      setLessons(data);
    } finally { setLoading(false); }
  };

  // ─── Group Management ──────────────────────────────────────────────────────────
  const handleSaveGroup = async () => {
    try {
      const vals = await groupForm.validateFields();
      if (groupModal.id) {
        await api.put(`/lesson-groups/${groupModal.id}`, vals);
        message.success('分组已更新');
      } else {
        await api.post('/lesson-groups', vals);
        message.success('分组已创建');
      }
      setGroupModal({ open: false });
      fetchGroups();
    } catch {
      message.error('保存分组失败');
    }
  };

  const handleDeleteGroup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent panel toggle
    try {
      await api.delete(`/lesson-groups/${id}`);
      message.success('分组已删除');
      fetchGroups();
    } catch {
      message.error('删除分组失败');
    }
  };

  const openAssignGroupModal = (lesson: Lesson) => {
    const selected = lesson.lessonGroupItems?.map(i => i.groupId) || [];
    setAssignGroupModal({ open: true, lessonId: lesson.id, selectedGroups: selected });
  };

  const handleAssignGroups = async () => {
    if (!assignGroupModal.lessonId) return;
    try {
      await api.post(`/lessons/${assignGroupModal.lessonId}/groups`, {
        groupIds: assignGroupModal.selectedGroups
      });
      message.success('分组指派已更新');
      setAssignGroupModal({ open: false, lessonId: null, selectedGroups: [] });
      fetchLessons(); // reload lessons to mirror groups
    } catch {
      message.error('指派分组失败');
    }
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
    const { data } = await api.post(presign.upload_url, formData, {
      baseURL: '' // Prevent appending base URL if presign.upload_url is somehow relative, though it's absolute
    });
    const { public_url } = data;
    return public_url;
  };

  // ─── Create/Edit lesson ───────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingLessonId(null);
    setSentences([{ text: '' }]);
    form.resetFields();
    setCreateModal(true);
  };

  const openEditModal = async (lesson: Lesson) => {
    try {
      setLoading(true);
      const { data } = await api.get(`/lessons/${lesson.id}`);
      const lessonDetail = data as LessonDetail;
      setEditingLessonId(lesson.id);
      // Strip DB-only fields (id, lessonId, orderIndex) so they aren't sent back to createMany
      setSentences(lessonDetail.sentences.length > 0
        ? lessonDetail.sentences.map(s => ({
            text: s.text,
            audioUrl: s.audioUrl ?? null,
            startTime: s.startTime ?? null,
            endTime: s.endTime ?? null,
            imageUrl: s.imageUrl ?? null,
          }))
        : [{ text: '' }]);
      form.setFieldsValue({
        title: lessonDetail.title,
        masterAudioUrl: lessonDetail.masterAudioUrl,
        imageFile: [
          {
            uid: '-1',
            name: '当前封面图',
            status: 'done',
            url: lessonDetail.imageUrl,
            thumbUrl: lessonDetail.imageUrl,
          },
        ],
      });
      setCreateModal(true);
    } catch {
      message.error('获取课程详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribeAudio = async (file: File) => {
    try {
      setUploading(true);
      message.loading({ content: 'AI智能识别中，请耐心等待 (约需几十秒)...', key: 'transcribe', duration: 0 });
      
      // 1. 发给云端识别
      const fd = new FormData();
      fd.append('audio', file);
      const { data } = await api.post('/api/transcribe', fd, { baseURL: '' });
      
      // 2. 正常上传原文件作为 masterAudioUrl
      message.loading({ content: '正在上传音频主文件...', key: 'transcribe', duration: 0 });
      const publicUrl = await uploadFile(file, 'lesson_audio');
      form.setFieldsValue({ masterAudioUrl: publicUrl });

      if (data.sentences && data.sentences.length > 0) {
        setSentences(data.sentences.map((s: any) => ({
          text: s.text,
          startTime: s.startTime,
          endTime: s.endTime,
        })));
        message.success({ content: `识别成功！分成了 ${data.sentences.length} 句话`, key: 'transcribe' });
      } else {
        message.warning({ content: '识别成功，但没有解析出内容', key: 'transcribe' });
      }
    } catch (err: any) {
      message.error({ content: err.response?.data?.message || '智能识别失败', key: 'transcribe' });
    } finally {
      setUploading(false);
    }
    return false; // Prevent default upload
  };

  const saveLesson = async () => {
    const vals = await form.validateFields();
    if (!vals.imageFile || vals.imageFile.length === 0) { message.error('请上传封面图'); return; }
    if (sentences.some(s => !s.text.trim())) { message.error('每句内容不能为空'); return; }

    setUploading(true);
    try {
      let imageUrl = '';
      const selectedImage = vals.imageFile[0];
      if (selectedImage.originFileObj) {
        imageUrl = await uploadFile(selectedImage.originFileObj as File, 'lesson_image');
      } else {
        imageUrl = selectedImage.url; // old image URL
      }

      const masterAudioRaw = form.getFieldValue('masterAudioUrl');
      let masterAudioUrl = typeof masterAudioRaw === 'string' ? masterAudioRaw : null;
      if (masterAudioRaw instanceof File) {
         masterAudioUrl = await uploadFile(masterAudioRaw, 'lesson_audio');
      }

      const sentencesData = await Promise.all(
        sentences.map(async (s) => {
          let audioUrl = typeof s.audioUrl === 'string' ? s.audioUrl : null;
          if (s.audioUrl instanceof File) {
            audioUrl = await uploadFile(s.audioUrl, 'lesson_audio');
          }
          let sentenceImgUrl = typeof s.imageUrl === 'string' ? s.imageUrl : null;
          if (s.imageUrl instanceof File) {
            sentenceImgUrl = await uploadFile(s.imageUrl, 'lesson_image');
          }
          // Only send the fields expected by the API — never include id/lessonId/orderIndex
          return {
            text: s.text,
            audioUrl: audioUrl ?? null,
            startTime: s.startTime ?? null,
            endTime: s.endTime ?? null,
            imageUrl: sentenceImgUrl ?? null,
          };
        })
      );

      if (editingLessonId) {
        // Update
        await api.put(`/lessons/${editingLessonId}`, { title: vals.title, imageUrl, masterAudioUrl });
        await api.post(`/lessons/${editingLessonId}/sentences`, { sentences: sentencesData });
        message.success('课程已更新');
      } else {
        // Create
        await api.post('/lessons', { title: vals.title, imageUrl, masterAudioUrl, sentences: sentencesData });
        message.success('课程已创建并加入课程库');
      }

      setCreateModal(false);
      fetchLessons();
    } catch {
      message.error('保存失败，请重试');
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
  const removeSentence = (i: number) => {
    if (i === 0) {
      setSentences(prev => prev.filter((_, idx) => idx !== 0));
    } else {
      setSentences(prev => {
        const next = [...prev];
        const prevSentence = next[i - 1];
        const currentSentence = next[i];
        
        next[i - 1] = {
          ...prevSentence,
          text: (prevSentence.text + ' ' + currentSentence.text).trim(),
          endTime: currentSentence.endTime ?? prevSentence.endTime,
        };
        
        return next.filter((_, idx) => idx !== i);
      });
    }
  };
  const updateSentence = (i: number, update: Partial<SentenceForm>) => 
    setSentences(prev => prev.map((s, idx) => idx === i ? { ...s, ...update } : s));

  const renderLessonCard = (lesson: Lesson) => (
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
        <Tooltip title="指派分组" key="assignGroup">
          <FolderOpenOutlined onClick={() => openAssignGroupModal(lesson)} style={{ color: '#ff385c' }} />
        </Tooltip>,
        <Tooltip title="编辑" key="edit">
          <EditOutlined onClick={() => openEditModal(lesson)} style={{ color: '#1677ff' }} />
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
              <Tag color="green">已分配 {lesson.classLessons.length} 班级</Tag>
            )}
          </div>
        }
      />
    </Card>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>课程库</Title>
        <Space>
          <Button type="default" icon={<FolderOutlined />} onClick={() => {
            groupForm.resetFields();
            setGroupModal({ open: true });
          }}>
            新建分组
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建课程
          </Button>
        </Space>
      </div>

      <Tabs defaultActiveKey="all" style={{ marginBottom: 24 }}>
        <Tabs.TabPane tab={<Space><AppstoreOutlined /> 全部课程</Space>} key="all">
          <Spin spinning={loading}>
            {lessons.length === 0 && !loading ? (
              <Empty description="课程库为空，点击「新建课程」开始创建" style={{ marginTop: 80 }} />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                {lessons.map(renderLessonCard)}
              </div>
            )}
          </Spin>
        </Tabs.TabPane>
        
        <Tabs.TabPane tab={<Space><FolderOpenOutlined /> 分组浏览</Space>} key="grouped">
          {groups.length === 0 ? (
            <Empty description="暂无分组，点击右上角「新建分组」开始组织您的课程" style={{ marginTop: 80 }} />
          ) : (
            <Collapse defaultActiveKey={groups.map(g => g.id)} ghost>
              {groups.map(group => {
                const groupLessons = lessons.filter(l => l.lessonGroupItems?.some(gi => gi.groupId === group.id));
                return (
                  <Collapse.Panel 
                    key={group.id} 
                    header={
                      <Space>
                        <FolderOutlined style={{ color: '#ff385c' }} />
                        <Text strong style={{ fontSize: 16 }}>{group.name}</Text>
                        <Tag color="red">{groupLessons.length} 课</Tag>
                      </Space>
                    }
                    extra={
                      <Space>
                        <Tooltip title="编辑分组名称">
                          <Button 
                            type="text" 
                            size="small" 
                            icon={<EditOutlined />} 
                            onClick={(e) => {
                              e.stopPropagation();
                              groupForm.setFieldsValue({ name: group.name });
                              setGroupModal({ open: true, id: group.id, name: group.name });
                            }} 
                          />
                        </Tooltip>
                        <Popconfirm 
                          title="确定要删除该分组吗？（仅删除分组，组内课程不会被删除）" 
                          onConfirm={(e) => handleDeleteGroup(group.id, e as React.MouseEvent)} 
                          onCancel={(e) => e?.stopPropagation()}
                          okText="删除" cancelText="取消"
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                        </Popconfirm>
                      </Space>
                    }
                    style={{ background: '#f2f2f2', borderRadius: 12, marginBottom: 16, border: 'none' }}
                  >
                    {groupLessons.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该分组下暂无课程" />
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                        {groupLessons.map(renderLessonCard)}
                      </div>
                    )}
                  </Collapse.Panel>
                );
              })}
            </Collapse>
          )}
        </Tabs.TabPane>
      </Tabs>

      {/* ── Create/Edit Lesson Modal ──────────────────────────────────────────── */}
      <Modal
        title={editingLessonId ? "编辑课程" : "新建课程"}
        open={createModal}
        destroyOnClose
        onOk={saveLesson}
        onCancel={() => setCreateModal(false)}
        okText={editingLessonId ? "保存课程修改" : "保存到课程库"}
        cancelText="取消"
        confirmLoading={uploading}
        width={640}
      >
        <Form form={form} layout="vertical">
          <audio 
            ref={audioRef} 
            src={masterAudioUrl || undefined}
            style={{ display: 'none' }} 
            onTimeUpdate={() => {
              if (playingIndex !== null && audioRef.current) {
                const sentence = sentences[playingIndex];
                if (sentence && sentence.endTime != null) {
                  if (audioRef.current.currentTime >= sentence.endTime) {
                    audioRef.current.pause();
                    setPlayingIndex(null);
                  }
                }
              }
            }}
            onEnded={() => setPlayingIndex(null)}
          />
          <Form.Item name="masterAudioUrl" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="课程标题" rules={[{ required: true }]}>
            <Input placeholder="如：Lesson 1 - Hello World" />
          </Form.Item>
          <Form.Item 
            name="imageFile" 
            label="封面图" 
            valuePropName="fileList"
            getValueFromEvent={(e: any) => Array.isArray(e) ? e : e?.fileList}
            rules={[{ required: true, message: '请上传封面图' }]}
          >
            <Upload accept="image/*" maxCount={1} beforeUpload={() => false} listType="picture">
              <Button icon={<UploadOutlined />}>更换 / 上传图片</Button>
            </Upload>
          </Form.Item>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
            <div style={{ flex: 1 }}>
              <Text strong>智能打轴模式</Text>
              <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
                上传一段主音频，AI会自动识别英文并切分成带时间戳的若干句子。
              </Paragraph>
              <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Upload accept="audio/*" showUploadList={false} beforeUpload={handleTranscribeAudio}>
                  <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                    上传主音频并智能分句
                  </Button>
                </Upload>
                {form.getFieldValue('masterAudioUrl') && (
                  <Tag color="green">已绑定主音频</Tag>
                )}
              </div>
            </div>
          </div>
          <Divider dashed />

          <Form.Item label="句子与插图时间轴" required>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sentences.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    background: '#fafafa',
                    borderRadius: 8,
                    border: '1px solid #f0f0f0'
                  }}
                >
                  <div style={{ width: 140, flexShrink: 0, textAlign: 'center' }}>
                    {(s.startTime != null && s.endTime != null) ? (
                      <Tag 
                        color={playingIndex === i ? "red" : "default"} 
                        style={{ margin: 0, cursor: 'pointer', padding: '2px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        onClick={() => handlePlaySegment(i)}
                      >
                        {playingIndex === i ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        <span>{s.startTime?.toFixed(2)}s - {s.endTime?.toFixed(2)}s</span>
                      </Tag>
                    ) : (
                      <Tag style={{ margin: 0 }}>无时间轴</Tag>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <Input.TextArea
                      value={s.text}
                      placeholder={`第 ${i + 1} 句英文内容`}
                      onChange={e => updateSentence(i, { text: e.target.value })}
                      autoSize={{ minRows: 1, maxRows: 4 }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {typeof s.imageUrl === 'string' && (
                      <Popover
                        content={<img src={s.imageUrl} alt="preview" style={{ maxWidth: 200, maxHeight: 200, objectFit: 'contain' }} />}
                        title="图片预览"
                        trigger="hover"
                        placement="top"
                      >
                        <Tag color="orange" style={{ margin: 0, cursor: 'pointer' }}>已有图</Tag>
                      </Popover>
                    )}
                    {s.imageUrl instanceof File && <Tag color="blue" style={{ margin: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.imageUrl.name}>待传图</Tag>}
                    
                    <Upload
                      accept="image/*"
                      maxCount={1}
                      showUploadList={false}
                      beforeUpload={(file) => { updateSentence(i, { imageUrl: file }); return false; }}
                    >
                      <Button icon={<UploadOutlined />} size="small">
                        {s.imageUrl ? '换图' : '加图'}
                      </Button>
                    </Upload>

                    {s.imageUrl && (
                      <Button size="small" type="text" danger onClick={() => updateSentence(i, { imageUrl: null })}>
                        清空
                      </Button>
                    )}

                    {sentences.length > 1 && (
                      <Tooltip title={i === 0 ? "删除该句" : "向上合并到上一句"}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeSentence(i)} />
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={addSentence} block>
                添加句子
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Lesson Detail Modal ───────────────────────────────────────────────── */}
      <Modal
        title={detailModal.lesson?.title}
        open={detailModal.open}
        destroyOnClose
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
            <Divider>句子与时间轴（{detailModal.lesson.sentences.length} 句）</Divider>
            {detailModal.lesson.masterAudioUrl && (
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
                <audio controls src={detailModal.lesson.masterAudioUrl} style={{ width: '100%' }} />
              </div>
            )}
            <List
              dataSource={detailModal.lesson.sentences}
              renderItem={(s, i) => (
                <List.Item
                  style={{ padding: '8px 0', flexDirection: 'column', alignItems: 'flex-start' }}
                >
                  <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Tag color="red">{i + 1}</Tag>
                      <Paragraph style={{ margin: 0 }}>{s.text}</Paragraph>
                    </div>
                    <div>
                      {(s.startTime !== null && s.endTime !== null) && (
                        <Tag>{s.startTime?.toFixed(1)}s - {s.endTime?.toFixed(1)}s</Tag>
                      )}
                      {s.audioUrl && (
                        <audio controls preload="none" src={s.audioUrl} style={{ height: 32, width: 180, marginLeft: 8 }} />
                      )}
                    </div>
                  </div>
                  {s.imageUrl && (
                    <div style={{ marginTop: 8, marginLeft: 40 }}>
                      <Tag color="orange">换图点</Tag>
                      <Image src={s.imageUrl as string} height={60} style={{ borderRadius: 4 }} preview={false} />
                    </div>
                  )}
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>

      {/* ── Create/Edit Group Modal ───────────────────────────────────────────── */}
      <Modal
        title={groupModal.id ? "编辑分组" : "新建分组"}
        open={groupModal.open}
        onOk={handleSaveGroup}
        onCancel={() => setGroupModal({ open: false })}
        okText="保存"
        cancelText="取消"
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="例如：一年级绘本" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Assign Groups to Lesson Modal ─────────────────────────────────────── */}
      <Modal
        title="指派课程到分组"
        open={assignGroupModal.open}
        onOk={handleAssignGroups}
        onCancel={() => setAssignGroupModal({ open: false, lessonId: null, selectedGroups: [] })}
        okText="确认"
        cancelText="取消"
      >
        {groups.length === 0 ? (
          <Empty description="暂无分组，请先在右上角新建分组" />
        ) : (
          <Checkbox.Group
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
            value={assignGroupModal.selectedGroups}
            onChange={(checkedValues) => {
              setAssignGroupModal(prev => ({ ...prev, selectedGroups: checkedValues as string[] }));
            }}
          >
            {groups.map(g => (
              <div 
                key={g.id}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '12px 16px', 
                  border: '1px solid rgba(0,0,0,0.04)', 
                  borderRadius: 6,
                  background: assignGroupModal.selectedGroups.includes(g.id) ? 'rgba(255,56,92,0.05)' : '#ffffff',
                  transition: 'all 0.3s'
                }}
              >
                <Checkbox value={g.id}>
                  <Text strong style={{ marginLeft: 8 }}>{g.name}</Text>
                </Checkbox>
              </div>
            ))}
          </Checkbox.Group>
        )}
      </Modal>
    </div>
  );
};

export default LessonsPage;
