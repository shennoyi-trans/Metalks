/**
 * ChatPage — 对话页（产品核心）
 * 三栏工作区：左侧话题 / 中间聊天 / 右侧特质画像
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { renderMarkdown } from '../utils/markdown.js';

const { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } = Vue;
const { useRoute, useRouter } = VueRouter;

function decodeTopicName(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function normalizeTraitSummary(value) {
  const text = String(value || '').trim();
  return text === '暂无特质数据' ? '' : text;
}

export const ChatPage = {
  template: `
    <div :class="['chat-shell', { 'chat-shell--no-topic': !showTopicSidebar, 'chat-shell--topic-collapsed': showTopicSidebar && topicPanelCollapsed }]">
      <aside
        v-if="showTopicSidebar"
        :class="['chat-panel', 'chat-panel--topic', { 'is-collapsed': topicPanelCollapsed }]"
      >
        <div class="chat-panel-card chat-topic-panel">
          <div class="chat-panel-toolbar">
            <button class="chat-panel-toggle" @click="toggleTopicSidebar" :title="topicPanelCollapsed ? '展开话题卡片' : '收起话题卡片'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path v-if="topicPanelCollapsed" d="M9 18l6-6-6-6"/>
                <path v-else d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <button v-if="!topicPanelCollapsed" class="chat-panel-back" @click="goBack">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
              </svg>
              返回
            </button>
          </div>

          <div v-if="topicPanelCollapsed" class="chat-topic-collapsed">
            <div class="chat-topic-collapsed-label">话题</div>
            <div class="chat-topic-collapsed-title">{{ topicMiniLabel }}</div>
            <button class="chat-topic-collapsed-link" @click="openTopicDetail" :disabled="!canOpenTopicDetail">
              详情
            </button>
          </div>

          <template v-else>
            <div class="chat-topic-eyebrow">当前话题</div>
            <div class="chat-topic-header">
              <div>
                <h3>{{ topicCardTitle }}</h3>
                <p class="chat-topic-subtitle">
                  {{ topicUnavailable ? '历史消息可查看，不能继续对话' : '你正在围绕这个话题展开对话' }}
                </p>
              </div>
              <span v-if="topicUnavailable" class="status-badge inactive">⚫ 已下架</span>
              <span v-else-if="topicIsOfficial" class="official-badge">⭐ 官方</span>
            </div>

            <p v-if="topicExcerpt" class="chat-topic-excerpt">{{ topicExcerpt }}</p>
            <p v-else class="chat-topic-excerpt chat-topic-excerpt--muted">
              {{ topicDetailLoading ? '正在加载话题详情...' : (topicDetailError || '这里会展示当前对话关联的话题信息。') }}
            </p>

            <div v-if="topicTags.length" class="topic-tags chat-topic-tags">
              <span
                v-for="(tag, i) in topicTags"
                :key="tag + '-' + i"
                :class="['tag-pill', 'tag-pill-sm', 'tag-colors-' + i % 7]"
              >
                {{ tag }}
              </span>
            </div>

            <div v-if="topicAuthors.length" class="chat-topic-authors">
              <span v-for="(author, i) in topicAuthors" :key="author.user_id || i">
                {{ author.nickname }}<span v-if="author.is_primary"> (主创)</span><span v-if="i < topicAuthors.length - 1">、</span>
              </span>
            </div>

            <div class="chat-topic-actions">
              <button class="btn btn-secondary btn-sm chat-topic-link" @click="openTopicDetail" :disabled="!canOpenTopicDetail">
                查看话题详情
              </button>
              <button v-if="canForceEnd" class="btn btn-ghost btn-sm chat-topic-link" @click="forceEnd">
                结束对话
              </button>
            </div>

            <p v-if="!canOpenTopicDetail && topicUnavailable" class="chat-topic-note">
              话题已下架，当前只能查看对话历史。
            </p>
          </template>
        </div>
      </aside>

      <section class="chat-main">
        <div class="chat-main-card">
          <div class="chat-banners">
            <div v-if="topicUnavailable" class="chat-unavailable-banner">
              <strong>当前话题已下架</strong>
              <span>{{ topicUnavailableReason || '你仍然可以查看历史消息，但不能继续对话。' }}</span>
            </div>
            <div v-if="wasCompleted && !topicUnavailable" class="chat-resume-banner">
              本次对话已结束，随时欢迎回来。
            </div>
          </div>

          <div class="chat-messages" ref="messagesEl" @scroll="handleScroll">
            <div v-if="!messages.length && mode === 2 && !isStreaming" class="chat-welcome">
              <div class="chat-welcome-icon">💬</div>
              <p>随便聊点什么吧…</p>
            </div>

            <template v-for="(m, i) in messages" :key="i">
              <div :class="['msg-row', m.role]">
                <div class="msg-bubble">
                  <div v-if="m.role === 'assistant' && m === currentAiMsg && isStreaming" style="white-space:pre-wrap">
                    {{ m.content }}
                    <span v-if="!m.content" class="typing-dots"><span></span><span></span><span></span></span>
                  </div>
                  <div v-else-if="m.role !== 'system'" class="markdown-body" v-html="renderMd(m.content)"></div>
                  <div v-else>{{ m.content }}</div>
                </div>
              </div>

              <div v-if="m.showQuitConfirm" class="quit-confirm-bar">
                <span>看起来你想结束对话了，确认结束吗？</span>
                <button class="btn btn-primary btn-sm" @click="forceEnd">结束对话</button>
                <button class="btn btn-ghost btn-sm" @click="m.showQuitConfirm=false">继续聊</button>
              </div>
            </template>

            <div v-if="isCompleted" class="end-state-card">
              <div class="end-state-icon">✅</div>
              <h3>对话已结束</h3>
              <p v-if="summary" class="end-state-summary">{{ summary }}</p>
              <button v-if="reportReady" class="btn btn-primary" @click="$router.push('/session/' + sessionId + '/report')">📊 查看观念报告</button>
              <p v-else-if="reportPolling" class="end-state-hint">报告生成中，稍后可在对话历史中查看</p>
            </div>
          </div>

          <div v-if="!topicUnavailable" class="chat-input-area">
            <div class="chat-input-shell">
              <div class="chat-input-caption">
                {{ isCompleted ? '这轮对话已经结束' : (mode === 1 ? '继续围绕当前话题表达你的想法' : '继续把脑海里的想法说出来') }}
              </div>
              <div class="chat-input-wrap">
                <textarea
                  v-model="inputText"
                  rows="1"
                  placeholder="输入你的想法..."
                  @keydown="handleKeydown"
                  ref="inputEl"
                  :disabled="isCompleted"
                ></textarea>
                <button v-if="isStreaming" class="chat-send-btn stop-btn" @click="stopGeneration" title="停止生成">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
                <button v-else class="chat-send-btn" @click="sendMessage" :disabled="!canSend">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside class="chat-panel chat-panel--report">
        <div :class="['chat-panel-card', 'chat-report-card', { 'chat-report-card--updating': reportUpdating }]">
          <div class="chat-report-header">
            <div>
              <div class="chat-topic-eyebrow">特质画像</div>
              <h3>对话中的你</h3>
            </div>
            <span class="chat-report-status">{{ reportStatusText }}</span>
          </div>

          <transition name="report-swap" mode="out-in">
            <div :key="reportRevision" class="chat-report-scroll">
              <div v-if="hasTraitContent || showSessionSummary" class="chat-report-stack">
                <section v-if="traitSummary" class="chat-report-section chat-report-section--summary">
                  <h4>即时特质摘要</h4>
                  <p>{{ traitSummary }}</p>
                </section>

                <section v-if="traitFullReport" class="chat-report-section">
                  <h4>长期特质报告</h4>
                  <div class="markdown-body" v-html="renderMd(traitFullReport)"></div>
                </section>

                <section v-if="showSessionSummary" class="chat-report-section chat-report-section--session">
                  <h4>本次观念摘要</h4>
                  <p>{{ summary }}</p>
                </section>
              </div>

              <div v-else class="chat-report-empty">
                <div class="chat-report-empty-icon">🧬</div>
                <h4>画像还在形成中</h4>
                <p>{{ reportEmptyText }}</p>
              </div>
            </div>
          </transition>

          <div class="chat-report-footer">
            <button v-if="showReportEntry" class="btn btn-primary" @click="$router.push('/session/' + sessionId + '/report')">
              查看完整观念报告
            </button>
            <p v-else class="chat-report-footer-text">{{ reportFooterText }}</p>
          </div>
        </div>
      </aside>
    </div>
  `,

  setup() {
    const route = useRoute();
    const router = useRouter();
    const toast = useToast();

    const sessionId = route.params.sessionId;
    const mode = ref(parseInt(route.query.mode) || 2);
    const topicId = ref(route.query.topicId ? parseInt(route.query.topicId) : null);
    const isFirst = ref(route.query.first === 'true');

    const messages = ref([]);
    const inputText = ref('');
    const isStreaming = ref(false);
    const isCompleted = ref(false);
    const summary = ref('');
    const reportReady = ref(false);
    const reportPolling = ref(false);
    const currentAiMsg = ref(null);
    const messagesEl = ref(null);
    const inputEl = ref(null);
    const abortController = ref(null);
    const topicName = ref(decodeTopicName(route.query.topicName));

    const topicUnavailable = ref(false);
    const topicUnavailableReason = ref('');
    const wasCompleted = ref(false);
    const topicDetail = ref(null);
    const topicDetailLoading = ref(false);
    const topicDetailError = ref('');
    const topicPanelCollapsed = ref(false);

    const traitSummary = ref('');
    const traitFullReport = ref('');
    const traitLoading = ref(false);
    const reportUpdating = ref(false);
    const reportRevision = ref(0);

    let outputQueue = [];
    let typewriterTimer = null;
    let pollTimer = null;
    let reportUpdateTimer = null;
    let userScrolledUp = false;

    const canSend = computed(() => inputText.value.trim() && !isStreaming.value && !topicUnavailable.value && !isCompleted.value);
    const canForceEnd = computed(() => !topicUnavailable.value && !isCompleted.value && !isStreaming.value);
    const showTopicSidebar = computed(() => mode.value === 1 && !!(topicId.value || topicName.value));
    const topicTags = computed(() => (
      (topicDetail.value?.tags || [])
        .map(tag => typeof tag === 'string' ? tag : tag?.name)
        .filter(Boolean)
    ));
    const topicAuthors = computed(() => topicDetail.value?.authors || []);
    const topicCardTitle = computed(() => topicName.value || topicDetail.value?.title || '话题对话');
    const topicIsOfficial = computed(() => Boolean(topicDetail.value?.is_official));
    const topicExcerpt = computed(() => {
      const text = String(topicDetail.value?.content || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      if (text.length <= 110) return text;
      return `${text.slice(0, 110).trim()}...`;
    });
    const canOpenTopicDetail = computed(() => Boolean(topicId.value && topicDetail.value));
    const topicMiniLabel = computed(() => {
      const text = topicCardTitle.value.trim();
      return text ? text.slice(0, 4) : '话题';
    });

    const hasTraitContent = computed(() => Boolean(traitSummary.value || traitFullReport.value));
    const showSessionSummary = computed(() => Boolean(summary.value));
    const showReportEntry = computed(() => Boolean(reportReady.value && (isCompleted.value || wasCompleted.value)));
    const reportStatusText = computed(() => {
      if (reportUpdating.value) return '更新中';
      if (traitLoading.value) return '同步中';
      if (reportPolling.value) return '生成中';
      if (hasTraitContent.value) return '已同步';
      return '待生成';
    });
    const reportEmptyText = computed(() => {
      if (traitLoading.value) return '系统正在同步你的特质画像。';
      if (reportPolling.value) return '对话已经触发分析，这里会在结果返回后自动更新。';
      if (wasCompleted.value || isCompleted.value) return '这次对话暂时没有生成完整画像，可以继续探索更多话题。';
      return '随着对话推进，这里会逐渐出现更完整的特质画像。';
    });
    const reportFooterText = computed(() => {
      if (reportPolling.value) return '观念报告正在生成，右侧画像会在数据变化后自动刷新。';
      if (showSessionSummary.value) return '这次对话已提炼出摘要，但还没有可打开的完整观念报告。';
      return '当前对话还没有生成单独的观念报告。';
    });

    function renderMd(text) {
      return renderMarkdown(text);
    }

    function lockPageScroll() {
      document.documentElement.classList.add('chat-page-lock');
      document.body.classList.add('chat-page-lock');
    }

    function unlockPageScroll() {
      document.documentElement.classList.remove('chat-page-lock');
      document.body.classList.remove('chat-page-lock');
    }

    function pulseReportPanel() {
      reportRevision.value += 1;
      reportUpdating.value = true;
      if (reportUpdateTimer) clearTimeout(reportUpdateTimer);
      reportUpdateTimer = setTimeout(() => {
        reportUpdating.value = false;
      }, 1200);
    }

    function resizeInput() {
      nextTick(() => {
        if (!inputEl.value) return;
        inputEl.value.style.height = 'auto';
        inputEl.value.style.height = `${Math.min(inputEl.value.scrollHeight, 140)}px`;
      });
    }

    async function loadTopicDetail() {
      if (mode.value !== 1 || !topicId.value) {
        topicDetail.value = null;
        topicDetailError.value = '';
        return;
      }

      topicDetailLoading.value = true;
      topicDetailError.value = '';
      try {
        const detail = await api.topics.detail(topicId.value);
        topicDetail.value = detail;
        if (!topicName.value && detail?.title) {
          topicName.value = detail.title;
        }
      } catch (e) {
        topicDetail.value = null;
        topicDetailError.value = e?.message || '话题详情暂不可查看';
      } finally {
        topicDetailLoading.value = false;
      }
    }

    async function loadTraitProfile({ animate = false } = {}) {
      traitLoading.value = true;
      try {
        const profile = await api.traits.getGlobal();
        const nextSummary = normalizeTraitSummary(profile.summary);
        const nextReport = String(profile.full_report || '').trim();
        const changed = nextSummary !== traitSummary.value || nextReport !== traitFullReport.value;

        traitSummary.value = nextSummary;
        traitFullReport.value = nextReport;

        if (animate && changed) {
          pulseReportPanel();
        }
      } catch (e) {
        // 忽略画像拉取失败，避免打断聊天
      } finally {
        traitLoading.value = false;
      }
    }

    function applyEndState(event = {}) {
      const nextSummary = String(event.summary || '').trim();
      const nextTraitSummary = normalizeTraitSummary(event.trait_summary);
      const changed = nextSummary !== summary.value || nextTraitSummary !== traitSummary.value;

      summary.value = nextSummary;
      if (nextTraitSummary) {
        traitSummary.value = nextTraitSummary;
      }

      if (changed) {
        pulseReportPanel();
      }
    }

    function goBack() {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push('/sessions');
      }
    }

    function openTopicDetail() {
      if (!canOpenTopicDetail.value) return;
      router.push(`/topic/${topicId.value}`);
    }

    function toggleTopicSidebar() {
      topicPanelCollapsed.value = !topicPanelCollapsed.value;
    }

    function scrollToBottom() {
      nextTick(() => {
        if (messagesEl.value && !userScrolledUp) {
          messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
        }
      });
    }

    function autoScroll() {
      scrollToBottom();
    }

    function handleScroll() {
      if (!messagesEl.value) return;
      const el = messagesEl.value;
      userScrolledUp = el.scrollTop + el.clientHeight < el.scrollHeight - 60;
    }

    function startTypewriter(aiMsg) {
      if (typewriterTimer) return;
      typewriterTimer = setInterval(() => {
        if (outputQueue.length === 0) {
          clearInterval(typewriterTimer);
          typewriterTimer = null;
          return;
        }
        const batch = outputQueue.splice(0, 2).join('');
        aiMsg.content += batch;
        autoScroll();
      }, 35);
    }

    function flushTypewriter(aiMsg) {
      if (typewriterTimer) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
      }
      if (outputQueue.length) {
        aiMsg.content += outputQueue.join('');
        outputQueue = [];
      }
    }

    function sendMessage() {
      const text = inputText.value.trim();
      if (!text || isStreaming.value || topicUnavailable.value || isCompleted.value) return;
      inputText.value = '';
      messages.value.push({ role: 'user', content: text });
      resizeInput();
      scrollToBottom();
      doStream(text, false);
      wasCompleted.value = false;
    }

    async function doStream(message, first) {
      isStreaming.value = true;
      const aiMsg = reactive({ role: 'assistant', content: '', showQuitConfirm: false });
      messages.value.push(aiMsg);
      currentAiMsg.value = aiMsg;
      outputQueue = [];
      autoScroll();

      abortController.value = new AbortController();
      const payload = { mode: mode.value, session_id: sessionId, message: message || '', is_first: first };
      if (topicId.value) payload.topic_id = topicId.value;

      try {
        await api.chat.stream(payload, {
          onChunk(text) {
            outputQueue.push(...text.split(''));
            startTypewriter(aiMsg);
          },
          onEnd(event) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            isCompleted.value = true;
            applyEndState(event);
            if (event.report_ready) reportReady.value = true;
            else startReportPolling();
            loadTraitProfile({ animate: true });
            window.dispatchEvent(new CustomEvent('chat-completed'));
          },
          onError(code, msg) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            if (code === 'TOPIC_UNAVAILABLE') {
              topicUnavailable.value = true;
              topicUnavailableReason.value = msg;
              window.dispatchEvent(new CustomEvent('chat-completed'));
            } else {
              toast.error(msg);
            }
          },
          onQuit() {
            aiMsg.showQuitConfirm = true;
          },
          onReportGenerating() {
            messages.value.push({ role: 'system', content: '📊 观念报告正在生成中…' });
            startReportPolling();
          },
          onEmptyStream() {
            toast.info('AI 暂时没有回应，请稍后重试');
            isStreaming.value = false;
            currentAiMsg.value = null;
          }
        }, abortController.value.signal);
      } catch (e) {
        if (e.name !== 'AbortError') toast.error('请求失败');
        isStreaming.value = false;
        currentAiMsg.value = null;
      }

      if (!isCompleted.value) {
        flushTypewriter(aiMsg);
        isStreaming.value = false;
        currentAiMsg.value = null;
      }
    }

    function stopGeneration() {
      if (abortController.value) abortController.value.abort();
      if (currentAiMsg.value) flushTypewriter(currentAiMsg.value);
      isStreaming.value = false;
      currentAiMsg.value = null;
    }

    function startReportPolling() {
      reportPolling.value = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const res = await api.sessions.reportStatus(sessionId);
          await loadTraitProfile({ animate: true });
          if (res.ready) {
            reportReady.value = true;
            reportPolling.value = false;
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } catch (e) {
          // 静默忽略轮询错误
        }
      }, 3000);
    }

    async function forceEnd() {
      if (topicUnavailable.value || isCompleted.value) return;
      isStreaming.value = true;
      const aiMsg = reactive({ role: 'assistant', content: '' });
      messages.value.push(aiMsg);
      currentAiMsg.value = aiMsg;
      outputQueue = [];

      abortController.value = new AbortController();
      const payload = { mode: mode.value, session_id: sessionId, message: '', is_first: false, force_end: true };
      if (topicId.value) payload.topic_id = topicId.value;

      try {
        await api.chat.stream(payload, {
          onChunk(text) {
            outputQueue.push(...text.split(''));
            startTypewriter(aiMsg);
          },
          onEnd(event) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            isCompleted.value = true;
            applyEndState(event);
            if (event.report_ready) reportReady.value = true;
            else startReportPolling();
            loadTraitProfile({ animate: true });
            window.dispatchEvent(new CustomEvent('chat-completed'));
          },
          onError(code, msg) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            toast.error(msg);
          },
          onQuit() {},
          onReportGenerating() {
            messages.value.push({ role: 'system', content: '📊 观念报告正在生成中…' });
            startReportPolling();
          },
          onEmptyStream() {
            isStreaming.value = false;
            currentAiMsg.value = null;
          }
        }, abortController.value.signal);
      } catch (e) {
        isStreaming.value = false;
        currentAiMsg.value = null;
      }
    }

    function handleKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function onForceEndEvent() {
      forceEnd();
    }

    watch(inputText, () => {
      resizeInput();
    });

    onMounted(async () => {
      lockPageScroll();
      resizeInput();
      if (window.innerWidth < 1280 && showTopicSidebar.value) {
        topicPanelCollapsed.value = true;
      }

      window.addEventListener('force-end-chat', onForceEndEvent);
      window.dispatchEvent(new CustomEvent('chat-started'));

      await loadTraitProfile();

      if (mode.value === 1 && topicId.value) {
        await loadTopicDetail();
      }

      if (!isFirst.value && !route.query.first) {
        try {
          const detail = await api.sessions.detail(sessionId);

          if (detail.topic_unavailable) {
            topicUnavailable.value = true;
            topicUnavailableReason.value = detail.topic_unavailable_reason || '';
            window.dispatchEvent(new CustomEvent('chat-completed'));
          }

          if (detail.messages) {
            messages.value = detail.messages.map(m => ({ role: m.role, content: m.content }));
          }

          const completed = detail.is_completed || detail.status === 'completed';
          if (completed) {
            wasCompleted.value = true;
            isCompleted.value = true;
            summary.value = String(detail.summary || '').trim();
            window.dispatchEvent(new CustomEvent('chat-completed'));
            try {
              const r = await api.sessions.reportStatus(sessionId);
              reportReady.value = r.ready;
              if (!r.ready) startReportPolling();
            } catch (e) {}
          } else {
            if (detail.mode) mode.value = detail.mode;
            if (detail.topic_id) topicId.value = detail.topic_id;
          }

          if (detail.topic_title) topicName.value = detail.topic_title;
          if (detail.mode) mode.value = detail.mode;

          if (mode.value === 1 && topicId.value) {
            await loadTopicDetail();
          }

          if (summary.value) {
            pulseReportPanel();
          }

          scrollToBottom();
          return;
        } catch (e) {
          // 新 session，无需恢复历史
        }
      }

      if (mode.value === 1 && isFirst.value) {
        await doStream('', true);
      }
    });

    onUnmounted(() => {
      unlockPageScroll();
      window.removeEventListener('force-end-chat', onForceEndEvent);
      if (pollTimer) clearInterval(pollTimer);
      if (typewriterTimer) clearInterval(typewriterTimer);
      if (reportUpdateTimer) clearTimeout(reportUpdateTimer);
      if (abortController.value) abortController.value.abort();
    });

    return {
      sessionId,
      mode,
      messages,
      inputText,
      isStreaming,
      isCompleted,
      summary,
      reportReady,
      reportPolling,
      currentAiMsg,
      canSend,
      canForceEnd,
      messagesEl,
      inputEl,
      topicUnavailable,
      topicUnavailableReason,
      wasCompleted,
      topicDetail,
      topicDetailLoading,
      topicDetailError,
      showTopicSidebar,
      topicTags,
      topicAuthors,
      topicCardTitle,
      topicIsOfficial,
      topicExcerpt,
      canOpenTopicDetail,
      topicMiniLabel,
      topicPanelCollapsed,
      traitSummary,
      traitFullReport,
      hasTraitContent,
      showSessionSummary,
      showReportEntry,
      reportStatusText,
      reportEmptyText,
      reportFooterText,
      reportUpdating,
      reportRevision,
      renderMd,
      sendMessage,
      handleKeydown,
      forceEnd,
      stopGeneration,
      handleScroll,
      openTopicDetail,
      toggleTopicSidebar,
      goBack,
    };
  }
};
