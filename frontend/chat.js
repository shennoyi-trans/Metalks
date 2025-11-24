// ==================== API配置 ====================
const API_BASE_URL = 'http://localhost:8000'; // 本地开发环境

const API_ENDPOINTS = {
    CHAT_STREAM: '/chat/stream',           // 流式对话
    TOPICS: '/topics',                     // 获取所有话题
    TOPICS_RANDOM: '/topics/random',       // 随机获取话题
    // 以下接口暂未实现，使用模拟数据
    SESSION_LIST: '/session/list',         
    SESSION_DETAIL: '/session',            
    SESSION_REPORT: '/session/report',     
    TRAITS_GLOBAL: '/traits/global',       
    SESSION_STATUS: '/session/status',     
    CREATE_SESSION: '/session/create',     
    UPDATE_SESSION: '/session/update',     
    SAVE_SESSION: '/session/save'          
};

// ==================== DOM元素 ====================
const topicOverlay = document.getElementById('topicOverlay');
const reportOverlay = document.getElementById('reportOverlay');
const traitsDetailOverlay = document.getElementById('traitsDetailOverlay');
const confirmOverlay = document.getElementById('confirmOverlay');
const authOverlay = document.getElementById('authOverlay');
const topicSelectorMini = document.getElementById('topicSelectorMini');
const currentTopic = document.getElementById('currentTopic');
const statusContent = document.getElementById('statusContent');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const casualChatButton = document.getElementById('casualChatButton');
const closeReportButton = document.getElementById('closeReportButton');
const closeTraitsDetailButton = document.getElementById('closeTraitsDetailButton');
const closeAuthButton = document.getElementById('closeAuthButton');
const userAuthButton = document.getElementById('userAuthButton');
const reportTitle = document.getElementById('reportTitle');
const reportContent = document.getElementById('reportContent');
const traitsDetailLink = document.getElementById('traitsDetailLink');
const traitsDetailContent = document.getElementById('traitsDetailContent');
const traitsContent = document.getElementById('traitsContent');
const sessionList = document.getElementById('sessionList');
const confirmMessage = document.getElementById('confirmMessage');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const chatTitle = document.getElementById('chatTitle');
const topicsGrid = document.getElementById('topicsGrid');
const refreshTopicsButton = document.getElementById('refreshTopicsButton');
const traitUpdateIndicator = document.getElementById('traitUpdateIndicator');
const reportButtonContainer = document.getElementById('reportButtonContainer');

// 登录注册相关DOM元素
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const registerUsername = document.getElementById('registerUsername');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerConfirmPassword = document.getElementById('registerConfirmPassword');
const loginMessage = document.getElementById('loginMessage');
const registerMessage = document.getElementById('registerMessage');

// ==================== 状态变量 ====================
let currentMode = null; // 'topic' 或 'casual'
let currentTopicId = null;
let currentTopicName = null;
let currentTopicTag = null;
let currentSessionId = null;
let conversationHistory = [];
let hasUnsavedChanges = false;
let pendingTopicChange = null;
let currentStreamController = null;
let isFirstMessage = false;
let availableTopics = [];
let mockSessions = []; // 存储会话数据

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，初始化事件监听器');
    
    // 绑定刷新话题按钮点击事件
    refreshTopicsButton.addEventListener('click', function() {
        console.log('刷新话题按钮被点击');
        loadRandomTopics();
    });
    
    // 绑定随便聊聊按钮点击事件
    casualChatButton.addEventListener('click', function() {
        console.log('随便聊聊按钮被点击');
        handleTopicChange(null, null, null, true);
    });
    
    // 绑定右侧话题选择器点击事件
    topicSelectorMini.addEventListener('click', function() {
        console.log('话题选择器被点击');
        showTopicOverlay();
    });
    
    // 绑定发送消息按钮点击事件
    sendButton.addEventListener('click', sendMessage);
    
    // 绑定输入框回车键发送消息
    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 输入框自动调整高度
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    // 关闭报告按钮点击事件
    closeReportButton.addEventListener('click', function() {
        reportOverlay.style.display = 'none';
    });
    
    // 关闭特质详情按钮点击事件
    closeTraitsDetailButton.addEventListener('click', function() {
        traitsDetailOverlay.style.display = 'none';
    });
    
    // 关闭登录注册窗口按钮点击事件
    closeAuthButton.addEventListener('click', function() {
        console.log('关闭登录注册窗口按钮被点击');
        authOverlay.style.display = 'none';
    });
    
    // 用户认证按钮点击事件
    userAuthButton.addEventListener('click', function() {
        console.log('用户认证按钮被点击');
        authOverlay.style.display = 'flex';
        // 默认显示登录表单
        showLoginForm();
    });
    
    // 登录选项卡点击事件
    loginTab.addEventListener('click', function() {
        console.log('登录选项卡被点击');
        showLoginForm();
    });
    
    // 注册选项卡点击事件
    registerTab.addEventListener('click', function() {
        console.log('注册选项卡被点击');
        showRegisterForm();
    });
    
    // 登录表单提交事件
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });
    
    // 注册表单提交事件
    registerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleRegister();
    });
    
    // 特质详情链接点击事件
    traitsDetailLink.addEventListener('click', function() {
        showTraitsDetail();
        // 用户查看特质详情后，隐藏红点
        traitUpdateIndicator.style.display = 'none';
    });
    
    // 确认弹窗按钮点击事件
    confirmYes.addEventListener('click', function() {
        saveCurrentSession();
        confirmOverlay.style.display = 'none';
        if (pendingTopicChange) {
            executeTopicChange(
                pendingTopicChange.topicId, 
                pendingTopicChange.topicName, 
                pendingTopicChange.topicTag, 
                pendingTopicChange.isCasual
            );
            pendingTopicChange = null;
        }
    });
    
    confirmNo.addEventListener('click', function() {
        confirmOverlay.style.display = 'none';
        if (pendingTopicChange) {
            executeTopicChange(
                pendingTopicChange.topicId, 
                pendingTopicChange.topicName, 
                pendingTopicChange.topicTag, 
                pendingTopicChange.isCasual
            );
            pendingTopicChange = null;
        }
    });
    
    // 加载初始数据
    loadInitialData();
});

// ==================== 登录注册功能 ====================

/**
 * 显示登录表单
 */
function showLoginForm() {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    // 清空消息
    loginMessage.textContent = '';
    registerMessage.textContent = '';
}

/**
 * 显示注册表单
 */
function showRegisterForm() {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
    // 清空消息
    loginMessage.textContent = '';
    registerMessage.textContent = '';
}

/**
 * 处理登录
 */
function handleLogin() {
    const username = loginUsername.value;
    const password = loginPassword.value;
    
    if (!username || !password) {
        loginMessage.textContent = '请填写所有字段';
        loginMessage.style.color = '#ef4444';
        return;
    }
    
    // 模拟登录成功
    loginMessage.textContent = '登录成功！';
    loginMessage.style.color = '#10b981';
    
    // 2秒后关闭窗口
    setTimeout(() => {
        authOverlay.style.display = 'none';
        // 更新用户按钮文本
        userAuthButton.textContent = '已登录';
        loginMessage.textContent = '';
        // 清空表单
        loginForm.reset();
    }, 2000);
}

/**
 * 处理注册
 */
function handleRegister() {
    const username = registerUsername.value;
    const email = registerEmail.value;
    const password = registerPassword.value;
    const confirmPassword = registerConfirmPassword.value;
    
    if (!username || !email || !password || !confirmPassword) {
        registerMessage.textContent = '请填写所有字段';
        registerMessage.style.color = '#ef4444';
        return;
    }
    
    if (password !== confirmPassword) {
        registerMessage.textContent = '密码不匹配';
        registerMessage.style.color = '#ef4444';
        return;
    }
    
    if (password.length < 6) {
        registerMessage.textContent = '密码长度至少6位';
        registerMessage.style.color = '#ef4444';
        return;
    }
    
    // 模拟注册成功
    registerMessage.textContent = '注册成功！正在自动登录...';
    registerMessage.style.color = '#10b981';
    
    // 2秒后自动登录并关闭窗口
    setTimeout(() => {
        authOverlay.style.display = 'none';
        // 更新用户按钮文本
        userAuthButton.textContent = '已登录';
        registerMessage.textContent = '';
        // 清空表单
        registerForm.reset();
        // 切换到登录表单
        showLoginForm();
    }, 2000);
}

// ==================== API调用函数 ====================

/**
 * 加载初始数据
 */
async function loadInitialData() {
    try {
        // 加载随机话题列表
        await loadRandomTopics();
        
        // 加载历史会话列表
        await loadSessions();
        
        // 加载全局特质
        await loadGlobalTraits();
        
        // 显示话题选择窗口
        showTopicOverlay();
    } catch (error) {
        console.error('加载初始数据失败:', error);
        showError('加载数据失败，请刷新页面重试');
    }
}

/**
 * 加载随机话题列表
 */
async function loadRandomTopics() {
    try {
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.TOPICS_RANDOM}?count=6`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const topics = await response.json();
        availableTopics = topics;
        updateTopicsGrid(topics);
    } catch (error) {
        console.error('加载随机话题失败:', error);
        // 使用模拟数据作为备选
        availableTopics = getMockTopics();
        updateTopicsGrid(availableTopics);
    }
}

/**
 * 加载所有话题列表
 */
async function loadAllTopics() {
    try {
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.TOPICS}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const topics = await response.json();
        availableTopics = topics;
        updateTopicsGrid(topics);
    } catch (error) {
        console.error('加载话题列表失败:', error);
        // 使用模拟数据作为备选
        availableTopics = getMockTopics();
        updateTopicsGrid(availableTopics);
    }
}

/**
 * 更新话题网格
 */
function updateTopicsGrid(topics) {
    topicsGrid.innerHTML = '';

    topics.forEach(topic => {
        const topicCard = document.createElement('div');
        topicCard.className = 'topic-card';
        topicCard.dataset.topicId = topic.id;
        topicCard.dataset.topic = topic.topic;
        topicCard.dataset.tag = topic.concept_tag;

        topicCard.innerHTML = `
            <div class="topic-name">${topic.topic}</div>
            <div class="topic-tag">${topic.concept_tag}</div>
        `;

        topicCard.addEventListener('click', function() {
            handleTopicChange(
                this.dataset.topicId,
                this.dataset.topic,
                this.dataset.tag
            );
        });

        topicsGrid.appendChild(topicCard);
    });
}

/**
 * 加载历史会话列表
 */
async function loadSessions() {
    try {
        // 调用API获取会话列表（临时使用模拟数据）
        updateSessionList(mockSessions);
    } catch (error) {
        console.error('加载会话列表失败:', error);
        updateSessionList(mockSessions);
    }
}

/**
 * 加载特定会话
 */
async function loadSession(sessionId) {
    try {
        // 中止当前可能正在进行的流式请求
        if (currentStreamController) {
            currentStreamController.abort();
            currentStreamController = null;
        }
        
        // 查找会话
        const session = mockSessions.find(s => s.id === sessionId);
        if (!session) {
            console.error('会话不存在:', sessionId);
            return;
        }
        
        // 更新当前会话状态
        currentSessionId = session.id;
        currentMode = session.mode || 'casual';
        currentTopicId = session.topic_id || null;
        currentTopicName = session.topic || null;
        currentTopicTag = session.topic ? `${session.topic}观` : null;
        
        // 更新UI
        currentTopic.textContent = currentTopicName || '随便聊聊';
        chatTitle.textContent = session.title || '与AI对话';
        
        // 更新状态
        if (session.status === 'completed') {
            statusContent.innerHTML = `已完成${currentTopicTag || '自由对话'}`;
        } else {
            statusContent.innerHTML = currentMode === 'topic' ? 
                `正在测试：${currentTopicTag}<br>继续对话中...` : 
                '自由对话中<br>继续对话中...';
        }
        
        // 加载会话消息
        displayMessages(session.messages || []);
        
        // 隐藏话题选择窗口（如果有）
        topicOverlay.style.display = 'none';
        
        // 清除现有报告按钮
        clearReportButton();
        
        // 如果是已完成的会话，显示报告按钮
        if (session.status === 'completed' && session.has_report) {
            addReportButton();
        }
        
        // 聚焦输入框
        chatInput.focus();
        
        // 更新特质信息
        if (session.traits) {
            updateTraitsDisplay(session.traits);
        }
        
    } catch (error) {
        console.error('加载会话失败:', error);
        showError('加载会话失败，请重试');
    }
}

/**
 * 加载会话报告
 */
async function loadSessionReport(sessionId) {
    try {
        // 临时使用模拟数据
        const report = getMockReport();
        showReport(report.content, report.topic ? `${report.topic}观` : '自由对话');
    } catch (error) {
        console.error('加载报告失败:', error);
        showError('加载报告失败，请重试');
    }
}

/**
 * 加载全局特质
 */
async function loadGlobalTraits() {
    try {
        // 临时使用模拟数据
        updateTraitsDisplay(getMockTraits());
    } catch (error) {
        console.error('加载特质失败:', error);
        updateTraitsDisplay(getMockTraits());
    }
}

/**
 * 创建新会话
 */
async function createSession(topicId = null, mode = 'topic') {
    // 临时实现：生成一个随机会话ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
        id: sessionId,
        mode: mode,
        topic_id: topicId,
        topic: topicId ? availableTopics.find(t => t.id == topicId)?.topic : null,
        created_at: new Date().toISOString()
    };
}

/**
 * 发送消息到API
 */
async function sendMessageToAPI(message, isFirst = false) {
    // 中止之前的流式请求（如果有）
    if (currentStreamController) {
        currentStreamController.abort();
    }
    
    // 创建新的AbortController用于当前请求
    currentStreamController = new AbortController();
    
    try {
        // 构建请求体，与后端API参数匹配
        const requestBody = {
            mode: currentMode === 'topic' ? 1 : 2,
            session_id: currentSessionId || "default",
            message: message,
            topic_id: currentMode === 'topic' ? parseInt(currentTopicId) : undefined,
            is_first: isFirst,
            force_end: false
        };

        // 移除undefined字段
        Object.keys(requestBody).forEach(key => {
            if (requestBody[key] === undefined) {
                delete requestBody[key];
            }
        });

        console.log('发送请求体:', requestBody);

        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.CHAT_STREAM}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: currentStreamController.signal
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 处理流式响应
        await processStreamResponse(response);
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('请求被中止');
        } else {
            console.error('API请求失败:', error);
            throw error;
        }
    } finally {
        currentStreamController = null;
        isFirstMessage = false;
    }
}

/**
 * 保存当前会话
 */
async function saveCurrentSession() {
    try {
        // 创建或更新会话对象
        const session = {
            id: currentSessionId,
            mode: currentMode,
            topic_id: currentTopicId,
            topic: currentTopicName,
            title: currentMode === 'topic' ? `测试：${currentTopicTag}` : '自由对话',
            last_message: conversationHistory.length > 0 ? 
                conversationHistory[conversationHistory.length - 1].content : '',
            created_at: new Date().toISOString(),
            status: 'completed',
            has_report: true,
            has_trait_report: true,
            messages: [...conversationHistory],
            traits: getMockTraits()
        };
        
        // 检查是否已存在
        const existingIndex = mockSessions.findIndex(s => s.id === currentSessionId);
        if (existingIndex >= 0) {
            mockSessions[existingIndex] = session;
        } else {
            mockSessions.push(session);
        }
        
        console.log('会话已保存:', session);
        
        // 重新加载会话列表
        await loadSessions();
        
        // 重置未保存更改标志
        hasUnsavedChanges = false;
        
        // 添加报告按钮
        addReportButton();
        
    } catch (error) {
        console.error('保存会话失败:', error);
        showError('保存会话失败');
    }
}

// ==================== UI更新函数 ====================

/**
 * 更新会话列表
 */
function updateSessionList(sessions) {
    sessionList.innerHTML = '';
    
    if (sessions.length === 0) {
        sessionList.innerHTML = '<li class="session-item" style="text-align: center; color: rgba(254, 243, 199, 0.5);">暂无历史对话</li>';
        return;
    }
    
    sessions.forEach(session => {
        const sessionItem = document.createElement('li');
        sessionItem.className = 'session-item';
        sessionItem.dataset.sessionId = session.id;
        
        const title = session.title || `[${session.topic || '随便聊聊'}] ${session.last_message || '新对话'}`;
        const date = formatDate(session.created_at || session.updated_at);
        
        // 根据会话状态生成标签
        let tag = '';
        if (session.has_report) {
            tag = '<span class="tag">包含观念</span>';
        } else if (session.has_trait_report) {
            tag = '<span class="tag tag-trait">特质报告</span>';
        } else if (session.status === 'in_progress') {
            tag = '<span class="tag tag-in-progress">进行中</span>';
        }
        
        sessionItem.innerHTML = `
            <div class="session-title">${title}</div>
            <div class="session-meta">
                <span>${date}</span>
                ${tag}
            </div>
        `;
        
        sessionItem.addEventListener('click', () => loadSession(session.id));
        sessionList.appendChild(sessionItem);
    });
}

/**
 * 显示消息记录
 */
function displayMessages(messages) {
    chatMessages.innerHTML = '';
    conversationHistory = [];
    
    messages.forEach(msg => {
        if (msg.role === 'user') {
            addUserMessage(msg.content, false);
        } else if (msg.role === 'assistant') {
            addAIMessage(msg.content, false);
        }
    });
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 更新特质显示
 */
function updateTraitsDisplay(traits) {
    // 更新简要特质显示
    if (traits.summary) {
        traitsContent.textContent = traits.summary;
    } else if (traits.categories && Object.keys(traits.categories).length > 0) {
        // 从分类中提取简要描述
        const summary = [];
        for (const [category, items] of Object.entries(traits.categories)) {
            if (items.length > 0) {
                summary.push(items[0].name);
            }
        }
        traitsContent.textContent = summary.join('，') + '。';
    } else {
        traitsContent.textContent = '你的特质将会在这里显示。';
    }
    
    // 更新特质详情
    updateTraitsDetail(traits);
    
    // 如果有特质数据，显示红点提醒
    if (traits && (traits.summary || traits.categories || traits.detailed)) {
        traitUpdateIndicator.style.display = 'inline-block';
    } else {
        traitUpdateIndicator.style.display = 'none';
    }
}

/**
 * 更新特质详情
 */
function updateTraitsDetail(traits) {
    let traitsHTML = '';
    
    if (traits.categories && Object.keys(traits.categories).length > 0) {
        for (const [category, items] of Object.entries(traits.categories)) {
            traitsHTML += `
                <div class="trait-category">
                    <div class="trait-category-title">${category}</div>
            `;
            
            items.forEach(trait => {
                traitsHTML += `
                    <div class="trait-item">
                        <div class="trait-name">${trait.name}</div>
                        <div class="trait-description">${trait.description}</div>
                    </div>
                `;
            });
            
            traitsHTML += `</div>`;
        }
    } else if (traits.detailed) {
        traitsHTML = `<p>${traits.detailed}</p>`;
    } else {
        traitsHTML = '<p>暂无详细的特质分析。</p>';
    }
    
    traitsDetailContent.innerHTML = traitsHTML;
}

// ==================== 报告按钮相关函数 ====================

/**
 * 添加查看报告按钮
 */
function addReportButton() {
    // 先清除现有按钮
    clearReportButton();
    
    const reportButton = document.createElement('button');
    reportButton.className = 'report-button';
    reportButton.textContent = '查看报告';
    reportButton.addEventListener('click', () => loadSessionReport(currentSessionId));
    
    reportButtonContainer.appendChild(reportButton);
}

/**
 * 清除报告按钮
 */
function clearReportButton() {
    reportButtonContainer.innerHTML = '';
}

// ==================== 核心交互函数 ====================

/**
 * 显示话题选择窗口
 */
function showTopicOverlay() {
    topicOverlay.style.display = 'flex';
}

/**
 * 处理话题切换
 */
function handleTopicChange(topicId, topicName, topicTag, isCasual = false) {
    // 检查是否有未保存的更改
    if (hasUnsavedChanges && conversationHistory.length > 0) {
        // 显示确认弹窗
        pendingTopicChange = {
            topicId: topicId,
            topicName: topicName,
            topicTag: topicTag,
            isCasual: isCasual
        };
        confirmOverlay.style.display = 'flex';
    } else {
        // 直接执行话题切换
        executeTopicChange(topicId, topicName, topicTag, isCasual);
    }
}

/**
 * 执行话题切换
 */
async function executeTopicChange(topicId, topicName, topicTag, isCasual = false) {
    try {
        let newSession;
        
        if (isCasual) {
            newSession = await createSession(null, 'casual');
            selectCasualChat(newSession);
        } else {
            newSession = await createSession(topicId, 'topic');
            selectTopic(topicId, topicName, topicTag, newSession);
        }
        
        // 重新加载会话列表
        await loadSessions();
        
    } catch (error) {
        console.error('切换话题失败:', error);
        showError('切换话题失败，请重试');
    }
}

/**
 * 选择话题
 */
function selectTopic(topicId, topicName, topicTag, session) {
    currentSessionId = session.id;
    currentMode = 'topic';
    currentTopicId = topicId;
    currentTopicName = topicName;
    currentTopicTag = topicTag;
    isFirstMessage = true;
    
    // 更新UI
    currentTopic.textContent = topicName;
    chatTitle.textContent = `测试：${topicTag}`;
    statusContent.innerHTML = `正在测试：${topicTag}<br>我开始有些了解你了`;
    
    // 隐藏话题选择窗口
    topicOverlay.style.display = 'none';
    
    // 清空聊天记录
    chatMessages.innerHTML = '';
    conversationHistory = [];
    hasUnsavedChanges = false;
    
    // 清除报告按钮
    clearReportButton();
    
    sendMessageToAPI("", true);  // 第二个参数 true 表示 is_first
    
    // 聚焦输入框
    chatInput.focus();
}

/**
 * 选择随便聊聊模式
 */
function selectCasualChat(session) {
    currentSessionId = session.id;
    currentMode = 'casual';
    currentTopicId = null;
    currentTopicName = null;
    currentTopicTag = null;
    isFirstMessage = true;
    
    // 更新UI
    currentTopic.textContent = '随便聊聊';
    chatTitle.textContent = '自由对话';
    statusContent.innerHTML = '自由对话中<br>模型正在捕捉你的思考方式';
    
    // 隐藏话题选择窗口
    topicOverlay.style.display = 'none';
    
    // 清空聊天记录
    chatMessages.innerHTML = '';
    conversationHistory = [];
    hasUnsavedChanges = false;
    
    // 清除报告按钮
    clearReportButton();
    
    sendMessageToAPI("", true);  // 第二个参数 true 表示 is_first
    
    // 聚焦输入框
    chatInput.focus();
}

/**
 * 发送消息
 */
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // 添加用户消息到聊天界面
    addUserMessage(message);
    
    // 清空输入框
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // 禁用发送按钮
    sendButton.disabled = true;
    
    // 标记有未保存的更改
    hasUnsavedChanges = true;
    
    try {
        // 发送消息到后端API
        await sendMessageToAPI(message);
    } catch (error) {
        console.error('发送消息失败:', error);
        addAIMessage('抱歉，我遇到了一些问题，请稍后再试。');
        sendButton.disabled = false;
    }
}

/**
 * 处理流式响应
 */
async function processStreamResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiMessage = '';
    
    // 创建AI消息元素
    const messageElement = document.createElement('div');
    messageElement.className = 'message message-ai';
    chatMessages.appendChild(messageElement);
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                break;
            }
            
            // 解码块数据
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        // 流结束
                        break;
                    }
                    
                    if (data.trim()) {
                        try {
                            const event = JSON.parse(data);
                            
                            // 处理内容更新
                            if (event.content) {
                                aiMessage += event.content;
                                messageElement.textContent = aiMessage;
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                            
                            // 处理会话状态更新
                            if (event.session_status) {
                                updateSessionStatus(event.session_status);
                            }
                            
                            // 处理特质更新
                            if (event.traits_update) {
                                updateTraitsDisplay(event.traits_update);
                            }
                            
                            // 处理对话完成
                            if (event.is_complete) {
                                // 对话完成，显示报告
                                setTimeout(() => {
                                    showReport(event.report, currentTopicTag);
                                }, 1000);
                            }
                            
                        } catch (e) {
                            console.error('解析流数据失败:', e);
                        }
                    }
                }
            }
        }
        
        // 保存AI消息到历史记录
        conversationHistory.push({ role: 'assistant', content: aiMessage });
        
        // 重新启用发送按钮
        sendButton.disabled = false;
        
    } catch (error) {
        console.error('处理流响应失败:', error);
        messageElement.textContent = '抱歉，响应过程中出现了问题。';
        sendButton.disabled = false;
    }
}

// ==================== 辅助函数 ====================

/**
 * 添加用户消息
 */
function addUserMessage(message, updateHistory = true) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message message-user';
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 保存到历史记录
    if (updateHistory) {
        conversationHistory.push({ role: 'user', content: message });
    }
}

/**
 * 添加AI消息
 */
function addAIMessage(message, withTyping = false, updateHistory = true) {
    if (withTyping) {
        // 显示输入指示器
        const typingElement = document.createElement('div');
        typingElement.className = 'message message-ai typing-indicator';
        typingElement.innerHTML = '思考中<span class="typing-dots"><span></span><span></span><span></span></span>';
        chatMessages.appendChild(typingElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 模拟打字效果
        setTimeout(() => {
            chatMessages.removeChild(typingElement);
            addAIMessage(message, false, updateHistory);
        }, 1500);
    } else {
        const messageElement = document.createElement('div');
        messageElement.className = 'message message-ai';
        messageElement.textContent = message;
        chatMessages.appendChild(messageElement);
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 保存到历史记录
        if (updateHistory) {
            conversationHistory.push({ role: 'assistant', content: message });
        }
        
        // 重新启用发送按钮
        sendButton.disabled = false;
    }
}

/**
 * 更新会话状态
 */
function updateSessionStatus(sessionStatus) {
    if (sessionStatus.status === 'testing') {
        statusContent.innerHTML = `正在测试：${currentTopicTag}<br>${sessionStatus.message || '我开始有些了解你了'}`;
    } else if (sessionStatus.status === 'analyzing') {
        statusContent.innerHTML = `分析中<br>${sessionStatus.message || '我正在分析你的回答...'}`;
    } else if (sessionStatus.status === 'completed') {
        statusContent.innerHTML = `测试完成<br>${sessionStatus.message || '已生成观念报告'}`;
        hasUnsavedChanges = false;
    } else if (sessionStatus.status === 'casual') {
        statusContent.innerHTML = `自由对话中<br>${sessionStatus.message || '模型正在捕捉你的思考方式'}`;
    }
}

/**
 * 显示报告
 */
function showReport(report, topic) {
    // 更新报告内容
    reportTitle.textContent = `你的【${topic}】测试结果`;
    reportContent.textContent = report;
    
    // 显示报告窗口
    reportOverlay.style.display = 'flex';
    
    // 更新状态
    statusContent.innerHTML = `已生成${topic}报告`;
    
    // 重置未保存更改标志
    hasUnsavedChanges = false;
}

/**
 * 显示特质详情
 */
function showTraitsDetail() {
    // 显示特质详情窗口
    traitsDetailOverlay.style.display = 'flex';
}

/**
 * 显示错误消息
 */
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'message message-ai';
    errorElement.style.color = '#ef4444';
    errorElement.textContent = `错误: ${message}`;
    chatMessages.appendChild(errorElement);
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return '昨天';
    } else if (diffDays === 2) {
        return '前天';
    } else if (diffDays <= 7) {
        return `${diffDays}天前`;
    } else {
        return date.toLocaleDateString('zh-CN');
    }
}

// ==================== 模拟数据函数 ====================

/**
 * 获取模拟话题数据
 */
function getMockTopics() {
    return [
        { id: 1, topic: '工作', concept_tag: '工作观' },
        { id: 2, topic: '家庭', concept_tag: '家庭观' },
        { id: 3, topic: '金钱', concept_tag: '金钱观' },
        { id: 4, topic: '爱情', concept_tag: '爱情观' },
        { id: 5, topic: '友谊', concept_tag: '友谊观' },
        { id: 6, topic: '教育', concept_tag: '教育观' }
    ];
}

/**
 * 获取模拟报告
 */
function getMockReport() {
    return {
        content: '根据我们的对话分析，你倾向于将工作视为实现个人价值的重要途径。你重视工作中的自主性和创造性，认为工作与生活的平衡同样重要。',
        topic: '工作'
    };
}

/**
 * 获取模拟特质数据
 */
function getMockTraits() {
    return {
        summary: '你的表达习惯结构化且逻辑清晰。你倾向于从价值层面解释行为。',
        categories: {
            '思维模式': [
                {
                    name: '逻辑性强',
                    description: '你习惯用逻辑分析问题，表达观点时条理清晰。'
                },
                {
                    name: '价值导向',
                    description: '你倾向于从价值观角度解释行为和决策。'
                }
            ],
            '沟通风格': [
                {
                    name: '结构化表达',
                    description: '你的表达方式通常有明确的结构和层次。'
                }
            ]
        }
    };
}