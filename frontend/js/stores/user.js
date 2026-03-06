/**
 * 用户信息 Store
 */

import api from '../api/index.js';

const { reactive } = Vue;

/** 响应式用户状态 */
const state = reactive({
  isLoggedIn: false,
  userId: null,
  nickname: '',
  email: '',
  electrolyteBalance: 0,
  isPlus: false,
});

/** 用户操作方法 */
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
    } catch (e) {
      state.isLoggedIn = false;
    }
  },

  async refreshElectrolyte() {
    try {
      const d = await api.user.getElectrolyte();
      state.electrolyteBalance = d.balance;
    } catch (e) { /* ignore */ }
  },

  clear() {
    state.isLoggedIn = false;
    state.userId = null;
    state.nickname = '';
    state.email = '';
    state.electrolyteBalance = 0;
    state.isPlus = false;
  },
};

/**
 * Composable hook — 返回 reactive state + actions
 * 模板中直接用 user.nickname, user.fetchProfile() 等
 */
export function useUser() {
  return Object.assign(state, actions);
}
