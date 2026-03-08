/**
 * 用户搜索工具函数
 * 支持按用户 ID 或昵称搜索，复用于创建话题和话题管理
 */

import api from '../api/index.js';

/**
 * 搜索用户（按 ID 或昵称）
 *
 * @param {string} query - 搜索关键词（ID 或昵称）
 * @param {number} [limit=5] - 最大返回数量
 * @returns {Promise<Array<{id: number, nickname: string}>>}
 */
export async function searchUsers(query, limit = 5) {
    const q = (query || '').trim();
    if (!q) return [];

    try {
        const res = await api.user.searchUser(q, limit);
        return res.users || [];
    } catch (e) {
        console.error('searchUsers error:', e);
        return [];
    }
}

/**
 * 创建防抖搜索函数
 *
 * @param {(results: Array) => void} onResults - 结果回调
 * @param {number} [delay=300] - 防抖延迟（ms）
 * @returns {{ search: (query: string) => void, cancel: () => void }}
 */
export function createDebouncedUserSearch(onResults, delay = 300) {
    let timer = null;

    function search(query) {
        if (timer) clearTimeout(timer);
        const q = (query || '').trim();
        if (!q) {
            onResults([]);
            return;
        }
        timer = setTimeout(async () => {
            const results = await searchUsers(q);
            onResults(results);
        }, delay);
    }

    function cancel() {
        if (timer) clearTimeout(timer);
    }

    return { search, cancel };
}
