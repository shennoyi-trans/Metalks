/**
 * 用户信息 Store
 *
 * 通知红点逻辑（纯后端驱动）：
 *  - 后端 notifications 表有记录就亮红点，没有就灭
 *  - 用户查看/编辑某个话题 → 调用后端删除该话题的通知 → 红点消失
 *  - 前端不做任何推导，不依赖 localStorage 或内存 Set
 *
 * 每日签到：
 *  - 由 fetchProfile 触发（后端在 GET /user/profile 时自动签到）
 *  - 返回的 electrolyte_balance 已包含签到奖励
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

  // 话题通知（直接映射后端 notifications 表）
  topicNotifications: [],
  hasTopicUpdates: false,
});

// 通知轮询定时器
let _notificationTimer = null;

// ----------------------------------------------------------
// Actions
// ----------------------------------------------------------

const actions = {
  /**
   * 获取用户信息（同时触发后端每日签到）
   */
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

  /**
   * 从后端拉取通知列表
   * 有记录 → hasTopicUpdates = true → 亮红点
   * 无记录 → hasTopicUpdates = false → 灭红点
   */
  async fetchTopicNotifications() {
    try {
      const res = await api.topics.getNotifications();
      state.topicNotifications = res.notifications || [];
      state.hasTopicUpdates = state.topicNotifications.length > 0;
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

  /**
   * 逐条消除：标记某个话题的通知已读
   *
   * 流程：
   *  1. 立即从本地列表移除（保证 UI 即时响应）
   *  2. 重新计算全局红点
   *  3. 后台调用后端 DELETE 接口删除该话题的通知记录
   */
  markTopicViewed(topicId) {
    // 立即更新本地状态
    state.topicNotifications = state.topicNotifications.filter(
      n => n.topic_id !== topicId
    );
    state.hasTopicUpdates = state.topicNotifications.length > 0;

    // 后台通知后端（不阻塞 UI）
    api.topics.dismissNotification(topicId).catch(() => {});
  },

  /**
   * 检查某个话题是否有未读通知（供 MyTopicsPage 使用）
   * 直接查本地通知列表：有记录就有红点
   */
  isTopicUnviewed(topicId) {
    return state.topicNotifications.some(n => n.topic_id === topicId);
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
