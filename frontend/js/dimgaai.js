// 解构工具函数
const {
    API_BASE_URL,
    API_ENDPOINTS,
    fetchWithAuth,
    formatDate,
    showModal,
    hideModal,
    showToast,
    logout
} = window.MetalksUtils;

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
    userEmail: ''
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('点解页面加载中...');
    
    initEventListeners();
    
    try {
        // 检查登录状态
        const isLoggedIn = await window.MetalksUtils.checkAuth();
        if (!isLoggedIn) {
            window.location.href = '/chat.html';
            return;
        }
        
        // 加载数据
        await Promise.all([
            loadTraitData(),
            loadReports()
        ]);
        
        // 设置用户邮箱（从cookie或其他方式获取）
        // 这里简化处理，实际应该从后端获取
        els.userEmail.textContent = state.userEmail || '已登录用户';
        
    } catch (error) {
        console.error('初始化失败:', error);
        showToast('加载失败: ' + error.message);
    }
});

// ==================== 事件监听 ====================
function initEventListeners() {
    // 返回聊天
    els.backToChatBtn.addEventListener('click', () => {
        window.location.href = '/chat.html';
    });
    
    // 用户菜单
    els.userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showModal(els.userMenuOverlay);
    });
    
    // 点击外部关闭用户菜单
    els.userMenuOverlay.addEventListener('click', (e) => {
        if (e.target === els.userMenuOverlay) {
            hideModal(els.userMenuOverlay);
        }
    });
    
    // 未开发功能提示
    els.upgradeBtn.addEventListener('click', () => {
        showToast('功能尚在开发中~', true);
    });
    
    els.personalizeBtn.addEventListener('click', () => {
        showToast('功能尚在开发中~', true);
    });
    
    // 点解按钮（当前已在点解页面）
    els.dimgaaiMenuBtn.addEventListener('click', () => {
        hideModal(els.userMenuOverlay);
        showToast('您已在点解页面');
    });
    
    // 登出
    els.logoutBtn.addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) {
            logout();
        }
    });
    
    // 关闭报告详情
    els.closeReportDetailBtn.addEventListener('click', () => {
        hideModal(els.reportDetailOverlay);
    });
    
    // 点击外部关闭报告详情
    els.reportDetailOverlay.addEventListener('click', (e) => {
        if (e.target === els.reportDetailOverlay) {
            hideModal(els.reportDetailOverlay);
        }
    });
}

// ==================== 数据加载 ====================

/**
 * 加载特质数据
 */
async function loadTraitData() {
    try {
        const data = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.TRAITS_GLOBAL}`);
        state.traitData = data;
        
        // 渲染特质卡片
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
        const sessions = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.SESSION_LIST}`);
        
        // 只保留有报告的会话
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
    
    // 获取话题名称
    const topicName = getTopicName(session.mode, session.topic_id);
    
    // 格式化日期
    const dateStr = formatDate(session.created_at);
    
    // 预览文本（使用last_message作为预览）
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
 * 获取话题名称
 */
function getTopicName(mode, topicId) {
    if (mode === 2) {
        return '心流漫游';
    }
    
    // 这里应该从话题列表中查找，简化处理
    const topicMap = {
        1: '友谊',
        2: '爱情',
        3: '工作',
        4: '消费'
    };
    
    return topicMap[topicId] || `话题${topicId}`;
}

/**
 * 查看报告详情
 */
async function viewReport(sessionId, topicName) {
    try {
        const res = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.REPORT_GET}/${sessionId}/report`);
        
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
