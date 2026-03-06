/**
 * AuthPage — 登录 / 注册
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';

const { ref, reactive } = Vue;
const { useRouter } = VueRouter;

export const AuthPage = {
  template: `
    <div class="auth-page">
      <div class="auth-container">
        <div class="auth-brand">
          <h1>Metalks</h1>
          <p>在对话中发现你的观念</p>
        </div>
        <div class="auth-card">
          <div class="auth-tabs">
            <button :class="['auth-tab', { active: tab === 'login' }]" @click="tab='login'">登录</button>
            <button :class="['auth-tab', { active: tab === 'register' }]" @click="tab='register'">注册</button>
          </div>

          <!-- 登录 -->
          <div v-if="tab==='login'">
            <div class="form-group">
              <label class="form-label">邮箱</label>
              <input class="form-input" v-model="loginForm.email" type="email" placeholder="请输入邮箱" @keyup.enter="handleLogin">
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input class="form-input" v-model="loginForm.password" type="password" placeholder="请输入密码" @keyup.enter="handleLogin">
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%" @click="handleLogin" :disabled="loginLoading">
              <span v-if="loginLoading" class="spinner"></span>
              {{ loginLoading ? '登录中...' : '登录' }}
            </button>
          </div>

          <!-- 注册 -->
          <div v-if="tab==='register'">
            <div class="form-group">
              <label class="form-label">邮箱</label>
              <input :class="['form-input', { error: emailError }]" v-model="regForm.email" type="email" placeholder="请输入邮箱" @blur="checkEmailAvail">
              <p v-if="emailError" class="form-error">{{ emailError }}</p>
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input :class="['form-input', { error: regForm.password && regForm.password.length < 6 }]" v-model="regForm.password" type="password" placeholder="最少6位">
              <p v-if="regForm.password && regForm.password.length < 6" class="form-error">密码至少需要6位</p>
            </div>
            <div class="form-group">
              <label class="form-label">昵称</label>
              <input class="form-input" v-model="regForm.nickname" placeholder="选填，不填自动生成">
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%" @click="handleRegister" :disabled="regLoading">
              <span v-if="regLoading" class="spinner"></span>
              {{ regLoading ? '注册中...' : '注册' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const router = useRouter();
    const toast = useToast();
    const user = useUser();

    const tab = ref('login');
    const loginForm = reactive({ email: '', password: '' });
    const regForm = reactive({ email: '', password: '', nickname: '' });
    const loginLoading = ref(false);
    const regLoading = ref(false);
    const emailError = ref('');

    async function checkEmailAvail() {
      if (!regForm.email) return;
      try {
        const res = await api.auth.checkEmail(regForm.email);
        emailError.value = res.available ? '' : res.message;
      } catch (e) { emailError.value = ''; }
    }

    async function handleLogin() {
      if (!loginForm.email || !loginForm.password) { toast.error('请填写邮箱和密码'); return; }
      loginLoading.value = true;
      const res = await api.auth.login(loginForm.email, loginForm.password);
      loginLoading.value = false;
      if (res.success) {
        await user.fetchProfile();
        if (res.data?.checkin && !res.data.checkin.already_checked) {
          toast.success('每日签到 +1⚡');
        }
        router.push('/');
      } else {
        toast.error(res.error);
      }
    }

    async function handleRegister() {
      if (!regForm.email || !regForm.password) { toast.error('请填写邮箱和密码'); return; }
      if (regForm.password.length < 6) { toast.error('密码至少6位'); return; }
      regLoading.value = true;
      const res = await api.auth.register(regForm.email, regForm.password, regForm.nickname || undefined);
      regLoading.value = false;
      if (res.success) {
        toast.success('注册成功，请登录');
        tab.value = 'login';
        loginForm.email = regForm.email;
      } else {
        toast.error(res.error);
      }
    }

    return {
      tab, loginForm, regForm, loginLoading, regLoading,
      emailError, checkEmailAvail, handleLogin, handleRegister,
    };
  }
};
