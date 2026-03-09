/**
 * TopicManagePage — 话题管理（管理员）
 *
 * 作者搜索逻辑：
 *  - 下拉选择 + 标签 chips（支持多作者）
 *  - 回车时自动选择第一个匹配结果（而非直接搜索）
 *  - 无选中作者时不触发搜索，提示用户先选择
 *  - 使用后端 author_ids 参数高效筛选
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
            <!-- 话题信息搜索模式 -->
            <template v-if="searchMode === 'topic'">
              <input class="form-input" style="flex:1"
                v-model="searchQuery"
                placeholder="搜索标题/内容/提示词..."
                @keydown.enter="doSearch">
            </template>
            <!-- 作者搜索模式 -->
            <template v-else>
              <div class="author-search-box" style="flex:1;position:relative">
                <div class="author-tags-input">
                  <span v-for="a in selectedAuthors" :key="a.id" class="author-tag-chip">
                    {{ a.nickname }} <span style="font-size:10px;opacity:0.7">#{{ a.id }}</span>
                    <button class="author-tag-remove" @click="removeAuthorTag(a.id)">✕</button>
                  </span>
                  <input class="author-search-input" v-model="authorQuery"
                    placeholder="输入作者ID或昵称搜索..."
                    @input="onAuthorSearchInput" @focus="showAuthorDropdown=true"
                    @keydown.enter.prevent="onAuthorSearchEnter">
                </div>
                <!-- 搜索下拉 -->
                <div v-if="showAuthorDropdown && authorSearchResults.length" class="manage-author-dropdown">
                  <div v-for="u in authorSearchResults" :key="u.id" class="coauthor-dropdown-item"
                    @mousedown.prevent="addAuthorTag(u)">
                    <span style="font-weight:500">{{ u.nickname }}</span>
                    <span style="font-size:11px;color:var(--text-muted)">#{{ u.id }}</span>
                  </div>
                </div>
              </div>
            </template>
            <select class="sort-select" v-model="statusFilter" @change="doSearch" style="width:120px">
              <option value="">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
            </select>
            <button class="btn btn-primary btn-sm" @click="handleSearchClick" :disabled="searching">
              {{ searching ? '搜索中...' : '搜索' }}
            </button>
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
          <p>{{ searched ? '没有找到匹配的话题' : '输入关键词开始搜索' }}</p>
        </div>

        <!-- 话题列表 -->
        <div v-else class="manage-list">
          <div v-for="t in topics" :key="t.id" :class="['manage-card', { expanded: expandedId === t.id }]">
            <div class="manage-card-header" @click="toggleExpand(t.id)">
              <div class="manage-card-info">
                <h3>{{ t.title }}</h3>
                <div class="manage-card-meta">
                  <span :class="['status-badge', statusClass(t)]">{{ statusLabel(t) }}</span>
                  <span style="font-size:11px;color:var(--text-muted)">❤️ {{ t.likes_count || 0 }}</span>
                  <span style="font-size:11px;color:var(--text-muted)">⚡ {{ t.electrolyte_received || 0 }}</span>
                </div>
              </div>
              <div class="manage-card-actions">
                <button class="btn btn-ghost btn-sm" @click.stop="viewDetail(t.id)" style="font-size:12px">查看</button>
                <button v-if="t.is_active" class="btn btn-ghost btn-sm" @click.stop="handleDeactivate(t)"
                  :disabled="t._loading" style="font-size:12px;color:var(--error)">下架</button>
              </div>
            </div>
            <!-- 展开详情 -->
            <div v-if="expandedId === t.id" class="manage-card-body">
              <div v-if="!t._detail" class="page-loading" style="padding:20px"><div class="page-spinner" style="width:24px;height:24px;border-width:2px"></div></div>
              <template v-else>
                <div class="review-section">
                  <label>作者</label>
                  <div style="font-size:13px">
                    <span v-for="(a,i) in t._detail.authors" :key="i">
                      {{ a.nickname }}<span v-if="a.is_primary" style="color:var(--purple)"> (主创)</span><span v-if="i<t._detail.authors.length-1">、</span>
                    </span>
                  </div>
                </div>
                <div class="review-section">
                  <label>内容</label>
                  <div class="review-prompt markdown-body" v-html="renderMd(t._detail.content)"></div>
                </div>
                <div class="review-section">
                  <label>提示词</label>
                  <div class="review-prompt">{{ t._detail.prompt }}</div>
                </div>
                <div class="review-section">
                  <label>创建时间</label>
                  <div style="font-size:12px;color:var(--text-muted)">{{ formatTime(t._detail.created_at) }}</div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="!loading && topics.length && topics.length < totalCount" style="text-align:center;margin-top:16px">
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

    // 多作者搜索
    const authorQuery = ref('');
    const authorSearchResults = ref([]);
    const selectedAuthors = ref([]);
    const showAuthorDropdown = ref(false);
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
    // 作者搜索（下拉 + 标签）
    // ============================

    function onAuthorSearchInput() {
      if (authorSearchTimer) clearTimeout(authorSearchTimer);
      const q = authorQuery.value.trim();
      if (!q) {
        authorSearchResults.value = [];
        return;
      }
      showAuthorDropdown.value = true;
      authorSearchTimer = setTimeout(async () => {
        const results = await searchUsers(q, 8);
        // 排除已选中的作者
        const selectedIds = new Set(selectedAuthors.value.map(a => a.id));
        authorSearchResults.value = results.filter(u => !selectedIds.has(u.id));
      }, 300);
    }

    /**
     * 回车时的处理逻辑：
     * 1. 如果下拉列表有结果 → 自动选择第一个
     * 2. 如果输入框有文字但没有下拉结果 → 等待搜索完成后再选择
     * 3. 如果没有输入文字且已有选中作者 → 执行搜索
     */
    async function onAuthorSearchEnter() {
      const q = authorQuery.value.trim();

      // 如果下拉列表有结果，自动选择第一个
      if (authorSearchResults.value.length > 0) {
        addAuthorTag(authorSearchResults.value[0]);
        return;
      }

      // 如果有输入文字但没有下拉结果，立即搜索用户
      if (q) {
        const results = await searchUsers(q, 8);
        const selectedIds = new Set(selectedAuthors.value.map(a => a.id));
        const filtered = results.filter(u => !selectedIds.has(u.id));
        if (filtered.length > 0) {
          addAuthorTag(filtered[0]);
        } else {
          toast.info('未找到匹配的用户');
        }
        return;
      }

      // 没有输入文字，如果已有选中的作者则执行搜索
      if (selectedAuthors.value.length > 0) {
        doSearch();
      }
    }

    function addAuthorTag(u) {
      if (selectedAuthors.value.some(a => a.id === u.id)) return;
      selectedAuthors.value.push({ id: u.id, nickname: u.nickname });
      authorQuery.value = '';
      authorSearchResults.value = [];
      showAuthorDropdown.value = false;
      doSearch();
    }

    function removeAuthorTag(userId) {
      selectedAuthors.value = selectedAuthors.value.filter(a => a.id !== userId);
      if (selectedAuthors.value.length) {
        doSearch();
      } else {
        topics.value = [];
        totalCount.value = 0;
        searched.value = false;
      }
    }

    // ============================
    // 搜索按钮点击处理
    // ============================

    /**
     * 搜索按钮点击：
     * 在作者模式下，如果输入框有文字但没有选中作者，先尝试选择用户
     */
    async function handleSearchClick() {
      if (searchMode.value === 'author') {
        const q = authorQuery.value.trim();
        // 有输入文字但没选中作者 → 先尝试匹配用户
        if (q && !selectedAuthors.value.length) {
          const results = await searchUsers(q, 8);
          if (results.length > 0) {
            addAuthorTag(results[0]);
            return; // addAuthorTag 内部会调用 doSearch
          } else {
            toast.info('未找到匹配的用户，请选择一个作者后搜索');
            return;
          }
        }
        // 有输入文字且已有选中作者 → 追加选择
        if (q && selectedAuthors.value.length) {
          const results = await searchUsers(q, 8);
          const selectedIds = new Set(selectedAuthors.value.map(a => a.id));
          const filtered = results.filter(u => !selectedIds.has(u.id));
          if (filtered.length > 0) {
            addAuthorTag(filtered[0]);
            return;
          }
        }
        // 没有选中作者 → 提示
        if (!selectedAuthors.value.length) {
          toast.info('请先选择至少一个作者');
          return;
        }
      }
      doSearch();
    }

    // ============================
    // 搜索逻辑
    // ============================

    async function doSearch() {
      authorSearchResults.value = [];
      showAuthorDropdown.value = false;
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
          if (searchQuery.value.trim()) {
            params.search = searchQuery.value.trim();
          }
        } else if (searchMode.value === 'author' && selectedAuthors.value.length) {
          params.author_ids = selectedAuthors.value.map(a => a.id).join(',');
        }

        const res = await api.topics.list(params);
        const topicList = (res.topics || []).map(t => ({ ...t, _loading: false, _detail: null }));
        topics.value = topicList;
        totalCount.value = res.total || topicList.length;
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
        if (searchMode.value === 'author' && selectedAuthors.value.length) {
          params.author_ids = selectedAuthors.value.map(a => a.id).join(',');
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
      authorQuery.value = '';
      selectedAuthors.value = [];
      authorSearchResults.value = [];
    });

    // 点击外部关闭下拉
    function onClickOutsideDropdown(e) {
      if (!e.target.closest('.author-search-box')) {
        showAuthorDropdown.value = false;
      }
    }

    onMounted(() => {
      if (!user.isAdmin) {
        toast.error('无权限访问');
        router.push('/');
        return;
      }
      document.addEventListener('click', onClickOutsideDropdown);
      // 默认加载所有话题
      doSearch();
    });

    // 清理
    Vue.onUnmounted(() => {
      document.removeEventListener('click', onClickOutsideDropdown);
      if (authorSearchTimer) clearTimeout(authorSearchTimer);
    });

    return {
      searchMode, searchQuery, statusFilter,
      searching, loading, loadingMore, searched,
      topics, totalCount, expandedId,
      authorQuery, authorSearchResults, selectedAuthors, showAuthorDropdown,
      onAuthorSearchInput, onAuthorSearchEnter, addAuthorTag, removeAuthorTag,
      handleSearchClick,
      renderMd, formatTime, statusLabel, statusClass,
      doSearch, loadMore, toggleExpand, viewDetail, handleDeactivate,
    };
  }
};
