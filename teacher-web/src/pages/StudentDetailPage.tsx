import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Descriptions, Progress, Tag, Button, Space,
  Typography, Skeleton, message, Collapse, Popconfirm, Spin,
} from 'antd';
import {
  ArrowLeftOutlined, PlayCircleOutlined, PauseCircleOutlined,
  DeleteOutlined, SoundOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';

const { Title, Text } = Typography;
const { Panel } = Collapse;

interface Sentence {
  id: string; text: string; orderIndex: number;
}
interface Submission {
  id: string;
  status: string;
  submittedAt: string;
  audioUrl?: string;
  sentence?: { id: string; text: string; orderIndex: number } | null;
  lesson: { id: string; title: string; sentences: Sentence[] };
}
interface LessonGroup {
  lessonId: string;
  lessonTitle: string;
  sentenceCount: number;
  submissionCount: number;
  submissions: Submission[];
}
interface Progress_ {
  student: { id: string; name: string; studentCode: string; class?: { name: string } };
  totalLessons: number;
  completedLessons: number;
  submissions: Submission[];
  lessonGroups: LessonGroup[];
}

const StudentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<Progress_ | null>(null);
  const [loading, setLoading] = useState(true);

  // Audio state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [listenedIds, setListenedIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => { fetchProgress(); }, [id]);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/students/${id}/progress`);
      setProgress(data);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  const handlePlay = async (recordingId: string) => {
    // Toggle off if already playing
    if (playingId === recordingId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // Stop any current audio
    audioRef.current?.pause();
    setPlayingId(null);

    // Get URL (cached or fetch)
    let url = resolvedUrls[recordingId];
    if (!url) {
      setLoadingId(recordingId);
      try {
        const { data } = await api.get(`/recordings/${recordingId}/url`);
        url = data.url;
        setResolvedUrls(prev => ({ ...prev, [recordingId]: url }));
      } catch {
        message.error('获取播放链接失败');
        setLoadingId(null);
        return;
      }
      setLoadingId(null);
    }

    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().catch(() => message.error('播放失败'));
      setPlayingId(recordingId);

      // Mark as reviewed on first listen (fire-and-forget, don't block playback)
      if (!listenedIds.has(recordingId)) {
        setListenedIds(prev => new Set(prev).add(recordingId));
        // Update local progress state immediately for instant UI feedback
        setProgress(prev => {
          if (!prev) return prev;
          const updatedGroups = prev.lessonGroups.map(group => ({
            ...group,
            submissions: group.submissions.map(sub =>
              sub.id === recordingId ? { ...sub, status: 'reviewed' } : sub
            ),
          }));
          return { ...prev, lessonGroups: updatedGroups };
        });
        // Persist to server in background
        api.patch(`/recordings/${recordingId}/status`, { status: 'reviewed' }).catch(() => {});
      }
    }
  };

  const handleDelete = async (recordingId: string) => {
    try {
      await api.delete(`/recordings/${recordingId}`);
      message.success('录音已删除');
      // Remove from cached urls
      setResolvedUrls(prev => { const n = { ...prev }; delete n[recordingId]; return n; });
      if (playingId === recordingId) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
      fetchProgress();
    } catch {
      message.error('删除失败');
    }
  };

  const handleAudioEnded = () => setPlayingId(null);

  if (loading) return <Skeleton active />;
  if (!progress) return <Text>学生不存在</Text>;

  const { student, totalLessons, completedLessons, lessonGroups } = progress;
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <div>
      {/* Hidden audio element */}
      <audio ref={audioRef} onEnded={handleAudioEnded} style={{ display: 'none' }} />

      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 20 }}>
        返回学生列表
      </Button>

      {/* Student Info Card */}
      <Card style={{ marginBottom: 20 }}>
        <Descriptions
          title={<Title level={4} style={{ margin: 0 }}>{student.name} 的学习详情</Title>}
          column={2}
        >
          <Descriptions.Item label="学生码">
            <Text code>{student.studentCode}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="班级">
            {student.class?.name || <Text type="secondary">未分班</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="课程完成进度" span={2}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>{completedLessons} / {totalLessons} 课</Text>
              <Progress percent={pct} strokeColor="#ff385c" />
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Lesson Groups */}
      <Card title="录音记录（按课程分组）">
        {lessonGroups.length === 0 ? (
          <Text type="secondary">该学生暂无录音记录</Text>
        ) : (
          <Collapse defaultActiveKey={lessonGroups.filter(g => g.submissionCount > 0).map(g => g.lessonId)}>
            {lessonGroups.map(group => (
              <Panel
                key={group.lessonId}
                header={
                  <Space>
                    <SoundOutlined />
                    <Text strong>{group.lessonTitle}</Text>
                    <Tag color={group.submissionCount > 0 ? 'blue' : 'default'}>
                      {group.submissionCount} / {group.sentenceCount} 句已提交
                    </Tag>
                  </Space>
                }
              >
                {group.submissions.length === 0 ? (
                  <Text type="secondary">该课程暂无录音</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.submissions.map((sub, idx) => {
                      // Use directly linked sentence if available (new recordings),
                      // otherwise fall back to position-based matching for old records
                      const sentenceText = sub.sentence?.text 
                        ?? sub.lesson?.sentences?.[idx]?.text 
                        ?? '（旧录音，无对应句子信息）';
                      const isPlaying = playingId === sub.id;
                      const isLoading = loadingId === sub.id;

                      return (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            background: isPlaying ? 'rgba(255,56,92,0.05)' : '#ffffff',
                            borderRadius: 12,
                            border: `1px solid ${isPlaying ? 'rgba(255,56,92,0.2)' : 'rgba(0,0,0,0.02)'}`,
                            boxShadow: isPlaying ? 'none' : 'rgba(0,0,0,0.02) 0px 0px 0px 1px',
                            transition: 'all 0.2s',
                          }}
                        >
                          {/* Play button */}
                          <Spin spinning={isLoading} size="small">
                            <Button
                              type={isPlaying ? 'primary' : 'default'}
                              shape="circle"
                              size="small"
                              icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                              onClick={() => handlePlay(sub.id)}
                            />
                          </Spin>

                          {/* Sentence text */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13 }}>{sentenceText}</Text>
                          </div>

                          {/* Meta */}
                          <Space size={6} style={{ flexShrink: 0 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(sub.submittedAt).toLocaleString('zh-CN')}
                            </Text>
                            {sub.status === 'reviewed'
                              ? <Tag color="green">已听</Tag>
                              : <Tag color="orange">未听</Tag>
                            }
                            <Popconfirm
                              title="确认删除这条录音？此操作不可恢复"
                              onConfirm={() => handleDelete(sub.id)}
                              okText="删除" cancelText="取消"
                              okButtonProps={{ danger: true }}
                            >
                              <Button
                                size="small" type="text" danger
                                icon={<DeleteOutlined />}
                              />
                            </Popconfirm>
                          </Space>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            ))}
          </Collapse>
        )}
      </Card>
    </div>
  );
};

export default StudentDetailPage;
