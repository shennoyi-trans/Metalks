// ==================== API配置 ====================
const API_BASE_URL = 'http://localhost:8000'; // 本地开发环境

const API_ENDPOINTS = {
    CHAT_STREAM: '/chat/stream',           // 流式对话
    TOPICS: '/topics',                     // 获取所有话题
    TOPICS_RANDOM: '/topics/random',       // 随机获取话题
};

// ==================== DOM元素 ====================
const topicOverlay = document.getElementById('topicOverlay');
const reportOverlay = document.getElementById('reportOverlay');
const traitsDetailOverlay = document.getElementById('traitsDetailOverlay');
const confirmOverlay = document.getElementById('confirmOverlay');
const topicSelectorMini = document.getElementById('topicSelectorMini');
const currentTopic = document.getElementById('currentTopic');
const statusContent = document.getElementById('statusContent');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const casualChatButton = document.getElementById('casualChatButton');
const closeReportButton = document.getElementById('closeReportButton');
const closeTraitsDetailButton = document.getElementById('closeTraitsDetailButton');
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

// 存储历史对话和特质信息
let savedSessions = [];
let globalTraits = {
    summary: ""
};

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
    
    // 特质详情链接点击事件
    traitsDetailLink.addEventListener('click', function() {
        showTraitsDetail();
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
        // 从本地存储加载会话列表
        const savedSessionsData = localStorage.getItem('savedSessions');
        if (savedSessionsData) {
            savedSessions = JSON.parse(savedSessionsData);
        } else {
            // 如果没有保存的会话，使用模拟数据
            savedSessions = getMockSessions();
        }
        updateSessionList(savedSessions);
    } catch (error) {
        console.error('加载会话列表失败:', error);
        // 使用空的会话列表作为备选
        updateSessionList([]);
    }
}

/**
 * 加载全局特质
 */
async function loadGlobalTraits() {
    try {
        // 从本地存储加载特质
        const savedTraits = localStorage.getItem('globalTraits');
        if (savedTraits) {
            globalTraits = JSON.parse(savedTraits);
            updateTraitsDisplay(globalTraits.summary);
        } else {
            // 如果没有保存的特质，使用模拟数据
            updateTraitsDisplay(getMockTraits());
        }
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
async function sendMessageToAPI(message) {
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
            is_first: isFirstMessage,
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
        // 创建会话数据
        const sessionData = {
            id: currentSessionId,
            title: `[${currentTopicName || '随便聊聊'}] 对话记录`,
            mode: currentMode,
            topic_id: currentTopicId,
            topic: currentTopicName,
            status: 'completed',
            has_report: false,
            trait_summary: globalTraits.summary || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_message: conversationHistory[conversationHistory.length - 1]?.content || '对话记录',
            messages: [...conversationHistory]
        };
        
        // 添加到保存的会话列表
        savedSessions.push(sessionData);
        
        // 保存到本地存储
        localStorage.setItem('savedSessions', JSON.stringify(savedSessions));
        
        // 更新会话列表显示
        updateSessionList(savedSessions);
        
        // 重置未保存更改标志
        hasUnsavedChanges = false;
        
        console.log('会话已保存:', sessionData);
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
    
    // 按创建时间倒序排列
    const sortedSessions = [...sessions].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
    );
    
    sortedSessions.forEach(session => {
        const sessionItem = document.createElement('li');
        sessionItem.className = 'session-item';
        sessionItem.dataset.sessionId = session.id;
        
        const title = session.title || `[${session.topic || '随便聊聊'}] ${session.last_message || '新对话'}`;
        const date = formatDate(session.created_at || session.updated_at);
        
        // 构建标签HTML - 添加特质报告标签
        let tagsHtml = '';
        if (session.has_report) {
            tagsHtml += '<span class="tag">包含观念</span>';
        }
        // 使用 trait_summary 判断是否有特质报告
        if (session.trait_summary && session.trait_summary.trim() !== "") {
            tagsHtml += '<span class="tag" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; margin-left: 0.25rem;">特质报告</span>';
        } else if (session.status === 'in_progress') {
            tagsHtml += '<span class="tag tag-in-progress">进行中</span>';
        }
        
        sessionItem.innerHTML = `
            <div class="session-title">${title}</div>
            <div class="session-meta">
                <span>${date}</span>
                ${tagsHtml}
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
    const traitUpdateIndicator = document.querySelector('.traits-title .update-indicator');
    
    // 处理字符串类型的特质（从后端返回的 trait_summary）
    if (typeof traits === 'string') {
        if (traits && traits.trim() !== "") {
            traitsContent.textContent = traits;
            traitsDetailLink.style.display = 'block';
            
            // 显示红点指示器
            if (traitUpdateIndicator) {
                traitUpdateIndicator.style.display = 'inline-block';
            }
            
            // 更新全局特质
            globalTraits.summary = traits;
            localStorage.setItem('globalTraits', JSON.stringify(globalTraits));
        } else {
            traitsContent.textContent = '你的特质将会在这里显示。';
            traitsDetailLink.style.display = 'none';
            
            // 隐藏红点指示器
            if (traitUpdateIndicator) {
                traitUpdateIndicator.style.display = 'none';
            }
        }
        return;
    }
    
    // 处理对象类型的特质（模拟数据）
    if (traits && traits.summary) {
        traitsContent.textContent = traits.summary;
        traitsDetailLink.style.display = 'block';
        
        // 显示红点指示器
        if (traitUpdateIndicator) {
            traitUpdateIndicator.style.display = 'inline-block';
        }
        
        // 更新全局特质
        globalTraits.summary = traits.summary;
        localStorage.setItem('globalTraits', JSON.stringify(globalTraits));
    } else {
        traitsContent.textContent = '你的特质将会在这里显示。';
        traitsDetailLink.style.display = 'none';
        
        // 隐藏红点指示器
        if (traitUpdateIndicator) {
            traitUpdateIndicator.style.display = 'none';
        }
    }
}

/**
 * 更新特质详情
 */
function updateTraitsDetail(traits) {
    let traitsHTML = '';
    
    // 处理字符串类型的特质（从后端返回的 trait_summary）
    if (typeof traits === 'string') {
        traitsHTML = `<p>${traits}</p>`;
    }
    // 处理对象类型的特质（模拟数据）
    else if (traits && traits.categories && Object.keys(traits.categories).length > 0) {
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
    } else if (traits && traits.detailed) {
        traitsHTML = `<p>${traits.detailed}</p>`;
    } else {
        traitsHTML = '<p>暂无详细的特质分析。</p>';
    }
    
    traitsDetailContent.innerHTML = traitsHTML;
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
    
    // 确保没有残留的特质报告按钮
    removeTraitReportButton();
    
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
    
    // 确保没有残留的特质报告按钮
    removeTraitReportButton();
    
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
    
    // 显示AI思考动画
    showThinkingAnimation();
    
    // 标记有未保存的更改
    hasUnsavedChanges = true;
    
    try {
        // 发送消息到后端API
        await sendMessageToAPI(message);
    } catch (error) {
        console.error('发送消息失败:', error);
        addAIMessage('抱歉，我遇到了一些问题，请稍后再试。');
        sendButton.disabled = false;
        // 隐藏思考动画
        hideThinkingAnimation();
    }
}

/**
 * 处理对话结束事件
 */
function handleEndEvent(event) {    
    // 1. 使用后端完整历史同步前端
    if (event.full_dialogue) {
        conversationHistory = event.full_dialogue.slice(); // 直接覆盖
        displayMessages(conversationHistory);              // 刷新 UI
    }

    // 2. 显示一句话总结（一定有）
    if (event.summary) {
        addAIMessage(event.summary, false, true);
    }

    // 3. 显示观念报告
    if (event.has_opinion_report && event.opinion_report) {
        showReport(event.opinion_report, currentTopicTag);
    }

    // 4. 更新特质显示 - 添加红点逻辑
    if (event.trait_summary) {
        // 更新全局特质
        globalTraits.summary = event.trait_summary;
        
        // 更新特质显示
        updateTraitsDisplay(event.trait_summary);
        
        // 更新当前会话的特质数据
        const currentSession = savedSessions.find(s => s.id === currentSessionId);
        if (currentSession) {
            currentSession.trait_summary = event.trait_summary;
            // 保存更新后的会话
            localStorage.setItem('savedSessions', JSON.stringify(savedSessions));
        }
    }

    // 5. 重置
    hasUnsavedChanges = false;
    
    // 6. 重新加载会话列表以更新标签
    loadSessions();
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

                            if (event.type === "end") {
                                // 隐藏思考动画
                                hideThinkingAnimation();
                                handleEndEvent(event);
                                continue;
                            }
                            
                            // 处理内容更新
                            if (event.content) {
                                // 收到第一个token时隐藏思考动画
                                if (aiMessage === '') {
                                    hideThinkingAnimation();
                                }
                                aiMessage += event.content;
                                messageElement.textContent = aiMessage;
                                chatMessages.scrollTop = chatMessages.scrollHeight;
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
        // 隐藏思考动画
        hideThinkingAnimation();
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
 * 显示AI思考动画
 */
function showThinkingAnimation() {
    // 移除已存在的思考动画
    const existingAnimation = document.querySelector('.thinking-animation');
    if (existingAnimation) {
        existingAnimation.remove();
    }
    
    const thinkingAnimation = document.createElement('div');
    thinkingAnimation.className = 'thinking-animation';
    thinkingAnimation.innerHTML = `
        <span class="thinking-text">AI正在思考</span>
        <div class="thinking-dots">
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
        </div>
    `;
    
    chatMessages.appendChild(thinkingAnimation);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 隐藏AI思考动画
 */
function hideThinkingAnimation() {
    const thinkingAnimation = document.querySelector('.thinking-animation');
    if (thinkingAnimation) {
        thinkingAnimation.remove();
    }
}

/**
 * 移除特质报告按钮
 */
function removeTraitReportButton() {
    const existingButton = document.querySelector('.trait-report-button');
    if (existingButton) {
        existingButton.remove();
    }
}

/**
 * 添加查看报告按钮
 */
function addReportButton() {
    const reportButton = document.createElement('button');
    reportButton.className = 'send-button';
    reportButton.textContent = '查看报告';
    reportButton.style.marginTop = '1rem';
    reportButton.addEventListener('click', () => loadSessionReport(currentSessionId));
    
    const inputArea = document.querySelector('.chat-input-area');
    inputArea.appendChild(reportButton);
}

/**
 * 添加查看特质报告按钮
 */
function addTraitReportButton(session) {
    // 移除已存在的特质报告按钮
    removeTraitReportButton();
    
    const traitReportButton = document.createElement('button');
    traitReportButton.className = 'send-button trait-report-button';
    traitReportButton.textContent = '查看特质报告';
    traitReportButton.style.marginTop = '1rem';
    traitReportButton.style.marginLeft = '0.5rem';
    traitReportButton.style.background = 'rgba(239, 68, 68, 0.8)';
    traitReportButton.addEventListener('click', () => {
        showTraitReport(session.trait_summary, session.topic_tag);
    });
    
    const inputArea = document.querySelector('.chat-input-area');
    inputArea.appendChild(traitReportButton);
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
 * 显示特质报告
 */
function showTraitReport(traitSummary, topicTag) {
    // 更新报告内容
    if (topicTag) {
        reportTitle.textContent = `你的【${topicTag}】特质分析`;
    } else {
        reportTitle.textContent = '你的特质分析';
    }
    reportContent.textContent = traitSummary;
    
    // 显示报告窗口
    reportOverlay.style.display = 'flex';
    
    // 更新状态
    statusContent.innerHTML = topicTag ? `已查看${topicTag}特质报告` : '已查看特质报告';
}

/**
 * 显示特质详情
 */
function showTraitsDetail() {
    // 使用全局特质数据
    const globalTraits = {
        summary: traitsContent.textContent
    };
    
    // 更新特质详情内容
    updateTraitsDetail(globalTraits.summary);
    
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
        
        // 从保存的会话中查找
        const session = savedSessions.find(s => s.id === sessionId);
        if (!session) {
            showError('会话不存在');
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
        
        // 移除已存在的按钮
        const existingButtons = document.querySelectorAll('.send-button:not(#sendButton)');
        existingButtons.forEach(button => button.remove());
        
        // 如果是已完成的会话，显示报告按钮
        if (session.status === 'completed' && session.has_report) {
            addReportButton();
        }
        
        // 如果有特质报告，显示特质报告按钮（只有在已完成的会话中）
        if (session.status === 'completed' && session.trait_summary && session.trait_summary.trim() !== "") {
            addTraitReportButton(session);
        }
        
        // 聚焦输入框
        chatInput.focus();
        
        // 更新特质信息 - 使用 trait_summary
        if (session.trait_summary) {
            updateTraitsDisplay(session.trait_summary);
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

// ==================== 模拟数据（当API不可用时使用） ====================

function getMockTopics() {
    return [
        {
            "id": 1,
            "topic": "友谊",
            "concept_tag": "友谊观"
        },
        {
            "id": 2,
            "topic": "爱情",
            "concept_tag": "爱情观"
        },
        {
            "id": 3,
            "topic": "投资",
            "concept_tag": "投资观"
        },
        {
            "id": 4,
            "topic": "工作",
            "concept_tag": "工作观"
        },
        {
            "id": 5,
            "topic": "消费",
            "concept_tag": "消费观"
        },
        {
            "id": 6,
            "topic": "教育",
            "concept_tag": "教育观"
        }
    ];
}

function getMockSessions() {
    return [
        {
            id: 'session1',
            title: '[工作观] 关于职业发展的讨论',
            mode: 'topic',
            topic_id: 4,
            topic: '工作',
            status: 'completed',
            has_report: true,
            trait_summary: '你的表达习惯结构化且逻辑清晰。你倾向于从价值层面解释行为。',
            created_at: '2023-06-15T10:00:00Z',
            updated_at: '2023-06-15T10:30:00Z',
            last_message: '我觉得工作最重要的是成就感',
            messages: [
                { role: 'user', content: '我觉得工作最重要的是成就感' },
                { role: 'assistant', content: '这是一个很有深度的观点。成就感确实能带来工作的满足感。' }
            ]
        },
        {
            id: 'session2',
            title: '[随便聊聊] 日常对话',
            mode: 'casual',
            status: 'in_progress',
            has_report: false,
            trait_summary: '', // 空字符串表示没有特质报告
            created_at: '2023-06-18T15:30:00Z',
            updated_at: '2023-06-18T15:35:00Z',
            last_message: '今天天气真好',
            messages: [
                { role: 'user', content: '今天天气真好' },
                { role: 'assistant', content: '是的，适合出去走走。' }
            ]
        },
        {
            id: 'session3',
            title: '[友谊观] 什么是真正的朋友',
            mode: 'topic',
            topic_id: 1,
            topic: '友谊',
            status: 'completed',
            has_report: true,
            trait_summary: '你重视信任和真诚，在友谊中追求深层次的情感连接。',
            created_at: '2023-06-20T09:15:00Z',
            updated_at: '2023-06-20T09:45:00Z',
            last_message: '信任是友谊的基础',
            messages: [
                { role: 'user', content: '信任是友谊的基础' },
                { role: 'assistant', content: '非常同意，信任是维持长久友谊的关键因素。' }
            ]
        }
    ];
}

function getMockReport() {
    return {
        content: "根据我们的对话分析，你的工作观强调个人成就感和职业发展。你重视工作的意义而不仅仅是经济回报，这表明你有很强的内在动机。你倾向于在职业中寻找自我实现的机会，这让你在工作中表现出色。",
        topic: "工作"
    };
}

function getMockTraits() {
    return {
        summary: "你的表达习惯结构化且逻辑清晰。你倾向于从价值层面解释行为。",
        categories: {
            "思考模式": [
                {
                    name: "逻辑分析",
                    description: "你倾向于通过逻辑推理和分析来理解问题，喜欢有条理的思考方式。"
                },
                {
                    name: "系统性思维",
                    description: "你习惯从整体角度看待问题，关注各个部分之间的关系和相互作用。"
                }
            ],
            "价值取向": [
                {
                    name: "个人成长",
                    description: "你重视自我发展和学习新知识，认为持续进步是生活的重要部分。"
                },
                {
                    name: "意义追求",
                    description: "你倾向于从价值层面解释行为，关注行动背后的深层意义和目的。"
                }
            ]
        }
    };
}