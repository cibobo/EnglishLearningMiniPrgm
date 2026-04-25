// pages/lessons/lessons.js
const { request } = require('../../utils/request');
const { getUserInfo, logout } = require('../../utils/auth');

Page({
  data: {
    lessons: [],
    loading: true,
    userInfo: null,
    classId: null,
    showCheckinModal: false,
    streak: 0,
    totalSentences: 0,
    showAvatarPicker: false,
    avatars: [],
    selectedAvatar: null,
  },

  onLoad() {
    const user = wx.getStorageSync('user');
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    
    this.setData({ userInfo: user });
    this.loadLessons();
  },

  async onShow() {
    // 每次显示页面时，刷新课程列表进度（需用户已登录）
    const user = wx.getStorageSync('user');
    if (user) {
      await this.loadLessons();
      this.checkDailyLogin();
    }
  },

  // 从本地存储汇总所有课程的已读句子数
  getLocalTotalSentences() {
    const { lessons } = this.data;
    if (lessons && lessons.length > 0) {
      // lessons 已经包含从本地计算好的 completedSentences
      return lessons.reduce((sum, l) => sum + (l.completedSentences || 0), 0);
    }
    // 若 lessons 尚未加载，直接扫本地存储
    const allKeys = wx.getStorageInfoSync().keys || [];
    return allKeys
      .filter(k => k.startsWith('lesson_recordings_'))
      .reduce((sum, k) => {
        const recs = wx.getStorageSync(k) || {};
        return sum + Object.keys(recs).length;
      }, 0);
  },

  async checkDailyLogin() {
    try {
      const res = await request({ url: '/auth/me/checkin', method: 'POST' });
      // 只使用服务器的打卡连续天数，句子数改用本地数据保持与课程页一致
      const localTotal = this.getLocalTotalSentences();
      this.setData({
        streak: res.streak,
        totalSentences: localTotal
      });
      if (res.isFirstLoginToday) {
        this.setData({ showCheckinModal: true });
      }
    } catch (err) {
      console.error('[Checkin Error]', err);
    }
  },

  onShowCheckin() {
    this.setData({ showCheckinModal: true });
  },

  onCloseCheckin() {
    this.setData({ showCheckinModal: false });
  },

  async loadLessons() {
    this.setData({ loading: true });
    try {
      const lessons = await request({ url: '/lessons' });

      const themes = ['theme-primary', 'theme-secondary', 'theme-tertiary'];
      const enrichedLessons = lessons.map((l, index) => {
        const totalSentences = l._count?.sentences || 0;
        
        // 读取本地存储中的分句跟读记录
        const localRecordings = wx.getStorageSync(`lesson_recordings_${l.id}`) || {};
        // 已完成的句子数等于存储的有效录音记录数
        const completed = Object.keys(localRecordings).length;

        const progressPercent = totalSentences > 0 ? Math.round((completed / totalSentences) * 100) : 0;
        
        // 本地计算奖杯级别（全部跟读完才显示；老师验收类课程使用服务器返回值）
        let trophyLevel = null;
        if (l.requiresTeacherReview) {
          // 老师验收模式：trophyLevel 由服务端打分后写入 LessonScore，直接使用
          trophyLevel = l.trophyLevel ?? null;
        } else if (totalSentences > 0 && completed >= totalSentences) {
          const evals = wx.getStorageSync(`lesson_evals_${l.id}`) || {};
          let earnedStars = 0;
          for (let k in evals) { earnedStars += (evals[k].stars || 0); }
          const maxStars = totalSentences * 3;
          const ratio = earnedStars / maxStars;
          if (ratio >= 0.8) trophyLevel = 'gold';
          else if (ratio >= 0.5) trophyLevel = 'silver';
          else trophyLevel = 'bronze';
        }

        return {
          ...l,
          totalSentences,
          completedSentences: completed,
          progressPercent,
          colorTheme: themes[index % themes.length],
          trophyLevel,
          isLocked: l.isLocked || false,
          requiresTeacherReview: l.requiresTeacherReview || false,
        };

      });

      // 更新课程列表后，同步刷新本地句子总数（供打卡弹窗使用）
      const localTotal = enrichedLessons.reduce((sum, l) => sum + (l.completedSentences || 0), 0);
      this.setData({ lessons: enrichedLessons, loading: false, totalSentences: localTotal });
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

  onChangeAvatar() {
    const avatars = Array.from({length: 12}, (_, i) => `/images/avatars/avatar_${i+1}.png`);
    this.setData({
      showAvatarPicker: true,
      avatars,
      selectedAvatar: this.data.userInfo?.avatarUrl || null,
    });
  },

  onCloseAvatarPicker() {
    this.setData({ showAvatarPicker: false });
  },

  onSelectAvatar(e) {
    const { url } = e.currentTarget.dataset;
    this.setData({ selectedAvatar: url });
  },

  async onConfirmAvatar() {
    const { selectedAvatar, userInfo } = this.data;
    if (!selectedAvatar) return;

    // Save locally
    const { setStorageSync, getStorageSync } = require('../../utils/auth');
    if (userInfo) {
      userInfo.avatarUrl = selectedAvatar;
      setStorageSync('user_info', userInfo);
      setStorageSync(`user_avatar_${userInfo.id}`, selectedAvatar);
      
      this.setData({ 
        userInfo,
        showAvatarPicker: false 
      });

      // Try backend sync
      try {
        await request({ url: '/auth/me', method: 'PUT', data: { avatarUrl: selectedAvatar } });
      } catch(e) {}
    }
  },
});
