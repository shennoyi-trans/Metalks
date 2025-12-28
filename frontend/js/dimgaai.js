// ==================== 直接使用 MetalksUtils，不重新声明 ====================
if (!window.MetalksUtils) {
    console.error('❌ MetalksUtils not loaded!');
    alert('系统初始化失败，请刷新页面');
}

var utils = window.MetalksUtils;

// ==================== DOM元素 ====================
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
    logoutBtn: document.getElementById('logoutBtn')
};

// ==================== 状态 ====================
let state = {
    traitData: null,
    sessions: [],
    userEmail: '',
    topics: []  // 🆕 存储话题列表
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('点解页面加载中...');
    
    initEventListeners();
    
    try {
        const isLoggedIn = await utils.checkAuth();
        if (!isLoggedIn) {
            window.location.href = '/chat.html';
            return;
        }
        
        // 🆕 先加载话题列表，再加载报告（报告需要用到话题信息）
        await loadTopics();
        
        await Promise.all([
            loadTraitData(),
            loadReports()
        ]);
        
        els.userEmail.textContent = state.userEmail || '已登录用户';
        
    } catch (error) {
        console.error('初始化失败:', error);
        utils.showToast('加载失败: ' + error.message);
    }
});

// ==================== 事件监听 ====================
function initEventListeners() {
    els.backToChatBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    els.userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        utils.showModal(els.userMenuOverlay);
    });
    
    els.userMenuOverlay.addEventListener('click', (e) => {
        if (e.target === els.userMenuOverlay) {
            utils.hideModal(els.userMenuOverlay);
        }
    });
    
    els.upgradeBtn.addEventListener('click', () => {
        utils.showToast('功能尚在开发中~', true);
    });
    
    els.personalizeBtn.addEventListener('click', () => {
        utils.showToast('功能尚在开发中~', true);
    });
    
    els.dimgaaiMenuBtn.addEventListener('click', () => {
        utils.hideModal(els.userMenuOverlay);
        utils.showToast('您已在点解页面');
    });
    
    els.logoutBtn.addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) {
            utils.logout();
        }
    });
    
    els.closeReportDetailBtn.addEventListener('click', () => {
        utils.hideModal(els.reportDetailOverlay);
    });
    
    els.reportDetailOverlay.addEventListener('click', (e) => {
        if (e.target === els.reportDetailOverlay) {
            utils.hideModal(els.reportDetailOverlay);
        }
    });
}

// ==================== 数据加载 ====================

/**
 * 🆕 加载话题列表
 */
async function loadTopics() {
    try {
        const topics = await utils.fetchWithAuth(`${utils.API_BASE_URL}/topics`);
        state.topics = topics;
        console.log('✅ 话题列表加载成功:', topics);
    } catch (error) {
        console.error('❌ 加载话题列表失败:', error);
        // 即使失败也继续，使用降级方案
        state.topics = [];
    }
}

/**
 * 加载特质数据
 */
async function loadTraitData() {
    try {
        const data = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.TRAITS_GLOBAL}`);
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

/**
 * 加载所有观念报告
 */
async function loadReports() {
    try {
        const sessions = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.SESSION_LIST}`);
        
        const sessionsWithReport = sessions.filter(s => s.report_ready);
        
        state.sessions = sessionsWithReport;
        els.reportCount.textContent = `共 ${sessionsWithReport.length} 份`;
        
        renderReports(sessionsWithReport);
        
    } catch (error) {
        console.error('加载报告失败:', error);
        els.reportsGrid.innerHTML = '<div class="loading-placeholder">加载失败</div>';
    }
}

/**
 * 渲染报告列表
 */
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
    
    sessions.forEach(session => {
        const card = createReportCard(session);
        els.reportsGrid.appendChild(card);
    });
}

/**
 * 创建报告卡片
 */
function createReportCard(session) {
    const div = document.createElement('div');
    div.className = 'report-item';
    
    const topicName = getTopicName(session.mode, session.topic_id);
    const dateStr = utils.formatDate(session.created_at);
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

/**
 * 🔧 获取话题名称（从实际话题列表中查找）
 */
function getTopicName(mode, topicId) {
    // mode 2 是随便聊聊模式
    if (mode === 2) {
        return '心流漫游';
    }
    
    // 🆕 从加载的话题列表中查找
    const topic = state.topics.find(t => t.id === topicId);
    
    if (topic) {
        return topic.topic;  // 返回话题名称（如：友谊、爱情）
    }
    
    // 降级方案：如果没找到（话题列表加载失败或话题已被删除）
    console.warn(`⚠️ 未找到 topic_id=${topicId} 的话题信息`);
    return `话题${topicId}`;
}

/**
 * 查看报告详情
 */
async function viewReport(sessionId, topicName) {
    try {
        const res = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.REPORT_GET}/${sessionId}/report`);
        
        if (res.ready && res.report) {
            els.reportDetailTitle.textContent = `观念分析报告：${topicName}`;
            els.reportDetailContent.innerHTML = `<div style="white-space: pre-wrap;">${res.report}</div>`;
            utils.showModal(els.reportDetailOverlay);
        } else {
            utils.showToast('报告正在生成中，请稍后再试');
        }
    } catch (error) {
        console.error('加载报告失败:', error);
        utils.showToast('加载报告失败: ' + error.message);
    }
}