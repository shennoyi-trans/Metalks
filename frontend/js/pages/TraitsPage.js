/**
 * TraitsPage — 我的特质（无顶部导航栏，独立页面）
 */

import api from '../api/index.js';
import { renderMarkdown } from '../utils/markdown.js';
import { useToast } from '../stores/toast.js';

const { ref, computed, onMounted } = Vue;
const { useRouter } = VueRouter;

export const TraitsPage = {
  template: `
    <div class="traits-page-standalone">
      <!-- 自定义顶栏 -->
      <div class="traits-topbar">
        <button class="traits-back-btn" @click="$router.back()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          返回
        </button>
        <span class="traits-topbar-title">特质画像</span>
        <button class="traits-share-btn" @click="handleShare">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          分享
        </button>
      </div>

      <div class="traits-body">
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <template v-else>
          <div v-if="isEmpty" class="empty-state" style="padding-top:80px">
            <div class="empty-icon">🧬</div>
            <p>完成你的第一次对话，开始积累观念画像</p>
            <button class="btn btn-primary" @click="$router.push('/')">去话题广场看看</button>
          </div>
          <template v-else>
            <div class="traits-hero"><h2>{{ summary }}</h2></div>
            <div class="card" style="padding:32px">
              <div class="markdown-body" v-html="renderMd(fullReport)"></div>
            </div>
          </template>
        </template>
      </div>
    </div>
  `,

  setup() {
    const toast = useToast();
    const loading = ref(true);
    const summary = ref('');
    const fullReport = ref('');
    const isEmpty = computed(() => summary.value === '暂无特质数据' || (!summary.value && !fullReport.value));

    function renderMd(text) { return renderMarkdown(text); }

    function handleShare() {
      toast.info('分享功能即将上线');
    }

    onMounted(async () => {
      try {
        const res = await api.traits.getGlobal();
        summary.value = res.summary || '';
        fullReport.value = res.full_report || '';
      } catch (e) {}
      loading.value = false;
    });

    return { loading, summary, fullReport, isEmpty, renderMd, handleShare };
  }
};
