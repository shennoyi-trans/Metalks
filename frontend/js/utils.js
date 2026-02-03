// ==================== API配置 ====================
const API_BASE_URL = '/api';

const API_ENDPOINTS = {
    CHAT_STREAM: '/chat/stream',
    TOPICS_RANDOM: '/topics/random',
    SESSION_LIST: '/sessions',
    SESSION_DETAIL: '/sessions',
    SESSION_COMPLETE: '/sessions',
    SESSION_DELETE: '/sessions',
    REPORT_STATUS: '/sessions',
    REPORT_GET: '/sessions',
    TRAITS_GLOBAL: '/traits/global',
    AUTH_LOGIN: '/auth/login',
    AUTH_REGISTER: '/auth/register'
};

// ==================== 工具函数 ====================

/**
 * 带认证的fetch请求
 */
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
            } catch (e) { /* ignore */ }
            
            throw new Error(`HTTP Error ${response.status}: ${errorText}`);
        }

        if (url.includes('/chat/stream')) {
            return response;
        }

        return response.json();
    } catch (err) {
        console.error("Fetch Error:", err);
        throw err;
    }
}

/**
 * 格式化日期
 */
function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${date.getFullYear()}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * 生成UUID
 */
function generateUUID() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
}

/**
 * 显示/隐藏模态框
 */
function showModal(modal) { 
    modal.classList.add('active'); 
    modal.style.visibility = 'visible'; 
}

function hideModal(modal) { 
    modal.classList.remove('active'); 
    setTimeout(() => modal.style.visibility = 'hidden', 300); 
}

/**
 * Toast 提示
 */
let toastInstance = null;
let toastTimer = null;
let toastHighlightCount = 0;

function showToast(message, highlight = false) {
    if (!toastInstance) {
        toastInstance = document.createElement('div');
        toastInstance.className = 'toast';
        document.body.appendChild(toastInstance);
    }

    // 清除之前的定时器
    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    // 如果已经在显示且要求高亮
    if (toastInstance.classList.contains('show') && highlight) {
        toastHighlightCount++;
        toastInstance.classList.add('highlight');
        setTimeout(() => {
            toastInstance.classList.remove('highlight');
        }, 300);
    } else {
        toastHighlightCount = 0;
    }

    toastInstance.textContent = message;
    toastInstance.classList.add('show');

    toastTimer = setTimeout(() => {
        toastInstance.classList.remove('show');
        toastHighlightCount = 0;
    }, 3000);
}

/**
 * 检查登录状态
 */
async function checkAuth() {
    try {
        await fetchWithAuth(`${API_BASE_URL}${API_ENDPOINTS.TRAITS_GLOBAL}`);
        return true;
    } catch (error) {
        if (error.status === 401) {
            return false;
        }
        throw error;
    }
}

/**
 * 登出
 */
function logout() {
    // 清除cookie（通过设置过期时间为过去）
    document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    window.location.href = '/chat.html';
}

// 导出到全局作用域
window.MetalksUtils = {
    API_BASE_URL,
    API_ENDPOINTS,
    fetchWithAuth,
    formatDate,
    generateUUID,
    showModal,
    hideModal,
    showToast,
    checkAuth,
    logout
};
// utils.js - 添加认证相关函数

// 认证相关函数
window.MetalksUtils = window.MetalksUtils || {};

// 补充原来缺少的 AUTH_LOGOUT 端点
window.MetalksUtils.API_ENDPOINTS.AUTH_LOGOUT = '/auth/logout';

Object.assign(window.MetalksUtils, {

    // 登录（token 通过 HttpOnly Cookie 返回，无需手动存储）
    async login(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',   // 确保接收 Set-Cookie
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // ✅ token 已经由服务端通过 Set-Cookie 设置到浏览器，无需前端处理
                return { success: true, data };
            } else {
                return {
                    success: false,
                    error: data.detail || data.message || '登录失败'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: '网络连接失败，请检查网络设置'
            };
        }
    },

    // 注册（支持可选昵称）
    async register(email, password, nickname) {
        try {
            const body = { email, password };
            if (nickname) body.nickname = nickname;   // ✅ 正确传递 nickname

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (response.ok) {
                return { success: true, data };
            } else {
                return {
                    success: false,
                    error: data.detail || data.message || '注册失败'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: '网络连接失败，请检查网络设置'
            };
        }
    },

    // 登出（调用后端接口删除 HttpOnly Cookie）
    logout() {
        fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        }).finally(() => {
            window.location.href = '/auth';
        });
    }
});