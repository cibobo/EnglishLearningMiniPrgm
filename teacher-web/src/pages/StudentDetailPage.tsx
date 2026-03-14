import React, { useState, useEffect } from 'react';
import {
  Card, Descriptions, Progress, Table, Tag, Button, Space,
  Typography, Skeleton, message, Modal
} from 'antd';
import { ArrowLeftOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';

const { Title, Text } = Typography;

interface Recording {
  id: string; status: string; submittedAt: string;
  lesson: { id: string; title: string };
}
interface Progress_ {
  student: { id: string; name: string; studentCode: string; class?: { name: string } };
  totalLessons: number; completedLessons: number;
  submissions: Recording[];
}

const StudentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<Progress_ | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioModal, setAudioModal] = useState<{ open: boolean; url: string; title: string }>({ open: false, url: '', title: '' });
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  useEffect(() => { fetchProgress(); }, [id]);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/students/${id}/progress`);
      setProgress(data);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  const playRecording = async (recordingId: string, title: string) => {
    setLoadingUrl(recordingId);
    try {
      const { data } = await api.get(`/recordings/${recordingId}/url`);
      setAudioModal({ open: true, url: data.url, title });
    } catch { message.error('获取播放链接失败'); }
    finally { setLoadingUrl(null); }
  };

  const markReviewed = async (recordingId: string) => {
    await api.patch(`/recordings/${recordingId}/status`, { status: 'reviewed' });
    fetchProgress();
  };

  const columns = [
    { title: '课程', dataIndex: ['lesson', 'title'], key: 'lesson' },
    {
      title: '提交时间', dataIndex: 'submittedAt', key: 'time',
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => v === 'reviewed'
        ? <Tag color="green">已听</Tag>
        : <Tag color="orange">未听</Tag>,
    },
    {
      title: '操作', key: 'ops',
      render: (_: any, r: Recording) => (
        <Space>
          <Button
            size="small" icon={<PlayCircleOutlined />}
            loading={loadingUrl === r.id}
            onClick={() => playRecording(r.id, r.lesson.title)}
          >播放录音</Button>
          {r.status === 'pending' && (
            <Button size="small" onClick={() => markReviewed(r.id)}>标记已听</Button>
          )}
        </Space>
      ),
    },
  ];

  if (loading) return <Skeleton active />;
  if (!progress) return <Text>学生不存在</Text>;

  const { student, totalLessons, completedLessons, submissions } = progress;
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 20 }}>
        返回学生列表
      </Button>

      <Card style={{ marginBottom: 20 }}>
        <Descriptions title={
          <Title level={4} style={{ margin: 0 }}>
            {student.name} 的学习详情
          </Title>
        } column={2}>
          <Descriptions.Item label="学生码">
            <Text code>{student.studentCode}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="班级">
            {student.class?.name || <Text type="secondary">未分班</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="课程完成进度" span={2}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>{completedLessons} / {totalLessons} 课</Text>
              <Progress percent={pct} strokeColor={{ '0%': '#4F46E5', '100%': '#10B981' }} />
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={`录音记录（共 ${submissions.length} 条）`}>
        <Table
          dataSource={submissions} columns={columns}
          rowKey="id" pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Audio Player Modal */}
      <Modal
        title={`🎧 播放录音 — ${audioModal.title}`}
        open={audioModal.open}
        onCancel={() => setAudioModal({ open: false, url: '', title: '' })}
        footer={null}
        width={480}
      >
        {audioModal.url && (
          <audio controls style={{ width: '100%' }} src={audioModal.url} autoPlay>
            您的浏览器不支持音频播放
          </audio>
        )}
      </Modal>
    </div>
  );
};

export default StudentDetailPage;
