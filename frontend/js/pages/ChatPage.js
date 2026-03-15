/**
 * ChatPage — 对话页（产品核心）
 * v2: 正确处理会话完成状态、优化视觉
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { renderMarkdown } from '../utils/markdown.js';

const { ref, reactive, computed, onMounted, onUnmounted, nextTick } = Vue;
const { useRoute, useRouter } = VueRouter;

export const ChatPage = {
  template: `
    <div class="chat-container chat-container--immersive">
      <!-- 顶部模糊渐变遮罩 -->
      <div class="chat-blur-top"></div>

      <!-- 话题不可用横幅 -->
      <div v-if="topicUnavailable" class="chat-unavailable-banner">
        {{ topicUnavailableReason || '该话题已不可用' }}
      </div>
      <!-- 已结束可继续横幅 -->
      <div v-if="wasCompleted && !topicUnavailable" class="chat-resume-banner">
        本次对话已结束，随时欢迎回来。
      </div>

      <div class="chat-messages" ref="messagesEl" @scroll="handleScroll">
        <!-- Mode2 空状态 -->
        <div v-if="!messages.length && mode==2 && !isStreaming" class="chat-welcome">
          <div class="chat-welcome-icon">💬</div>
          <p>随便聊点什么吧…</p>
        </div>

        <template v-for="(m,i) in messages" :key="i">
          <div :class="['msg-row', m.role]">
            <div class="msg-bubble">
              <!-- 流式输出中：纯文本 -->
              <div v-if="m.role==='assistant' && m===currentAiMsg && isStreaming" style="white-space:pre-wrap">{{ m.content }}<span v-if="!m.content" class="typing-dots"><span></span><span></span><span></span></span></div>
              <!-- 已完成：Markdown渲染 -->
              <div v-else-if="m.role!=='system'" class="markdown-body" v-html="renderMd(m.content)"></div>
              <!-- 系统消息 -->
              <div v-else>{{ m.content }}</div>
            </div>
          </div>
          <!-- 退出确认条 -->
          <div v-if="m.showQuitConfirm" class="quit-confirm-bar">
            <span>看起来你想结束对话了，确认结束吗？</span>
            <button class="btn btn-primary btn-sm" @click="forceEnd">结束对话</button>
            <button class="btn btn-ghost btn-sm" @click="m.showQuitConfirm=false">继续聊</button>
          </div>
        </template>

        <!-- 结束状态卡片 -->
        <div v-if="isCompleted" class="end-state-card">
          <div class="end-state-icon">✅</div>
          <h3>对话已结束</h3>
          <p v-if="summary" class="end-state-summary">{{ summary }}</p>
          <button v-if="reportReady" class="btn btn-primary" @click="$router.push('/session/'+sessionId+'/report')">📊 查看观念报告</button>
          <p v-else-if="reportPolling" class="end-state-hint">报告生成中，稍后可在对话历史中查看</p>
        </div>
      </div>

      <!-- 输入区 -->
      <div v-if="!topicUnavailable" class="chat-input-area">
        <div class="chat-input-wrap">
          <textarea v-model="inputText" rows="1" placeholder="输入你的想法..."
            @keydown="handleKeydown" ref="inputEl" :disabled="isCompleted"></textarea>
          <button v-if="isStreaming" class="chat-send-btn stop-btn" @click="stopGeneration" title="停止生成">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </button>
          <button v-else class="chat-send-btn" @click="sendMessage" :disabled="!canSend">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
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
    const topicName = ref(route.query.topicName || '');

    const topicUnavailable = ref(false);
    const topicUnavailableReason = ref('');
    const wasCompleted = ref(false);

    let outputQueue = [];
    let typewriterTimer = null;
    let userScrolledUp = false;

    const canSend = computed(() => inputText.value.trim() && !isStreaming.value && !topicUnavailable.value);

    function renderMd(text) { return renderMarkdown(text); }

    // ---------- 滚动控制 ----------
    function scrollToBottom() {
      nextTick(() => {
        if (messagesEl.value && !userScrolledUp) {
          messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
        }
      });
    }
    function autoScroll() { scrollToBottom(); }
    function handleScroll() {
      if (!messagesEl.value) return;
      const el = messagesEl.value;
      userScrolledUp = el.scrollTop + el.clientHeight < el.scrollHeight - 60;
    }

    // ---------- 伪逐字输出 ----------
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
      if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
      if (outputQueue.length) {
        aiMsg.content += outputQueue.join('');
        outputQueue = [];
      }
    }

    // ---------- 发送消息 ----------
    function sendMessage() {
      const text = inputText.value.trim();
      if (!text || isStreaming.value || topicUnavailable.value) return;
      inputText.value = '';
      messages.value.push({ role: 'user', content: text });
      scrollToBottom();
      doStream(text, false);
      wasCompleted.value = false;
    }

    // ---------- 流式请求 ----------
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
            summary.value = event.summary || '';
            if (event.report_ready) reportReady.value = true;
            else startReportPolling();
            window.dispatchEvent(new CustomEvent('chat-completed'));
          },
          onError(code, msg) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            if (code === 'TOPIC_UNAVAILABLE') {
              topicUnavailable.value = true;
              topicUnavailableReason.value = msg;
            } else {
              toast.error(msg);
            }
          },
          onQuit() { aiMsg.showQuitConfirm = true; },
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

      // 确保流结束后清理状态
      if (!isCompleted.value) {
        flushTypewriter(aiMsg);
        isStreaming.value = false;
        currentAiMsg.value = null;
      }
    }

    // ---------- 停止生成 ----------
    function stopGeneration() {
      if (abortController.value) abortController.value.abort();
      if (currentAiMsg.value) flushTypewriter(currentAiMsg.value);
      isStreaming.value = false;
      currentAiMsg.value = null;
    }

    // ---------- 报告轮询 ----------
    let pollTimer = null;
    function startReportPolling() {
      reportPolling.value = true;
      pollTimer = setInterval(async () => {
        try {
          const res = await api.sessions.reportStatus(sessionId);
          if (res.ready) {
            reportReady.value = true;
            reportPolling.value = false;
            clearInterval(pollTimer);
          }
        } catch (e) {}
      }, 3000);
    }

    // ---------- 强制结束 ----------
    async function forceEnd() {
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
          onChunk(text) { outputQueue.push(...text.split('')); startTypewriter(aiMsg); },
          onEnd(event) {
            flushTypewriter(aiMsg);
            isStreaming.value = false;
            currentAiMsg.value = null;
            isCompleted.value = true;
            summary.value = event.summary || '';
            if (event.report_ready) reportReady.value = true;
            else startReportPolling();
            window.dispatchEvent(new CustomEvent('chat-completed'));
          },
          onError(code, msg) { flushTypewriter(aiMsg); isStreaming.value = false; currentAiMsg.value = null; toast.error(msg); },
          onQuit() {},
          onReportGenerating() { messages.value.push({ role: 'system', content: '📊 观念报告正在生成中…' }); startReportPolling(); },
          onEmptyStream() { isStreaming.value = false; currentAiMsg.value = null; }
        }, abortController.value.signal);
      } catch (e) {
        isStreaming.value = false;
        currentAiMsg.value = null;
      }
    }

    // ---------- 键盘事件 ----------
    function handleKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    // ---------- 监听导航栏结束按钮 ----------
    function onForceEndEvent() { forceEnd(); }

    // ---------- 初始化 ----------
    onMounted(async () => {
      window.addEventListener('force-end-chat', onForceEndEvent);
      window.dispatchEvent(new CustomEvent('chat-started'));

      // 加载话题名
      if (topicId.value && !route.query.topicName) {
        try { const t = await api.topics.detail(topicId.value); topicName.value = t.title; } catch (e) {}
      }

      // 从历史进入（非首次对话）时，尝试恢复会话状态
      if (!isFirst.value && !route.query.first) {
        try {
          const detail = await api.sessions.detail(sessionId);
          // 检查话题不可用
          if (detail.topic_unavailable) {
            topicUnavailable.value = true;
            topicUnavailableReason.value = detail.topic_unavailable_reason || '';
          }
          if (detail.messages) {
            messages.value = detail.messages.map(m => ({ role: m.role, content: m.content }));
          }

          // 检查是否已完成 — 关键：使用 detail 中的状态
          const completed = detail.is_completed || detail.status === 'completed';
          if (completed) {
            wasCompleted.value = true;  // 标记曾经完成，但不禁用输入
            summary.value = detail.summary || '';
            window.dispatchEvent(new CustomEvent('chat-completed'));
            // 检查报告状态
            try {
              const r = await api.sessions.reportStatus(sessionId);
              reportReady.value = r.ready;
              if (!r.ready) startReportPolling();
            } catch (e) {}
          } else {
            // 未完成的会话：恢复模式信息，允许继续对话
            if (detail.mode) mode.value = detail.mode;
            if (detail.topic_id) topicId.value = detail.topic_id;
          }

          if (detail.topic_title) topicName.value = detail.topic_title;
          if (detail.mode) mode.value = detail.mode;
          scrollToBottom();
          return;
        } catch (e) { /* 新 session */ }
      }

      // Mode 1: AI 先说话
      if (mode.value === 1 && isFirst.value) {
        await doStream('', true);
      }
    });

    onUnmounted(() => {
      window.removeEventListener('force-end-chat', onForceEndEvent);
      if (pollTimer) clearInterval(pollTimer);
      if (typewriterTimer) clearInterval(typewriterTimer);
      if (abortController.value) abortController.value.abort();
    });

    return {
      sessionId, mode, messages, inputText, isStreaming, isCompleted,
      summary, reportReady, reportPolling, currentAiMsg, canSend,
      messagesEl, inputEl, topicName,
      renderMd, sendMessage, handleKeydown, forceEnd, scrollToBottom,
      stopGeneration, handleScroll,
    };
  }
};
