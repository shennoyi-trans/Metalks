/**
 * 认证 API
 * 对应后端：backend/api/auth_api.py
 */

import { request } from './client.js';

/**
 * 登录（token 通过 HttpOnly Cookie 返回，无需前端处理）
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function login(email, password) {
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            return { success: true, data };
        } else {
            return {
                success: false,
                error: data.detail || data.message || '登录失败',
            };
        }
    } catch (error) {
        return {
            success: false,
            error: '网络连接失败，请检查网络设置',
        };
    }
}

/**
 * 注册（支持可选昵称）
 * @param {string} email
 * @param {string} password
 * @param {string} [nickname]
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function register(email, password, nickname) {
    try {
        const body = { email, password };
        if (nickname) body.nickname = nickname;

        const response = await fetch('/api/auth/register', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (response.ok) {
            return { success: true, data };
        } else {
            return {
                success: false,
                error: data.detail || data.message || '注册失败',
            };
        }
    } catch (error) {
        return {
            success: false,
            error: '网络连接失败，请检查网络设置',
        };
    }
}

/**
 * 登出（删除 HttpOnly Cookie，然后跳转到 auth 页面）
 */
export function logout() {
    fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
    }).finally(() => {
        window.location.href = '/auth';
    });
}

/**
 * 检查当前登录状态
 * 通过请求 traits/global 接口来验证 cookie 是否有效
 * @returns {Promise<boolean>}
 */
export async function checkAuth() {
    try {
        await request('/traits/global');
        return true;
    } catch (error) {
        if (error.status === 401) {
            return false;
        }
        throw error;
    }
}

/**
 * 检查邮箱是否可用
 * @param {string} email
 * @returns {Promise<{available: boolean, message: string}>}
 */
export async function checkEmail(email) {
    return request(`/auth/check-email?email=${encodeURIComponent(email)}`);
}
