// pages/lessons/lessons.js
const { request } = require('../../utils/request');
const { getUserInfo, logout } = require('../../utils/auth');

Page({
  data: {
    lessons: [],
    loading: true,
    userInfo: null,
    classId: null,
  },

  onLoad(options) {
    const user = getUserInfo();
    const classId = options.classId || user?.classId;
    this.setData({ userInfo: user, classId });
    if (classId) {
      this.loadLessons(classId);
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: '未分配班级，请联系老师', icon: 'none', duration: 3000 });
    }
  },

  onShow() {
    // 每次显示时刷新（跟读完成后返回可更新状态）
    const { classId } = this.data;
    if (classId) this.loadLessons(classId);
  },

  async loadLessons(classId) {
    this.setData({ loading: true });
    try {
      const lessons = await request({ url: `/lessons?class_id=${classId}` });

      const themes = ['theme-primary', 'theme-secondary', 'theme-tertiary'];
      const enrichedLessons = lessons.map((l, index) => {
        const totalSentences = l._count?.sentences || 0;
        
        // 读取本地存储中的分句跟读记录
        const localRecordings = wx.getStorageSync(`lesson_recordings_${l.id}`) || {};
        // 已完成的句子数等于存储的有效录音记录数
        const completed = Object.keys(localRecordings).length;

        const progressPercent = totalSentences > 0 ? Math.round((completed / totalSentences) * 100) : 0;
        
        return {
          ...l,
          totalSentences,
          completedSentences: completed,
          progressPercent,
          colorTheme: themes[index % themes.length]
        };
      });

      this.setData({ lessons: enrichedLessons, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err.message || '加载失败，请重试', icon: 'none' });
    }
  },

  onLessonTap(e) {
    const { id, theme } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/reading/reading?lessonId=${id}&theme=${theme || 'theme-primary'}` });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出吗？',
      success: (res) => { if (res.confirm) logout(); },
    });
  },
});
