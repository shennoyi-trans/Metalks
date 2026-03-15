/**
 * ElectrolyteDetailPage — 电解液明细页
 * 路由：/electrolyte
 * 入口：点击导航栏的电解液数字
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';

const { ref, onMounted } = Vue;

const REASON_LABELS = {
  checkin: '每日签到',
  topic_donation_out: '投喂话题',
  topic_donation_in: '收到投喂',
  self_donation_out: '自我投喂（支出）',
  self_donation_in: '自我投喂（收入）',
  admin_gift: '管理员充值',
  change_nickname: '修改昵称',
};

function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

export const ElectrolyteDetailPage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">

        <!-- 余额卡片 -->
        <div class="elec-balance-card">
          <div class="elec-balance-label">当前余额</div>
          <div class="elec-balance-number">⚡ {{ user.electrolyteBalance }}</div>
        </div>

        <!-- 分类统计 -->
        <div v-if="summary" class="elec-breakdown">
          <div v-for="(val, key) in summary.breakdown" :key="key" class="elec-breakdown-item">
            <span class="elec-breakdown-label">{{ reasonLabel(key) }}</span>
            <span :class="['elec-breakdown-value', val >= 0 ? 'income' : 'expense']">
              {{ val >= 0 ? '+' : '' }}{{ val.toFixed(1) }}
            </span>
          </div>
        </div>

        <!-- 按话题统计 -->
        <div v-if="summary && summary.by_topic && summary.by_topic.length" style="margin-top:20px">
          <h3 style="font-size:15px;font-weight:600;margin-bottom:12px">话题收支</h3>
          <div v-for="t in summary.by_topic" :key="t.topic_id" class="elec-topic-row">
            <span class="elec-topic-title">{{ t.topic_title || ('话题#' + t.topic_id) }}</span>
            <span class="income">+{{ t.received.toFixed(1) }}</span>
            <span class="expense">{{ t.donated.toFixed(1) }}</span>
          </div>
        </div>

        <!-- 时间线明细 -->
        <h3 style="font-size:15px;font-weight:600;margin:24px 0 12px">明细记录</h3>
        <div v-if="loading" class="page-loading"><div class="page-spinner"></div></div>
        <div v-else-if="logs.length" class="elec-timeline">
          <div v-for="log in logs" :key="log.id" class="elec-log-item">
            <div class="elec-log-left">
              <span class="elec-log-date">{{ formatDate(log.created_at) }}</span>
              <span class="elec-log-reason">{{ reasonLabel(log.reason) }}</span>
              <span v-if="log.ref_name" class="elec-log-ref">「{{ log.ref_name }}」</span>
            </div>
            <span :class="['elec-log-amount', log.amount >= 0 ? 'income' : 'expense']">
              {{ log.amount >= 0 ? '+' : '' }}{{ log.amount.toFixed(1) }}
            </span>
          </div>
          <div v-if="hasMore" style="text-align:center;padding:16px">
            <button class="btn btn-secondary btn-sm" @click="loadMore" :disabled="loadingMore">
              {{ loadingMore ? '加载中...' : '加载更多' }}
            </button>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">📊</div>
          <p>暂无记录</p>
        </div>
      </div>
    </div>
  `,

  setup() {
    const toast = useToast();
    const user = useUser();

    const loading = ref(true);
    const loadingMore = ref(false);
    const logs = ref([]);
    const summary = ref(null);
    const skip = ref(0);
    const limit = 20;
    const hasMore = ref(false);

    function formatDate(t) {
      if (!t) return '';
      const d = new Date(t);
      return (d.getMonth() + 1).toString().padStart(2, '0') + '-' +
             d.getDate().toString().padStart(2, '0') + ' ' +
             d.getHours().toString().padStart(2, '0') + ':' +
             d.getMinutes().toString().padStart(2, '0');
    }

    async function loadLogs() {
      try {
        const res = await api.user.electrolyteDetail(skip.value, limit);
        logs.value.push(...(res.logs || []));
        hasMore.value = (res.logs || []).length >= limit;
      } catch (e) {
        toast.error('加载失败');
      }
    }

    async function loadMore() {
      loadingMore.value = true;
      skip.value += limit;
      await loadLogs();
      loadingMore.value = false;
    }

    onMounted(async () => {
      try {
        const [, summaryRes] = await Promise.all([
          loadLogs(),
          api.user.electrolyteSummary(),
        ]);
        summary.value = summaryRes;
      } catch (e) {}
      loading.value = false;
    });

    return {
      user, loading, loadingMore, logs, summary, hasMore,
      formatDate, reasonLabel, loadMore,
    };
  }
};
