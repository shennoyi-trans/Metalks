/**
 * SessionsPage — 我的对话（历史会话列表）
 * v2: 正确检测会话完成状态
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';

const { ref, onMounted } = Vue;
const { useRouter } = VueRouter;

export const SessionsPage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:20px">我的对话</h2>
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <div v-else-if="!sessions.length" class="empty-state">
          <div class="empty-icon">💬</div>
          <p>还没有对话记录，去话题广场看看？</p>
          <button class="btn btn-primary" @click="$router.push('/')">去话题广场</button>
        </div>
        <div v-else style="display:flex;flex-direction:column;gap:8px">
          <div
          v-for="s in sessions"
          :key="s.session_id||s.id"
          class="card card-hover session-card"
          :class="{ 'session-card--unavailable': s.topic_unavailable }"
          :data-reason="s.topic_unavailable_reason || '话题不可用'"
          @click="goSession(s)"
          >
            <div class="session-info">
              <div class="session-title">{{ sessionTitle(s) }}</div>
              <div v-if="s.topic_unavailable" class="session-unavailable-reason">
                {{ s.topic_unavailable_reason || '话题不可用' }}
              </div>
              <div class="session-time">{{ formatTime(s.created_at) }}</div>
            </div>
            
            <div class="session-right">
              <span :class="['status-badge', isSessionCompleted(s)?'completed':'active']">{{ isSessionCompleted(s) ? '✅ 已完成' : '🟢 进行中' }}</span>
              <button v-if="isSessionCompleted(s) && (s.report_ready)" class="btn btn-sm btn-secondary" @click.stop="$router.push('/session/'+(s.session_id||s.id)+'/report')">查看报告</button>
              <button class="btn btn-sm btn-ghost" @click.stop="confirmDelete(s)" style="color:var(--error)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除确认 Modal -->
      <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm=false">
        <div class="modal-card" style="text-align:center">
          <h3 class="modal-title">确认删除这条对话？</h3>
          <p style="color:var(--text-secondary);margin-bottom:16px">此操作不可撤销</p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-ghost" @click="showDeleteConfirm=false">取消</button>
            <button class="btn btn-primary" style="background:var(--error)" @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const router = useRouter();
    const toast = useToast();

    const loading = ref(true);
    const sessions = ref([]);
    const showDeleteConfirm = ref(false);
    const deleteTarget = ref(null);

    function formatTime(t) { if (!t) return ''; return new Date(t).toLocaleString('zh-CN'); }

    function sessionTitle(s) {
      return s.topic_title || (s.mode === 2 ? '随便聊聊' : '话题对话');
    }

    // 正确检测会话完成状态
    function isSessionCompleted(s) {
      if (s.is_completed === true) return true;
      if (s.status === 'completed') return true;
      return false;
    }

    function goSession(s) {
      if (s.topic_unavailable) return;
      const id = s.session_id || s.id;
      const query = {};
      if (s.mode) query.mode = s.mode;
      if (s.topic_title) query.topicName = s.topic_title;
      if (s.topic_id) query.topicId = s.topic_id;
      // 不传 first=true，让 ChatPage 走"从历史进入"逻辑
      router.push({ path: `/chat/${id}`, query });
    }

    function confirmDelete(s) { deleteTarget.value = s; showDeleteConfirm.value = true; }

    async function doDelete() {
      const id = deleteTarget.value.session_id || deleteTarget.value.id;
      try {
        await api.sessions.remove(id);
        sessions.value = sessions.value.filter(s => (s.session_id || s.id) !== id);
        toast.success('已删除');
      } catch (e) { toast.error('删除失败'); }
      showDeleteConfirm.value = false;
    }

    onMounted(async () => {
      try {
        const res = await api.sessions.list();
        sessions.value = Array.isArray(res) ? res : (res.sessions || []);
      } catch (e) { toast.error('加载失败'); }
      loading.value = false;
    });

    return {
      loading, sessions, showDeleteConfirm, formatTime,
      sessionTitle, isSessionCompleted, goSession, confirmDelete, doDelete,
    };
  }
};
