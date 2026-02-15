/**
 * 话题 API
 * 对应后端：backend/api/topic_api.py
 */

import { request } from './client.js';

/**
 * 获取推荐话题列表
 * @param {number} [limit=6]
 * @returns {Promise<object>}
 */
export async function recommended(limit = 6) {
    return request(`/topics/recommended?limit=${limit}`);
}

/**
 * 获取所有话题列表
 * @returns {Promise<Array>}
 */
export async function list() {
    return request('/topics');
}

/**
 * 获取所有标签
 * @returns {Promise<{tags: Array}>}
 */
export async function allTags() {
    return request('/topics/tags/all');
}
