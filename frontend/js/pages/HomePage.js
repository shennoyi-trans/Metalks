/**
 * HomePage — 话题广场 / 首页
 * v2: 搜索展开居中、创建话题改为+号入口
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';

const { ref, watch, onMounted, onUnmounted } = Vue;
const { useRouter } = VueRouter;

export const HomePage = {
  template: `
    <div class="page-content">
      <div class="page-center">
        <!-- 推荐区 -->
        <div class="rec-section" v-if="recommended.length">
          <h2>🔥 推荐话题</h2>
          <div class="rec-scroll">
            <div v-for="(t,i) in recommended" :key="t.id" :class="['rec-card','rec-gradients-'+i%6]" @click="goTopic(t.id)">
              <h3>{{ t.title }}</h3>
              <p>{{ t.content }}</p>
            </div>
          </div>
        </div>

        <!-- 筛选工具栏 -->
        <div class="filter-bar">
          <div class="filter-tags">
            <span :class="['tag-pill','tag-colors-0',{active:!selectedTag}]" @click="selectedTag=null" style="cursor:pointer">全部</span>
            <span v-for="(tag,i) in tags" :key="tag.id"
              :class="['tag-pill','tag-colors-'+(i%7+1),{active:selectedTag===tag.id}]"
              @click="selectedTag=selectedTag===tag.id?null:tag.id" style="cursor:pointer">
              {{ tag.name }}
            </span>
          </div>
          <div class="filter-right">
            <div class="search-box" @click="openSearch">
              <span>🔍</span>
              <span style="font-size:13px;color:var(--text-muted)">搜索话题...</span>
            </div>
            <select class="sort-select" v-model="sortBy" @change="loadTopics">
              <option value="created_at">最新</option>
              <option value="likes_count">最热</option>
              <option value="electrolyte_received">电解液最多</option>
            </select>
          </div>
        </div>

        <!-- 话题列表 -->
        <div v-if="loading && !topics.length" class="page-loading"><div class="page-spinner"></div></div>
        <div v-else-if="topics.length" class="topics-grid">
          <div v-for="t in topics" :key="t.id" class="card card-hover topic-card" @click="goTopic(t.id)">
            <span v-if="t.is_official" class="official-badge" style="position:absolute;top:12px;left:12px">⭐ 官方</span>
            <div :style="t.is_official?'padding-top:16px':''">
              <div class="topic-title">{{ t.title }}</div>
              <div class="topic-excerpt">{{ t.content }}</div>
              <div class="topic-tags">
                <span v-for="(tag,i) in (t.tags||[]).slice(0,3)" :key="tag.id||i" :class="['tag-pill','tag-pill-sm','tag-colors-'+i%7]">{{ tag.name || tag }}</span>
                <span v-if="(t.tags||[]).length>3" class="tag-pill tag-pill-sm" style="background:#F3F4F6;color:#6B7280">+{{ t.tags.length - 3 }}</span>
              </div>
              <div class="topic-meta">
                <span>❤️ {{ t.likes_count || 0 }}</span>
                <span>⚡ {{ t.electrolyte_received || 0 }}</span>
                <span>{{ t.author_nickname || (t.authors && t.authors[0] && t.authors[0].nickname) || '' }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">📭</div>
          <p>暂无话题</p>
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore" style="text-align:center;padding:24px">
          <button class="btn btn-secondary" @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </div>
      </div>

      <!-- 创建话题浮动按钮 -->
      <button class="fab-create-topic" @click="$router.push('/topic/create')" title="创建话题">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>

      <!-- 搜索弹窗 -->
      <div v-if="searchOpen" class="search-overlay" @click.self="closeSearch">
        <div class="search-modal">
          <div class="search-modal-input">
            <span style="font-size:18px">🔍</span>
            <input ref="searchInputEl" v-model="searchQuery" placeholder="搜索话题..." @input="debounceSearch" @keydown.esc="closeSearch" autofocus>
            <button class="search-close-btn" @click="closeSearch">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div v-if="searchResults.length" class="search-results">
            <div v-for="r in searchResults" :key="r.id" class="search-result-item" @click="goTopic(r.id); closeSearch()">
              <span class="search-result-title">{{ r.title }}</span>
              <span class="search-result-likes">❤️ {{ r.likes_count || 0 }}</span>
            </div>
          </div>
          <div v-else-if="searchQuery.trim() && !searchLoading" class="search-no-results">
            没有找到相关话题
          </div>
          <div v-else-if="searchLoading" class="search-no-results">
            <div class="page-spinner" style="width:24px;height:24px;border-width:2px"></div>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const router = useRouter();
    const toast = useToast();

    const recommended = ref([]);
    const tags = ref([]);
    const topics = ref([]);
    const loading = ref(true);
    const loadingMore = ref(false);
    const selectedTag = ref(null);
    const sortBy = ref('created_at');
    const skip = ref(0);
    const hasMore = ref(false);
    const limit = 18;

    // 搜索相关
    const searchOpen = ref(false);
    const searchQuery = ref('');
    const searchResults = ref([]);
    const searchLoading = ref(false);
    const searchInputEl = ref(null);
    let searchTimer = null;

    function goTopic(id) { router.push(`/topic/${id}`); }

    function openSearch() {
      searchOpen.value = true;
      searchQuery.value = '';
      searchResults.value = [];
      Vue.nextTick(() => {
        if (searchInputEl.value) searchInputEl.value.focus();
      });
    }
    function closeSearch() {
      searchOpen.value = false;
      searchQuery.value = '';
      searchResults.value = [];
    }

    function debounceSearch() {
      clearTimeout(searchTimer);
      if (!searchQuery.value.trim()) {
        searchResults.value = [];
        return;
      }
      searchLoading.value = true;
      searchTimer = setTimeout(async () => {
        try {
          const res = await api.topics.search(searchQuery.value.trim(), 20);
          searchResults.value = res.topics || [];
        } catch (e) {
          searchResults.value = [];
        }
        searchLoading.value = false;
      }, 300);
    }

    // 键盘快捷关闭
    function onEsc(e) {
      if (e.key === 'Escape' && searchOpen.value) closeSearch();
    }

    async function loadTopics() {
      loading.value = true;
      skip.value = 0;
      try {
        const params = {
          skip: 0,
          limit,
          sort_by: sortBy.value,
          order: 'desc',
          status: 'approved',
          is_active: true,
        };
        if (selectedTag.value) params.tag_id = selectedTag.value;

        const res = await api.topics.list(params);
        topics.value = res.topics || [];
        hasMore.value = topics.value.length >= limit;
      } catch (e) {
        toast.error('加载话题失败');
      }
      loading.value = false;
    }

    async function loadMore() {
      loadingMore.value = true;
      skip.value += limit;
      try {
        const params = {
          skip: skip.value,
          limit,
          sort_by: sortBy.value,
          order: 'desc',
          status: 'approved',
          is_active: true,
        };
        if (selectedTag.value) params.tag_id = selectedTag.value;

        const res = await api.topics.list(params);
        const newTopics = res.topics || [];
        topics.value = [...topics.value, ...newTopics];
        hasMore.value = newTopics.length >= limit;
      } catch (e) {
        toast.error('加载失败');
      }
      loadingMore.value = false;
    }

    // 标签筛选切换时重新加载
    watch(selectedTag, () => { loadTopics(); });

    onMounted(async () => {
      document.addEventListener('keydown', onEsc);
      // 并行加载推荐话题、标签、话题列表
      try {
        const [recRes, tagRes] = await Promise.allSettled([
          api.topics.recommended(6),
          api.topics.allTags(),
        ]);
        if (recRes.status === 'fulfilled') recommended.value = recRes.value.topics || recRes.value || [];
        if (tagRes.status === 'fulfilled') tags.value = tagRes.value.tags || tagRes.value || [];
      } catch (e) {}
      await loadTopics();
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', onEsc);
    });

    return {
      recommended, tags, topics, loading, loadingMore,
      selectedTag, sortBy, hasMore,
      searchOpen, searchQuery, searchResults, searchLoading, searchInputEl,
      goTopic, openSearch, closeSearch, debounceSearch, loadTopics, loadMore,
    };
  }
};
