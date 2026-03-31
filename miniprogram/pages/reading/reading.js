// pages/reading/reading.js
const { request } = require('../../utils/request');

const recorderManager = wx.getRecorderManager();
const audioContext = wx.createInnerAudioContext();

Page({
  data: {
    lessonId: null,
    lesson: null,
    sentences: [],
    groups: [],
    activeGroupIndex: 0,
    currentIndex: 0,
    playingIndex: -1, // Tracks which sentence is currently outputting audio
    loading: true,
    
    // Recording state
    isRecording: false,
    recordings: {},       // { [sentenceIndex]: tempFilePath }
    recordedCount: 0,
    
    // Submit
    submitting: false,
    allDone: false,
    
    // Scroller destination
    scrollToView: ''
  },

  onLoad(options) {
    const { lessonId } = options;
    this.setData({ lessonId });
    this._setupRecorder();
    this._setupAudioContext();
    this.loadLesson(lessonId);
  },

  onUnload() {
    audioContext.destroy();
    if (this.data.isRecording) recorderManager.stop();
  },

  async loadLesson(lessonId) {
    try {
      const lesson = await request({ url: `/lessons/${lessonId}` });
      const sentences = lesson.sentences || [];
      
      // Group sentences logically by their illustrations
      const groups = [];
      let currentGroup = null;
      let targetImgUrl = null;
      
      sentences.forEach((s, idx) => {
        if (s.imageUrl) {
          // If the sentence explicitly has an image, start a new group
          currentGroup = { 
            id: `group-${groups.length}`, 
            imageUrl: s.imageUrl, 
            sentences: [], 
            indices: [] 
          };
          groups.push(currentGroup);
        } else if (!currentGroup) {
          // If the first sentence has no image, fallback to the course cover image
          currentGroup = { 
            id: `group-${groups.length}`, 
            imageUrl: lesson.imageUrl, 
            sentences: [], 
            indices: [] 
          };
          groups.push(currentGroup);
        }

        currentGroup.sentences.push(s);
        currentGroup.indices.push(idx);
      });

      this.setData({
        lesson,
        sentences,
        groups,
        activeGroupIndex: 0, // initially expand first group
        loading: false,
      });
      
      // Prime audio player with the master file
      if (lesson.masterAudioUrl) {
         audioContext.src = lesson.masterAudioUrl;
      }
      
    } catch (err) {
      wx.showToast({ title: '加载课程失败', icon: 'error' });
      this.setData({ loading: false });
    }
  },

  // ─── Audio Setup ───────────────────────────────────────────────────────────
  _setupAudioContext() {
    audioContext.onPlay(() => {
    });

    audioContext.onTimeUpdate(() => {
      const { playingIndex, sentences } = this.data;
      if (playingIndex === -1) return;
      
      const targetSentence = sentences[playingIndex];
      // If we've reached the end timestamp for this chunk, automatically pause.
      if (targetSentence && targetSentence.endTime) {
        if (audioContext.currentTime >= targetSentence.endTime) {
           audioContext.pause();
           this.setData({ playingIndex: -1 });
        }
      }
    });

    audioContext.onEnded(() => {
      this.setData({ playingIndex: -1 });
    });

    audioContext.onError((err) => {
      this.setData({ playingIndex: -1 });
      console.error('[AudioContext Error]', err);
    });
  },

  // ─── Recorder Setup ────────────────────────────────────────────────────────
  _setupRecorder() {
    recorderManager.onStart(() => {
      this.setData({ isRecording: true });
    });

    recorderManager.onStop((res) => {
      const { currentIndex, recordings, sentences, groups } = this.data;
      const updated = { ...recordings, [currentIndex]: res.tempFilePath };
      const recordedCount = Object.keys(updated).length;
      const allDone = recordedCount >= sentences.length;

      this.setData({
        isRecording: false,
        recordings: updated,
        recordedCount,
        allDone,
      });

      // Advance to next sentence automatically (unless done)
      if (!allDone && currentIndex < sentences.length - 1) {
        setTimeout(() => {
          const nextIndex = currentIndex + 1;
          
          // Determine which group the next sentence belongs to
          let targetGroupIndex = this.data.activeGroupIndex;
          for (let i = 0; i < groups.length; i++) {
            if (groups[i].indices.includes(nextIndex)) {
               targetGroupIndex = i;
               break;
            }
          }
          
          this.setData({ 
            currentIndex: nextIndex,
            activeGroupIndex: targetGroupIndex
          });
          this._scrollToCurrent(targetGroupIndex);
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
        
        // Stop audio playback to not record device output
        if (this.data.playingIndex !== -1) {
           audioContext.pause();
           this.setData({ playingIndex: -1 });
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

  // ─── Interactions ──────────────────────────────────────────────────────────
  
  onGroupTap(e) {
    const groupIndex = e.currentTarget.dataset.groupIndex;
    const { activeGroupIndex, groups, currentIndex } = this.data;
    
    // If accordion is clicked, we expand it. If already expanded we can just scroll.
    this.setData({ 
       activeGroupIndex: groupIndex,
       scrollToView: `group-${groupIndex}`
    });
  },
  
  onSentenceTap(e) {
    const targetIdx = e.currentTarget.dataset.index;
    const { sentences, playingIndex, lesson } = this.data;
    const sentence = sentences[targetIdx];
    
    // If clicking currently active sentence audio... STOP it.
    if (playingIndex === targetIdx) {
       audioContext.pause();
       this.setData({ playingIndex: -1, currentIndex: targetIdx });
       return;
    }
    
    // Prepare for new play structure
    this.setData({ 
       playingIndex: targetIdx,
       currentIndex: targetIdx,
    });
    
    // Handle playback via timeline if masterAudioUrl exists
    if (lesson.masterAudioUrl && typeof sentence.startTime === 'number') {
       if (audioContext.src !== lesson.masterAudioUrl) {
          audioContext.src = lesson.masterAudioUrl;
       }
       // WeChat InnerAudioContext allows setting 'startTime' directly before calling 'play'
       audioContext.startTime = sentence.startTime;
       audioContext.play();
    } 
    // Fallback to standalone sentence audioUrl
    else if (sentence.audioUrl) {
       audioContext.src = sentence.audioUrl;
       audioContext.play();
    } else {
       wx.showToast({ title: '无法播放：该句子暂无音频信息', icon: 'none' });
       this.setData({ playingIndex: -1 });
    }
  },

  _scrollToCurrent(groupIndex) {
    this.setData({ scrollToView: `group-${groupIndex}` });
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
      const recordingPaths = Object.values(this.data.recordings);
      const lastFile = recordingPaths[recordingPaths.length - 1];
      const filename = `recording_${Date.now()}.aac`;

      const presignRes = await request({
        url: '/upload/presign',
        method: 'POST',
        data: { filename, content_type: 'audio/aac', category: 'recording' },
      });

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

      await request({
        url: '/recordings',
        method: 'POST',
        data: { lessonId: this.data.lessonId, fileKey: presignRes.file_key },
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
