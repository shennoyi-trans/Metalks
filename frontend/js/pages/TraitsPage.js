/**
 * TraitsPage — 我的特质
 */

import api from '../api/index.js';
import { renderMarkdown } from '../utils/markdown.js';

const { ref, computed, onMounted } = Vue;

export const TraitsPage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <template v-else>
          <div v-if="isEmpty" class="empty-state">
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
    const loading = ref(true);
    const summary = ref('');
    const fullReport = ref('');
    const isEmpty = computed(() => summary.value === '暂无特质数据' || (!summary.value && !fullReport.value));

    function renderMd(text) { return renderMarkdown(text); }

    onMounted(async () => {
      try {
        const res = await api.traits.getGlobal();
        summary.value = res.summary || '';
        fullReport.value = res.full_report || '';
      } catch (e) {}
      loading.value = false;
    });

    return { loading, summary, fullReport, isEmpty, renderMd };
  }
};
