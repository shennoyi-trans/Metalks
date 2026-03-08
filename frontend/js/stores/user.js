/**
 * 用户信息 Store
 * ✅ v1.6：新增话题状态通知
 */

import api from '../api/index.js';

const { reactive } = Vue;

const state = reactive({
  isLoggedIn: false,
  userId: null,
  nickname: '',
  email: '',
  electrolyteBalance: 0,
  isPlus: false,
  isAdmin: false,
  createdAt: null,

  // ✅ v1.6：话题通知
  topicNotifications: [],
  hasTopicUpdates: false,
});

// 通知轮询定时器
let _notificationTimer = null;

const actions = {
  async fetchProfile() {
    try {
      const data = await api.user.getProfile();
      state.isLoggedIn = true;
      state.userId = data.id;
      state.nickname = data.nickname;
      state.email = data.email;
      state.electrolyteBalance = data.electrolyte_balance || 0;
      state.isPlus = data.is_plus || false;
      state.isAdmin = data.is_admin || false;
      state.createdAt = data.created_at || null;

      // 登录后开启通知轮询
      this.startNotificationPolling();
    } catch (e) {
      state.isLoggedIn = false;
    }
  },

  async refreshElectrolyte() {
    try {
      const d = await api.user.getElectrolyte();
      state.electrolyteBalance = d.balance;
    } catch (e) {}
  },

  // ✅ v1.6：获取话题通知
  async fetchTopicNotifications() {
    try {
      const res = await api.topics.getNotifications();
      state.topicNotifications = res.notifications || [];
      state.hasTopicUpdates = res.has_updates || false;
    } catch (e) {
      // 静默失败
    }
  },

  // ✅ v1.6：开启通知轮询（每60秒）
  startNotificationPolling() {
    this.stopNotificationPolling();
    this.fetchTopicNotifications();
    _notificationTimer = setInterval(() => {
      this.fetchTopicNotifications();
    }, 60000);
  },

  // ✅ v1.6：停止通知轮询
  stopNotificationPolling() {
    if (_notificationTimer) {
      clearInterval(_notificationTimer);
      _notificationTimer = null;
    }
  },

  // ✅ v1.6：标记通知已读（清除红点）
  markNotificationsRead() {
    state.hasTopicUpdates = false;
  },

  clear() {
    state.isLoggedIn = false;
    state.userId = null;
    state.nickname = '';
    state.email = '';
    state.electrolyteBalance = 0;
    state.isPlus = false;
    state.isAdmin = false;
    state.createdAt = null;
    state.topicNotifications = [];
    state.hasTopicUpdates = false;
    this.stopNotificationPolling();
  },
};

export function useUser() {
  return Object.assign(state, actions);
}
