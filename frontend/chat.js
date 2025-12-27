// ==================== 更新公告配置 ====================
const UPDATE_CONFIG = {
    version: "v1.1.0_20251229",
    date: "2025/12/29 更新",
    content: `
        <ul style="list-style: none; padding: 0;">
            <li style="margin-bottom: 10px;">
                <strong style="color: var(--accent-primary);">🎯 核心升级</strong><br>
                报告生成逻辑优化：现在报告会在后台自动生成，不再阻塞对话流程。
            </li>
            <li style="margin-bottom: 10px;">
                <strong style="color: var(--accent-secondary);">💡 交互改进</strong><br>
                当系统捕捉到您的观念时，会主动提示；您也可以随时选择结束对话。
            </li>
            <li>
                <strong style="color: var(--accent-glow);">🐛 问题修复</strong><br>
                修复了会话 ID 生成的 Bug，确保每次对话都有独立记录。
            </li>
        </ul>
    `
};

// ==================== API配置 ====================
const API_BASE_URL = '/api';

const API_ENDPOINTS = {
    CHAT_STREAM: '/chat/stream',
    TOPICS_RANDOM: '/topics/random',
    SESSION_LIST: '/sessions',
    SESSION_DETAIL: '/sessions', // + /{id}
    SESSION_COMPLETE: '/sessions', // + /{id}/complete
    REPORT_STATUS: '/sessions', // + /{id}/report_status
    REPORT_GET: '/sessions', // + /{id}/report
    TRAITS_GLOBAL: '/traits/global',
    AUTH_LOGIN: '/auth/login',
    AUTH_REGISTER: '/auth/register'
};

// ==================== DOM元素 ====================
const els = {
    // 模态框
    topicOverlay: document.getElementById('topicOverlay'),
    reportOverlay: document.getElementById('reportOverlay'),
    traitsDetailOverlay: document.getElementById('traitsDetailOverlay'),
    confirmOverlay: document.getElementById('confirmOverlay'),
    authOverlay: document.getElementById('authOverlay'),
    updateOverlay: document.getElementById('updateOverlay'),
    
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
    
    // Auth
    authTabs: document.querySelectorAll('.auth-tab'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    submitAuthBtn: document.getElementById('submitAuthBtn'),
    authErrorMsg: document.getElementById('authErrorMsg'),
    closeAuthBtn: document.getElementById('closeAuthBtn'),
    
    // Confirm
    confirmYes: document.getElementById('confirmYes'),
    confirmNo: document.getElementById('confirmNo'),
    confirmMessage: document.getElementById('confirmMessage'),
    
    // 🆕 Delete Confirm
    deleteConfirmOverlay: document.getElementById('deleteConfirmOverlay'),
    deleteConfirmYes: document.getElementById('deleteConfirmYes'),
    deleteConfirmNo: document.getElementById('deleteConfirmNo'),
    
    // Update Announcement
    updateContentBody: document.getElementById('updateContentBody'),
    updateVersionDate: document.getElementById('updateVersionDate'),
    closeUpdateBtn: document.getElementById('closeUpdateBtn'),
    acknowledgeUpdateBtn: document.getElementById('acknowledgeUpdateBtn')
};

// ==================== 状态变量 ====================
let state = {
    isLoggedIn: false,
    currentMode: null, // 'topic' | 'casual'
    currentTopicId: null,
    currentTopicName: null,
    currentTopicTag: null,
    currentSessionId: null,
    conversationHistory: [],
    hasUnsavedChanges: false,
    pendingTopicChange: null,
    pendingDeleteSessionId: null, // 🆕 待删除的会话ID
    isFirstMessage: false,
    streamController: null,
    isAuthLoginMode: true,
    fullTraitReport: "",
    reportCheckInterval: null, // 🆕 轮询定时器
};

// 模拟缓存
let availableTopics = [];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Nebula UI initialized');
    initEventListeners();
    checkLoginStatus();
    checkUpdatePopup();
});

function initEventListeners() {
    // 1. 侧边栏交互 (修改：toggle 模式 + 空白点击关闭)
    els.historyToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.historyDrawer.classList.toggle('open');
    });

    els.closeHistoryBtn.addEventListener('click', () => {
        els.historyDrawer.classList.remove('open');
    });

    // 新增：点击页面空白处关闭侧边栏
    document.addEventListener('click', (e) => {
        if (els.historyDrawer.classList.contains('open')) {
            if (!els.historyDrawer.contains(e.target) && !els.historyToggleBtn.contains(e.target)) {
                els.historyDrawer.classList.remove('open');
            }
        }
    });
    
    // 2. 话题刷新与选择
    [els.refreshTopicsBtn, els.refreshTopicsBtnHeader].forEach(btn => {
        btn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if(btn === els.refreshTopicsBtnHeader) showModal(els.topicOverlay);
            loadRandomTopics();
        });
    });

    els.topicSelectorMini.addEventListener('click', () => showModal(els.topicOverlay));
    els.newChatBtn.addEventListener('click', () => showModal(els.topicOverlay));
    
    els.casualChatBtn.addEventListener('click', () => handleTopicChange(null, null, null, true));

    // 3. 聊天交互
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

    // 4. 模态框关闭逻辑
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideModal(overlay);
            }
        });
    });
    
    document.getElementById('closeReportButton').addEventListener('click', () => hideModal(els.reportOverlay));
    document.getElementById('closeTraitsDetailButton').addEventListener('click', () => hideModal(els.traitsDetailOverlay));
    els.closeAuthBtn.addEventListener('click', () => hideModal(els.authOverlay));

    // 5. Auth 交互
    els.authBtn.addEventListener('click', () => showModal(els.authOverlay));
    els.authTabs.forEach(tab => {
        tab.addEventListener('click', () => switchAuthMode(tab.dataset.mode === 'login'));
    });
    els.submitAuthBtn.addEventListener('click', handleAuthSubmit);

    // 6. 确认弹窗
    els.confirmYes.addEventListener('click', () => {
        hideModal(els.confirmOverlay);
        if (state.pendingTopicChange) {
            const { id, name, tag, casual } = state.pendingTopicChange;
            executeTopicChange(id, name, tag, casual);
            state.pendingTopicChange = null;
        }
    });
    els.confirmNo.addEventListener('click', () => {
        hideModal(els.confirmOverlay);
        state.pendingTopicChange = null;
    });
    
    els.traitsDetailLink.addEventListener('click', showTraitsDetail);

    // 7. 更新弹窗交互
    els.closeUpdateBtn?.addEventListener('click', () => handleUpdateClose());
    els.acknowledgeUpdateBtn?.addEventListener('click', () => handleUpdateClose());
    
    // 8. 🆕 删除确认弹窗
    els.deleteConfirmNo?.addEventListener('click', () => {
        hideModal(els.deleteConfirmOverlay);
        state.pendingDeleteSessionId = null;
    });
    
    els.deleteConfirmYes?.addEventListener('click', () => {
        hideModal(els.deleteConfirmOverlay);
        if (state.pendingDeleteSessionId) {
            executeDeleteSession(state.pendingDeleteSessionId);
            state.pendingDeleteSessionId = null;
        }
    });
}

// ==================== 核心逻辑 ====================

async function checkLoginStatus() {
    try {
        await loadGlobalTraits();
        state.isLoggedIn = true;
        updateAuthUI();
        loadSessions();
        loadRandomTopics();
        showModal(els.topicOverlay);
    } catch (error) {
        if (error.status === 401) {
            state.isLoggedIn = false;
            showModal(els.authOverlay);
        }
    }
}

function handleTopicChange(topicId, topicName, topicTag, isCasual = false) {
    if (state.hasUnsavedChanges && state.conversationHistory.length > 0) {
        state.pendingTopicChange = { id: topicId, name: topicName, tag: topicTag, casual: isCasual };
        showModal(els.confirmOverlay);
    } else {
        executeTopicChange(topicId, topicName, topicTag, isCasual);
    }
}

async function executeTopicChange(topicId, topicName, topicTag, isCasual = false) {
    // 🆕 停止之前的报告轮询
    stopReportPolling();
    
    // 1. 重置状态
    state.currentSessionId = generateUUID();
    
    state.currentMode = isCasual ? 'casual' : 'topic';
    state.currentTopicId = topicId;
    state.currentTopicName = topicName;
    state.currentTopicTag = topicTag;
    state.isFirstMessage = true;
    state.conversationHistory = [];
    state.hasUnsavedChanges = false;

    // 2. UI 更新
    const casualTitle = "随心对话";
    const casualTag = "心流漫游";
    const casualStatus = "思维通道已打开<br>准备进入潜意识之海...";

    els.currentTopic.textContent = isCasual ? '随便聊聊' : topicName;
    els.headerTag.textContent = isCasual ? casualTag : topicTag;
    els.chatTitle.textContent = isCasual ? casualTitle : `正在探索：${topicTag}`;
    els.statusContent.innerHTML = isCasual ? casualStatus : `正在连接深层意识...<br>测试对象：${topicTag}`;
    
    els.chatMessages.innerHTML = '';
    els.welcomePlaceholder.style.display = 'none';
    hideModal(els.topicOverlay);
    
    els.chatInput.value = '';
    
    // 🆕 开始报告轮询
    startReportPolling(state.currentSessionId);
    
    // 3. 自动开场 (Mode 1)
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
}

/** 发送消息 */
async function sendMessage() {
    const text = els.chatInput.value.trim();
    
    if (!text) return;

    // 1. 上屏用户消息
    addMessage('user', text);
    els.chatInput.value = '';
    els.chatInput.style.height = 'auto';
    els.welcomePlaceholder.style.display = 'none';

    // 2. 锁定并显示思考
    els.sendButton.disabled = true;
    showThinking();
    state.hasUnsavedChanges = true;

    // 3. 发送请求
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
        state.currentSessionId = generateUUID();
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
        response = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.CHAT_STREAM}`, {
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
                    
                    // 🆕 处理新的事件类型
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

// 🆕 处理用户想退出事件
function handleUserWantQuit() {
    hideThinking();
    
    // 在消息区域添加"结束对话"按钮
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
    
    // 绑定点击事件
    document.getElementById('quitSessionBtn').addEventListener('click', async () => {
        await completeSession();
        // 跳转回话题广场
        showModal(els.topicOverlay);
        loadRandomTopics();
    });
}

// 🆕 完成会话
async function completeSession() {
    try {
        stopReportPolling();
        
        await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.SESSION_COMPLETE}/${state.currentSessionId}/complete`, {
            method: 'POST'
        });
        
        // 重置状态
        state.currentSessionId = null;
        state.conversationHistory = [];
        state.hasUnsavedChanges = false;
        els.chatMessages.innerHTML = '';
        els.welcomePlaceholder.style.display = 'block';
        
        // 刷新历史列表
        loadSessions();
    } catch (e) {
        console.error("Complete session failed", e);
    }
}

function handleEndEvent(event) {
    if (event.summary) {
        // 可以选择显示总结，或者只是记录
    }
    
    // 🆕 删除旧的报告处理逻辑
    // 报告现在由后台生成，通过轮询获取
    
    if (event.trait_summary) {
        updateTraitsDisplay(event.trait_summary);
    }
    state.hasUnsavedChanges = false;
}

// 🆕 报告轮询逻辑
function startReportPolling(sessionId) {
    stopReportPolling(); // 先停止之前的轮询
    
    state.reportCheckInterval = setInterval(async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.REPORT_STATUS}/${sessionId}/report_status`);
            
            if (res.ready) {
                stopReportPolling();
                showReportReadyNotification(sessionId);
            }
        } catch (e) {
            // 🔧 如果是 404 或其他错误，停止无意义的轮询
            if (e.message.includes('404') || e.message.includes('Not Found')) {
                console.warn('Session not found, stopping report polling');
                stopReportPolling();
            } else {
                console.warn('Report status check failed', e);
            }
        }
    }, 3000); // 每3秒检查一次
}

function stopReportPolling() {
    if (state.reportCheckInterval) {
        clearInterval(state.reportCheckInterval);
        state.reportCheckInterval = null;
    }
}

// 🆕 显示报告就绪提示
function showReportReadyNotification(sessionId) {
    // 在右侧状态栏显示提示
    els.statusContent.innerHTML = `
        <div style="color: var(--accent-glow);">
            ✨ 观念分析已完成！
        </div>
        <button id="viewReportBtn" class="btn-primary" style="margin-top: 0.5rem; width: 100%; font-size: 0.9rem;">
            查看报告
        </button>
    `;
    
    // 绑定点击事件
    document.getElementById('viewReportBtn').addEventListener('click', () => {
        viewReport(sessionId);
    });
}

// 🆕 查看报告
async function viewReport(sessionId) {
    try {
        const res = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.REPORT_GET}/${sessionId}/report`);
        
        if (res.ready && res.report) {
            showReport(res.report, state.currentTopicTag || '观念分析');
        } else {
            alert('报告正在生成中，请稍后再试');
        }
    } catch (e) {
        console.error('Load report failed', e);
        alert('加载报告失败: ' + e.message);
    }
}

// ==================== 数据加载 ====================

async function loadSessions() {
    try {
        const sessions = await fetchWithAuth(`${API_BASE_URL}/sessions`);
        renderSessionList(sessions);
    } catch (e) {
        console.error("Load sessions failed", e);
    }
}

function renderSessionList(sessions) {
    els.sessionList.innerHTML = '';
    if (!sessions || sessions.length === 0) {
        els.sessionList.innerHTML = '<div style="text-align:center; opacity:0.5; padding:1rem;">暂无记录</div>';
        return;
    }

    sessions.forEach(s => {
        const li = document.createElement('li');
        li.className = 'session-item';
        li.dataset.id = s.id;

        const dateStr = formatDate(s.created_at);
        let title = s.last_message || "无对话内容";
        if (title.length > 15) title = title.substring(0, 15) + "...";
        
        const topicObj = availableTopics.find(t => t.id === s.topic_id);
        const topicLabel = s.mode === 1 ? (topicObj ? topicObj.topic : `话题${s.topic_id}`) : "漫游";

        let tagsHtml = '';
        if (s.status === 'completed') tagsHtml += `<span class="tag">已完成</span>`;
        else tagsHtml += `<span class="tag tag-progress">进行中</span>`;
        
        // 🆕 显示报告状态
        if (s.report_ready) {
            tagsHtml += `<span class="tag" style="background: rgba(244, 114, 182, 0.2); color: #f472b6;">有报告</span>`;
        }

        li.innerHTML = `
            <div class="session-title">[${topicLabel}] ${title}</div>
            <div class="session-meta">
                <span>${dateStr}</span>
                <div class="session-tags">${tagsHtml}</div>
            </div>
            <div class="delete-btn" title="删除记录">
                <i class="ri-delete-bin-line"></i>
            </div>
        `;
        
        // 点击列表项：加载
        li.addEventListener('click', (e) => {
            // 如果点击的是删除按钮，不触发加载
            if (e.target.closest('.delete-btn')) {
                return;
            }
            loadSessionDetail(s.id);
        });
        
        // 🆕 点击删除按钮：弹出确认框
        const delBtn = li.querySelector('.delete-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteSession(s.id);
        });
        
        els.sessionList.appendChild(li);
    });
}

async function loadSessionDetail(sessionId) {
    try {
        // 🔧 停止之前的轮询（查看历史时不需要轮询）
        stopReportPolling();
        
        const session = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.SESSION_DETAIL}/${sessionId}`);
        
        state.currentSessionId = session.id;
        state.currentMode = session.mode === 1 ? 'topic' : 'casual';
        state.currentTopicId = session.topic_id;
        
        const topicObj = availableTopics.find(t => t.id === session.topic_id);
        state.currentTopicName = topicObj ? topicObj.topic : "历史话题";
        state.currentTopicTag = topicObj ? topicObj.concept_tag : "";
        
        els.currentTopic.textContent = state.currentTopicName;
        els.headerTag.textContent = state.currentMode === 'topic' ? state.currentTopicTag : '心流漫游';
        els.chatTitle.textContent = state.currentMode === 'topic' ? `回顾：${state.currentTopicTag}` : '回顾：随心对话';
        
        els.chatMessages.innerHTML = '';
        els.welcomePlaceholder.style.display = 'none';
        
        session.messages.forEach(msg => {
            addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
        });
        
        // 🆕 如果报告已就绪，显示提示
        if (session.report_ready) {
            showReportReadyNotification(sessionId);
        } else if (session.status === 'in_progress') {
            // 🔧 只有进行中的会话才启动轮询
            startReportPolling(sessionId);
        }
        
        els.historyDrawer.classList.remove('open');
        
    } catch (e) {
        console.error("Load detail failed", e);
    }
}

async function loadRandomTopics() {
    try {
        const topics = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.TOPICS_RANDOM}?count=6`);
        topics.forEach(t => {
            if(!availableTopics.find(at => at.id === t.id)) availableTopics.push(t);
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
            <div class="topic-name">${topic.topic}</div>
            <div class="topic-tag">${topic.concept_tag}</div>
        `;
        div.addEventListener('click', () => handleTopicChange(topic.id, topic.topic, topic.concept_tag));
        els.topicsGrid.appendChild(div);
    });
}

async function loadGlobalTraits() {
    const data = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.TRAITS_GLOBAL}`);
    updateTraitsDisplay(data.summary);
    state.fullTraitReport = data.full_report;
}

// ==================== Auth 逻辑 ====================

function switchAuthMode(isLogin) {
    state.isAuthLoginMode = isLogin;
    els.authTabs.forEach(t => t.classList.toggle('active', 
        (t.dataset.mode === 'login') === isLogin
    ));
    document.getElementById('authTitle').textContent = isLogin ? '欢迎回来' : '创建账号';
    els.submitAuthBtn.textContent = isLogin ? '登录' : '注册';
    els.authErrorMsg.textContent = '';
}

async function handleAuthSubmit() {
    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value.trim();
    if (!email || !password) return;

    const endpoint = state.isAuthLoginMode
        ? API_ENDPOINTS.AUTH_LOGIN
        : API_ENDPOINTS.AUTH_REGISTER;

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '操作失败');
        }

        if (state.isAuthLoginMode) {
            state.isLoggedIn = true;
            hideModal(els.authOverlay);
            await checkLoginStatus();
        } else {
            switchAuthMode(true);
            els.authErrorMsg.style.color = 'var(--success-color)';
            els.authErrorMsg.textContent = '注册成功，请登录';
        }

    } catch (error) {
        els.authErrorMsg.style.color = 'var(--error-color)';
        els.authErrorMsg.textContent = error.message;
    }
}

// ==================== 工具函数 ====================

async function fetchWithAuth(url, options = {}) {
    const finalOptions = {
        method: options.method || 'GET',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        body: options.body,
        signal: options.signal
    };

    try {
        const response = await fetch(url, finalOptions);

        if (response.status === 401) {
            const error = new Error("未登录或会话过期");
            error.status = 401;
            throw error;
        }

        if (!response.ok) {
            let errorText = response.statusText;
            try {
                const errJson = await response.json();
                errorText = errJson.detail || JSON.stringify(errJson);
            } catch (e) { /* ignore json parse error */ }
            
            throw new Error(`HTTP Error ${response.status}: ${errorText}`);
        }

        if (url.includes('/chat/stream')) {
            return response;
        }

        return response.json();
    } catch (err) {
        console.error("Fetch Error Details:", err);
        throw err;
    }
}

function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function showModal(modal) { 
    modal.classList.add('active'); 
    modal.style.visibility = 'visible'; 
}
function hideModal(modal) { 
    modal.classList.remove('active'); 
    setTimeout(() => modal.style.visibility = 'hidden', 300); 
}

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
    if(summary) {
        const dot = document.querySelector('.update-dot');
        if(dot) {
            dot.style.display = 'inline-block';
            setTimeout(() => dot.style.display = 'none', 5000);
        }
    }
}

function showReport(content, topic) {
    els.reportTitle.textContent = `分析报告：${topic}`;
    els.reportContent.innerHTML = `<div style="white-space: pre-wrap;">${content}</div>`;
    showModal(els.reportOverlay);
}

function showTraitsDetail() {
    els.traitsDetailContent.innerHTML = `<div style="white-space: pre-wrap;">${state.fullTraitReport || els.traitsContent.textContent}</div>`;
    showModal(els.traitsDetailOverlay);
}

function updateAuthUI() {
    // 🔧 使用图标而非文字 M
    els.authBtn.innerHTML = '<i class="ri-user-3-fill" style="font-size: 1.3rem;"></i>';
    els.authBtn.style.background = 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))';
}

function generateUUID() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
}

// 🆕 删除会话逻辑
function confirmDeleteSession(sessionId) {
    state.pendingDeleteSessionId = sessionId;
    showModal(els.deleteConfirmOverlay);
}

async function executeDeleteSession(sessionId) {
    try {
        // 🔧 由于后端没有 DELETE 接口，这里标记为已完成作为替代
        await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.SESSION_COMPLETE}/${sessionId}/complete`, {
            method: 'POST'
        });
        
        // UI 移除动画
        const li = document.querySelector(`.session-item[data-id="${sessionId}"]`);
        if (li) {
            li.style.opacity = '0';
            li.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                li.remove();
                // 检查是否还有记录
                if (els.sessionList.children.length === 0) {
                    els.sessionList.innerHTML = '<div style="text-align:center; opacity:0.5; padding:1rem;">暂无记录</div>';
                }
            }, 300);
        }

        // 如果删除的是当前正在显示的会话，重置主界面
        if (state.currentSessionId === sessionId) {
            showModal(els.topicOverlay);
            loadRandomTopics();
        }
    } catch (e) {
        console.error("删除失败", e);
        alert("删除失败: " + e.message);
    }
}

// 🆕 更新公告逻辑
function checkUpdatePopup() {
    // 🔧 增加调试信息
    console.log('[Update Check] Starting...');
    console.log('[Update Check] Current version:', UPDATE_CONFIG.version);
    
    // 🔧 检查必要的 DOM 元素是否存在
    if (!els.updateOverlay) {
        console.error('[Update Check] updateOverlay element not found!');
        return;
    }
    
    const storageKey = 'metalks_last_version';
    const lastSeenVersion = localStorage.getItem(storageKey);
    
    console.log('[Update Check] Last seen version:', lastSeenVersion);

    if (lastSeenVersion !== UPDATE_CONFIG.version) {
        console.log('[Update Check] Showing update popup');
        
        // 🔧 安全设置内容
        if (els.updateVersionDate) {
            els.updateVersionDate.textContent = UPDATE_CONFIG.date;
        }
        if (els.updateContentBody) {
            els.updateContentBody.innerHTML = UPDATE_CONFIG.content;
        }
        
        showModal(els.updateOverlay);
    } else {
        console.log('[Update Check] Already up to date, skipping popup');
    }
}

function handleUpdateClose() {
    const storageKey = 'metalks_last_version';
    localStorage.setItem(storageKey, UPDATE_CONFIG.version);
    console.log('[Update Check] Version marked as seen:', UPDATE_CONFIG.version);
    hideModal(els.updateOverlay);
}