// pages/reading/reading.js
const { request } = require('../../utils/request');

const recorderManager = wx.getRecorderManager();
// this._audio is created per page instance in onLoad (see this._audio)

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

    // Dynamic Navigation
    navTop: 50, // default fallback
    navHeight: 32,

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
    const { lessonId, theme } = options;
    const menuButton = wx.getMenuButtonBoundingClientRect();
    
    this.setData({ 
      lessonId,
      colorTheme: theme || 'theme-primary',
      navTop: menuButton.top,
      navHeight: menuButton.height
    });
    // Create a fresh audio context per page visit to avoid using a destroyed instance
    this._audio = wx.createInnerAudioContext();
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

      // Load locally saved reading progress
      const savedStorage = wx.getStorageSync(`lesson_recordings_${lessonId}`) || {};
      // Rebuild recordings map: uploaded entries count as done (truthy), pending as their tempPath
      const recordings = {};
      for (let key in savedStorage) {
        const entry = savedStorage[key];
        if (entry === true || (entry && entry.uploaded)) {
          recordings[key] = entry; // already uploaded
        } else if (entry && entry.tempPath) {
          recordings[key] = entry.tempPath; // local file waiting to upload
        } else {
          recordings[key] = entry;
        }
      }
      const recordedCount = Object.keys(recordings).length;

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
        lesson,
        sentences,
        groups,
        activeGroupIndex: startGroup,
        currentIndex: startIndex,
        loading: false,
        recordings,
        recordedCount,
        allDone: recordedCount >= sentences.length
      });

      if (startIndex > 0) {
        setTimeout(() => {
          this._scrollToNode(`#group-${startGroup}`);
        }, 500);
      }

      // Prime audio player with the master file
      if (lesson.masterAudioUrl) {
        this._audio.src = lesson.masterAudioUrl;
      }

      // Measure group anchor positions after DOM settles
      setTimeout(() => this._measureGroupOffsets(), 400);

    } catch (err) {
      wx.showToast({ title: '加载课程失败', icon: 'error' });
      this.setData({ loading: false });
    }
  },

  // Measure Y position of each group anchor node (relative to scroll-view top)
  _measureGroupOffsets() {
    const { groups } = this.data;
    if (!groups || groups.length === 0) return;

    const query = wx.createSelectorQuery().in(this);
    groups.forEach((g, idx) => {
      query.select(`#group-anchor-${idx}`).boundingClientRect();
    });
    // Also need scroll-view top as reference
    query.select('.content-scroll').boundingClientRect();

    query.exec((rects) => {
      const scrollViewRect = rects[rects.length - 1];
      if (!scrollViewRect) return;
      const scrollViewTop = scrollViewRect.top;

      // Store offsets as distances from the scroll-view container top
      this._groupOffsets = [];
      for (let i = 0; i < groups.length; i++) {
        const rect = rects[i];
        if (rect) {
          // How far down from scroll-view top is this anchor currently (at scrollTop=0)
          this._groupOffsets[i] = rect.top - scrollViewTop;
        } else {
          this._groupOffsets[i] = 0;
        }
      }
    });
  },

  onContentScroll(e) {
    const scrollTop = e.detail.scrollTop;
    const offsets = this._groupOffsets;
    if (!offsets || offsets.length === 0) return;

    // Find the last group whose anchor is above (or at) the current scroll position + small lookahead
    let activeIdx = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (scrollTop >= offsets[i] - 80) {
        activeIdx = i;
      }
    }

    if (activeIdx !== this.data.activeGroupIndex) {
      this.setData({ activeGroupIndex: activeIdx });
    }
  },

  // ─── Audio Setup ───────────────────────────────────────────────────────────
  _setupAudioContext() {
    this._audio.onPlay(() => {
    });

    this._audio.onSeeking(() => {
      this.isSeeking = true;
    });

    this._audio.onSeeked(() => {
      this.isSeeking = false;
    });

    this._audio.onTimeUpdate(() => {
      if (this.isSeeking) return;

      const { playingIndex, sentences } = this.data;
      if (playingIndex === -1) return;

      const targetSentence = sentences[playingIndex];
      // If we've reached the end timestamp for this chunk, automatically pause.
      if (targetSentence && typeof targetSentence.endTime === 'number') {
        if (this._audio.currentTime >= targetSentence.endTime && this._audio.currentTime > 0) {
          this._audio.pause();
          this.setData({ playingIndex: -1 });
        }
      }
    });

    this._audio.onEnded(() => {
      this.setData({ playingIndex: -1 });
    });

    this._audio.onError((err) => {
      this.setData({ playingIndex: -1 });
      this.isSeeking = false;
      console.error('[this._audio Error]', err);
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

        // Persist to storage: store tempFilePath for new recordings, preserve uploaded markers
        const existingStorage = wx.getStorageSync(`lesson_recordings_${this.data.lessonId}`) || {};
        const storageMask = { ...existingStorage };
        for (let key in updated) {
          const val = updated[key];
          if (typeof val === 'string') {
            // New local recording not yet uploaded
            storageMask[key] = { uploaded: false, tempPath: val };
          }
          // If already { uploaded: true }, don't overwrite
        }
        wx.setStorageSync(`lesson_recordings_${this.data.lessonId}`, storageMask);

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
            if (isNewGroup) {
              this._scrollToNode(`#group-${targetGroupIndex}`);
            } else {
              this._scrollToNode(`#sentence-${nextIndex}`);
            }
          }, 400);
        }
      };

      if (isNewRecording) {
        const query = wx.createSelectorQuery();
        query.select('.giant-mic-btn').boundingClientRect();
        query.select('.star-icon').boundingClientRect();

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
    this._wantToRecord = true;  // Set intent flag BEFORE async call

    // Synchronously stop any playing audio BEFORE the async getSetting call.
    // This prevents the brief flash where playingIndex is still set while
    // isRecording is still false, which would wrongly show the speaker icon.
    if (this.data.playingIndex !== -1) {
      this._audio.pause();
      this.setData({ playingIndex: -1 });
    }

    wx.getSetting({
      success: (res) => {
        if (!this._wantToRecord) return;  // User already released - abort

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
    this._wantToRecord = false;  // Clear intent flag
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
    // before triggering native page scroll to prevent bounds violations
    setTimeout(() => {
      this._scrollToNode(`#group-${groupIndex}`);
    }, 400);
  },

  onSentenceTap(e) {
    const targetIdx = e.currentTarget.dataset.index;
    const { sentences, playingIndex, lesson } = this.data;
    const sentence = sentences[targetIdx];

    // If clicking currently active sentence audio... STOP it.
    if (playingIndex === targetIdx) {
      this._audio.pause();
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
      if (this._audio.src !== lesson.masterAudioUrl) {
        this._audio.src = lesson.masterAudioUrl;
        // WeChat InnerAudioContext allows setting 'startTime' directly before calling 'play'
        this._audio.startTime = sentence.startTime;
        this._audio.play();
      } else {
        // Synchronously flag that we are seeking to avoid onTimeUpdate instantly stopping it.
        this.isSeeking = true;
        // Fallback to clear isSeeking flag in case onSeeked somehow doesn't fire
        if (this.seekTimeout) clearTimeout(this.seekTimeout);
        this.seekTimeout = setTimeout(() => { this.isSeeking = false; }, 1000);

        this._audio.seek(sentence.startTime);
        this._audio.play();
      }
    }
    // Fallback to standalone sentence audioUrl
    else if (sentence.audioUrl) {
      if (this._audio.src !== sentence.audioUrl) {
        this._audio.src = sentence.audioUrl;
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

  _scrollToNode(selector) {
    const query = wx.createSelectorQuery();
    query.select(selector).boundingClientRect();
    query.selectViewport().scrollOffset();

    query.exec((res) => {
      if (!res[0] || !res[1]) return;

      const targetRect = res[0];
      const scrollInfo = res[1];

      // We want to offset by sticking header height (230rpx)
      const systemInfo = wx.getWindowInfo();
      const pxPerRpx = systemInfo.screenWidth / 750;
      const offsetPx = 230 * pxPerRpx;

      // Calculate absolute scroll destination
      const targetTop = scrollInfo.scrollTop + targetRect.top - offsetPx;

      wx.pageScrollTo({
        scrollTop: targetTop,
        duration: 300
      });
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
        success: (res) => { if (res.confirm) this._doSubmit(); },
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
        if (typeof val === 'string') {
          const sentence = sentences[sentenceIndex];
          pendingEntries.push({
            sentenceIndex,
            tempPath: val,
            sentenceId: sentence ? sentence.id : null,
          });
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

      wx.showLoading({ title: `上传录音 1/${pendingEntries.length}…`, mask: true });
      const storage = wx.getStorageSync(`lesson_recordings_${lessonId}`) || {};

      for (let i = 0; i < pendingEntries.length; i++) {
        const entry = pendingEntries[i];
        wx.showLoading({ title: `上传录音 ${i + 1}/${pendingEntries.length}…`, mask: true });

        // 直传云存储（wx.cloud.uploadFile 不受 uploadFile 合法域名限制）
        const cloudPath = `recordings/${lessonId}/${entry.sentenceId || entry.sentenceIndex}_${Date.now()}.aac`;
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
          data: {
            lessonId,
            cloudId: uploadRes.cloudID,   // wx.cloud.uploadFile 返回的 fileID (cloud://...)
            sentenceId: entry.sentenceId,
          },
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
