// pages/reading/reading.js
const { request } = require('../../utils/request');
const { getSoeCredential } = require('../../utils/soe-credential');

// ─── RecorderManager（流式录音，每帧发送给评测引擎）────────────────────────────
const recorderManager = wx.getRecorderManager();

// ─── SOE evaluationManager（在 Page onLoad 内初始化）────────────────────────
let evaluationManager = null;

Page({
  data: {
    lessonId: null,
    lesson: null,
    sentences: [],
    groups: [],
    activeGroupIndex: 0,
    currentIndex: 0,
    playingIndex: -1,
    playingUserAudio: false,
    loading: true,

    // Dynamic Navigation
    navTop: 50,
    navHeight: 32,

    // Recording state
    isRecording: false,
    recordingUI: false,
    recordings: {},
    recordedCount: 0,

    // Pronunciation evaluation state
    isEvaluating: false,   // 等待 SOE 服务器返回结果
    evalResult: null,      // 当前句子的评测结果（切换句子时从 sentenceEvals 恢复）
    sentenceEvals: {},     // { [sentenceIndex]: evalResult } 所有句子的评测历史

    // Submit
    submitting: false,
    allDone: false,

    // Lesson type
    requiresTeacherReview: false,

    // Animation
    flyingStars: [],

    scrollToView: '',
    totalStars: 0
  },

  onLoad(options) {
    const { lessonId, theme } = options;
    const menuButton = wx.getMenuButtonBoundingClientRect();

    this.setData({
      lessonId,
      colorTheme: theme || 'theme-primary',
      navTop: menuButton.top,
      navHeight: menuButton.height
    });
    this._audio = wx.createInnerAudioContext();
    this._setupEvalManager();
    this._setupRecorder();
    this._setupAudioContext();
    this.loadLesson(lessonId);
  },

  onNavigateBack() {
    wx.navigateBack();
  },

  onUnload() {
    if (this._audio) {
      this._audio.destroy();
      this._audio = null;
    }
    if (this._userAudio) {
      this._userAudio.destroy();
      this._userAudio = null;
    }
    if (this.data.isRecording) recorderManager.stop();
    evaluationManager = null;
  },

  async loadLesson(lessonId) {
    try {
      const lesson = await request({ url: `/lessons/${lessonId}` });
      const sentences = lesson.sentences || [];

      const groups = [];
      let currentGroup = null;

      sentences.forEach((s, idx) => {
        if (s.imageUrl) {
          currentGroup = { id: `group-${groups.length}`, imageUrl: s.imageUrl, sentences: [], indices: [] };
          groups.push(currentGroup);
        } else if (!currentGroup) {
          currentGroup = { id: `group-${groups.length}`, imageUrl: lesson.imageUrl, sentences: [], indices: [] };
          groups.push(currentGroup);
        }
        currentGroup.sentences.push(s);
        currentGroup.indices.push(idx);
      });

      const savedStorage = wx.getStorageSync(`lesson_recordings_${lessonId}`) || {};
      const recordings = {};
      for (let key in savedStorage) {
        const entry = savedStorage[key];
        if (entry === true || (entry && entry.uploaded)) {
          recordings[key] = entry;
        } else if (entry && entry.tempPath) {
          recordings[key] = entry.tempPath;
        } else {
          recordings[key] = entry;
        }
      }
      const recordedCount = Object.keys(recordings).length;

      // 读取持久化的评测结果
      const sentenceEvals = wx.getStorageSync(`lesson_evals_${lessonId}`) || {};
      let totalStars = 0;
      for (let k in sentenceEvals) {
        totalStars += (sentenceEvals[k].stars || 0);
      }

      let startGroup = 0;
      let startIndex = 0;
      for (let i = 0; i < sentences.length; i++) {
        if (!recordings[i]) {
          startIndex = i;
          startGroup = groups.findIndex(g => g.indices.includes(i));
          if (startGroup === -1) startGroup = 0;
          break;
        }
      }

      this.setData({
        lesson, sentences, groups,
        activeGroupIndex: startGroup,
        currentIndex: startIndex,
        loading: false, recordings, recordedCount,
        allDone: recordedCount >= sentences.length,
        sentenceEvals,
        evalResult: sentenceEvals[startIndex] || null,
        totalStars,
        requiresTeacherReview: lesson.requiresTeacherReview || false,
      });

      if (startIndex > 0) {
        setTimeout(() => this._scrollToNode(`#group-${startGroup}`), 500);
      }

      if (lesson.masterAudioUrl) {
        this._audio.src = lesson.masterAudioUrl;
        this._hasPlayedMaster = false;
      }

      setTimeout(() => this._measureGroupOffsets(), 400);

    } catch (err) {
      wx.showToast({ title: '加载课程失败', icon: 'error' });
      this.setData({ loading: false });
    }
  },

  _measureGroupOffsets() {
    const { groups } = this.data;
    if (!groups || groups.length === 0) return;

    const query = wx.createSelectorQuery().in(this);
    groups.forEach((g, idx) => {
      query.select(`#group-anchor-${idx}`).boundingClientRect();
    });
    query.select('.content-scroll').boundingClientRect();

    query.exec((rects) => {
      const scrollViewRect = rects[rects.length - 1];
      if (!scrollViewRect) return;
      const scrollViewTop = scrollViewRect.top;
      this._groupOffsets = [];
      for (let i = 0; i < groups.length; i++) {
        const rect = rects[i];
        this._groupOffsets[i] = rect ? rect.top - scrollViewTop : 0;
      }
    });
  },

  onContentScroll(e) {
    const scrollTop = e.detail.scrollTop;
    const offsets = this._groupOffsets;
    if (!offsets || offsets.length === 0) return;
    let activeIdx = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (scrollTop >= offsets[i] - 80) activeIdx = i;
    }
    if (activeIdx !== this.data.activeGroupIndex) {
      this.setData({ activeGroupIndex: activeIdx });
    }
  },

  // ─── Audio Context ─────────────────────────────────────────────────────────
  _setupAudioContext() {
    this._audio.onSeeking(() => { this.isSeeking = true; });
    this._audio.onSeeked(() => { this.isSeeking = false; });
    this._audio.onTimeUpdate(() => {
      if (this.isSeeking) return;
      const { playingIndex, sentences } = this.data;
      if (playingIndex === -1) return;
      const targetSentence = sentences[playingIndex];
      if (targetSentence && typeof targetSentence.endTime === 'number') {
        let currentAbs = this._audio.currentTime;
        
        // 【核心补偿】：微信小程序在部分设备（特别是 iOS）上使用 startTime 播放后，currentTime 会从 0 开始计时（变为相对时间）
        // 此时如果当前读取的绝对时间比预计的 startTime 还小了许多，说明必然遇到了这个 Bug，我们需要将 startTime 补回来
        if (typeof targetSentence.startTime === 'number' && targetSentence.startTime > 0 && currentAbs < targetSentence.startTime - 1) {
          currentAbs += targetSentence.startTime;
        }

        if (currentAbs >= targetSentence.endTime && currentAbs > 0) {
          this._audio.pause();
          this.setData({ playingIndex: -1 });
        }
      }
    });
    this._audio.onEnded(() => { this.setData({ playingIndex: -1 }); });
    this._audio.onError((err) => {
      this.setData({ playingIndex: -1 });
      this.isSeeking = false;
      console.error('[Audio Error]', err);
    });
  },

  // ─── SOE Evaluation Manager ────────────────────────────────────────────────
  _setupEvalManager() {
    try {
      const plugin = requirePlugin('soePlugin');
      evaluationManager = plugin.getOralEvaluation();
    } catch (e) {
      console.error('[SOE] 插件初始化失败，请确认已在 app.json 注册并在公众平台添加了插件', e);
      wx.showToast({ title: '评测插件未就绪', icon: 'none', duration: 3000 });
      return;
    }

    evaluationManager.OnEvaluationStart = (res) => {
      console.log('[SOE] WebSocket 连接成功，开始发送音频帧');
      this._evalReady = true;
      // 将录音启动期间缓冲的帧一次性发送
      if (this._audioBuffer && this._audioBuffer.length > 0) {
        this._audioBuffer.forEach(frame => evaluationManager.write(frame));
        this._audioBuffer = [];
      }
    };

    evaluationManager.OnEvaluationResultChange = (res) => {
      // 中间结果，暂不处理（可用于实时进度展示）
    };

    evaluationManager.OnEvaluationComplete = (res) => {
      console.log('[SOE] 评测完成', res);
      this.setData({ isEvaluating: false });
      this._handleEvalResult(res);
    };

    evaluationManager.OnError = (err) => {
      console.error('[SOE] 评测失败', err);
      this.setData({ isRecording: false, recordingUI: false, isEvaluating: false });
      wx.showToast({ title: '评测失败，请重试', icon: 'none' });
    };
  },

  // ─── RecorderManager（流式） ────────────────────────────────────────────────
  _setupRecorder() {
    recorderManager.onStart(() => {
      this.setData({ isRecording: true });
    });

    recorderManager.onFrameRecorded((res) => {
      if (!res.frameBuffer) return;
      if (this._evalReady && evaluationManager) {
        evaluationManager.write(res.frameBuffer);
      } else {
        // 在 WebSocket 建立前先缓冲
        if (!this._audioBuffer) this._audioBuffer = [];
        this._audioBuffer.push(res.frameBuffer);
      }
    });

    recorderManager.onStop((res) => {
      const tempFilePath = res.tempFilePath || '';
      this._lastTempFilePath = tempFilePath;

      // 立即保存录音路径（不等评测结果），保证红色小喇叭可以回放
      if (tempFilePath) {
        const { currentIndex, lessonId, recordings, sentences } = this.data;
        const updated = { ...recordings, [currentIndex]: tempFilePath };
        const recordedCount = Object.keys(updated).length;
        this.setData({
          recordings: updated,
          recordedCount,
          allDone: recordedCount >= sentences.length,
        });
        const existingStorage = wx.getStorageSync(`lesson_recordings_${lessonId}`) || {};
        existingStorage[currentIndex] = { uploaded: false, tempPath: tempFilePath };
        wx.setStorageSync(`lesson_recordings_${lessonId}`, existingStorage);
      }

      this.setData({ isRecording: false, recordingUI: false });
      // isEvaluating 仍为 true，等 OnEvaluationComplete 回调
    });

    recorderManager.onError((err) => {
      this.setData({ isRecording: false, recordingUI: false, isEvaluating: false });
      wx.showToast({ title: '录音失败，请重试', icon: 'none' });
      console.error('[Recorder Error]', err);
    });
  },

  // ─── 解析评测结果 ─────────────────────────────────────────────────────────
  _handleEvalResult(res) {
    const { currentIndex, sentenceEvals, lessonId, sentences } = this.data;
    const sentenceText = sentences[currentIndex].text;

    // API 返回结构：{ code, result: { PronAccuracy, Words: [...] }, final }
    const resultData = res.result || {};
    const wordList = resultData.Words || [];

    // 将原始句子拆分为 单词 和 非单词（标点/空格）
    const tokens = [];
    // 支持多语言混合：中文单字为一个评估单位，英文/数字为一组。匹配不在[a-zA-Z0-9']及中文字符之内的作为占位符空白/标点
    const regex = /([\u4e00-\u9fa5]|[a-zA-Z0-9']+)|([^\u4e00-\u9fa5a-zA-Z0-9']+)/g;
    let match;
    let wordIndex = 0;

    while ((match = regex.exec(sentenceText)) !== null) {
      if (match[1]) {
        // 这是单词
        const wordData = wordList[wordIndex] || {};
        const score = Math.round(wordData.PronAccuracy || 0);
        tokens.push({
          text: match[1], // 保持原始首字母大小写
          isWord: true,
          score: score,
          isError: score < 60,
          isWarning: score >= 60 && score < 80,
          isOk: score >= 80
        });
        wordIndex++;
      } else if (match[2]) {
        // 这是标点或空格
        tokens.push({
          text: match[2],
          isWord: false
        });
      }
    }

    const overallScore = Math.round(resultData.SuggestedScore || resultData.PronAccuracy || 0);
    let stars = 0;
    if (overallScore >= 80) stars = 3;
    else if (overallScore >= 50) stars = 2;
    else if (overallScore >= 20) stars = 1;

    const evalResult = {
      overallScore,
      stars,
      tokens,
    };

    const oldEval = sentenceEvals[currentIndex];
    const oldStars = oldEval ? (oldEval.stars || 0) : 0;
    const isNewBest = !oldEval || stars >= oldStars;

    // 只有新成绩 >= 旧成绩时才覆盖（保留最佳评测结果）
    const updatedEvals = isNewBest
      ? { ...sentenceEvals, [currentIndex]: evalResult }
      : sentenceEvals;

    // 重新计算总星星数
    let newTotalStars = 0;
    for (let k in updatedEvals) {
      newTotalStars += (updatedEvals[k].stars || 0);
    }

    this.setData({ 
      evalResult, 
      sentenceEvals: updatedEvals,
      totalStars: newTotalStars 
    });

    if (isNewBest) {
      wx.setStorageSync(`lesson_evals_${lessonId}`, updatedEvals);
    }

    // 飞星动画：如果这是该句子第一次评测，或者新评测的星星数 > 旧星星数
    const isFirstEval = !oldEval;
    if (isFirstEval || stars > oldStars) {
      this._triggerStarAnimation();
    }
  },

  // ─── 飞星动画 ─────────────────────────────────────────────────────────────
  _triggerStarAnimation() {
    const query = wx.createSelectorQuery();
    query.select('.giant-mic-btn').boundingClientRect();
    query.select('.star-icon').boundingClientRect();

    query.exec((rects) => {
      const btnRect = rects[0];
      const starRect = rects[1];
      if (!btnRect || !starRect) return;

      const starId = Date.now();
      const newStar = {
        id: starId,
        x: btnRect.left + btnRect.width / 2 - 15,
        y: btnRect.top + btnRect.height / 2 - 15,
        opacity: 1, scale: 1.5
      };
      this.setData({ flyingStars: [...this.data.flyingStars, newStar] });

      setTimeout(() => {
        const updatedStars = this.data.flyingStars.map(s =>
          s.id === starId ? { ...s, x: starRect.left - 5, y: starRect.top - 5, scale: 0.8, opacity: 0.2 } : s
        );
        this.setData({ flyingStars: updatedStars });

        setTimeout(() => {
          this.setData({ flyingStars: this.data.flyingStars.filter(s => s.id !== starId) });
        }, 600);
      }, 50);
    });
  },

  // ─── Record Button (Long Press) ────────────────────────────────────────────
  onRecordStart() {
    // 老师验收模式：跳过 SOE，直接录音
    if (this.data.requiresTeacherReview) {
      this._wantToRecord = true;
      this._startCalled = false;

      if (this.data.playingIndex !== -1) {
        this._audio.pause();
        this.setData({ playingIndex: -1 });
      }
      if (this.data.playingUserAudio) {
        if (this._userAudio) this._userAudio.pause();
        this.setData({ playingUserAudio: false });
      }
      this.setData({ recordingUI: true, evalResult: null });

      wx.getSetting({
        success: (res) => {
          if (!this._wantToRecord) { this.setData({ recordingUI: false }); return; }
          if (res.authSetting['scope.record'] === false) {
            this.setData({ recordingUI: false });
            wx.openSetting();
            return;
          }
          this._startCalled = true;
          recorderManager.start({
            format: 'wav',
            sampleRate: 16000,
            numberOfChannels: 1,
            frameSize: 0.32,
            duration: 60000,
          });
        },
      });
      return;
    }

    // 机器检测模式（原有逻辑保持不变）
    if (!evaluationManager) {
      wx.showToast({ title: '评测插件未就绪', icon: 'none' });
      return;
    }

    this._wantToRecord = true;
    this._startCalled = false;
    this._evalReady = false;
    this._audioBuffer = [];
    this._lastTempFilePath = '';

    // 停止任何正在播放的音频
    if (this.data.playingIndex !== -1) {
      this._audio.pause();
      this.setData({ playingIndex: -1 });
    }
    if (this.data.playingUserAudio) {
      if (this._userAudio) this._userAudio.pause();
      this.setData({ playingUserAudio: false });
    }

    // 先更新视觉状态，清除上一次评测结果
    this.setData({ recordingUI: true, evalResult: null });

    wx.getSetting({
      success: async (res) => {
        if (!this._wantToRecord) {
          this.setData({ recordingUI: false });
          return;
        }
        if (res.authSetting['scope.record'] === false) {
          this.setData({ recordingUI: false });
          wx.openSetting();
          return;
        }

        const { currentIndex, sentences } = this.data;
        const refText = (sentences[currentIndex] || {}).text || '';

        // 1. 先获取临时凭证，再建立 WebSocket 评测连接
        let cred;
        try {
          cred = await getSoeCredential();
        } catch (e) {
          console.error('[SOE] 获取临时凭证失败', e);
          this.setData({ recordingUI: false });
          wx.showToast({ title: '评测服务暂不可用', icon: 'none' });
          return;
        }

        const isChinese = /[\u4e00-\u9fa5]/.test(refText);

        evaluationManager.start({
          secretid: cred.tmpSecretId,
          secretkey: cred.tmpSecretKey,
          token: cred.sessionToken,
          appid: '1411543302',
          duration: 60000,
          frameSize: 0.32,
          server_engine_type: isChinese ? '16k_zh' : '16k_en',
          ref_text: refText,
          eval_mode: 1,          // 1 = 句子模式
          score_coeff: 1.0,
          sentence_info_enabled: 1,
        });

        // 2. 同时启动录音（帧数据在 onFrameRecorded 里流式发送）
        // WAV = PCM + 标准文件头
        // - onFrameRecorded 发出原始 PCM 帧 → SOE 引擎可正确识别，评分准确
        // - 最终 .wav 文件 → InnerAudioContext 可直接回放
        this._startCalled = true;
        recorderManager.start({
          format: 'wav',
          sampleRate: 16000,
          numberOfChannels: 1,
          frameSize: 0.32,
          duration: 60000,
        });
      },
    });
  },

  onRecordStop() {
    this._wantToRecord = false;

    if (this.data.isRecording || this._startCalled) {
      this._startCalled = false;
      recorderManager.stop();
      if (!this.data.requiresTeacherReview) {
        // 告知评测引擎音频发送完毕
        if (evaluationManager && this._evalReady) {
          evaluationManager.stop();
        }
        // 进入"检测中"等待状态
        this.setData({ isEvaluating: true });
      }
      // 老师验收模式：无评测，不设置 isEvaluating
    } else {
      this.setData({ recordingUI: false });
    }
  },


  preventBubbling() {},

  // ─── Interactions ──────────────────────────────────────────────────────────
  onGroupTap(e) {
    const groupIndex = e.currentTarget.dataset.groupIndex;
    if (this.data.activeGroupIndex === groupIndex) {
      this.setData({ activeGroupIndex: -1 });
      return;
    }
    this.setData({ activeGroupIndex: groupIndex });
    setTimeout(() => this._scrollToNode(`#group-${groupIndex}`), 400);
  },

  onSentenceTap(e) {
    const targetIdx = e.currentTarget.dataset.index;
    const { sentences, playingIndex, lesson } = this.data;
    const sentence = sentences[targetIdx];

    if (targetIdx !== this.data.currentIndex) {
      // 切换句子时从持久化缓存中恢复该句子的评测结果（如有）
      const savedEval = this.data.sentenceEvals[targetIdx] || null;
      this.setData({ evalResult: savedEval });
    }

    if (playingIndex === targetIdx) {
      this._audio.pause();
      this.setData({ playingIndex: -1, currentIndex: targetIdx });
      return;
    }

    if (this.data.playingUserAudio) {
      if (this._userAudio) this._userAudio.pause();
      this.setData({ playingUserAudio: false });
    }

    this.setData({ playingIndex: targetIdx, currentIndex: targetIdx });

    if (lesson.masterAudioUrl && typeof sentence.startTime === 'number') {
      if (this._audio.src !== lesson.masterAudioUrl || !this._hasPlayedMaster) {
        this._audio.src = lesson.masterAudioUrl;
        this._audio.startTime = sentence.startTime;
        this._hasPlayedMaster = true;
        this._audio.play();
      } else {
        this.isSeeking = true;
        if (this.seekTimeout) clearTimeout(this.seekTimeout);
        this.seekTimeout = setTimeout(() => { this.isSeeking = false; }, 1000);
        this._audio.seek(sentence.startTime);
        this._audio.play();
      }
    } else if (sentence.audioUrl) {
      if (this._audio.src !== sentence.audioUrl) {
        this._audio.src = sentence.audioUrl;
        this._audio.startTime = 0;
      } else {
        this.isSeeking = true;
        if (this.seekTimeout) clearTimeout(this.seekTimeout);
        this.seekTimeout = setTimeout(() => { this.isSeeking = false; }, 1000);
        this._audio.seek(0);
      }
      this._audio.play();
    } else {
      wx.showToast({ title: '无法播放：该句子暂无音频信息', icon: 'none' });
      this.setData({ playingIndex: -1 });
    }
  },

  onPlayUserRecording() {
    const { currentIndex, recordings, playingUserAudio } = this.data;

    if (playingUserAudio) {
      if (this._userAudio) this._userAudio.pause();
      this.setData({ playingUserAudio: false });
      return;
    }

    if (this.data.playingIndex !== -1) {
      this._audio.pause();
      this.setData({ playingIndex: -1 });
    }

    const rec = recordings[currentIndex];
    if (!rec) return;

    let pathToPlay = typeof rec === 'string' ? rec : (rec.tempPath || '');
    if (!pathToPlay) {
      wx.showToast({ title: '暂无该录音的本地缓存', icon: 'none' });
      return;
    }

    if (!this._userAudio) {
      this._userAudio = wx.createInnerAudioContext();
      this._userAudio.onEnded(() => this.setData({ playingUserAudio: false }));
      this._userAudio.onError((err) => {
        console.error('[User Audio Error]', err);
        this.setData({ playingUserAudio: false });
        wx.showToast({ title: '回放失败', icon: 'none' });
      });
    }

    this._userAudio.src = pathToPlay;
    this.setData({ playingUserAudio: true });
    this._userAudio.play();
  },

  _scrollToNode(selector) {
    const query = wx.createSelectorQuery();
    query.select(selector).boundingClientRect();
    query.selectViewport().scrollOffset();

    query.exec((res) => {
      if (!res[0] || !res[1]) return;
      const systemInfo = wx.getWindowInfo();
      const pxPerRpx = systemInfo.screenWidth / 750;
      const offsetPx = 230 * pxPerRpx;
      const targetTop = res[1].scrollTop + res[0].top - offsetPx;
      wx.pageScrollTo({ scrollTop: targetTop, duration: 300 });
    });
  },

  _scrollToCurrent(groupIndex) {
    this._scrollToNode(`#group-${groupIndex}`);
  },

  // ─── Submit All Recordings ─────────────────────────────────────────────────
  async onSubmit() {
    const { recordings, lessonId, sentences } = this.data;
    if (Object.keys(recordings).length < sentences.length) {
      wx.showModal({
        title: '还有句子未跟读',
        content: '有些句子还没有录音，确定要提交吗？',
        success: async (res) => { if (res.confirm) this._doSubmit(); },
      });
      return;
    }
    this._doSubmit();
  },

  async _doSubmit() {
    this.setData({ submitting: true });
    wx.showLoading({ title: '准备中…', mask: false });

    try {
      const { recordings, lessonId, sentences } = this.data;
      const pendingEntries = [];
      for (let key in recordings) {
        const val = recordings[key];
        const sentenceIndex = parseInt(key);
        if (typeof val === 'string' && val) {
          const sentence = sentences[sentenceIndex];
          pendingEntries.push({ sentenceIndex, tempPath: val, sentenceId: sentence ? sentence.id : null });
        }
      }

      if (pendingEntries.length === 0) {
        wx.hideLoading();
        wx.showModal({
          title: '太棒了',
          content: '当前课程没有新的未保存录音，可以直接退出哦！',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        this.setData({ submitting: false });
        return;
      }

      const storage = wx.getStorageSync(`lesson_recordings_${lessonId}`) || {};

      for (let i = 0; i < pendingEntries.length; i++) {
        const entry = pendingEntries[i];
        wx.showLoading({ title: `上传录音 ${i + 1}/${pendingEntries.length}…`, mask: true });

        const cloudPath = `recordings/${lessonId}/${entry.sentenceId || entry.sentenceIndex}_${Date.now()}.wav`;
        const uploadRes = await new Promise((resolve, reject) => {
          wx.cloud.uploadFile({
            cloudPath,
            filePath: entry.tempPath,
            success: (res) => resolve({ cloudID: res.fileID }),
            fail: (err) => reject(new Error(err.errMsg || '云存储上传失败'))
          });
        });

        await request({
          url: '/recordings',
          method: 'POST',
          data: { lessonId, cloudId: uploadRes.cloudID, sentenceId: entry.sentenceId },
        });

        storage[entry.sentenceIndex] = { uploaded: true };
        wx.setStorageSync(`lesson_recordings_${lessonId}`, storage);
      }

      wx.hideLoading();
      wx.showModal({
        title: '🎉 太棒了！',
        content: `共 ${pendingEntries.length} 条录音已发送给老师，老师会认真听的！`,
        showCancel: false,
        success: () => wx.navigateBack(),
      });
    } catch (err) {
      wx.hideLoading();
      wx.showModal({ title: '发送失败', content: err.message || '请检查网络后重试', showCancel: false });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
