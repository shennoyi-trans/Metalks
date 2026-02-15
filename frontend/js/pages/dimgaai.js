/**
 * Metalks 点解页面逻辑
 * API 调用全部通过 api/ 模块
 */

import api from '../api/index.js';
import { formatDate, showModal, hideModal, showToast } from '../utils.js';

// ==================== DOM 元素 ====================
const els = {
    // 导航
    backToChatBtn: document.getElementById('backToChatBtn'),
    userMenuBtn: document.getElementById('userMenuBtn'),

    // 特质区域
    traitSummary: document.getElementById('traitSummary'),
    traitDetail: document.getElementById('traitDetail'),

    // 报告区域
    reportCount: document.getElementById('reportCount'),
    reportsGrid: document.getElementById('reportsGrid'),

    // 模态框
    reportDetailOverlay: document.getElementById('reportDetailOverlay'),
    reportDetailTitle: document.getElementById('reportDetailTitle'),
    reportDetailContent: document.getElementById('reportDetailContent'),
    closeReportDetailBtn: document.getElementById('closeReportDetailBtn'),

    // 用户菜单
    userMenuOverlay: document.getElementById('userMenuOverlay'),
    userEmail: document.getElementById('userEmail'),
    upgradeBtn: document.getElementById('upgradeBtn'),
    personalizeBtn: document.getElementById('personalizeBtn'),
    dimgaaiMenuBtn: document.getElementById('dimgaaiMenuBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
};

// ==================== 状态 ====================
let state = {
    traitData: null,
    sessions: [],
    userEmail: '',
    topics: [],
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('点解页面加载中...');

    initEventListeners();

    try {
        const isLoggedIn = await api.auth.checkAuth();
        if (!isLoggedIn) {
            window.location.href = '/chat.html';
            return;
        }

        // 先加载话题列表，再加载报告（报告需要用到话题信息）
        await loadTopics();

        await Promise.all([loadTraitData(), loadReports()]);

        els.userEmail.textContent = state.userEmail || '已登录用户';
    } catch (error) {
        console.error('初始化失败:', error);
        showToast('加载失败: ' + error.message);
    }
});

// ==================== 事件监听 ====================
function initEventListeners() {
    els.backToChatBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    els.userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showModal(els.userMenuOverlay);
    });

    els.userMenuOverlay.addEventListener('click', (e) => {
        if (e.target === els.userMenuOverlay) hideModal(els.userMenuOverlay);
    });

    els.upgradeBtn.addEventListener('click', () => showToast('功能尚在开发中~', true));
    els.personalizeBtn.addEventListener('click', () => showToast('功能尚在开发中~', true));
    els.dimgaaiMenuBtn.addEventListener('click', () => showToast('您已在点解页面'));

    els.logoutBtn.addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) {
            api.auth.logout();
        }
    });

    els.closeReportDetailBtn.addEventListener('click', () => {
        hideModal(els.reportDetailOverlay);
    });

    els.reportDetailOverlay.addEventListener('click', (e) => {
        if (e.target === els.reportDetailOverlay) hideModal(els.reportDetailOverlay);
    });
}

// ==================== 数据加载 ====================
async function loadTopics() {
    try {
        const topics = await api.topics.list();
        state.topics = topics;
        console.log('✅ 话题列表加载成功:', topics);
    } catch (error) {
        console.error('❌ 加载话题列表失败:', error);
        state.topics = [];
    }
}

async function loadTraitData() {
    try {
        const data = await api.traits.getGlobal();
        state.traitData = data;

        els.traitSummary.textContent = data.summary || '暂无特质数据';
        els.traitDetail.innerHTML = data.full_report
            ? `<div style="white-space: pre-wrap;">${data.full_report}</div>`
            : '<div class="loading-placeholder">暂无详细报告</div>';
    } catch (error) {
        console.error('加载特质失败:', error);
        els.traitSummary.textContent = '加载失败';
        els.traitDetail.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

async function loadReports() {
    try {
        const sessions = await api.sessions.list();
        const sessionsWithReport = sessions.filter((s) => s.report_ready);

        state.sessions = sessionsWithReport;
        els.reportCount.textContent = `共 ${sessionsWithReport.length} 份`;

        renderReports(sessionsWithReport);
    } catch (error) {
        console.error('加载报告失败:', error);
        els.reportsGrid.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

// ==================== 渲染 ====================
function renderReports(sessions) {
    if (sessions.length === 0) {
        els.reportsGrid.innerHTML = `
            <div class="loading-placeholder">
                <i class="ri-inbox-line"></i> 暂无观念报告
                <p style="font-size: 0.9rem; margin-top: 0.5rem;">完成对话后即可查看报告</p>
            </div>
        `;
        return;
    }

    els.reportsGrid.innerHTML = '';
    sessions.forEach((session) => {
        const card = createReportCard(session);
        els.reportsGrid.appendChild(card);
    });
}

function createReportCard(session) {
    const div = document.createElement('div');
    div.className = 'report-item';

    const topicName = getTopicName(session.mode, session.topic_id);
    const dateStr = formatDate(session.created_at);
    const preview = session.last_message || '点击查看完整报告';

    div.innerHTML = `
        <div class="report-header">
            <div class="report-topic">${topicName}</div>
            <div class="report-date">${dateStr}</div>
        </div>
        <div class="report-preview">${preview}</div>
        <div class="report-footer">
            <i class="ri-file-text-line"></i>
            <span>查看完整报告</span>
        </div>
    `;

    div.addEventListener('click', () => viewReport(session.id, topicName));
    return div;
}

function getTopicName(mode, topicId) {
    if (mode === 2) return '心流漫游';

    const topic = state.topics.find((t) => t.id === topicId);
    if (topic) return topic.topic;

    console.warn(`⚠️ 未找到 topic_id=${topicId} 的话题信息`);
    return `话题${topicId}`;
}

// ==================== 报告详情 ====================
async function viewReport(sessionId, topicName) {
    try {
        const res = await api.sessions.report(sessionId);

        if (res.ready && res.report) {
            els.reportDetailTitle.textContent = `观念分析报告：${topicName}`;
            els.reportDetailContent.innerHTML = `<div style="white-space: pre-wrap;">${res.report}</div>`;
            showModal(els.reportDetailOverlay);
        } else {
            showToast('报告正在生成中，请稍后再试');
        }
    } catch (error) {
        console.error('加载报告失败:', error);
        showToast('加载报告失败: ' + error.message);
    }
}
