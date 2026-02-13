// 确保 utils.js 已加载
if (!window.MetalksUtils) {
    console.error('❌ MetalksUtils not loaded!');
    alert('系统初始化失败，请刷新页面');
}

// 使用简短的别名引用（不使用const声明）
var utils = window.MetalksUtils;

// ==================== 更新公告配置 ====================
const UPDATE_CONFIG = {
    version: "v1.3.0_20260203",
    date: "2026/2/3 更新",
    content: `
        <ul style="list-style: none; padding: 0;">
            <li style="margin-bottom: 10px;">
                <strong style="color: var(--accent-primary);">🔐 全新登录与注册流程</strong><br>
                邮箱注册 + 密码登录，进入更加顺畅
            </li>
            <li style="margin-bottom: 10px;">
                <strong style="color: var(--accent-secondary);">📱 手机号注册</strong><br>
                新增手机号 + 验证码注册入口，多一种选择
            </li>
            <li style="margin-bottom: 10px;">
                <strong style="color: var(--accent-glow);">💾 记住我</strong><br>
                勾选后下次自动填充邮箱，省得每次都手动输入
            </li>
            <li>
                <strong style="color: var(--accent-primary);">🛡️ 密码输入优化</strong><br>
                新增密码显示/隐藏切换，告别盲输
            </li>
        </ul>
    `
};

// ==================== DOM元素 ====================
const els = {
    // 模态框
    topicOverlay: document.getElementById('topicOverlay'),
    reportOverlay: document.getElementById('reportOverlay'),
    traitsDetailOverlay: document.getElementById('traitsDetailOverlay'),
    confirmOverlay: document.getElementById('confirmOverlay'),
    updateOverlay: document.getElementById('updateOverlay'),
    deleteConfirmOverlay: document.getElementById('deleteConfirmOverlay'),
    userMenuOverlay: document.getElementById('userMenuOverlay'),
    
    // 侧边栏
    historyDrawer: document.getElementById('historyDrawer'),
    historyToggleBtn: document.getElementById('historyToggleBtn'),
    closeHistoryBtn: document.getElementById('closeHistoryBtn'),
    sessionList: document.getElementById('sessionList'),
    newChatBtn: document.getElementById('newChatBtn'),
    authBtn: document.getElementById('authBtn'),
    
    // 聊天主区域
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendButton: document.getElementById('sendButton'),
    chatTitle: document.getElementById('chatTitle'),
    headerTag: document.getElementById('currentTopicTag'),
    welcomePlaceholder: document.getElementById('welcomePlaceholder'),
    
    // HUD右侧栏
    statusContent: document.getElementById('statusContent'),
    traitsContent: document.getElementById('traitsContent'),
    traitsDetailLink: document.getElementById('traitsDetailLink'),
    topicSelectorMini: document.getElementById('topicSelectorMini'),
    currentTopic: document.getElementById('currentTopic'),
    
    // 模态框内容
    topicsGrid: document.getElementById('topicsGrid'),
    refreshTopicsBtn: document.getElementById('refreshTopicsButton'),
    refreshTopicsBtnHeader: document.getElementById('refreshTopicsButton_Header'),
    casualChatBtn: document.getElementById('casualChatButton'),
    reportTitle: document.getElementById('reportTitle'),
    reportContent: document.getElementById('reportContent'),
    traitsDetailContent: document.getElementById('traitsDetailContent'),
    
    // Confirm
    confirmYes: document.getElementById('confirmYes'),
    confirmNo: document.getElementById('confirmNo'),
    confirmMessage: document.getElementById('confirmMessage'),
    
    // Delete Confirm
    deleteConfirmYes: document.getElementById('deleteConfirmYes'),
    deleteConfirmNo: document.getElementById('deleteConfirmNo'),
    dimgaaiLink: document.getElementById('dimgaaiLink'),
    
    // User Menu
    userEmail: document.getElementById('userEmail'),
    upgradeBtn: document.getElementById('upgradeBtn'),
    personalizeBtn: document.getElementById('personalizeBtn'),
    dimgaaiMenuBtn: document.getElementById('dimgaaiMenuBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Update
    updateContentBody: document.getElementById('updateContentBody'),
    updateVersionDate: document.getElementById('updateVersionDate'),
    closeUpdateBtn: document.getElementById('closeUpdateBtn'),
    acknowledgeUpdateBtn: document.getElementById('acknowledgeUpdateBtn')
};

// ==================== 状态变量 ====================
let state = {
    isLoggedIn: false,
    currentMode: null,
    currentTopicId: null,
    currentTopicName: null,
    currentTopicTag: null,
    currentSessionId: null,
    conversationHistory: [],
    hasUnsavedChanges: false,
    pendingTopicChange: null,
    pendingDeleteSessionId: null,
    pendingDeleteIndex: null,
    isFirstMessage: false,
    streamController: null,
    fullTraitReport: "",
    reportCheckInterval: null,
    allSessions: [],
    userEmail: '',
    keepDrawerOpen: false
};

let availableTopics = [];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Metalks Chat initialized');
    initEventListeners();
    await checkLoginStatus();
    if (state.isLoggedIn) {
        checkUpdatePopup();
    }   
});

function initEventListeners() {
    // 侧边栏交互
    els.historyToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.historyDrawer.classList.toggle('open');
        state.keepDrawerOpen = els.historyDrawer.classList.contains('open');
    });

    els.closeHistoryBtn.addEventListener('click', () => {
        els.historyDrawer.classList.remove('open');
        state.keepDrawerOpen = false;
    });

    document.addEventListener('click', (e) => {
        if (!state.keepDrawerOpen) return;
        
        const isDrawer = els.historyDrawer.contains(e.target);
        const isToggleBtn = els.historyToggleBtn.contains(e.target);
        const isDeleteBtn = e.target.closest('.delete-btn');
        const isDeleteConfirm = els.deleteConfirmOverlay.contains(e.target);
        
        if (!isDrawer && !isToggleBtn && !isDeleteBtn && !isDeleteConfirm) {
            els.historyDrawer.classList.remove('open');
            state.keepDrawerOpen = false;
        }
    });
    
    // 话题刷新与选择
    [els.refreshTopicsBtn, els.refreshTopicsBtnHeader].forEach(btn => {
        btn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if(btn === els.refreshTopicsBtnHeader) utils.showModal(els.topicOverlay);
            loadRecommendedTopics();
        });
    });

    els.topicSelectorMini.addEventListener('click', () => utils.showModal(els.topicOverlay));
    els.newChatBtn.addEventListener('click', () => utils.showModal(els.topicOverlay));
    els.casualChatBtn.addEventListener('click', () => handleTopicChange(null, null, null, true));

    // 聊天交互
    els.sendButton.addEventListener('click', () => sendMessage());
    els.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    els.chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // 模态框关闭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                utils.hideModal(overlay);
            }
        });
    });
    
    document.getElementById('closeReportButton')?.addEventListener('click', () => utils.hideModal(els.reportOverlay));
    document.getElementById('closeTraitsDetailButton')?.addEventListener('click', () => utils.hideModal(els.traitsDetailOverlay));

    // Auth - 跳转到 auth.html
    els.authBtn.addEventListener('click', () => {
        window.location.href = 'auth';
    });

    // Confirm
    els.confirmYes.addEventListener('click', () => {
        utils.hideModal(els.confirmOverlay);
        if (state.pendingTopicChange) {
            const { id, name, tag, casual } = state.pendingTopicChange;
            executeTopicChange(id, name, tag, casual);
            state.pendingTopicChange = null;
        }
    });
    els.confirmNo.addEventListener('click', () => {
        utils.hideModal(els.confirmOverlay);
        state.pendingTopicChange = null;
    });
    
    // Delete Confirm
    els.deleteConfirmNo?.addEventListener('click', () => {
        utils.hideModal(els.deleteConfirmOverlay);
        state.pendingDeleteSessionId = null;
        state.pendingDeleteIndex = null;
        state.keepDrawerOpen = true;
    });
    
    els.deleteConfirmYes?.addEventListener('click', () => {
        utils.hideModal(els.deleteConfirmOverlay);
        if (state.pendingDeleteSessionId) {
            executeDeleteSession(state.pendingDeleteSessionId);
            state.pendingDeleteSessionId = null;
            state.pendingDeleteIndex = null;
        }
        state.keepDrawerOpen = true;
    });
    
    // 点解链接
    els.dimgaaiLink?.addEventListener('click', () => {
        window.location.href = '/dimgaai';
    });
    
    // User Menu
    els.upgradeBtn?.addEventListener('click', () => {
        utils.showToast('功能尚在开发中~', true);
    });
    
    els.personalizeBtn?.addEventListener('click', () => {
        utils.showToast('功能尚在开发中~', true);
    });
    
    els.dimgaaiMenuBtn?.addEventListener('click', () => {
        window.location.href = '/dimgaai';
    });
    
    els.logoutBtn?.addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) {
            handleLogout();
        }
    });
    
    els.userMenuOverlay?.addEventListener('click', (e) => {
        if (e.target === els.userMenuOverlay) {
            utils.hideModal(els.userMenuOverlay);
        }
    });
    
    els.traitsDetailLink?.addEventListener('click', () => {
        window.location.href = '/dimgaai';
    });

    // Update
    els.closeUpdateBtn?.addEventListener('click', () => handleUpdateClose());
    els.acknowledgeUpdateBtn?.addEventListener('click', () => handleUpdateClose());
}

// ==================== 核心逻辑 ====================
async function checkLoginStatus() {
    try {
        await loadGlobalTraits();
        state.isLoggedIn = true;
        updateAuthUI();
        loadSessions();
        loadRecommendedTopics();
        utils.showModal(els.topicOverlay);
    } catch (error) {
        if (error.status === 401) {
            state.isLoggedIn = false;
            // 用户需要手动点击登录按钮跳转到 auth.html
        }
    }
}

async function handleLogout() {
    try {
        // 调用API登出
        await fetch(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.AUTH_LOGOUT}`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.warn('Logout API call failed:', error);
    }
    
    // 清除本地状态
    state.isLoggedIn = false;
    state.userEmail = '';
    
    // 重置UI
    els.authBtn.innerHTML = '<i class="ri-user-3-line"></i>';
    els.authBtn.style.background = 'transparent';
    
    // 清除聊天数据
    els.chatMessages.innerHTML = '';
    els.welcomePlaceholder.style.display = 'block';
    state.currentSessionId = null;
    state.conversationHistory = [];
    state.hasUnsavedChanges = false;
    
    // 重新加载页面
    window.location.href = '/auth?logout=true';
}

function handleTopicChange(topicId, topicName, topicTag, isCasual = false) {
    if (state.hasUnsavedChanges && state.conversationHistory.length > 0) {
        state.pendingTopicChange = { id: topicId, name: topicName, tag: topicTag, casual: isCasual };
        utils.showModal(els.confirmOverlay);
    } else {
        executeTopicChange(topicId, topicName, topicTag, isCasual);
    }
}

async function executeTopicChange(topicId, topicName, topicTag, isCasual = false) {
    stopReportPolling();
    
    state.currentSessionId = utils.generateUUID();
    state.currentMode = isCasual ? 'casual' : 'topic';
    state.currentTopicId = topicId;
    state.currentTopicName = topicName;
    state.currentTopicTag = topicTag;
    state.isFirstMessage = true;
    state.conversationHistory = [];
    state.hasUnsavedChanges = false;

    const casualTitle = "随心对话";
    const casualTag = "心流漫游";
    const casualStatus = "思维通道已打开<br>准备进入潜意识之海...";

    els.currentTopic.textContent = isCasual ? '随便聊聊' : topicName;
    els.headerTag.textContent = isCasual ? casualTag : topicTag;
    els.chatTitle.textContent = isCasual ? casualTitle : `正在探索：${topicTag}`;
    els.statusContent.innerHTML = isCasual ? casualStatus : `正在连接深层意识...<br>测试对象：${topicTag}`;
    
    els.chatMessages.innerHTML = '';
    els.welcomePlaceholder.style.display = 'none';
    utils.hideModal(els.topicOverlay);
    els.chatInput.value = '';
    
    startReportPolling(state.currentSessionId);
    
    if (!isCasual) {
        showThinking();
        try {
            await sendMessageToAPI("", true);
            state.isFirstMessage = false;
        } catch (error) {
            console.error("Auto-start failed:", error);
            hideThinking();
            addMessage('ai', '系统连接超时，请尝试刷新或重新选择话题。');
        }
    } else {
        els.welcomePlaceholder.style.display = 'block';
        els.welcomePlaceholder.innerHTML = `<h2>准备好了</h2><p>告诉我你现在在想什么...</p>`;
        els.chatInput.focus();
    }
    
    // 更新历史记录列表
    loadSessions();
}

async function sendMessage() {
    const text = els.chatInput.value.trim();
    if (!text) return;

    addMessage('user', text);
    els.chatInput.value = '';
    els.chatInput.style.height = 'auto';
    els.welcomePlaceholder.style.display = 'none';
    els.sendButton.disabled = true;
    showThinking();
    state.hasUnsavedChanges = true;

    try {
        await sendMessageToAPI(text, state.isFirstMessage);
        state.isFirstMessage = false;
    } catch (error) {
        console.error(error);
        addMessage('ai', '连接中断，请稍后重试。');
        hideThinking();
        els.sendButton.disabled = false;
    }
}

async function sendMessageToAPI(message, isFirst = false) {
    if (state.streamController) state.streamController.abort();
    state.streamController = new AbortController();

    if (!state.currentSessionId) {
        state.currentSessionId = utils.generateUUID();
    }

    const payload = {
        mode: state.currentMode === 'topic' ? 1 : 2,
        session_id: state.currentSessionId,
        message: message,
        topic_id: state.currentMode === 'topic' ? parseInt(state.currentTopicId) : undefined,
        is_first: isFirst
    };

    let response;
    try {
        response = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.CHAT_STREAM}`, {
            method: 'POST',
            body: JSON.stringify(payload),
            signal: state.streamController.signal
        });
    } catch (e) {
        throw new Error(`请求失败: ${e.message}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let aiMsgDiv = null;
    let aiContent = "";
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine.startsWith('data: ')) continue;
                
                const jsonStr = trimmedLine.slice(6);
                if (jsonStr === '[DONE]') break;
                
                try {
                    const event = JSON.parse(jsonStr);
                    
                    if (event.type === 'user_want_quit') {
                        handleUserWantQuit();
                        continue;
                    }

                    if (event.type === 'end') {
                        handleEndEvent(event);
                        continue;
                    }

                    if (event.content) {
                        if (!aiMsgDiv) {
                            hideThinking();
                            aiMsgDiv = addMessage('ai', '');
                        }
                        aiContent += event.content;
                        aiMsgDiv.textContent = aiContent;
                        scrollToBottom();
                    }
                } catch (e) {
                    console.warn('JSON Parse error:', e);
                }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error("Stream Error:", error);
        throw error;
    } finally {
        if (aiContent) {
            state.conversationHistory.push({ role: 'assistant', content: aiContent });
        }
        els.sendButton.disabled = false;
        hideThinking();
        loadSessions();
    }
}

function handleUserWantQuit() {
    hideThinking();
    
    const quitPrompt = document.createElement('div');
    quitPrompt.className = 'quit-prompt';
    quitPrompt.innerHTML = `
        <p style="text-align: center; color: var(--text-secondary); margin: 1rem 0;">
            看起来您想结束这次对话了
        </p>
        <button id="quitSessionBtn" class="btn-primary" style="display: block; margin: 0 auto;">
            <i class="ri-logout-box-line"></i> 点此结束对话
        </button>
    `;
    els.chatMessages.appendChild(quitPrompt);
    scrollToBottom();
    
    document.getElementById('quitSessionBtn').addEventListener('click', async () => {
        await completeSession();
        utils.showModal(els.topicOverlay);
        loadRecommendedTopics();
    });
}

async function completeSession() {
    try {
        stopReportPolling();
        
        await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.SESSION_COMPLETE}/${state.currentSessionId}/complete`, {
            method: 'POST'
        });
        
        state.currentSessionId = null;
        state.conversationHistory = [];
        state.hasUnsavedChanges = false;
        els.chatMessages.innerHTML = '';
        els.welcomePlaceholder.style.display = 'block';
        
        loadSessions();
    } catch (e) {
        console.error("Complete session failed", e);
    }
}

function handleEndEvent(event) {
    if (event.trait_summary) {
        updateTraitsDisplay(event.trait_summary);
    }
    state.hasUnsavedChanges = false;
}

function startReportPolling(sessionId) {
    stopReportPolling();
    
    state.reportCheckInterval = setInterval(async () => {
        try {
            const res = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.REPORT_STATUS}/${sessionId}/report_status`);
            
            if (res.ready) {
                stopReportPolling();
                showReportReadyNotification(sessionId);
            }
        } catch (e) {
            if (e.message.includes('404') || e.message.includes('Not Found')) {
                console.warn('Session not found, stopping report polling');
                stopReportPolling();
            }
        }
    }, 3000);
}

function stopReportPolling() {
    if (state.reportCheckInterval) {
        clearInterval(state.reportCheckInterval);
        state.reportCheckInterval = null;
    }
}

function showReportReadyNotification(sessionId) {
    els.statusContent.innerHTML = `
        <div style="color: var(--accent-glow);">
            ✨ 观念分析已完成！
        </div>
        <button id="viewReportBtn" class="btn-primary" style="margin-top: 0.5rem; width: 100%; font-size: 0.9rem;">
            查看报告
        </button>
    `;
    
    document.getElementById('viewReportBtn').addEventListener('click', () => {
        viewReport(sessionId);
    });
}

async function viewReport(sessionId) {
    try {
        const res = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.REPORT_GET}/${sessionId}/report`);
        
        if (res.ready && res.report) {
            showReport(res.report, state.currentTopicTag || '观念分析');
        } else {
            utils.showToast('报告正在生成中，请稍后再试');
        }
    } catch (e) {
        console.error('Load report failed', e);
        utils.showToast('加载报告失败: ' + e.message);
    }
}

// ==================== 数据加载 ====================
async function loadSessions() {
    try {
        const sessions = await utils.fetchWithAuth(`${utils.API_BASE_URL}/sessions`);
        renderSessionList(sessions);
    } catch (e) {
        console.error("Load sessions failed", e);
    }
}

function renderSessionList(sessions) {
    state.allSessions = sessions;
    
    els.sessionList.innerHTML = '';
    if (!sessions || sessions.length === 0) {
        els.sessionList.innerHTML = '<div style="text-align:center; opacity:0.5; padding:1rem;">暂无记录</div>';
        return;
    }

    sessions.forEach((s, index) => {
        const li = document.createElement('li');
        li.className = 'session-item';
        if (s.id === state.currentSessionId) {
            li.classList.add('active');
        }
        li.dataset.id = s.id;
        li.dataset.index = index;

        const dateStr = utils.formatDate(s.created_at);
        let title = s.last_message || "无对话内容";
        if (title.length > 15) title = title.substring(0, 15) + "...";
        
        const topicObj = availableTopics.find(t => t.id === s.topic_id);
        const topicLabel = s.mode === 1 ? (getTopicName(topicObj) || `话题${s.topic_id}`) : "漫游";

        let tagsHtml = '';
        if (s.status === 'completed') tagsHtml += `<span class="tag">已完成</span>`;
        else tagsHtml += `<span class="tag tag-progress">进行中</span>`;
        
        if (s.report_ready) {
            tagsHtml += `<span class="tag" style="background: rgba(244, 114, 182, 0.2); color: #f472b6;">有报告</span>`;
        }

        li.innerHTML = `
            <div class="session-title">[${topicLabel}] ${title}</div>
            <div class="session-meta">
                <span>${dateStr}</span>
                <div class="session-tags">${tagsHtml}</div>
            </div>
            <button class="delete-btn" title="删除记录">
                <i class="ri-delete-bin-line"></i>
            </button>
        `;
        
        li.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn')) {
                return;
            }
            loadSessionDetail(s.id);
        });
        
        const delBtn = li.querySelector('.delete-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteSession(s.id, index);
        });
        
        els.sessionList.appendChild(li);
    });
}

async function loadSessionDetail(sessionId) {
    try {
        stopReportPolling();
        
        const session = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.SESSION_DETAIL}/${sessionId}`);
        
        state.currentSessionId = session.id;
        state.currentMode = session.mode === 1 ? 'topic' : 'casual';
        state.currentTopicId = session.topic_id;
        
        const topicObj = availableTopics.find(t => t.id === session.topic_id);
        state.currentTopicName = getTopicName(topicObj) || "历史话题";
        state.currentTopicTag = getTopicTag(topicObj);

        els.currentTopic.textContent = state.currentTopicName;
        els.headerTag.textContent = state.currentMode === 'topic' ? (state.currentTopicTag || state.currentTopicName) : '心流漫游';
        els.chatTitle.textContent = state.currentMode === 'topic' ? `回顾：${state.currentTopicTag || state.currentTopicName}` : '回顾：随心对话';
        
        els.chatMessages.innerHTML = '';
        els.welcomePlaceholder.style.display = 'none';
        
        session.messages.forEach(msg => {
            addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
        });
        
        if (session.report_ready) {
            showReportReadyNotification(sessionId);
        } else if (session.status === 'in_progress') {
            startReportPolling(sessionId);
        }
        
        // 重新渲染列表以更新高亮状态
        loadSessions();
        
    } catch (e) {
        console.error("Load detail failed", e);
    }
}

async function loadRecommendedTopics() {
    try {
        const res = await utils.fetchWithAuth(
            `${utils.API_BASE_URL}/topics/recommended?limit=6`
        );
        const topics = res.topics || res;
        topics.forEach(t => {
            if (!availableTopics.find(at => at.id === t.id)) availableTopics.push(t);
        });
        renderTopicsGrid(topics);
    } catch (e) { console.error(e); }
}

function renderTopicsGrid(topics) {
    els.topicsGrid.innerHTML = '';
    topics.forEach(topic => {
        const div = document.createElement('div');
        div.className = 'topic-card';
        div.innerHTML = `
            <div class="topic-name">${getTopicName(topic)}</div>
            <div class="topic-tag">${getTopicTag(topic)}</div>
        `;
        div.addEventListener('click', () => handleTopicChange(topic.id, getTopicName(topic), getTopicTag(topic)));
        els.topicsGrid.appendChild(div);
    });
}

async function loadGlobalTraits() {
    const data = await utils.fetchWithAuth(`${utils.API_BASE_URL}${utils.API_ENDPOINTS.TRAITS_GLOBAL}`);
    updateTraitsDisplay(data.summary);
    state.fullTraitReport = data.full_report;
}

// ==================== UI Helpers ====================
function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message message-${role}`;
    div.textContent = text;
    els.chatMessages.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function showThinking() {
    if(document.getElementById('thinkingAnim')) return;
    const div = document.createElement('div');
    div.className = 'thinking-animation';
    div.id = 'thinkingAnim';
    div.innerHTML = `<span style="font-size:0.8rem; color:rgba(255,255,255,0.5)">思考中</span><div class="thinking-dots"><div></div><div></div></div>`;
    els.statusContent.appendChild(div);
}

function hideThinking() {
    const el = document.getElementById('thinkingAnim');
    if(el) el.remove();
}

function updateTraitsDisplay(summary) {
    els.traitsContent.textContent = summary || "暂无特质数据";
}

function showReport(content, topic) {
    els.reportTitle.textContent = `分析报告：${topic}`;
    els.reportContent.innerHTML = `<div style="white-space: pre-wrap;">${content}</div>`;
    utils.showModal(els.reportOverlay);
}

function updateAuthUI() {
    if (state.isLoggedIn) {
        els.authBtn.innerHTML = '<i class="ri-user-3-fill" style="font-size: 1.3rem;"></i>';
        els.authBtn.style.background = 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))';
        
        // 尝试从 localStorage 获取用户邮箱
        const savedEmail = localStorage.getItem('metalks_user_email');
        if (savedEmail && els.userEmail) {
            state.userEmail = savedEmail;
            els.userEmail.textContent = savedEmail;
        } else if (els.userEmail) {
            els.userEmail.textContent = '已登录用户';
        }
    } else {
        els.authBtn.innerHTML = '<i class="ri-user-3-line"></i>';
        els.authBtn.style.background = 'transparent';
    }
}

// ==================== Delete Session ====================
function confirmDeleteSession(sessionId, index) {
    state.pendingDeleteSessionId = sessionId;
    state.pendingDeleteIndex = index;
    state.keepDrawerOpen = true;
    utils.showModal(els.deleteConfirmOverlay);
}

async function executeDeleteSession(sessionId) {
    try {
        const currentIndex = state.pendingDeleteIndex;
        const totalSessions = state.allSessions.length;
        let nextSessionId = null;

        if (totalSessions > 1) {
            if (currentIndex < totalSessions - 1) {
                nextSessionId = state.allSessions[currentIndex + 1].id;
            } else if (currentIndex > 0) {
                nextSessionId = state.allSessions[currentIndex - 1].id;
            }
        }

        await utils.fetchWithAuth(`${utils.API_BASE_URL}/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        await loadSessions();
        
        if (nextSessionId) {
            await loadSessionDetail(nextSessionId);
        } else {
            if (state.currentSessionId === sessionId) {
                utils.showModal(els.topicOverlay);
                loadRecommendedTopics();
                state.currentSessionId = null;
                state.conversationHistory = [];
                state.hasUnsavedChanges = false;
                els.chatMessages.innerHTML = '';
                els.welcomePlaceholder.style.display = 'block';
            }
        }

        state.keepDrawerOpen = true;

    } catch (e) {
        console.error("[DELETE] Failed:", e);
        utils.showToast("删除失败: " + e.message);
    }
}

// ==================== Fetch Topics ====================
function getTopicName(topicObj) {
    if (!topicObj) return '未知话题';
    return topicObj.title || '未知话题';
}

function getTopicTag(topicObj) {
    if (!topicObj) return '';
    return Array.isArray(topicObj.tags) ? topicObj.tags.join('、') : '';
}

// ==================== Update Popup ====================
function checkUpdatePopup() {
    const storageKey = 'metalks_last_version';
    const lastSeenVersion = localStorage.getItem(storageKey);
    
    // 只有老用户（有历史版本）且版本不同时才显示更新公告
    if (lastSeenVersion && lastSeenVersion !== UPDATE_CONFIG.version) {
        if (els.updateVersionDate) {
            els.updateVersionDate.textContent = UPDATE_CONFIG.date;
        }
        if (els.updateContentBody) {
            els.updateContentBody.innerHTML = UPDATE_CONFIG.content;
        }
        
        utils.showModal(els.updateOverlay);
    } else if (!lastSeenVersion) {
        // 新用户：静默记录当前版本，不显示公告
        localStorage.setItem(storageKey, UPDATE_CONFIG.version);
    }
}

function handleUpdateClose() {
    const storageKey = 'metalks_last_version';
    localStorage.setItem(storageKey, UPDATE_CONFIG.version);
    utils.hideModal(els.updateOverlay);
}