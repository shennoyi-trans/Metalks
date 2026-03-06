/**
 * TopicDetailPage — 话题详情
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { renderMarkdown } from '../utils/markdown.js';
import { uuid } from '../utils/uuid.js';

const { ref, onMounted } = Vue;
const { useRoute, useRouter } = VueRouter;

export const TopicDetailPage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <template v-else-if="topic">
          <div class="topic-detail-header">
            <div v-if="topic.is_official" class="official-badge" style="margin-bottom:12px">⭐ 官方话题</div>
            <h1>{{ topic.title }}</h1>
            <div class="topic-tags" style="margin-bottom:12px;">
              <span v-for="(tag,i) in (topic.tags||[])" :key="tag.id||i" :class="['tag-pill','tag-colors-'+i%7]">{{ tag.name || tag }}</span>
            </div>
            <div class="topic-detail-authors">
              <span v-for="(a,i) in (topic.authors||[])" :key="i">
                {{ a.nickname }}<span v-if="a.is_primary" style="color:var(--purple);font-weight:600"> (主创)</span><span v-if="i<topic.authors.length-1">、</span>
              </span>
            </div>
            <div class="topic-detail-time">{{ formatTime(topic.created_at) }}</div>
          </div>
          <div class="topic-detail-body markdown-body" v-html="renderMd(topic.content)"></div>
          <div class="topic-detail-actions">
            <div class="left-actions">
              <button :class="['like-btn',{liked:topic.has_liked}]" @click="toggleLike">
                {{ topic.has_liked ? '❤️' : '🤍' }} {{ topic.likes_count || 0 }}
              </button>
              <button class="donate-btn" @click="showDonate=true">⚡ 投喂电解液</button>
            </div>
            <button class="btn btn-primary btn-lg" @click="startChat">🗣️ 开始对话</button>
          </div>
        </template>
      </div>

      <!-- 投喂 Modal -->
      <div v-if="showDonate" class="modal-overlay" @click.self="showDonate=false">
        <div class="modal-card">
          <h3 class="modal-title">⚡ 投喂电解液</h3>
          <div class="form-group">
            <label class="form-label">投喂数量</label>
            <input class="form-input" v-model.number="donateAmount" type="number" min="1" placeholder="输入数量">
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" @click="showDonate=false">取消</button>
            <button class="btn btn-orange" @click="handleDonate" :disabled="donating">{{ donating ? '投喂中...' : '确认投喂' }}</button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const route = useRoute();
    const router = useRouter();
    const toast = useToast();

    const loading = ref(true);
    const topic = ref(null);
    const showDonate = ref(false);
    const donateAmount = ref(1);
    const donating = ref(false);

    function formatTime(t) {
      if (!t) return '';
      return new Date(t).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    function renderMd(text) { return renderMarkdown(text); }

    async function loadTopic() {
      loading.value = true;
      try { topic.value = await api.topics.detail(route.params.id); }
      catch (e) { toast.error('话题不存在'); router.push('/'); }
      loading.value = false;
    }

    async function toggleLike() {
      try {
        const res = await api.topics.toggleLike(route.params.id);
        topic.value.has_liked = res.liked;
        topic.value.likes_count = res.likes_count;
      } catch (e) { toast.error('操作失败'); }
    }

    async function handleDonate() {
      if (!donateAmount.value || donateAmount.value < 1) { toast.error('请输入有效数量'); return; }
      donating.value = true;
      try {
        const res = await api.topics.donate(route.params.id, donateAmount.value);
        toast.success('投喂成功！');
        showDonate.value = false;
        if (res.distribution) {
          const detail = res.distribution.map(d => `${d.nickname}获得${d.amount}⚡`).join('，');
          toast.info(detail);
        }
        topic.value.electrolyte_received = res.electrolyte_received || topic.value.electrolyte_received + donateAmount.value;
      } catch (e) { toast.error(e.message || '投喂失败'); }
      donating.value = false;
    }

    function startChat() {
      const sessionId = uuid();
      router.push({ path: `/chat/${sessionId}`, query: { mode: '1', topicId: route.params.id, first: 'true' } });
    }

    onMounted(loadTopic);

    return {
      loading, topic, showDonate, donateAmount, donating,
      formatTime, renderMd, toggleLike, handleDonate, startChat,
    };
  }
};
