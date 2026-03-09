/**
 * ProfilePage — 个人中心
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';

const { ref, onMounted } = Vue;

export const ProfilePage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <div class="profile-hero">
          <div class="avatar-lg" style="position:relative">
            {{ (user.nickname||'U')[0] }}
            <span v-if="user.hasTopicUpdates" class="notification-dot notification-dot--profile-avatar"></span>
          </div>
          <h2>{{ user.nickname }}</h2>
          <p style="font-size:12px;color:var(--text-muted);margin-top:2px">ID: {{ user.userId }}</p>
          <p>{{ user.email }}</p>
          <p v-if="user.createdAt" style="font-size:12px;color:var(--text-muted);margin-top:4px">注册于 {{ formatTime(user.createdAt) }}</p>
          <div class="elec-big">⚡ {{ user.electrolyteBalance }}</div>
        </div>
        <div class="settings-list">
          <div class="settings-item" @click="$router.push('/sessions')">我的对话 <span class="arrow">→</span></div>
          <div class="settings-item" @click="$router.push('/traits')">我的特质 <span class="arrow">→</span></div>
          <div class="settings-item" @click="goMyTopics" style="position:relative">
            我的话题
            <span v-if="user.hasTopicUpdates" class="notification-dot notification-dot--settings"></span>
            <span class="arrow">→</span>
          </div>
          <div class="settings-item" @click="showNickname=true">修改昵称 <span class="arrow">→</span></div>
          <div class="settings-item" @click="showPassword=true">修改密码 <span class="arrow">→</span></div>
          <div class="settings-item" style="color:var(--error)" @click="showLogout=true">退出登录 <span class="arrow">→</span></div>
        </div>
      </div>

      <!-- 修改昵称 Modal -->
      <div v-if="showNickname" class="modal-overlay" @click.self="showNickname=false">
        <div class="modal-card">
          <h3 class="modal-title">修改昵称</h3>
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">当前昵称：{{ user.nickname }}</p>
          <div class="form-group">
            <input class="form-input" v-model="newNickname" placeholder="输入新昵称" @input="checkNick">
            <p v-if="nickMsg" :class="nickAvail?'form-hint':'form-error'">{{ nickMsg }}</p>
          </div>
          <p style="font-size:12px;color:var(--orange);margin-bottom:16px">修改昵称将消耗电解液</p>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" @click="showNickname=false">取消</button>
            <button class="btn btn-primary" @click="doChangeNickname" :disabled="!nickAvail || nickLoading">
              {{ nickLoading ? '修改中...' : '确认修改' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 修改密码 Modal -->
      <div v-if="showPassword" class="modal-overlay" @click.self="showPassword=false">
        <div class="modal-card">
          <h3 class="modal-title">修改密码</h3>
          <div class="form-group">
            <label class="form-label">当前密码</label>
            <input class="form-input" type="password" v-model="pwForm.old" placeholder="输入当前密码">
          </div>
          <div class="form-group">
            <label class="form-label">新密码</label>
            <input class="form-input" type="password" v-model="pwForm.new" placeholder="输入新密码（至少6位）">
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" @click="showPassword=false">取消</button>
            <button class="btn btn-primary" @click="doChangePassword" :disabled="pwLoading">
              {{ pwLoading ? '修改中...' : '确认修改' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 退出登录确认 Modal -->
      <div v-if="showLogout" class="modal-overlay" @click.self="showLogout=false">
        <div class="modal-card">
          <h3 class="modal-title">退出登录</h3>
          <p style="font-size:14px;color:var(--text-secondary);margin-bottom:20px">确定要退出登录吗？</p>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" @click="showLogout=false">取消</button>
            <button class="btn btn-primary" style="background:var(--error)" @click="doLogout">退出</button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const toast = useToast();
    const user = useUser();

    const showNickname = ref(false);
    const showPassword = ref(false);
    const showLogout = ref(false);

    // 昵称修改
    const newNickname = ref('');
    const nickMsg = ref('');
    const nickAvail = ref(false);
    const nickLoading = ref(false);
    let nickTimer = null;

    function checkNick() {
      if (nickTimer) clearTimeout(nickTimer);
      const n = newNickname.value.trim();
      if (!n) { nickMsg.value = ''; nickAvail.value = false; return; }
      nickTimer = setTimeout(async () => {
        try {
          const res = await api.user.checkNickname(n);
          nickAvail.value = res.available;
          nickMsg.value = res.message;
        } catch (e) {
          nickAvail.value = false;
          nickMsg.value = '检查失败';
        }
      }, 400);
    }

    async function doChangeNickname() {
      nickLoading.value = true;
      try {
        const res = await api.user.changeNickname(newNickname.value.trim());
        if (res.success) {
          toast.success(res.message);
          user.nickname = res.new_nickname;
          user.electrolyteBalance = res.balance;
          showNickname.value = false;
          newNickname.value = '';
        } else {
          toast.error(res.message);
        }
      } catch (e) { toast.error(e.message || '修改失败'); }
      nickLoading.value = false;
    }

    // 密码修改
    const pwForm = ref({ old: '', new: '' });
    const pwLoading = ref(false);

    async function doChangePassword() {
      if (!pwForm.value.old || !pwForm.value.new) { toast.error('请填写完整'); return; }
      if (pwForm.value.new.length < 6) { toast.error('新密码至少6位'); return; }
      pwLoading.value = true;
      try {
        await api.user.changePassword(pwForm.value.old, pwForm.value.new);
        toast.success('密码修改成功');
        showPassword.value = false;
        pwForm.value = { old: '', new: '' };
      } catch (e) { toast.error(e.message || '修改失败'); }
      pwLoading.value = false;
    }

    // 退出登录
    async function doLogout() {
      try { await api.auth.logout(); } catch (e) {}
      user.clear();
      window.location.href = '/auth';
    }

    function formatTime(t) { if (!t) return ''; return new Date(t).toLocaleString('zh-CN'); }

    // 跳转我的话题
    function goMyTopics() {
      const router = VueRouter.useRouter();
      router.push('/topic/mine');
    }

    return {
      user, showNickname, showPassword, showLogout,
      newNickname, nickMsg, nickAvail, nickLoading, checkNick, doChangeNickname,
      pwForm, pwLoading, doChangePassword,
      doLogout, formatTime, goMyTopics,
    };
  }
};
