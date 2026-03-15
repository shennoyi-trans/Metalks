/**
 * ChatPage — 悬浮式对话页
 * 左侧图标展开话题/报告卡片，中间保留对话流，右上角仅保留分享占位。
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

function clampPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export const ChatPage = {
  template: `
    <div class="chat-stage">
      <div v-if="activePanel" class="chat-float-backdrop" @click="closeFloatingPanels"></div>

      <button class="chat-corner-btn chat-corner-btn--back" @click.stop="goBack">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
        </svg>
        返回
      </button>

      <button class="chat-corner-btn chat-corner-btn--share" @click.stop="handleShare">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        分享
      </button>

      <div class="chat-side-dock" @click.stop>
        <button
          v-if="showTopicDock"
          :class="['chat-dock-btn', { active: activePanel === 'topic' }]"
          title="当前话题"
          @click="togglePanel('topic')"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16.5A1.5 1.5 0 0 0 18.5 18H6.5A2.5 2.5 0 0 1 4 15.5z"/>
            <path d="M8 7h8"/><path d="M8 11h8"/>
          </svg>
        </button>

        <button
          :class="['chat-dock-btn', 'chat-dock-btn--report', { active: activePanel === 'report' }]"
          title="观念报告"
          @click="togglePanel('report')"
        >
          <span class="chat-dock-water">
            <span class="chat-dock-water-fill" :style="{ height: reportCompleteness + '%' }"></span>
            <span class="chat-dock-water-text">{{ reportCompleteness }}%</span>
          </span>
          <span class="chat-dock-subtext">{{ reportConfidence }}%</span>
        </button>
      </div>

      <transition name="panel-float">
        <aside
          v-if="showTopicPanel"
          class="chat-float-card chat-float-card--topic"
          @click.stop
        >
          <div class="chat-float-card-header">
            <div>
              <div class="chat-float-eyebrow">当前话题</div>
              <h3>{{ topicCardTitle }}</h3>
            </div>
            <button class="chat-float-close" @click="closeFloatingPanels">×</button>
          </div>

          <p v-if="topicExcerpt" class="chat-float-description">{{ topicExcerpt }}</p>
          <p v-else class="chat-float-description chat-float-description--muted">
            {{ topicDetailLoading ? '正在加载话题详情...' : (topicDetailError || '这里会展示当前对话关联的话题信息。') }}
          </p>

          <div v-if="topicTags.length" class="topic-tags chat-float-tags">
            <span
              v-for="(tag, i) in topicTags"
              :key="tag + '-' + i"
              :class="['tag-pill', 'tag-pill-sm', 'tag-colors-' + i % 7]"
            >
              {{ tag }}
            </span>
          </div>

          <div v-if="topicAuthors.length" class="chat-float-meta">
            <span v-for="(author, i) in topicAuthors" :key="author.user_id || i">
              {{ author.nickname }}<span v-if="author.is_primary"> (主创)</span><span v-if="i < topicAuthors.length - 1">、</span>
            </span>
          </div>

          <div class="chat-float-actions">
            <button class="btn btn-secondary btn-sm" @click="openTopicDetail" :disabled="!canOpenTopicDetail">
              查看话题详情
            </button>
            <button v-if="canForceEnd" class="btn btn-ghost btn-sm" @click="forceEnd">
              结束对话
            </button>
          </div>

          <p v-if="topicUnavailable" class="chat-float-tip">
            话题已下架，当前只能查看历史内容。
          </p>
        </aside>
      </transition>

      <transition name="panel-float">
        <aside
          v-if="showReportPanel"
          class="chat-float-card chat-float-card--report"
          @click.stop
        >
          <div class="chat-float-card-header">
            <div>
              <div class="chat-float-eyebrow">观念报告</div>
              <h3>本次对话的结论</h3>
            </div>
            <button class="chat-float-close" @click="closeFloatingPanels">×</button>
          </div>

          <div class="chat-report-metrics">
            <div class="chat-report-metric">
              <span>报告完整性</span>
              <strong>{{ reportCompleteness }}%</strong>
            </div>
            <div class="chat-report-metric">
              <span>结论置信度</span>
              <strong>{{ reportConfidence }}%</strong>
            </div>
          </div>

          <div v-if="reportLoading" class="chat-report-placeholder">
            正在读取观念报告...
          </div>
          <div v-else-if="reportContent" class="chat-report-body markdown-body" v-html="renderMd(reportContent)"></div>
          <div v-else class="chat-report-placeholder">
            暂无观念报告
          </div>

          <p v-if="reportPolling && !reportContent" class="chat-float-tip">
            报告生成中，完成后这里会自动更新。
          </p>
        </aside>
      </transition>

      <div class="chat-thread">
        <div v-if="topicUnavailable" class="chat-thread-status chat-thread-status--danger">
          {{ topicUnavailableReason || '当前话题已下架，你仍然可以查看历史消息。' }}
        </div>
        <div v-else-if="wasCompleted" class="chat-thread-status">
          本次对话已结束，历史内容仍可继续查看。
        </div>

        <div class="chat-messages" ref="messagesEl" @scroll="handleScroll">
          <div class="chat-messages-inner">
            <div v-if="!messages.length && mode === 2 && !isStreaming" class="chat-welcome">
              <div class="chat-welcome-icon">💬</div>
              <p>随便聊点什么吧…</p>
            </div>

            <template v-for="(m, i) in messages" :key="m.id || i">
              <div v-if="m.role === 'system_card'" class="chat-system-card">
                <div class="chat-system-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 3l1.9 3.85L18 8.27l-3 2.93.71 4.13L12 13.8l-3.71 1.95.71-4.13-3-2.93 4.1-1.42z"/>
                  </svg>
                </div>
                <div class="chat-system-card-body">
                  <div class="chat-system-card-title">{{ m.title }}</div>
                  <div v-if="m.content" class="chat-system-card-content markdown-body" v-html="renderMd(m.content)"></div>
                  <div v-if="m.items && m.items.length" class="chat-system-card-list">
                    <span v-for="(item, idx) in m.items" :key="idx" class="chat-system-pill">{{ item }}</span>
                  </div>
                </div>
              </div>

              <div v-else :class="['msg-row', m.role]">
                <div class="msg-bubble">
                  <div v-if="m.role === 'assistant' && m === currentAiMsg && isStreaming" style="white-space:pre-wrap">
                    {{ m.content }}<span v-if="!m.content" class="typing-dots"><span></span><span></span><span></span></span>
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
          </div>
        </div>

        <div v-if="!topicUnavailable" class="chat-input-area">
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

    const activePanel = ref(null);
    const reportContent = ref('');
    const reportLoading = ref(false);
    const reportCompleteness = ref(0);
    const reportConfidence = ref(0);

    let outputQueue = [];
    let typewriterTimer = null;
    let pollTimer = null;
    let userScrolledUp = false;

    const canSend = computed(() => inputText.value.trim() && !isStreaming.value && !topicUnavailable.value && !isCompleted.value);
    const canForceEnd = computed(() => !topicUnavailable.value && !isCompleted.value && !isStreaming.value);
    const showTopicDock = computed(() => mode.value === 1 && !!(topicId.value || topicName.value));
    const showTopicPanel = computed(() => showTopicDock.value && activePanel.value === 'topic');
    const showReportPanel = computed(() => activePanel.value === 'report');
    const topicTags = computed(() => (
      (topicDetail.value?.tags || [])
        .map(tag => typeof tag === 'string' ? tag : tag?.name)
        .filter(Boolean)
    ));
    const topicAuthors = computed(() => topicDetail.value?.authors || []);
    const topicCardTitle = computed(() => topicName.value || topicDetail.value?.title || '话题对话');
    const topicExcerpt = computed(() => {
      const text = String(topicDetail.value?.content || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      if (text.length <= 100) return text;
      return `${text.slice(0, 100).trim()}...`;
    });
    const canOpenTopicDetail = computed(() => Boolean(topicId.value && topicDetail.value));

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

    function resizeInput() {
      nextTick(() => {
        if (!inputEl.value) return;
        inputEl.value.style.height = 'auto';
        inputEl.value.style.height = `${Math.min(inputEl.value.scrollHeight, 140)}px`;
      });
    }

    function ensureMessageIds() {
      messages.value = messages.value.map((item, index) => ({
        ...item,
        id: item.id || `${item.role}-${Date.now()}-${index}`,
      }));
    }

    function applyReportMeta(payload = {}) {
      const nextCompleteness = clampPercent(
        payload.report_completeness ?? payload.completeness ?? (reportContent.value ? 100 : reportCompleteness.value)
      );
      const nextConfidence = clampPercent(
        payload.conclusion_confidence ?? payload.confidence ?? reportConfidence.value
      );
      reportCompleteness.value = nextCompleteness;
      reportConfidence.value = nextConfidence;
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

    function insertSystemCard(card) {
      const payload = {
        id: `system-card-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        role: 'system_card',
        title: card.title || '系统卡片',
        content: card.content || '',
        items: Array.isArray(card.items) ? card.items.filter(Boolean) : [],
      };

      const last = messages.value[messages.value.length - 1];
      if (
        last &&
        last.role === 'system_card' &&
        last.title === payload.title &&
        last.content === payload.content
      ) {
        return;
      }

      messages.value.push(payload);
      scrollToBottom();
    }

    async function loadSessionReport() {
      reportLoading.value = true;
      try {
        const res = await api.sessions.report(sessionId);
        reportContent.value = String(res.report || '').trim();
        if (reportContent.value) {
          applyReportMeta({ ...res, completeness: 100 });
        }
      } catch (e) {
        reportContent.value = '';
      } finally {
        reportLoading.value = false;
      }
    }

    function goBack() {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push('/sessions');
      }
    }

    function handleShare() {
      toast.info('分享功能即将上线');
    }

    function openTopicDetail() {
      if (!canOpenTopicDetail.value) return;
      router.push(`/topic/${topicId.value}`);
    }

    function togglePanel(panel) {
      activePanel.value = activePanel.value === panel ? null : panel;
    }

    function closeFloatingPanels() {
      activePanel.value = null;
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

    function syncEndState(event = {}) {
      summary.value = String(event.summary || '').trim();
      if (summary.value) {
        insertSystemCard({
          title: '当前阶段总结',
          content: summary.value,
        });
      }

      if (Array.isArray(event.insights) && event.insights.length) {
        insertSystemCard({
          title: '新识别出的观念',
          items: event.insights,
        });
      }

      applyReportMeta(event);
    }

    function sendMessage() {
      const text = inputText.value.trim();
      if (!text || isStreaming.value || topicUnavailable.value || isCompleted.value) return;
      inputText.value = '';
      messages.value.push({
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      });
      resizeInput();
      scrollToBottom();
      doStream(text, false);
      wasCompleted.value = false;
    }

    async function doStream(message, first) {
      isStreaming.value = true;
      const aiMsg = reactive({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        showQuitConfirm: false
      });
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
          onSystemCard(event) {
            insertSystemCard({
              title: event.title || event.label || '系统卡片',
              content: event.content || event.summary || '',
              items: event.items || event.insights || [],
            });
          },
          onReportMeta(event) {
            applyReportMeta(event);
          },
          onEnd(event) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            isCompleted.value = true;
            syncEndState(event);
            if (event.report_ready) {
              reportReady.value = true;
              loadSessionReport();
            } else {
              startReportPolling();
            }
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
          applyReportMeta(res);
          if (res.ready) {
            reportReady.value = true;
            reportPolling.value = false;
            clearInterval(pollTimer);
            pollTimer = null;
            await loadSessionReport();
          }
        } catch (e) {
          // 静默忽略轮询错误
        }
      }, 3000);
    }

    async function forceEnd() {
      if (topicUnavailable.value || isCompleted.value) return;
      isStreaming.value = true;
      const aiMsg = reactive({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: ''
      });
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
          onSystemCard(event) {
            insertSystemCard({
              title: event.title || event.label || '系统卡片',
              content: event.content || event.summary || '',
              items: event.items || event.insights || [],
            });
          },
          onReportMeta(event) {
            applyReportMeta(event);
          },
          onEnd(event) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            isCompleted.value = true;
            syncEndState(event);
            if (event.report_ready) {
              reportReady.value = true;
              loadSessionReport();
            } else {
              startReportPolling();
            }
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

    watch(inputText, () => {
      resizeInput();
    });

    onMounted(async () => {
      lockPageScroll();
      resizeInput();
      window.dispatchEvent(new CustomEvent('chat-started'));

      if (mode.value === 1 && topicId.value) {
        await loadTopicDetail();
      }

      if (!isFirst.value && !route.query.first) {
        try {
          const detail = await api.sessions.detail(sessionId);

          if (detail.mode) mode.value = detail.mode;
          if (detail.topic_id) topicId.value = detail.topic_id;
          if (detail.topic_title) topicName.value = detail.topic_title;

          if (detail.topic_unavailable) {
            topicUnavailable.value = true;
            topicUnavailableReason.value = detail.topic_unavailable_reason || '';
            window.dispatchEvent(new CustomEvent('chat-completed'));
          }

          if (detail.messages) {
            messages.value = detail.messages.map((m, index) => ({
              id: `history-${index}-${Date.now()}`,
              role: m.role,
              content: m.content,
            }));
          }
          ensureMessageIds();

          const completed = detail.is_completed || detail.status === 'completed';
          if (completed) {
            wasCompleted.value = true;
            isCompleted.value = true;
            summary.value = String(detail.summary || '').trim();
            if (summary.value) {
              insertSystemCard({
                title: '当前阶段总结',
                content: summary.value,
              });
            }

            try {
              const r = await api.sessions.reportStatus(sessionId);
              reportReady.value = r.ready;
              applyReportMeta(r);
              if (r.ready) {
                await loadSessionReport();
              } else {
                startReportPolling();
              }
            } catch (e) {}

            window.dispatchEvent(new CustomEvent('chat-completed'));
          } else {
            // 继续中的会话保持可对话状态
          }

          if (mode.value === 1 && topicId.value) {
            await loadTopicDetail();
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
      if (pollTimer) clearInterval(pollTimer);
      if (typewriterTimer) clearInterval(typewriterTimer);
      if (abortController.value) abortController.value.abort();
    });

    return {
      sessionId,
      mode,
      messages,
      inputText,
      isStreaming,
      isCompleted,
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
      showTopicDock,
      showTopicPanel,
      showReportPanel,
      topicTags,
      topicAuthors,
      topicCardTitle,
      topicExcerpt,
      canOpenTopicDetail,
      activePanel,
      reportContent,
      reportLoading,
      reportCompleteness,
      reportConfidence,
      renderMd,
      sendMessage,
      handleKeydown,
      forceEnd,
      stopGeneration,
      handleScroll,
      goBack,
      handleShare,
      openTopicDetail,
      togglePanel,
      closeFloatingPanels,
    };
  }
};
