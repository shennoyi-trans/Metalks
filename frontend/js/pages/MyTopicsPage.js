/**
 * MyTopicsPage — 我的话题管理
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';

const { ref, onMounted } = Vue;

export const MyTopicsPage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:20px">我的话题</h2>
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <div v-else-if="!topics.length" class="empty-state">
          <div class="empty-icon">📝</div>
          <p>还没有创建话题</p>
          <button class="btn btn-primary" @click="$router.push('/topic/create')">创建话题</button>
        </div>
        <div v-else style="display:flex;flex-direction:column;gap:8px">
          <div v-for="t in topics" :key="t.id" class="card" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px">
            <div>
              <div style="font-weight:600;margin-bottom:4px">{{ t.title }}</div>
              <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text-muted)">
                <span :class="['status-badge', statusClass(t)]">{{ statusLabel(t) }}</span>
                <span>❤️ {{ t.likes_count || 0 }}</span>
                <span>⚡ {{ t.electrolyte_received || 0 }}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-secondary" @click="$router.push('/topic/create?edit='+t.id)">编辑</button>
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
    </div>
  `,

  setup() {
    const toast = useToast();
    const loading = ref(true);
    const topics = ref([]);
    const deleteTarget = ref(null);

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
      try { await api.topics.deactivate(t.id); t.is_active = false; toast.success('已下架'); }
      catch (e) { toast.error(e.message); }
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
      try { const r = await api.topics.myList(); topics.value = r.topics || []; } catch (e) {}
      loading.value = false;
    });

    return { loading, topics, deleteTarget, statusLabel, statusClass, deactivate, showDeleteConfirm, removeTopic };
  }
};
