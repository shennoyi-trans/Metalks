/**
 * MyTopicsPage — 我的话题管理
 * v1.6:
 *  - 编辑按钮仅对 pending 状态话题可见
 *  - 状态变更提示（通知红点）
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';

const { ref, computed, onMounted } = Vue;

export const MyTopicsPage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
          <h2 style="font-size:22px;font-weight:700">我的话题</h2>
          <span v-if="hasStatusUpdates" class="notification-badge-text">有状态更新</span>
        </div>

        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <div v-else-if="!topics.length" class="empty-state">
          <div class="empty-icon">📝</div>
          <p>还没有创建话题</p>
          <button class="btn btn-primary" @click="$router.push('/topic/create')">创建话题</button>
        </div>
        <div v-else style="display:flex;flex-direction:column;gap:8px">
          <div v-for="t in topics" :key="t.id" class="card" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:4px">
                {{ t.title }}
                <span v-if="isStatusChanged(t)" class="notification-dot-inline" :title="getStatusChangeLabel(t)"></span>
              </div>
              <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text-muted)">
                <span :class="['status-badge', statusClass(t)]">{{ statusLabel(t) }}</span>
                <span>❤️ {{ t.likes_count || 0 }}</span>
                <span>⚡ {{ t.electrolyte_received || 0 }}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px">
              <!-- ✅ v1.6：编辑按钮仅对 pending 状态可见 -->
              <button v-if="t.status === 'pending'" class="btn btn-sm btn-secondary"
                @click="$router.push('/topic/create?edit='+t.id)">编辑</button>
              <button v-if="t.is_active" class="btn btn-sm btn-ghost" @click="deactivate(t)">下架</button>
              <button class="btn btn-sm btn-ghost" @click="showDeleteConfirm(t)" style="color:var(--error)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除确认 Modal -->
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget=null">
        <div class="modal-card" style="text-align:center">
          <h3 class="modal-title">确认永久删除？</h3>
          <p style="color:var(--text-secondary);margin-bottom:16px">此操作不可撤销</p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-ghost" @click="deleteTarget=null">取消</button>
            <button class="btn btn-primary" style="background:var(--error)" @click="removeTopic">确认删除</button>
          </div>
        </div>
      </div>

      <!-- 创建话题浮动按钮 -->
      <button class="fab-create-topic" @click="$router.push('/topic/create')" title="创建话题">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
  `,

  setup() {
    const toast = useToast();
    const user = useUser();
    const loading = ref(true);
    const topics = ref([]);
    const deleteTarget = ref(null);

    // ✅ v1.6：话题状态变更检测
    const hasStatusUpdates = computed(() => {
      return topics.value.some(t =>
        t.status === 'approved' || t.status === 'rejected' ||
        (t.status === 'approved' && !t.is_active)
      );
    });

    function isStatusChanged(t) {
      // 非 pending 状态的话题都显示状态点
      return t.status === 'approved' || t.status === 'rejected' ||
        (t.status === 'approved' && !t.is_active);
    }

    function getStatusChangeLabel(t) {
      if (t.status === 'rejected') return '未通过审核';
      if (t.status === 'approved' && !t.is_active) return '已被下架';
      if (t.status === 'approved' && t.is_active) return '已通过审核';
      return '';
    }

    function statusLabel(t) {
      if (t.status === 'pending') return '🟡 审核中';
      if (t.status === 'rejected') return '🔴 已拒绝';
      if (!t.is_active) return '⚫ 已下架';
      return '🟢 已上线';
    }

    function statusClass(t) {
      if (t.status === 'pending') return 'pending';
      if (t.status === 'rejected') return 'rejected';
      if (!t.is_active) return 'inactive';
      return 'active';
    }

    async function deactivate(t) {
      try {
        await api.topics.deactivate(t.id);
        t.is_active = false;
        toast.success('已下架');
      } catch (e) {
        toast.error(e.message);
      }
    }

    function showDeleteConfirm(t) { deleteTarget.value = t; }

    async function removeTopic() {
      const t = deleteTarget.value;
      try {
        await api.topics.remove(t.id);
        topics.value = topics.value.filter(x => x.id !== t.id);
        toast.success('已删除');
      } catch (e) { toast.error(e.message); }
      deleteTarget.value = null;
    }

    onMounted(async () => {
      // 标记通知已读
      user.markNotificationsRead();

      try {
        const r = await api.topics.myList();
        topics.value = r.topics || [];
      } catch (e) {}
      loading.value = false;
    });

    return {
      loading, topics, deleteTarget, hasStatusUpdates,
      statusLabel, statusClass, isStatusChanged, getStatusChangeLabel,
      deactivate, showDeleteConfirm, removeTopic,
    };
  }
};
