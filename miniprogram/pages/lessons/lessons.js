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

    // 奖杯印章动画状态
    showTrophyStamp: false,
    stampTrophyLevel: null,
    stampAnimClass: 'stamp-phase-start',
    stampTargetX: 0,
    stampTargetY: 0,
    stampScale: 1,
    stampingLessonId: null,   // 被印章的课程 ID
    scrollIntoCardId: '',     // 驱动 scroll-view 的 scroll-into-view 属性
    stampRotate: 0,           // overlay 奖杯旋转角度（deg），最终对齐卡片的 rotate(15deg)
    stampedLessonId: null,    // 印章完成的课程 ID，用于禁用卡片奖杯 bounce 动画
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
    // ── 先检测庆典，展示奖杯 overlay（在课程列表背景上）──
    const app = getApp();
    let pendingCelebration = null;

    console.log('[DBG][onShow] app.globalData =', JSON.stringify(app.globalData));

    if (app.globalData && app.globalData.celebration) {
      pendingCelebration = { ...app.globalData.celebration };
      app.globalData.celebration = null;
      console.log('[DBG][onShow] 庆典数据:', JSON.stringify(pendingCelebration));
      this.setData({
        showTrophyStamp: true,
        stampTrophyLevel: pendingCelebration.trophyLevel,
        stampAnimClass: 'stamp-phase-start',
        stampTargetX: 0,
        stampTargetY: 0,
        stampScale: 1,
        stampRotate: 0,
        stampingLessonId: null,
      });
      console.log('[DBG][onShow] setData showTrophyStamp=true 完成');
    } else {
      console.log('[DBG][onShow] 无庆典数据，普通刷新');
    }

    // 刷新课程列表
    const user = wx.getStorageSync('user');
    if (user) {
      await this.loadLessons();
      this.checkDailyLogin();
    }

    // 课程列表已渲染完成，开始印章动画
    if (pendingCelebration) {
      console.log('[DBG][onShow] loadLessons 完成，100ms 后启动印章动画');
      setTimeout(() => {
        this._runTrophyStampAnimation(
          pendingCelebration.lessonId,
          pendingCelebration.trophyLevel
        );
      }, 100);
    }
  },

  // 从本地存储汇总所有课程的已读句子数
  getLocalTotalSentences() {
    const { lessons } = this.data;
    if (lessons && lessons.length > 0) {
      return lessons.reduce((sum, l) => sum + (l.completedSentences || 0), 0);
    }
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

        const localRecordings = wx.getStorageSync(`lesson_recordings_${l.id}`) || {};
        const completed = Object.keys(localRecordings).length;

        const progressPercent = totalSentences > 0 ? Math.round((completed / totalSentences) * 100) : 0;

        let trophyLevel = null;
        if (l.requiresTeacherReview) {
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
    const avatars = Array.from({ length: 12 }, (_, i) => `/images/avatars/avatar_${i + 1}.png`);
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

    const { setStorageSync, getStorageSync } = require('../../utils/auth');
    if (userInfo) {
      userInfo.avatarUrl = selectedAvatar;
      setStorageSync('user_info', userInfo);
      setStorageSync(`user_avatar_${userInfo.id}`, selectedAvatar);

      this.setData({
        userInfo,
        showAvatarPicker: false
      });

      try {
        await request({ url: '/auth/me', method: 'PUT', data: { avatarUrl: selectedAvatar } });
      } catch (e) { }
    }
  },

  preventBubble() { },

  // ─── 奖杯印章动画 ─────────────────────────────────────────────────────────────
  // showTrophyStamp 已是 true（奖杯在屏幕中心可见）
  // 流程：① 隐藏卡片奖杯 → ② scroll-into-view → ③ 飞落 → ④ 印章 → ⑤ 恢复卡片奖杯 → ⑥ 隐藏 overlay
  _runTrophyStampAnimation(lessonId, trophyLevel) {
    console.log('[DBG][Stamp] 启动, lessonId=', lessonId, 'trophyLevel=', trophyLevel);

    const screenW = wx.getWindowInfo().screenWidth;
    const screenH = wx.getWindowInfo().screenHeight;
    const pxPerRpx = screenW / 750;
    // overlay 内奖杯为 320rpx，卡片内为 250rpx
    const targetScale = (250 * pxPerRpx) / (320 * pxPerRpx);

    console.log('[DBG][Stamp] screen:', screenW, 'x', screenH, '| targetScale:', targetScale.toFixed(3));

    // ① 暂时清除目标卡片上的奖杯，使其在印章落定前不可见
    const lessons = this.data.lessons;
    const idx = lessons.findIndex(l => String(l.id) === String(lessonId));
    if (idx !== -1 && lessons[idx].trophyLevel) {
      this.setData({ [`lessons[${idx}].trophyLevel`]: null });
      console.log('[DBG][Stamp] 隐藏卡片奖杯，idx=', idx);
    }

    // ② scroll-into-view 触发 scroll-view 滚动到目标卡片
    const scrollId = `lesson-card-${lessonId}`;
    console.log('[DBG][Stamp] setData scrollIntoCardId =', scrollId);
    this.setData({ scrollIntoCardId: scrollId });

    // ③ 等滚动完成（700ms），测量卡片坐标，执行飞落
    setTimeout(() => {
      console.log('[DBG][Stamp] 700ms 后，查询 #' + scrollId);
      const query = wx.createSelectorQuery().in(this);
      query.select(`#${scrollId}`).boundingClientRect();
      query.exec((res) => {
        const cardRect = res[0];
        console.log('[DBG][Stamp] boundingClientRect:', JSON.stringify(cardRect));

        const screenCenterX = screenW / 2;
        const screenCenterY = screenH / 2;

        // ── 落点微调（像素） ──────────────────────────────────────────────
        // 正值 = 向右 / 向下；负值 = 向左 / 向上
        // 先用 0.55 / 0.52 定位到卡片内奖杯中心，再用偏移量精细对齐
        const OFFSET_X = 0;   // ← 水平微调（px）
        const OFFSET_Y = 45;   // ← 垂直微调（px）
        // ──────────────────────────────────────────────────────────────────

        const cardTrophyX = (cardRect ? cardRect.left + cardRect.width * 0.55 : screenCenterX) + OFFSET_X;
        const cardTrophyY = (cardRect ? cardRect.top + cardRect.height * 0.52 : screenCenterY) + OFFSET_Y;
        const deltaX = cardTrophyX - screenCenterX;
        const deltaY = cardTrophyY - screenCenterY;
        console.log('[DBG][Stamp] delta X/Y:', deltaX.toFixed(1), '/', deltaY.toFixed(1));

        // 阶段 A：奖杯飞向卡片，同步旋转到 15deg（匹配卡片最终角度）
        this.setData({
          stampAnimClass: 'stamp-phase-flying',
          stampTargetX: deltaX,
          stampTargetY: deltaY,
          stampScale: targetScale,
          stampRotate: 15,
        });

        // 阶段 B（+680ms）：印章接触 — 过冲到 22deg 再回弹到 15deg
        setTimeout(() => {
          this.setData({ stampAnimClass: 'stamp-phase-stamp', stampingLessonId: lessonId, stampScale: targetScale * 1.3, stampRotate: 22 });
          setTimeout(() => { this.setData({ stampScale: targetScale, stampRotate: 15 }); }, 200);
        }, 680);

        // 阶段 C1（+1400ms）：overlay 即将消失前恢复卡片奖杯
        // 同时设 stampedLessonId → 卡片奖杯跳过 bounce，直接以最终角度静止出现
        setTimeout(() => {
          if (idx !== -1) {
            this.setData({
              [`lessons[${idx}].trophyLevel`]: trophyLevel,
              stampedLessonId: String(lessonId),
            });
            console.log('[DBG][Stamp] 恢复卡片奖杯（无 bounce）:', trophyLevel);
          }
        }, 1400);

        // 阶段 C2（+1500ms）：overlay 消失
        setTimeout(() => {
          console.log('[DBG][Stamp] 隐藏 overlay');
          this.setData({
            showTrophyStamp: false,
            stampingLessonId: null,
            scrollIntoCardId: '',
          });
          // 300ms 后清除 stampedLessonId（恢复卡片正常行为）
          setTimeout(() => { this.setData({ stampedLessonId: null }); }, 300);
        }, 1500);

      });
    }, 700);
  },
});
