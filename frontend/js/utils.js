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

// 扩展原有的MetalksUtils对象
Object.assign(window.MetalksUtils, {
    // API配置 - 根据你的实际后端地址修改
    API_BASE_URL: 'http://localhost:8000', // 修改为你的后端地址
    API_ENDPOINTS: {
        // 认证相关
        AUTH_LOGIN: '/api/auth/login',
        AUTH_REGISTER: '/api/auth/register',
        AUTH_VERIFY: '/api/auth/verify',
        AUTH_LOGOUT: '/api/auth/logout'
    },

    // 登录
    async login(email, password) {
        try {
            const response = await fetch(`${this.API_BASE_URL}${this.API_ENDPOINTS.AUTH_LOGIN}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    email: email, 
                    password: password 
                })
            });

            const data = await response.json();

            if (response.ok && data.access_token) {
                // 存储token和用户信息
                localStorage.setItem('metalks_token', data.access_token);
                localStorage.setItem('metalks_user_email', email);
                
                // 存储用户ID（如果提供）
                if (data.user_id) {
                    localStorage.setItem('metalks_user_id', data.user_id);
                }
                
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

    // 注册
    async register(email, password) {
        try {
            const response = await fetch(`${this.API_BASE_URL}${this.API_ENDPOINTS.AUTH_REGISTER}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    email: email, 
                    password: password 
                })
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

    // 检查登录状态
    async checkAuthStatus() {
        try {
            const token = localStorage.getItem('metalks_token');
            if (!token) {
                return { isLoggedIn: false };
            }
            
            const response = await fetch(`${this.API_BASE_URL}${this.API_ENDPOINTS.AUTH_VERIFY}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return { 
                    isLoggedIn: true, 
                    user: data.user || {},
                    email: localStorage.getItem('metalks_user_email') || data.email
                };
            } else {
                // Token无效，清除
                this.clearAuthData();
                return { isLoggedIn: false };
            }
        } catch (error) {
            console.error('检查登录状态失败:', error);
            return { isLoggedIn: false };
        }
    },

    // 带认证的fetch
    async fetchWithAuth(url, options = {}) {
        const token = localStorage.getItem('metalks_token');
        
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        };

        // 如果有token，添加Authorization头
        if (token) {
            defaultOptions.headers['Authorization'] = `Bearer ${token}`;
        }

        // 合并选项
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };

        const response = await fetch(url, mergedOptions);
        
        // 处理401未授权
        if (response.status === 401) {
            this.clearAuthData();
            
            // 如果chat.js有state对象，更新登录状态
            if (window.chatState) {
                window.chatState.isLoggedIn = false;
            }
            
            throw new Error('登录已过期，请重新登录');
        }

        // 处理其他错误
        if (!response.ok) {
            let errorMessage = `请求失败: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorData.message || errorMessage;
            } catch (e) {
                // 无法解析JSON响应
            }
            throw new Error(errorMessage);
        }

        // 如果是204 No Content，返回空对象
        if (response.status === 204) {
            return {};
        }

        // 解析JSON响应
        try {
            return await response.json();
        } catch (error) {
            throw new Error('响应解析失败');
        }
    },

    // 清除认证数据
    clearAuthData() {
        localStorage.removeItem('metalks_token');
        localStorage.removeItem('metalks_user_email');
        localStorage.removeItem('metalks_user_id');
    },

    // 登出
    logout() {
        // 清除本地存储
        this.clearAuthData();
        
        // 如果chat.js有state对象，重置状态
        if (window.chatState) {
            window.chatState.isLoggedIn = false;
            window.chatState.userEmail = '';
        }
        
        // 刷新页面或跳转到登录页
        setTimeout(() => {
            window.location.href = '/auth.html';
        }, 500);
    },

    // 获取当前用户信息
    getCurrentUser() {
        return {
            email: localStorage.getItem('metalks_user_email'),
            id: localStorage.getItem('metalks_user_id'),
            token: localStorage.getItem('metalks_token')
        };
    },

    // 检查是否已登录
    isLoggedIn() {
        return !!localStorage.getItem('metalks_token');
    }
});
