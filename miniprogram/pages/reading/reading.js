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
    
    // Animation
    flyingStars: [],

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
      const { currentIndex, recordings, sentences, groups, activeGroupIndex } = this.data;
      const isNewRecording = !recordings[currentIndex];
      
      const updated = { ...recordings, [currentIndex]: res.tempFilePath };
      const recordedCount = Object.keys(updated).length;
      const allDone = recordedCount >= sentences.length;

      // Instantly update button visual to unpressed
      this.setData({ isRecording: false });

      const handleAdvance = () => {
        this.setData({
          recordings: updated,
          recordedCount,
          allDone,
        });

        if (!allDone && currentIndex < sentences.length - 1) {
          const nextIndex = currentIndex + 1;
          let targetGroupIndex = activeGroupIndex;
          for (let i = 0; i < groups.length; i++) {
            if (groups[i].indices.includes(nextIndex)) {
               targetGroupIndex = i;
               break;
            }
          }
          
          const isNewGroup = targetGroupIndex !== activeGroupIndex;
          this.setData({ 
            currentIndex: nextIndex,
            activeGroupIndex: targetGroupIndex
          });
          
          setTimeout(() => {
            this.setData({ scrollToView: isNewGroup ? `group-${targetGroupIndex}` : `sentence-${nextIndex}` });
          }, isNewGroup ? 400 : 100);
        }
      };

      if (isNewRecording) {
         const query = wx.createSelectorQuery();
         query.select('.btn-record').boundingClientRect();
         query.select('#global-target-star').boundingClientRect();
         
         query.exec((rects) => {
             const btnRect = rects[0];
             const starRect = rects[1];
             
             if (!btnRect || !starRect) {
                // Query failed (e.g., node offscreen), fallback to immediate advance
                handleAdvance();
                return;
             }

             // Determine exact coordinates
             const starId = Date.now();
             const newStar = {
                 id: starId,
                 x: btnRect.left + btnRect.width / 2 - 15,
                 y: btnRect.top + btnRect.height / 2 - 15,
                 opacity: 1,
                 scale: 1.5
             };
             
             this.setData({ flyingStars: [...this.data.flyingStars, newStar] });
             
             // Next frame, start the flight animation
             setTimeout(() => {
                 const updatedStars = this.data.flyingStars.map(s => {
                     if (s.id === starId) {
                         return { 
                            ...s, 
                            x: starRect.left - 5, 
                            y: starRect.top - 5, 
                            scale: 0.8, 
                            opacity: 0.2 
                         };
                     }
                     return s;
                 });
                 this.setData({ flyingStars: updatedStars });
                 
                 // Wait for CSS transition (600ms) to hit the progress bar
                 setTimeout(() => {
                     // Clean up star
                     const filteredStars = this.data.flyingStars.filter(s => s.id !== starId);
                     this.setData({ flyingStars: filteredStars });
                     // Advance state, which expands progress bar width
                     handleAdvance();
                 }, 600);
             }, 50);
         });
      } else {
         // User is just re-recording an already done sentence, no star granted!
         handleAdvance();
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
    
    if (this.data.activeGroupIndex === groupIndex) {
      this.setData({ activeGroupIndex: -1 });
      return;
    }
    
    // Set active group to trigger CSS max-height expansion/collapse
    this.setData({ activeGroupIndex: groupIndex });
    
    // Wait for the previous group's CSS transition (400ms) to complete 
    // so the DOM height stabilizes BEFORE triggering scroll-into-view
    setTimeout(() => {
      this.setData({ scrollToView: `group-${groupIndex}` });
    }, 400);
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
