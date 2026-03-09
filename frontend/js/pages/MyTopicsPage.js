/**
 * MyTopicsPage — 我的话题管理
 *
 * 红点逻辑：
 *  - 仅在话题有状态变更（审核通过/拒绝/下架）且用户未查看时显示红点
 *  - 用户查看/编辑某个话题时逐条删除该话题的通知
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';
import { renderMarkdown } from '../utils/markdown.js';

const { ref, computed, onMounted } = Vue;
const { useRouter } = VueRouter;

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
          <div v-for="t in topics" :key="t.id" class="card" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer"
            @click="handleTopicClick(t.id)">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:4px">
                {{ t.title }}
                <span v-if="isTopicUnviewed(t)" class="notification-dot-inline" :title="getStatusChangeLabel(t)"></span>
              </div>
              <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text-muted)">
                <span :class="['status-badge', statusClass(t)]">{{ statusLabel(t) }}</span>
                <span>❤️ {{ t.likes_count || 0 }}</span>
                <span>⚡ {{ t.electrolyte_received || 0 }}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px" @click.stop>
              <button class="btn btn-ghost btn-sm" @click="handleEdit(t.id)" style="font-size:12px">✏️ 编辑</button>
              <button v-if="t.is_active" class="btn btn-ghost btn-sm" @click="deactivate(t)" style="font-size:12px;color:var(--orange)">下架</button>
              <button class="btn btn-ghost btn-sm" @click="showDeleteConfirm(t)" style="font-size:12px;color:var(--error)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除确认 Modal -->
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget=null">
        <div class="modal-card">
          <h3 class="modal-title">确认删除</h3>
          <p style="font-size:14px;margin-bottom:20px">确定要删除话题「{{ deleteTarget.title }}」吗？此操作不可撤销。</p>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" @click="deleteTarget=null">取消</button>
            <button class="btn btn-primary" style="background:var(--error)" @click="removeTopic">删除</button>
          </div>
        </div>
      </div>

      <!-- 话题详情弹窗 -->
      <div v-if="detailTopic" class="modal-overlay" @click.self="detailTopic=null">
        <div class="modal-card" style="max-width:640px;max-height:80vh;overflow-y:auto">
          <div class="topic-detail-header">
            <div v-if="detailTopic.is_official" class="official-badge" style="margin-bottom:12px">⭐ 官方话题</div>
            <h1 style="font-size:22px">{{ detailTopic.title }}</h1>
            <div class="topic-tags" style="margin-bottom:12px">
              <span v-for="(tag,i) in (detailTopic.tags||[])" :key="tag.id||i" :class="['tag-pill','tag-colors-'+i%7]">{{ tag.name || tag }}</span>
            </div>
            <div class="topic-detail-authors">
              <span v-for="(a,i) in (detailTopic.authors||[])" :key="i">
                {{ a.nickname }}<span v-if="a.is_primary" style="color:var(--purple);font-weight:600"> (主创)</span><span v-if="i<detailTopic.authors.length-1">、</span>
              </span>
            </div>
            <div class="topic-detail-time">{{ formatTime(detailTopic.created_at) }}</div>
          </div>
          <div class="topic-detail-body markdown-body" v-html="renderMd(detailTopic.content)"></div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:20px">
            <span style="font-size:13px;color:var(--text-muted)">❤️ {{ detailTopic.likes_count || 0 }}</span>
            <span style="font-size:13px;color:var(--text-muted)">⚡ {{ detailTopic.electrolyte_received || 0 }}</span>
            <span :class="['status-badge', statusClass(detailTopic)]" style="margin-left:auto">{{ statusLabel(detailTopic) }}</span>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;border-top:1px solid var(--border-light);padding-top:16px">
            <button class="btn btn-ghost" @click="detailTopic=null">关闭</button>
            <button class="btn btn-primary" @click="handleEdit(detailTopic.id); detailTopic=null">✏️ 编辑</button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const router = useRouter();
    const toast = useToast();
    const user = useUser();

    const loading = ref(true);
    const topics = ref([]);
    const deleteTarget = ref(null);
    const detailTopic = ref(null);
    const detailLoading = ref(false);

    const hasStatusUpdates = computed(() => user.hasTopicUpdates);

    function renderMd(text) { return renderMarkdown(text); }
    function formatTime(t) { if (!t) return ''; return new Date(t).toLocaleString('zh-CN'); }

    /**
     * 判断话题红点是否应该显示：
     * 有状态变更 + 用户未查看过该话题
     */
    function isTopicUnviewed(t) {
      return user.isTopicUnviewed(t.id);
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

    // ----------------------------------------------------------
    // 交互操作（标记已查看后再执行）
    // ----------------------------------------------------------

    /**
     * 点击话题卡片 → 标记已查看 + 打开详情
     */
    function handleTopicClick(topicId) {
      user.markTopicViewed(topicId);
      openDetail(topicId);
    }

    /**
     * 编辑话题 → 标记已查看 + 跳转编辑页
     */
    function handleEdit(topicId) {
      user.markTopicViewed(topicId);
      router.push(`/topic/create?edit=${topicId}`);
    }

    /**
     * 查看话题详情（弹窗）
     */
    async function openDetail(topicId) {
      detailLoading.value = true;
      try {
        detailTopic.value = await api.topics.detail(topicId);
      } catch (e) {
        toast.error('加载话题详情失败');
      }
      detailLoading.value = false;
    }

    async function deactivate(t) {
      user.markTopicViewed(t.id);
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
      try {
        const r = await api.topics.myList();
        topics.value = r.topics || [];
      } catch (e) {}
      loading.value = false;
    });

    return {
      loading, topics, deleteTarget, hasStatusUpdates,
      detailTopic, detailLoading,
      statusLabel, statusClass, isTopicUnviewed, getStatusChangeLabel,
      handleTopicClick, handleEdit, openDetail, deactivate,
      showDeleteConfirm, removeTopic,
      renderMd, formatTime,
    };
  }
};
