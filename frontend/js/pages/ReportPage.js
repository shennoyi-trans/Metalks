/**
 * ReportPage — 观念报告
 */

import api from '../api/index.js';
import { renderMarkdown } from '../utils/markdown.js';

const { ref, onMounted, onUnmounted } = Vue;
const { useRoute } = VueRouter;

export const ReportPage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <!-- 面包屑导航 -->
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
          <span style="cursor:pointer" @click="$router.push('/sessions')">我的对话</span> &gt;
          <span v-if="topicTitle" style="cursor:pointer" @click="$router.push('/chat/'+sid)">{{ topicTitle }}</span>
          <span v-else style="cursor:pointer" @click="$router.push('/chat/'+sid)">本次对话</span>
          &gt; <span>观念报告</span>
        </div>

        <!-- ← 新增：话题名称和对话时间 -->
        <div v-if="topicTitle || sessionTime" style="margin-bottom:20px">
          <h2 v-if="topicTitle" style="font-size:20px;font-weight:700;margin-bottom:4px">{{ topicTitle }}</h2>
          <p v-if="sessionTime" style="font-size:13px;color:var(--text-muted)">对话时间：{{ sessionTime }}</p>
        </div>

        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <div v-else-if="!ready" class="empty-state">
          <div class="page-spinner" style="margin:0 auto 16px"></div>
          <p>你的观念报告正在生成中，通常需要几十秒…</p>
        </div>
        <div v-else>
          <div class="report-body markdown-body" v-html="renderMd(reportContent)"></div>
          <details style="margin-top:32px">
            <summary style="cursor:pointer;font-weight:600;padding:12px 0;color:var(--purple)">📜 查看完整对话</summary>
            <div style="margin-top:12px">
              <div v-for="(m,i) in dialogMessages" :key="i" :class="['msg-row', m.role]">
                <div class="msg-bubble"><div class="markdown-body" v-html="renderMd(m.content)"></div></div>
              </div>
            </div>
          </details>
          <div style="text-align:center;margin-top:24px">
            <button class="btn btn-secondary" @click="$router.push('/sessions')">返回对话列表</button>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const route = useRoute();
    const sid = route.params.id;

    const loading = ref(true);
    const ready = ref(false);
    const reportContent = ref('');
    const dialogMessages = ref([]);
    const topicTitle = ref('');    // ← 新增
    const sessionTime = ref('');   // ← 新增
    let pollTimer = null;

    function renderMd(text) { return renderMarkdown(text); }

    // ← 新增：格式化时间
    function formatTime(t) {
      if (!t) return '';
      return new Date(t).toLocaleString('zh-CN');
    }

    async function loadReport() {
      try {
        const res = await api.sessions.report(sid);
        if (res.ready) {
          ready.value = true;
          reportContent.value = res.report;
          loading.value = false;
          // 加载会话详情（对话内容 + 话题名称 + 时间）
          try {
            const d = await api.sessions.detail(sid);
            dialogMessages.value = d.messages || [];
            topicTitle.value = d.topic_title || (d.mode === 2 ? '随便聊聊' : '');  // ← 新增
            sessionTime.value = formatTime(d.created_at);  // ← 新增
          } catch (e) {}
        } else {
          loading.value = false;
          // ← 新增：即使报告未就绪，也先加载会话信息以显示标题和时间
          try {
            const d = await api.sessions.detail(sid);
            topicTitle.value = d.topic_title || (d.mode === 2 ? '随便聊聊' : '');
            sessionTime.value = formatTime(d.created_at);
            dialogMessages.value = d.messages || [];
          } catch (e) {}
          pollTimer = setInterval(async () => {
            try {
              const s = await api.sessions.reportStatus(sid);
              if (s.ready) {
                clearInterval(pollTimer);
                const r = await api.sessions.report(sid);
                reportContent.value = r.report;
                ready.value = true;
              }
            } catch (e) {}
          }, 3000);
        }
      } catch (e) { loading.value = false; }
    }

    onMounted(loadReport);
    onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });

    return { sid, loading, ready, reportContent, dialogMessages, topicTitle, sessionTime, renderMd };
  }
};
