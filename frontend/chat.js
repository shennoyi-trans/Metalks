// ==================== API配置 ====================
const API_BASE_URL = '';

const API_ENDPOINTS = {
    CHAT_STREAM: '/chat/stream',
    TOPICS_RANDOM: '/topics/random',
    SESSION_LIST: '/sessions',
    SESSION_DETAIL: '/sessions', // + /{id}
    MARK_COMPLETED: '/sessions/mark_completed',
    TRAITS_GLOBAL: '/sessions/traits/global',
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
    confirmMessage: document.getElementById('confirmMessage')
};

// ==================== 状态变量 ====================
let state = {
    isLoggedIn: false, // 简单标记，实际由HttpOnly Cookie控制
    currentMode: null, // 'topic' | 'casual'
    currentTopicId: null,
    currentTopicName: null,
    currentTopicTag: null,
    currentSessionId: null,
    conversationHistory: [],
    hasUnsavedChanges: false,
    pendingTopicChange: null,
    isFirstMessage: false,
    streamController: null,
    isAuthLoginMode: true // true=login, false=register
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Nebula UI initialized');
    
    initEventListeners();
    checkLoginStatus(); // 尝试加载数据，若401则弹出登录
});

function initEventListeners() {
    // 1. 侧边栏交互
    els.historyToggleBtn.addEventListener('click', () => els.historyDrawer.classList.add('open'));
    els.closeHistoryBtn.addEventListener('click', () => els.historyDrawer.classList.remove('open'));
    
    // 2. 话题刷新与选择
    [els.refreshTopicsBtn, els.refreshTopicsBtnHeader].forEach(btn => {
        btn?.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发背景点击
            if(btn === els.refreshTopicsBtnHeader) showModal(els.topicOverlay);
            loadRandomTopics();
        });
    });

    els.topicSelectorMini.addEventListener('click', () => showModal(els.topicOverlay));
    els.newChatBtn.addEventListener('click', () => showModal(els.topicOverlay));
    
    els.casualChatBtn.addEventListener('click', () => handleTopicChange(null, null, null, true));

    // 3. 聊天交互
    els.sendButton.addEventListener('click', sendMessage);
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

    // 4. 模态框关闭逻辑 (通用背景点击关闭)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // 特殊处理：Auth弹窗如果不强制登录，可以关闭；
                // 如果未登录且试图操作，可能不允许关闭。这里允许关闭。
                hideModal(overlay);
            }
        });
    });
    
    // 关闭按钮
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
        saveCurrentSession(); // 实际上后端会自动保存，这里主要是前端状态清理
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
    
    // 特质详情链接
    els.traitsDetailLink.addEventListener('click', showTraitsDetail);
}

// ==================== 核心逻辑 ====================

/** 检查登录状态 (通过尝试获取数据) */
async function checkLoginStatus() {
    try {
        // 尝试加载全局特质，如果成功说明已登录
        await loadGlobalTraits(); 
        state.isLoggedIn = true;
        updateAuthUI();
        loadSessions();
        loadRandomTopics();
        showModal(els.topicOverlay); // 初始显示话题选择
    } catch (error) {
        if (error.status === 401) {
            state.isLoggedIn = false;
            showModal(els.authOverlay); // 未登录显示弹窗
        }
    }
}

/** 切换话题 (带确认) */
function handleTopicChange(topicId, topicName, topicTag, isCasual = false) {
    if (state.hasUnsavedChanges && state.conversationHistory.length > 0) {
        state.pendingTopicChange = { id: topicId, name: topicName, tag: topicTag, casual: isCasual };
        showModal(els.confirmOverlay);
    } else {
        executeTopicChange(topicId, topicName, topicTag, isCasual);
    }
}

async function executeTopicChange(topicId, topicName, topicTag, isCasual = false) {
    // 清理当前状态
    state.currentSessionId = "session_" + Date.now(); // 临时ID，第一条消息后后端会建立真实Session或这里可以先调创建接口
    // 注意：后端API设计是 /chat/stream 自动创建Session (如果传default)，或者需要显式创建
    // 根据 chat_api.py，如果不传 session_id 或传 "default"，它可能没有持久化 session_id 给前端
    // 更好的做法是：前端生成一个随机 SessionID 或者第一条消息后获取。
    // 这里我们使用 "default" 让后端新建，但为了历史记录，最好能在第一次返回时拿到真实 ID。
    // 由于后端是流式，我们在 'is_first=true' 时发送，后端应该会处理。
    
    state.currentSessionId = null; // 让后端生成
    state.currentMode = isCasual ? 'casual' : 'topic';
    state.currentTopicId = topicId;
    state.currentTopicName = topicName;
    state.currentTopicTag = topicTag;
    state.isFirstMessage = true;
    state.conversationHistory = [];
    state.hasUnsavedChanges = false;

    // UI 更新
    els.currentTopic.textContent = isCasual ? '随便聊聊' : topicName;
    els.headerTag.textContent = isCasual ? '自由漫游' : topicTag;
    els.chatTitle.textContent = isCasual ? '自由对话' : `正在探索：${topicTag}`;
    els.statusContent.innerHTML = isCasual ? '模型已就绪<br>正在捕捉思维碎片...' : `正在连接深层意识...<br>测试对象：${topicTag}`;
    
    els.chatMessages.innerHTML = '';
    els.welcomePlaceholder.style.display = 'none'; // 隐藏欢迎
    hideModal(els.topicOverlay);
    removeTraitReportButton();
    
    // 自动聚焦
    els.chatInput.focus();
    
    // 发送第一条空消息以初始化 (可选，根据后端逻辑)
    // 如果后端需要 is_first 触发开场白：
    // sendMessageToAPI("", true); 
}

/** 发送消息 */
async function sendMessage() {
    const text = els.chatInput.value.trim();
    if (!text && !state.isFirstMessage) return;

    if (text) {
        addMessage('user', text);
        els.chatInput.value = '';
        els.chatInput.style.height = 'auto';
        els.welcomePlaceholder.style.display = 'none';
    }

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

/** 调用流式 API */
async function sendMessageToAPI(message, isFirst = false) {
    if (state.streamController) state.streamController.abort();
    state.streamController = new AbortController();

    const payload = {
        mode: state.currentMode === 'topic' ? 1 : 2,
        session_id: state.currentSessionId || "default",
        message: message,
        topic_id: state.currentMode === 'topic' ? parseInt(state.currentTopicId) : undefined,
        is_first: isFirst
    };

    const response = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.CHAT_STREAM}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: state.streamController.signal
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiMsgDiv = null;
    let aiContent = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') break;
                    
                    try {
                        const event = JSON.parse(jsonStr);
                        
                        // 处理 Session ID 回传 (如果后端在流里返回了 session_id)
                        if (event.session_id && !state.currentSessionId) {
                            state.currentSessionId = event.session_id;
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
                    } catch (e) { console.error('JSON Parse error', e); }
                }
            }
        }
    } finally {
        state.conversationHistory.push({ role: 'assistant', content: aiContent });
        els.sendButton.disabled = false;
        hideThinking();
        loadSessions(); // 刷新左侧列表
    }
}

function handleEndEvent(event) {
    if (event.summary) {
        addMessage('ai', event.summary).style.fontStyle = "italic";
    }
    if (event.has_opinion_report && event.opinion_report) {
        showReport(event.opinion_report, state.currentTopicTag);
    }
    if (event.trait_summary) {
        updateTraitsDisplay(event.trait_summary);
    }
    state.hasUnsavedChanges = false;
}

// ==================== 数据加载 ====================

/** 加载历史记录 (对接真实API) */
async function loadSessions() {
    try {
        const sessions = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.SESSION_LIST}`);
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
        
        // 格式化日期
        const dateStr = formatDate(s.created_at);
        
        // 标题处理
        let title = s.last_message || "无对话内容";
        if (title.length > 15) title = title.substring(0, 15) + "...";
        const topicLabel = s.mode === 1 ? (getTopicName(s.topic_id) || "话题对话") : "随便聊聊";

        // 标签
        let tagsHtml = '';
        if (s.status === 'completed') tagsHtml += `<span class="tag">已完成</span>`;
        else tagsHtml += `<span class="tag tag-progress">进行中</span>`;

        li.innerHTML = `
            <div class="session-title">[${topicLabel}] ${title}</div>
            <div class="session-meta">
                <span>${dateStr}</span>
                <div class="session-tags">${tagsHtml}</div>
            </div>
        `;
        
        li.addEventListener('click', () => loadSessionDetail(s.id));
        els.sessionList.appendChild(li);
    });
}

async function loadSessionDetail(sessionId) {
    try {
        const session = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.SESSION_DETAIL}/${sessionId}`);
        
        // 恢复状态
        state.currentSessionId = session.id;
        state.currentMode = session.mode === 1 ? 'topic' : 'casual';
        state.currentTopicId = session.topic_id;
        // 简单根据ID反查Name，实际建议后端详情返回 topic_name
        const topicObj = availableTopics.find(t => t.id === session.topic_id);
        state.currentTopicName = topicObj ? topicObj.topic : "历史话题";
        state.currentTopicTag = topicObj ? topicObj.concept_tag : "";
        
        // UI 恢复
        els.currentTopic.textContent = state.currentTopicName;
        els.headerTag.textContent = state.currentMode === 'topic' ? state.currentTopicTag : '自由漫游';
        els.chatTitle.textContent = state.currentMode === 'topic' ? `回顾：${state.currentTopicTag}` : '回顾：自由对话';
        
        els.chatMessages.innerHTML = '';
        els.welcomePlaceholder.style.display = 'none';
        
        session.messages.forEach(msg => {
            addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
        });
        
        els.historyDrawer.classList.remove('open');
        
    } catch (e) {
        console.error("Load detail failed", e);
    }
}

async function loadRandomTopics() {
    try {
        const topics = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.TOPICS_RANDOM}?count=6`);
        availableTopics = topics; // 缓存以备反查
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
    // 保存全量报告以备详情展示
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
            credentials: 'include',   // 必须，才能拿到 HttpOnly Cookie
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '操作失败');
        }

        const data = await response.json();

        if (state.isAuthLoginMode) {
            // 登录成功
            state.isLoggedIn = true;
            hideModal(els.authOverlay);
            await checkLoginStatus();
        } else {
            // 注册成功
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

/** 通用 Fetch 封装 (处理 Auth) */
async function fetchWithAuth(url, options = {}) {
    // 默认带上 credentials 以发送 Cookie
    options.credentials = 'include';
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
    
    const response = await fetch(url, options);
    
    if (response.status === 401) {
        const error = new Error("Unauthorized");
        error.status = 401;
        throw error;
    }
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    
    return response.json();
}

/** 日期格式化: ISO -> YYYY/MM/DD */
function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
}

/** UI 辅助 */
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
        document.querySelector('.update-dot').style.display = 'inline-block';
        setTimeout(() => document.querySelector('.update-dot').style.display = 'none', 5000);
    }
}

function showReport(content, topic) {
    els.reportTitle.textContent = `分析报告：${topic}`;
    els.reportContent.innerHTML = `<p>${content}</p>`;
    showModal(els.reportOverlay);
}

function showTraitsDetail() {
    // 如果有全量报告，这里展示。目前简单展示summary
    els.traitsDetailContent.innerHTML = `<p>${els.traitsContent.textContent}</p>`;
    showModal(els.traitsDetailOverlay);
}

function removeTraitReportButton() {
    // 以前的逻辑移除
}

function updateAuthUI() {
    // 可以在侧边栏显示头像等
    els.authBtn.innerHTML = '<span class="user-avatar-btn">M</span>';
}

// 模拟缓存
let availableTopics = [];