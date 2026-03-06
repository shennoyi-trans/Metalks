/**
 * HomePage — 话题广场 / 首页
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';

const { ref, watch, onMounted } = Vue;
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
              :class="['tag-pill','tag-colors-'+(i%7),{active:selectedTag===tag.id}]"
              @click="selectedTag=selectedTag===tag.id?null:tag.id" style="cursor:pointer">
              {{ tag.name }}
            </span>
          </div>
          <div class="filter-right">
            <div class="search-box">
              <span>🔍</span>
              <input v-model="searchQuery" placeholder="搜索话题..." @input="debounceSearch">
            </div>
            <select class="sort-select" v-model="sortBy" @change="loadTopics">
              <option value="created_at">最新</option>
              <option value="likes_count">最热</option>
              <option value="electrolyte_received">电解液最多</option>
            </select>
          </div>
        </div>

        <!-- 话题列表 -->
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <div v-else-if="topics.length" class="topics-grid">
          <div v-for="t in topics" :key="t.id" class="card card-hover topic-card" @click="goTopic(t.id)">
            <span v-if="t.is_official" class="official-badge" style="position:absolute;top:12px;left:12px">⭐ 官方</span>
            <div :style="t.is_official?'padding-top:8px':''">
              <h3 class="topic-title">{{ t.title }}</h3>
              <p class="topic-excerpt">{{ t.content }}</p>
              <div class="topic-tags">
                <span v-for="(tag,j) in (t.tags||[]).slice(0,3)" :key="tag.id||j" :class="['tag-pill','tag-pill-sm','tag-colors-'+j%7]">{{ tag.name || tag }}</span>
                <span v-if="(t.tags||[]).length>3" class="tag-pill tag-pill-sm" style="background:#F3F4F6;color:#6B7280">+{{ t.tags.length-3 }}</span>
              </div>
              <div class="topic-meta">
                <span>❤️ {{ t.likes_count || 0 }}</span>
                <span>⚡ {{ t.electrolyte_received || 0 }}</span>
                <span v-if="t.authors && t.authors.length">{{ t.authors[0].nickname }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">📭</div>
          <p>暂时还没有话题，去创建一个吧</p>
          <button class="btn btn-primary" @click="$router.push('/topic/create')">创建话题</button>
        </div>

        <div v-if="hasMore && !loading" style="text-align:center;padding:24px">
          <button class="btn btn-secondary" @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </div>
      </div>
    </div>
  `,

  setup() {
    const router = useRouter();
    const toast = useToast();

    const loading = ref(true);
    const loadingMore = ref(false);
    const recommended = ref([]);
    const tags = ref([]);
    const topics = ref([]);
    const selectedTag = ref(null);
    const searchQuery = ref('');
    const sortBy = ref('created_at');
    const skip = ref(0);
    const hasMore = ref(false);
    let searchTimer = null;

    function goTopic(id) { router.push(`/topic/${id}`); }

    async function loadTopics(reset = true) {
      if (reset) { skip.value = 0; topics.value = []; }
      loading.value = reset;
      loadingMore.value = !reset;
      try {
        const params = {
          skip: skip.value, limit: 20,
          status: 'approved', is_active: true,
          sort_by: sortBy.value, order: 'desc',
        };
        if (selectedTag.value) params.tag_id = selectedTag.value;
        if (searchQuery.value) params.search = searchQuery.value;
        const res = await api.topics.list(params);
        const newTopics = res.topics || [];
        if (reset) topics.value = newTopics;
        else topics.value = [...topics.value, ...newTopics];
        hasMore.value = newTopics.length >= 20;
      } catch (e) { toast.error('加载话题失败'); }
      loading.value = false;
      loadingMore.value = false;
    }

    function loadMore() { skip.value += 20; loadTopics(false); }
    function debounceSearch() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadTopics(), 400);
    }

    watch(selectedTag, () => loadTopics());
    watch(sortBy, () => loadTopics());

    onMounted(async () => {
      try { const res = await api.topics.recommended(6); recommended.value = res.topics || []; } catch (e) {}
      try { const res = await api.topics.allTags(); tags.value = res.tags || []; } catch (e) {}
      await loadTopics();
    });

    return {
      loading, loadingMore, recommended, tags, topics,
      selectedTag, searchQuery, sortBy, hasMore,
      goTopic, loadTopics, loadMore, debounceSearch,
    };
  }
};
