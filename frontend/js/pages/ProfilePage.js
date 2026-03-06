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
          <div class="avatar-lg">{{ (user.nickname||'U')[0] }}</div>
          <h2>{{ user.nickname }}</h2>
          <p>{{ user.email }}</p>
          <div class="elec-big">⚡ {{ user.electrolyteBalance }}</div>
        </div>
        <div class="settings-list">
          <div class="settings-item" @click="$router.push('/sessions')">我的对话 <span class="arrow">→</span></div>
          <div class="settings-item" @click="$router.push('/traits')">我的特质 <span class="arrow">→</span></div>
          <div class="settings-item" @click="$router.push('/topic/mine')">我的话题 <span class="arrow">→</span></div>
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
            <button class="btn btn-primary" @click="doChangeNickname" :disabled="!nickAvail">确认修改</button>
          </div>
        </div>
      </div>

      <!-- 修改密码 Modal -->
      <div v-if="showPassword" class="modal-overlay" @click.self="showPassword=false">
        <div class="modal-card">
          <h3 class="modal-title">修改密码</h3>
          <div class="form-group">
            <label class="form-label">旧密码</label>
            <input class="form-input" v-model="oldPw" type="password">
          </div>
          <div class="form-group">
            <label class="form-label">新密码（最少6位）</label>
            <input class="form-input" v-model="newPw" type="password">
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" @click="showPassword=false">取消</button>
            <button class="btn btn-primary" @click="doChangePw">确认修改</button>
          </div>
        </div>
      </div>

      <!-- 退出确认 Modal -->
      <div v-if="showLogout" class="modal-overlay" @click.self="showLogout=false">
        <div class="modal-card" style="text-align:center">
          <h3 class="modal-title">确认退出登录？</h3>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-ghost" @click="showLogout=false">取消</button>
            <button class="btn btn-primary" style="background:var(--error)" @click="api.auth.logout()">确认退出</button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const user = useUser();
    const toast = useToast();

    const showNickname = ref(false);
    const showPassword = ref(false);
    const showLogout = ref(false);
    const newNickname = ref('');
    const nickAvail = ref(false);
    const nickMsg = ref('');
    const oldPw = ref('');
    const newPw = ref('');
    let nickTimer = null;

    function checkNick() {
      clearTimeout(nickTimer);
      nickMsg.value = '';
      nickAvail.value = false;
      if (!newNickname.value) return;
      nickTimer = setTimeout(async () => {
        try {
          const r = await api.user.checkNickname(newNickname.value);
          nickAvail.value = r.available;
          nickMsg.value = r.message;
        } catch (e) { nickMsg.value = '检查失败'; }
      }, 500);
    }

    async function doChangeNickname() {
      try {
        await api.user.changeNickname(newNickname.value);
        toast.success('昵称修改成功');
        showNickname.value = false;
        user.fetchProfile();
      } catch (e) { toast.error(e.message); }
    }

    async function doChangePw() {
      if (newPw.value.length < 6) { toast.error('新密码至少6位'); return; }
      try {
        await api.user.changePassword(oldPw.value, newPw.value);
        toast.success('密码修改成功');
        showPassword.value = false;
        oldPw.value = '';
        newPw.value = '';
      } catch (e) { toast.error(e.message); }
    }

    onMounted(() => { user.fetchProfile(); });

    return {
      user, api, showNickname, showPassword, showLogout,
      newNickname, nickAvail, nickMsg, oldPw, newPw,
      checkNick, doChangeNickname, doChangePw,
    };
  }
};
