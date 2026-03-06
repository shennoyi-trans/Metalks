/**
 * 用户信息 Store
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
  createdAt: '',  // ← 新增：注册时间
});

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
      state.createdAt = data.created_at || '';  // ← 新增：存储注册时间
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

  clear() {
    state.isLoggedIn = false;
    state.userId = null;
    state.nickname = '';
    state.email = '';
    state.electrolyteBalance = 0;
    state.isPlus = false;
    state.createdAt = '';  // ← 新增：清空注册时间
  },
};

export function useUser() {
  return Object.assign(state, actions);
}
