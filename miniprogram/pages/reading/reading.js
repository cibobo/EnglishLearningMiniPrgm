// pages/reading/reading.js
const { request } = require('../../utils/request');

const recorderManager = wx.getRecorderManager();
const audioContext = wx.createInnerAudioContext();

Page({
  data: {
    lessonId: null,
    lesson: null,
    sentences: [],
    currentIndex: 0,
    loading: true,
    // Recording state
    isRecording: false,
    recordings: {},       // { [sentenceIndex]: tempFilePath }
    recordedCount: 0,
    // Playback
    isPlaying: false,
    // Submit
    submitting: false,
    allDone: false,
  },

  onLoad(options) {
    const { lessonId } = options;
    this.setData({ lessonId });
    this._setupRecorder();
    this.loadLesson(lessonId);
  },

  onUnload() {
    audioContext.destroy();
    if (this.data.isRecording) recorderManager.stop();
  },

  async loadLesson(lessonId) {
    try {
      const lesson = await request({ url: `/lessons/${lessonId}` });
      this.setData({
        lesson,
        sentences: lesson.sentences,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: '加载课程失败', icon: 'error' });
      this.setData({ loading: false });
    }
  },

  // ─── Recorder Setup ────────────────────────────────────────────────────────
  _setupRecorder() {
    recorderManager.onStart(() => {
      this.setData({ isRecording: true });
    });

    recorderManager.onStop((res) => {
      const { currentIndex, recordings, sentences } = this.data;
      const updated = { ...recordings, [currentIndex]: res.tempFilePath };
      const recordedCount = Object.keys(updated).length;
      const allDone = recordedCount >= sentences.length;

      this.setData({
        isRecording: false,
        recordings: updated,
        recordedCount,
        allDone,
      });

      // 自动跳到下一句（如果不是最后一句）
      if (!allDone && currentIndex < sentences.length - 1) {
        setTimeout(() => {
          this.setData({ currentIndex: currentIndex + 1 });
          this._scrollToCurrent();
        }, 300);
      }
    });

    recorderManager.onError((err) => {
      this.setData({ isRecording: false });
      wx.showToast({ title: '录音失败，请重试', icon: 'none' });
      console.error('[Recorder Error]', err);
    });
  },

  // ─── Record Button (Long Press) ────────────────────────────────────────────
  onRecordStart() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
          wx.openSetting();
          return;
        }
        recorderManager.start({
          format: 'aac',
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          duration: 60000,
        });
      },
    });
  },

  onRecordStop() {
    if (this.data.isRecording) {
      recorderManager.stop();
    }
  },

  // ─── Play Reference Audio ──────────────────────────────────────────────────
  onPlayRef() {
    const { sentences, currentIndex, isPlaying } = this.data;
    const sentence = sentences[currentIndex];
    if (!sentence?.audioUrl) {
      wx.showToast({ title: '暂无参考音频', icon: 'none' });
      return;
    }

    if (isPlaying) {
      audioContext.stop();
      this.setData({ isPlaying: false });
      return;
    }

    audioContext.src = sentence.audioUrl;
    audioContext.play();
    this.setData({ isPlaying: true });
    audioContext.onEnded(() => this.setData({ isPlaying: false }));
    audioContext.onError(() => {
      this.setData({ isPlaying: false });
      wx.showToast({ title: '音频播放失败', icon: 'none' });
    });
  },

  // ─── Sentence Navigation ───────────────────────────────────────────────────
  onSentenceTap(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ currentIndex: index });
    this._scrollToCurrent();
  },

  _scrollToCurrent() {
    // Use wx.createSelectorQuery to scroll sentence into view
    this.setData({ scrollToSentence: `sentence-${this.data.currentIndex}` });
  },

  // ─── Submit All Recordings ─────────────────────────────────────────────────
  async onSubmit() {
    const { recordings, lessonId, sentences } = this.data;

    if (Object.keys(recordings).length < sentences.length) {
      wx.showModal({
        title: '还有句子未跟读',
        content: '有些句子还没有录音，确定要提交吗？',
        success: (res) => { if (res.confirm) this._doSubmit(); },
      });
      return;
    }
    this._doSubmit();
  },

  async _doSubmit() {
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在发送录音…', mask: true });

    try {
      // 1. 合并最后一条录音上传（MVP版本：上传最后一条完整录音）
      // 注意：完整方案应合并所有句子录音；此处使用最后录制的文件作为代表
      const recordingPaths = Object.values(this.data.recordings);
      const lastFile = recordingPaths[recordingPaths.length - 1];
      const filename = `recording_${Date.now()}.aac`;

      // 2. 获取预签名上传 URL
      const presignRes = await request({
        url: '/upload/presign',
        method: 'POST',
        data: { filename, content_type: 'audio/aac', category: 'recording' },
      });

      // 3. 直传到 COS
      await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: presignRes.presigned_url,
          filePath: lastFile,
          name: 'file',
          header: { 'Content-Type': 'audio/aac' },
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(res);
            else reject(new Error(`上传失败: ${res.statusCode}`));
          },
          fail: reject,
        });
      });

      // 4. 提交录音记录
      await request({
        url: '/recordings',
        method: 'POST',
        data: { lessonId, fileKey: presignRes.file_key },
      });

      wx.hideLoading();
      wx.showModal({
        title: '🎉 太棒了！',
        content: '录音已发送给老师，老师会认真听的！',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
    } catch (err) {
      wx.hideLoading();
      wx.showModal({
        title: '发送失败',
        content: err.message || '请检查网络后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
