/**
 * 用户信息 Store
 *
 * 通知红点逻辑：
 *  - 已读通知不会因轮询而重新出现红点
 *  - 头像红点仅在所有菜单红点消失后才消失
 *  - 有新通知时红点重新出现
 *  - 单个话题被查看/编辑后，该话题的红点消失
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

  // 话题通知（细化红点控制）
  topicNotifications: [],
  hasTopicUpdates: false,
});

// 通知轮询定时器
let _notificationTimer = null;

// 已确认的通知 key 集合（用于判断"新"通知）
//   key = `${topic_id}:${status}` 唯一标识一条通知
let _acknowledgedKeys = new Set();

// 已查看的单个话题 ID 集合（用于控制每条话题的红点）
let _viewedTopicIds = new Set();

// ----------------------------------------------------------
// 工具函数
// ----------------------------------------------------------

/**
 * 从通知列表生成唯一 key 集合
 */
function _buildNotificationKeys(notifications) {
  return new Set(notifications.map(n => `${n.topic_id}:${n.status}`));
}

/**
 * 判断是否有未确认的新通知
 */
function _hasUnacknowledged(notifications) {
  return notifications.some(n => !_acknowledgedKeys.has(`${n.topic_id}:${n.status}`));
}

/**
 * 判断某个话题是否有未查看的状态变更
 * 仅当该话题 ID 不在 _viewedTopicIds 中、且存在于通知列表中时返回 true
 */
function isTopicUnviewed(topicId) {
  if (_viewedTopicIds.has(topicId)) return false;
  return state.topicNotifications.some(
    n => n.topic_id === topicId && !_acknowledgedKeys.has(`${n.topic_id}:${n.status}`)
  );
}

// ----------------------------------------------------------
// Actions
// ----------------------------------------------------------

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

  // 获取话题通知（仅未确认的算新）
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

  // 开启通知轮询（每60秒）
  startNotificationPolling() {
    this.stopNotificationPolling();
    this.fetchTopicNotifications();
    _notificationTimer = setInterval(() => {
      this.fetchTopicNotifications();
    }, 60000);
  },

  // 停止通知轮询
  stopNotificationPolling() {
    if (_notificationTimer) {
      clearInterval(_notificationTimer);
      _notificationTimer = null;
    }
  },

  // 标记所有话题通知已读（进入"我的话题"页面时调用）
  //   将当前所有通知加入已确认集合，红点消失
  //   下次轮询若出现新的 key（如新审核通过），红点重新出现
  markTopicNotificationsRead() {
    const currentKeys = _buildNotificationKeys(state.topicNotifications);
    currentKeys.forEach(k => _acknowledgedKeys.add(k));
    state.hasTopicUpdates = false;
  },

  // 标记单个话题已查看（点击查看详情/编辑时调用）
  //   该话题的红点消失，但全局红点是否消失取决于其他话题
  markTopicViewed(topicId) {
    _viewedTopicIds.add(topicId);
    // 同时把该话题相关的通知 key 加入已确认集合
    state.topicNotifications
      .filter(n => n.topic_id === topicId)
      .forEach(n => _acknowledgedKeys.add(`${n.topic_id}:${n.status}`));
    // 重新计算全局红点
    state.hasTopicUpdates = _hasUnacknowledged(state.topicNotifications);
  },

  // 检查某个话题是否有未查看的状态变更（供 MyTopicsPage 使用）
  isTopicUnviewed(topicId) {
    return isTopicUnviewed(topicId);
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
    _viewedTopicIds = new Set();
    this.stopNotificationPolling();
  },
};

export function useUser() {
  return Object.assign(state, actions);
}
