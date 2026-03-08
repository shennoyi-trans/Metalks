/**
 * TopicManagePage — 话题管理（管理员）
 * v1.6: 按话题信息或作者查询，查看详情，下架操作
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';
import { renderMarkdown } from '../utils/markdown.js';
import { searchUsers } from '../utils/userSearch.js';

const { ref, reactive, computed, onMounted, watch } = Vue;
const { useRouter } = VueRouter;

export const TopicManagePage = {
  template: `
    <div class="page-content">
      <div class="page-center" style="max-width:960px">
        <div class="manage-header">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            话题管理
          </h2>
          <p>搜索、查看和管理所有话题</p>
        </div>

        <!-- 搜索工具栏 -->
        <div class="manage-toolbar">
          <div class="manage-search-tabs">
            <button :class="['manage-tab', { active: searchMode === 'topic' }]"
              @click="searchMode='topic'">按话题信息</button>
            <button :class="['manage-tab', { active: searchMode === 'author' }]"
              @click="searchMode='author'">按作者</button>
          </div>
          <div class="manage-search-row">
            <input class="form-input" style="flex:1"
              v-model="searchQuery"
              :placeholder="searchMode === 'topic' ? '搜索标题/内容/提示词...' : '输入作者ID或昵称...'"
              @input="onSearchInput" @keydown.enter="doSearch">
            <select class="sort-select" v-model="statusFilter" @change="doSearch" style="width:120px">
              <option value="">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
            </select>
            <button class="btn btn-primary btn-sm" @click="doSearch" :disabled="searching">
              {{ searching ? '搜索中...' : '搜索' }}
            </button>
          </div>
          <!-- 作者模式下的用户搜索下拉 -->
          <div v-if="searchMode === 'author' && authorSearchResults.length" class="manage-author-dropdown">
            <div v-for="u in authorSearchResults" :key="u.id" class="coauthor-dropdown-item"
              @click="selectAuthorFilter(u)">
              <span style="font-weight:500">{{ u.nickname }}</span>
              <span style="font-size:11px;color:var(--text-muted)">#{{ u.id }}</span>
            </div>
          </div>
          <div v-if="selectedAuthor" style="margin-top:6px;font-size:12px;color:var(--purple)">
            当前筛选作者：{{ selectedAuthor.nickname }} (#{{ selectedAuthor.id }})
            <button class="btn btn-ghost btn-sm" @click="clearAuthorFilter" style="font-size:11px;padding:2px 6px">清除</button>
          </div>
        </div>

        <!-- 统计 -->
        <div v-if="!loading && totalCount > 0" style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
          共 {{ totalCount }} 条结果
        </div>

        <!-- 加载 -->
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>

        <!-- 空状态 -->
        <div v-else-if="!topics.length" class="empty-state">
          <div class="empty-icon">📋</div>
          <p>{{ searched ? '没有找到匹配的话题' : '输入关键词搜索话题' }}</p>
        </div>

        <!-- 话题列表 -->
        <div v-else class="manage-list">
          <div v-for="t in topics" :key="t.id" class="manage-card" :class="{ expanded: expandedId === t.id }">
            <div class="manage-card-header" @click="toggleExpand(t.id)">
              <div class="manage-card-info">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                  <h3>{{ t.title }}</h3>
                  <span v-if="t.is_official" class="official-badge" style="font-size:10px">⭐ 官方</span>
                </div>
                <div class="manage-card-meta">
                  <span :class="['status-badge', statusClass(t)]">{{ statusLabel(t) }}</span>
                  <span class="review-time">#{{ t.id }}</span>
                  <span class="review-time">{{ formatTime(t.created_at) }}</span>
                  <span class="review-time">❤️ {{ t.likes_count || 0 }}</span>
                  <span class="review-time">⚡ {{ t.electrolyte_received || 0 }}</span>
                </div>
              </div>
              <div class="manage-card-actions" @click.stop>
                <button v-if="t.is_active" class="btn btn-sm" style="color:#fff;background:var(--error);border-radius:var(--radius-pill)"
                  @click="handleDeactivate(t)" :disabled="t._loading">
                  {{ t._loading ? '处理中...' : '下架' }}
                </button>
                <span v-else-if="t.status === 'approved'" style="font-size:12px;color:var(--text-muted)">已下架</span>
                <button class="btn btn-sm btn-ghost" @click="viewDetail(t.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  查看
                </button>
              </div>
            </div>

            <!-- 展开详情 -->
            <div v-if="expandedId === t.id" class="review-card-body">
              <div v-if="t._detail" style="padding-top:4px">
                <div class="review-section">
                  <label>作者</label>
                  <div style="font-size:13px;color:var(--text)">
                    <span v-for="(a,i) in (t._detail.authors||[])" :key="i">
                      {{ a.nickname || '未知' }}<span v-if="a.is_primary" style="color:var(--purple);font-weight:600"> (主创)</span><span v-if="i<t._detail.authors.length-1">、</span>
                    </span>
                  </div>
                </div>
                <div class="review-section">
                  <label>内容描述</label>
                  <div class="markdown-body" v-html="renderMd(t._detail.content || '（无内容）')"></div>
                </div>
                <div class="review-section">
                  <label>AI 提示词</label>
                  <div class="review-prompt">{{ t._detail.prompt || '（无提示词）' }}</div>
                </div>
                <div v-if="t._detail.tags && t._detail.tags.length" class="review-section">
                  <label>标签</label>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <span v-for="(tag,i) in t._detail.tags" :key="i" :class="['tag-pill','tag-pill-sm','tag-colors-'+i%7]">{{ tag.name || tag }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="page-loading" style="padding:20px 0"><div class="page-spinner" style="width:24px;height:24px;border-width:2px"></div></div>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="topics.length && topics.length < totalCount" style="text-align:center;margin-top:16px">
          <button class="btn btn-ghost" @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </div>
      </div>
    </div>
  `,

  setup() {
    const router = useRouter();
    const toast = useToast();
    const user = useUser();

    const searchMode = ref('topic');
    const searchQuery = ref('');
    const statusFilter = ref('');
    const searching = ref(false);
    const loading = ref(false);
    const loadingMore = ref(false);
    const searched = ref(false);
    const topics = ref([]);
    const totalCount = ref(0);
    const expandedId = ref(null);
    const currentSkip = ref(0);
    const PAGE_SIZE = 20;

    // 作者搜索
    const authorSearchResults = ref([]);
    const selectedAuthor = ref(null);
    let authorSearchTimer = null;

    function renderMd(text) { return renderMarkdown(text); }
    function formatTime(t) { if (!t) return ''; return new Date(t).toLocaleString('zh-CN'); }

    function statusLabel(t) {
      if (t.status === 'pending') return '审核中';
      if (t.status === 'rejected') return '已拒绝';
      if (!t.is_active) return '已下架';
      return '已上线';
    }

    function statusClass(t) {
      if (t.status === 'pending') return 'pending';
      if (t.status === 'rejected') return 'rejected';
      if (!t.is_active) return 'inactive';
      return 'active';
    }

    // ============================
    // 搜索逻辑
    // ============================
    function onSearchInput() {
      if (searchMode.value === 'author') {
        // 作者模式：触发用户搜索
        selectedAuthor.value = null;
        if (authorSearchTimer) clearTimeout(authorSearchTimer);
        const q = searchQuery.value.trim();
        if (!q) {
          authorSearchResults.value = [];
          return;
        }
        authorSearchTimer = setTimeout(async () => {
          authorSearchResults.value = await searchUsers(q, 8);
        }, 300);
      } else {
        authorSearchResults.value = [];
      }
    }

    function selectAuthorFilter(u) {
      selectedAuthor.value = u;
      searchQuery.value = u.nickname;
      authorSearchResults.value = [];
      doSearch();
    }

    function clearAuthorFilter() {
      selectedAuthor.value = null;
      searchQuery.value = '';
      topics.value = [];
      totalCount.value = 0;
      searched.value = false;
    }

    async function doSearch() {
      authorSearchResults.value = [];
      currentSkip.value = 0;
      topics.value = [];
      loading.value = true;
      searched.value = true;

      try {
        const params = {
          skip: 0,
          limit: PAGE_SIZE,
        };

        if (statusFilter.value) params.status = statusFilter.value;

        if (searchMode.value === 'topic') {
          // 按话题信息搜索（标题/内容/提示词）
          if (searchQuery.value.trim()) {
            params.search = searchQuery.value.trim();
          }
        } else if (searchMode.value === 'author' && selectedAuthor.value) {
          // 按作者筛选 - 通过 search 参数（后端支持）
          // 注意：这里我们通过 list + 后续过滤实现
          // 更好的做法是后端增加 author_id 参数
        }

        const res = await api.topics.list(params);
        let topicList = (res.topics || []).map(t => ({ ...t, _loading: false, _detail: null }));

        // 如果是按作者筛选，前端过滤
        // 注意：更优方案是后端支持 author_id 参数
        if (searchMode.value === 'author' && selectedAuthor.value) {
          // 获取所有话题然后筛选作者
          const allRes = await api.topics.list({ ...params, limit: 200 });
          const allTopics = (allRes.topics || []).map(t => ({ ...t, _loading: false, _detail: null }));

          // 需要检查每个话题的作者 - 批量获取详情
          const filtered = [];
          for (const t of allTopics) {
            try {
              const detail = await api.topics.detail(t.id);
              if (detail.authors && detail.authors.some(a =>
                a.user_id === selectedAuthor.value.id ||
                a.nickname === selectedAuthor.value.nickname
              )) {
                t._detail = detail;
                filtered.push(t);
              }
            } catch (e) {
              // 忽略无权限的话题
            }
          }
          topicList = filtered;
          totalCount.value = filtered.length;
        } else {
          totalCount.value = res.total || topicList.length;
        }

        topics.value = topicList;
      } catch (e) {
        toast.error('搜索失败');
      }
      loading.value = false;
    }

    async function loadMore() {
      currentSkip.value += PAGE_SIZE;
      loadingMore.value = true;
      try {
        const params = {
          skip: currentSkip.value,
          limit: PAGE_SIZE,
        };
        if (statusFilter.value) params.status = statusFilter.value;
        if (searchMode.value === 'topic' && searchQuery.value.trim()) {
          params.search = searchQuery.value.trim();
        }
        const res = await api.topics.list(params);
        const more = (res.topics || []).map(t => ({ ...t, _loading: false, _detail: null }));
        topics.value.push(...more);
      } catch (e) {
        toast.error('加载更多失败');
      }
      loadingMore.value = false;
    }

    // ============================
    // 展开/收起详情
    // ============================
    async function toggleExpand(id) {
      if (expandedId.value === id) {
        expandedId.value = null;
        return;
      }
      expandedId.value = id;
      const t = topics.value.find(x => x.id === id);
      if (t && !t._detail) {
        try {
          t._detail = await api.topics.detail(id);
        } catch (e) {
          toast.error('加载详情失败');
        }
      }
    }

    function viewDetail(id) {
      router.push(`/topic/${id}`);
    }

    // ============================
    // 下架操作
    // ============================
    async function handleDeactivate(t) {
      t._loading = true;
      try {
        await api.topics.deactivate(t.id);
        t.is_active = false;
        toast.success('话题已下架');
      } catch (e) {
        toast.error(e.message || '下架失败');
      }
      t._loading = false;
    }

    // 切换搜索模式时清空
    watch(searchMode, () => {
      searchQuery.value = '';
      selectedAuthor.value = null;
      authorSearchResults.value = [];
    });

    onMounted(() => {
      if (!user.isAdmin) {
        toast.error('无权限访问');
        router.push('/');
        return;
      }
      // 默认加载所有话题
      doSearch();
    });

    return {
      searchMode, searchQuery, statusFilter,
      searching, loading, loadingMore, searched,
      topics, totalCount, expandedId,
      authorSearchResults, selectedAuthor,
      renderMd, formatTime, statusLabel, statusClass,
      onSearchInput, selectAuthorFilter, clearAuthorFilter,
      doSearch, loadMore, toggleExpand, viewDetail, handleDeactivate,
    };
  }
};
