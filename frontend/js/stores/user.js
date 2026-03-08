/**
 * 用户信息 Store
 * ✅ v1.7：修复通知红点逻辑
 *  - 已读通知不会因轮询而重新出现红点
 *  - 头像红点仅在所有菜单红点消失后才消失
 *  - 有新通知时红点重新出现
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

  // ✅ v1.7：话题通知（细化红点控制）
  topicNotifications: [],
  hasTopicUpdates: false,
});

// 通知轮询定时器
let _notificationTimer = null;

// ✅ v1.7：已确认的通知 key 集合（用于判断"新"通知）
//   key = `${topic_id}:${status}` 唯一标识一条通知
let _acknowledgedKeys = new Set();

/**
 * 从通知列表生成唯一 key 集合
 * @param {Array} notifications
 * @returns {Set<string>}
 */
function _buildNotificationKeys(notifications) {
  return new Set(notifications.map(n => `${n.topic_id}:${n.status}`));
}

/**
 * 判断是否有未确认的新通知
 * @param {Array} notifications - 最新的通知列表
 * @returns {boolean}
 */
function _hasUnacknowledged(notifications) {
  return notifications.some(n => !_acknowledgedKeys.has(`${n.topic_id}:${n.status}`));
}

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

  // ✅ v1.7：获取话题通知（仅未确认的算新）
  async fetchTopicNotifications() {
    try {
      const res = await api.topics.getNotifications();
      state.topicNotifications = res.notifications || [];
      // 只有存在未确认的通知才显示红点
      state.hasTopicUpdates = _hasUnacknowledged(state.topicNotifications);
    } catch (e) {
      // 静默失败
    }
  },

  // ✅ v1.7：开启通知轮询（每60秒）
  startNotificationPolling() {
    this.stopNotificationPolling();
    this.fetchTopicNotifications();
    _notificationTimer = setInterval(() => {
      this.fetchTopicNotifications();
    }, 60000);
  },

  // ✅ v1.7：停止通知轮询
  stopNotificationPolling() {
    if (_notificationTimer) {
      clearInterval(_notificationTimer);
      _notificationTimer = null;
    }
  },

  // ✅ v1.7：标记话题通知已读
  //   将当前所有通知加入已确认集合，红点消失
  //   下次轮询若出现新的 key（如新审核通过），红点重新出现
  markTopicNotificationsRead() {
    const currentKeys = _buildNotificationKeys(state.topicNotifications);
    currentKeys.forEach(k => _acknowledgedKeys.add(k));
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
    _acknowledgedKeys = new Set();
    this.stopNotificationPolling();
  },
};

export function useUser() {
  return Object.assign(state, actions);
}
