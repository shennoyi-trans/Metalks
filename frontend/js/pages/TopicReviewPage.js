/**
 * TopicReviewPage — 话题审核（管理员）
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';
import { renderMarkdown } from '../utils/markdown.js';

const { ref, computed, onMounted } = Vue;
const { useRouter } = VueRouter;

export const TopicReviewPage = {
  template: `
    <div class="page-content">
      <div class="page-center" style="max-width:960px">
        <div class="review-header">
          <h2>话题审核</h2>
          <p>审核社区用户提交的话题</p>
        </div>

        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>

        <div v-else-if="!topics.length" class="empty-state">
          <div class="empty-icon">✅</div>
          <p>暂无待审核话题</p>
        </div>

        <div v-else class="review-list">
          <div v-for="t in topics" :key="t.id" class="review-card" :class="{ expanded: expandedId === t.id }">
            <div class="review-card-header" @click="toggleExpand(t.id)">
              <div class="review-card-info">
                <h3>{{ t.title }}</h3>
                <div class="review-card-meta">
                  <span class="review-time">{{ formatTime(t.created_at) }}</span>
                  <span v-if="t.is_official" class="official-badge" style="font-size:10px">⭐ 官方</span>
                </div>
              </div>
              <div class="review-card-actions" @click.stop>
                <button class="btn-review approve" @click="handleReview(t, 'approve')" :disabled="t._loading">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  通过
                </button>
                <button class="btn-review reject" @click="handleReview(t, 'reject')" :disabled="t._loading">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  拒绝
                </button>
              </div>
            </div>

            <div v-if="expandedId === t.id" class="review-card-body">
              <div class="review-section">
                <label>内容描述</label>
                <div class="markdown-body" v-html="renderMd(t.content || '（无内容）')"></div>
              </div>
              <div class="review-section">
                <label>AI 提示词</label>
                <div class="review-prompt">{{ t.prompt || '（无提示词）' }}</div>
              </div>
              <div v-if="t.tags && t.tags.length" class="review-section">
                <label>标签</label>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <span v-for="(tag,i) in t.tags" :key="i" :class="['tag-pill','tag-pill-sm','tag-colors-'+i%7]">{{ tag.name || tag }}</span>
                </div>
              </div>
            </div>
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
    const expandedId = ref(null);

    function renderMd(text) { return renderMarkdown(text); }
    function formatTime(t) { if (!t) return ''; return new Date(t).toLocaleString('zh-CN'); }

    function toggleExpand(id) {
      expandedId.value = expandedId.value === id ? null : id;
    }

    async function loadPending() {
      loading.value = true;
      try {
        const res = await api.topics.list({ status: 'pending', limit: 50 });
        // Load full details for each topic
        const detailedTopics = [];
        for (const t of (res.topics || [])) {
          try {
            const detail = await api.topics.detail(t.id);
            detail._loading = false;
            detailedTopics.push(detail);
          } catch (e) {
            t._loading = false;
            detailedTopics.push(t);
          }
        }
        topics.value = detailedTopics;
      } catch (e) {
        toast.error('加载待审核话题失败');
      }
      loading.value = false;
    }

    async function handleReview(t, action) {
      t._loading = true;
      try {
        await api.topics.review(t.id, action);
        toast.success(action === 'approve' ? '已通过审核' : '已拒绝');
        topics.value = topics.value.filter(x => x.id !== t.id);
      } catch (e) {
        toast.error(e.message || '操作失败');
      }
      t._loading = false;
    }

    onMounted(() => {
      if (!user.isAdmin) {
        toast.error('无权限访问');
        router.push('/');
        return;
      }
      loadPending();
    });

    return {
      loading, topics, expandedId,
      renderMd, formatTime, toggleExpand, handleReview,
    };
  }
};
