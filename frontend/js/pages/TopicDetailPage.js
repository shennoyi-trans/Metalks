/**
 * TopicDetailPage — 话题详情
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';
import { renderMarkdown } from '../utils/markdown.js';
import { uuid } from '../utils/uuid.js';

const { ref, computed, onMounted } = Vue;
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
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-primary btn-lg" @click="startChat">🗣️ 开始对话</button>
            </div>
          </div>
        </template>
        <div v-else class="empty-state">
          <div class="empty-icon">😶</div>
          <p>话题不存在或已下架</p>
          <button class="btn btn-primary" @click="$router.push('/')">返回广场</button>
        </div>
      </div>

      <!-- 投喂 Modal -->
      <div v-if="showDonate" class="modal-overlay" @click.self="showDonate=false">
        <div class="modal-card">
          <h3 class="modal-title">⚡ 投喂电解液</h3>
          <div class="form-group">
            <label class="form-label">投喂数量</label>
            <input class="form-input" v-model.number="donateAmount" type="number" min="1" placeholder="输入数量">
          </div>
          <div v-if="donateResult" style="margin-bottom:16px;padding:12px;background:var(--bg-warm);border-radius:var(--radius-md);font-size:13px">
            <div v-for="(d,i) in donateResult" :key="i">{{ d.nickname || ('作者'+(i+1)) }} 获得 {{ d.amount }}⚡</div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" @click="closeDonate">{{ donateResult ? '关闭' : '取消' }}</button>
            <button v-if="!donateResult" class="btn btn-orange" @click="handleDonate" :disabled="donating || !donateAmount || donateAmount<1">
              {{ donating ? '投喂中...' : '确认投喂' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const route = useRoute();
    const router = useRouter();
    const toast = useToast();
    const user = useUser();
    const topicId = parseInt(route.params.id);

    const loading = ref(true);
    const topic = ref(null);
    const showDonate = ref(false);
    const donateAmount = ref(null);
    const donating = ref(false);
    const donateResult = ref(null);

    function renderMd(text) { return renderMarkdown(text); }
    function formatTime(t) { if (!t) return ''; return new Date(t).toLocaleString('zh-CN'); }

    async function toggleLike() {
      try {
        const res = await api.topics.toggleLike(topicId);
        topic.value.has_liked = res.liked;
        topic.value.likes_count = res.likes_count;
      } catch (e) {
        toast.error(e.message || '操作失败');
      }
    }

    async function handleDonate() {
      if (!donateAmount.value || donateAmount.value < 1) return;
      donating.value = true;
      try {
        const res = await api.topics.donate(topicId, donateAmount.value);
        if (res.self_donation) {
          const tips = [
            '给自己投喂电解液？左手倒右手的艺术家 🎨',
            '自给自足，可持续发展的典范 🔋',
            '电解液：我到底去哪儿了？🤔',
            '这波操作属于是……自己养自己 🌱',
          ];
          toast.success(tips[Math.floor(Math.random() * tips.length)]);
        } else {
          toast.success('投喂成功！');
        }
        donateResult.value = res.distribution || null;
        user.refreshElectrolyte();
      } catch (e) {
        toast.error(e.message || '投喂失败');
      }
      donating.value = false;
    }

    function closeDonate() {
      showDonate.value = false;
      donateAmount.value = null;
      donateResult.value = null;
    }

    function startChat() {
      const sessionId = uuid();
      router.push(`/chat/${sessionId}?mode=1&topicId=${topicId}&topicName=${encodeURIComponent(topic.value.title)}&first=true`);
    }

    onMounted(async () => {
      try {
        topic.value = await api.topics.detail(topicId);
      } catch (e) {
        toast.error('加载话题失败');
      }
      loading.value = false;
    });

    return {
      loading, topic, showDonate, donateAmount, donating, donateResult,
      renderMd, formatTime, toggleLike, handleDonate, closeDonate, startChat,
    };
  }
};
