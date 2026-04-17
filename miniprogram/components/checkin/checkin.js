Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    streak: {
      type: Number,
      value: 0
    },
    totalSentences: {
      type: Number,
      value: 0
    },
    avatarUrl: {
      type: String,
      value: ''
    }
  },
  methods: {
    catchModalTap() {
      // Prevent bubbling
    },
    onClose() {
      this.setData({ show: false });
      this.triggerEvent('close');
    },
    onStart() {
      this.setData({ show: false });
      this.triggerEvent('start');
    }
  }
});
