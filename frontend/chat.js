// ==================== API配置 ====================
const API_BASE_URL = '/api'; 

const API_ENDPOINTS = {
    CHAT_STREAM: '/chat/stream',
    TOPICS_RANDOM: '/topics/random',
    SESSION_LIST: '/sessions',
    SESSION_DETAIL: '/sessions', // + /{id}
    MARK_COMPLETED: '/sessions/mark_completed',
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
    isLoggedIn: false, 
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
    isAuthLoginMode: true,
    fullTraitReport: "" 
};

// 模拟缓存
let availableTopics = [];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Nebula UI initialized');
    initEventListeners();
    checkLoginStatus(); 
});

function initEventListeners() {
    // 1. 侧边栏交互 (修改：toggle 模式 + 空白点击关闭)
    els.historyToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止冒泡
        els.historyDrawer.classList.toggle('open');
    });

    els.closeHistoryBtn.addEventListener('click', () => {
        els.historyDrawer.classList.remove('open');
    });

    // 新增：点击页面空白处关闭侧边栏
    document.addEventListener('click', (e) => {
        // 如果侧边栏是打开的
        if (els.historyDrawer.classList.contains('open')) {
            // 且点击的不是侧边栏内部，也不是切换按钮
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
    // 1. 重置状态
    state.currentSessionId = generateUUID(); 
    
    state.currentMode = isCasual ? 'casual' : 'topic';
    state.currentTopicId = topicId;
    state.currentTopicName = topicName;
    state.currentTopicTag = topicTag;
    state.isFirstMessage = true;
    state.conversationHistory = [];
    state.hasUnsavedChanges = false;

    // 2. UI 更新 (修改文案)
    // 原：“自由对话”、“自由漫游” -> 现：“随心对话”、“心流漫游”
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
    
    // 如果没有文字且不是系统自动触发(即用户点击发送)，则不处理
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

// ... (保留之前的代码)

async function sendMessageToAPI(message, isFirst = false) {
    if (state.streamController) state.streamController.abort();
    state.streamController = new AbortController();

    // 🔴 修复点：确保 session_id 存在，不再回退到 "default"
    if (!state.currentSessionId) {
        state.currentSessionId = generateUUID();
    }

    const payload = {
        mode: state.currentMode === 'topic' ? 1 : 2,
        session_id: state.currentSessionId, // 这里改了
        message: message,
        topic_id: state.currentMode === 'topic' ? parseInt(state.currentTopicId) : undefined,
        is_first: isFirst
    };

    // ... (后续代码保持不变，直接复制之前的 try-catch-fetch 部分即可)
    
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

    // ... (后续流处理代码保持不变) ...
    // 为了节省篇幅，这里不重复粘贴流处理代码，请保持原样
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
                    
                    // 理论上这里不会再变，但保留以防后端强制覆写
                    if (event.session_id && state.currentSessionId !== event.session_id) {
                         // 通常不需要操作，除非后端有特殊逻辑
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
        loadSessions(); // 刷新左侧列表，现在应该能看到多条记录了
    }
}

function handleEndEvent(event) {
    if (event.summary) {
        // 可以选择显示总结，或者只是记录
        // addMessage('ai', `[小结] ${event.summary}`).style.fontStyle = "italic";
    }
    if (event.has_opinion_report && event.opinion_report) {
        // 延迟一点显示报告，体验更好
        setTimeout(() => showReport(event.opinion_report, state.currentTopicTag), 1000);
    }
    if (event.trait_summary) {
        updateTraitsDisplay(event.trait_summary);
    }
    state.hasUnsavedChanges = false;
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
        // 绑定 ID 用于删除时的 DOM 操作
        li.dataset.id = s.id;

        const dateStr = formatDate(s.created_at);
        let title = s.last_message || "无对话内容";
        if (title.length > 15) title = title.substring(0, 15) + "...";
        
        const topicObj = availableTopics.find(t => t.id === s.topic_id);
        const topicLabel = s.mode === 1 ? (topicObj ? topicObj.topic : `话题${s.topic_id}`) : "漫游";

        let tagsHtml = '';
        if (s.status === 'completed') tagsHtml += `<span class="tag">已完成</span>`;
        else tagsHtml += `<span class="tag tag-progress">进行中</span>`;

        // 结构修改：增加删除按钮
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
        li.addEventListener('click', () => loadSessionDetail(s.id));

        // 点击删除按钮：删除
        const delBtn = li.querySelector('.delete-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止触发加载
            confirmDeleteSession(s.id);
        });

        els.sessionList.appendChild(li);
    });
}

async function loadSessionDetail(sessionId) {
    try {
        const session = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.SESSION_DETAIL}/${sessionId}`);
        
        state.currentSessionId = session.id;
        state.currentMode = session.mode === 1 ? 'topic' : 'casual';
        state.currentTopicId = session.topic_id;
        
        const topicObj = availableTopics.find(t => t.id === session.topic_id);
        state.currentTopicName = topicObj ? topicObj.topic : "历史话题";
        state.currentTopicTag = topicObj ? topicObj.concept_tag : "";
        
        // 文案同步优化
        els.currentTopic.textContent = state.currentTopicName;
        els.headerTag.textContent = state.currentMode === 'topic' ? state.currentTopicTag : '心流漫游';
        els.chatTitle.textContent = state.currentMode === 'topic' ? `回顾：${state.currentTopicTag}` : '回顾：随心对话';
        
        els.chatMessages.innerHTML = '';
        els.welcomePlaceholder.style.display = 'none';
        
        session.messages.forEach(msg => {
            addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
        });
        
        // 手机端体验优化：点击列表项后自动关闭侧边栏
        els.historyDrawer.classList.remove('open');
        
    } catch (e) {
        console.error("Load detail failed", e);
    }
}

async function loadRandomTopics() {
    try {
        const topics = await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.TOPICS_RANDOM}?count=6`);
        // 简单去重合并到 availableTopics
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

// ... (保留之前的代码)

// ==================== 工具函数 (替换原有的 fetchWithAuth) ====================

async function fetchWithAuth(url, options = {}) {
    const finalOptions = {
        method: options.method || 'GET',
        credentials: 'include', // 必须允许跨域 Cookie
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
            // 尝试读取后端返回的错误信息
            let errorText = response.statusText;
            try {
                const errJson = await response.json();
                errorText = errJson.detail || JSON.stringify(errJson);
            } catch (e) { /* ignore json parse error */ }
            
            throw new Error(`HTTP Error ${response.status}: ${errorText}`);
        }

        // 对于流式接口，直接返回 response，不解析 json
        if (url.includes('/chat/stream')) {
            return response;
        }

        return response.json();
    } catch (err) {
        // 捕获网络层面的错误（如 CORS 失败，服务器没开）
        console.error("Fetch Error Details:", err);
        throw err; // 继续抛出给上层处理
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
    els.authBtn.innerHTML = '<span class="user-avatar-btn">M</span>';
}

/** 生成唯一会话ID */
function generateUUID() {
    // 简单实现，生成类似 "1719238491234-r8s9" 的字符串
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
}

function confirmDeleteSession(sessionId) {
    // 简单使用 confirm，为了效率
    if (confirm("确定要删除这条对话记录吗？删除后不可恢复。")) {
        deleteSession(sessionId);
    }
}

async function deleteSession(sessionId) {
    try {
        await fetchWithAuth(`${API_BASE_URL}/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        // UI 移除动画
        const li = document.querySelector(`.session-item[data-id="${sessionId}"]`);
        if (li) {
            li.style.opacity = '0';
            li.style.transform = 'translateX(-20px)';
            setTimeout(() => li.remove(), 300);
        }

        // 如果删除的是当前正在显示的会话，重置主界面
        if (state.currentSessionId === sessionId) {
            // 返回欢迎页/重置
            handleTopicChange(null, null, null, true);
        }
    } catch (e) {
        console.error("删除失败", e);
        alert("删除失败: " + e.message);
    }
}
