/**
 * 话题 API
 * 对应后端：backend/api/topic_api.py
 *
 * 完整覆盖接口：
 *  1.  create              - 创建话题
 *  2.  detail              - 获取话题详情
 *  3.  update              - 编辑话题
 *  4.  list                - 获取话题列表（分页/筛选/排序）
 *  5.  myList              - 获取我的话题
 *  6.  search              - 搜索话题
 *  7.  recommended         - 获取推荐话题
 *  8.  allTags             - 获取所有标签
 *  8a. searchTags          - 搜索标签
 *  8b. createTag           - 创建标签
 *  9.  review              - 审核话题（管理员）
 *  10. deactivate          - 下架话题
 *  11. remove              - 删除话题（硬删除）
 *  12. toggleLike          - 点赞/取消点赞
 *  13. donate              - 投喂电解液
 *  14. checkSensitive      - 敏感词预检
 *  15. getNotifications    - 话题状态通知
 *  16. dismissNotification - 逐条消除某话题的通知
 */

import { request } from './client.js';

// ============================================================
// 1. 创建话题
// ============================================================

/**
 * 创建话题
 * @param {object} data
 * @param {string} data.title       - 话题标题
 * @param {string} data.content     - 话题内容
 * @param {string} data.prompt      - 对话提示词
 * @param {number[]} data.tag_ids   - 标签ID列表
 * @param {Array<{user_id: number, share: number}>} [data.coauthors] - 共同作者
 * @returns {Promise<{success: boolean, message: string, topic: object}>}
 */
export async function create(data) {
    return request('/topics', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

// ============================================================
// 2. 获取话题详情
// ============================================================

/**
 * 获取话题详情
 * @param {number} topicId
 * @returns {Promise<object>} 话题完整信息（含 authors, tags, has_liked 等）
 */
export async function detail(topicId) {
    return request(`/topics/${topicId}`);
}

// ============================================================
// 3. 编辑话题
// ============================================================

/**
 * 编辑话题（编辑后 status 重置为 pending）
 * @param {number} topicId
 * @param {object} data
 * @param {string}   [data.title]
 * @param {string}   [data.content]
 * @param {string}   [data.prompt]
 * @param {number[]} [data.tag_ids]
 * @returns {Promise<{success: boolean, message: string, topic: object}>}
 */
export async function update(topicId, data) {
    return request(`/topics/${topicId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

// ============================================================
// 4. 获取话题列表（支持分页、筛选、排序）
// ============================================================

/**
 * 获取话题列表
 * @param {object} [params]
 * @param {number}  [params.skip=0]
 * @param {number}  [params.limit=20]
 * @param {string}  [params.status]       - pending | approved | rejected
 * @param {boolean} [params.is_active]
 * @param {boolean} [params.is_official]
 * @param {number}  [params.tag_id]
 * @param {string}  [params.search]
 * @param {string}  [params.sort_by]      - created_at | likes_count | electrolyte_received
 * @param {string}  [params.order]        - asc | desc
 * @returns {Promise<{topics: Array, total: number, skip: number, limit: number}>}
 */
export async function list(params = {}) {
    const query = buildQuery(params);
    return request(`/topics${query}`);
}

// ============================================================
// 5. 获取我的话题
// ============================================================

/**
 * 获取当前用户创建/参与的话题
 * @param {number} [skip=0]
 * @param {number} [limit=20]
 * @returns {Promise<{topics: Array, total: number}>}
 */
export async function myList(skip = 0, limit = 20) {
    return request(`/topics/my/list?skip=${skip}&limit=${limit}`);
}

// ============================================================
// 6. 搜索话题
// ============================================================

/**
 * 搜索话题（仅返回已审核且启用的）
 * @param {string} keyword - 搜索关键词
 * @param {number} [limit=10]
 * @returns {Promise<{topics: Array, query: string}>}
 */
export async function search(keyword, limit = 10) {
    return request(`/topics/search?q=${encodeURIComponent(keyword)}&limit=${limit}`);
}

// ============================================================
// 7. 获取推荐话题
// ============================================================

/**
 * 获取推荐话题列表
 * @param {number} [limit=6]
 * @returns {Promise<{topics: Array}>}
 */
export async function recommended(limit = 6) {
    return request(`/topics/recommended?limit=${limit}`);
}

// ============================================================
// 8. 获取所有标签
// ============================================================

/**
 * 获取所有标签
 * @returns {Promise<{tags: Array<{id: number, name: string, slug: string, description: string}>}>}
 */
export async function allTags() {
    return request('/topics/tags/all');
}

// ============================================================
// 8a. 搜索标签
// ============================================================

/**
 * 搜索标签（按名称模糊匹配）
 * @param {string} keyword - 搜索关键词
 * @param {number} [limit=20]
 * @returns {Promise<{tags: Array<{id: number, name: string, slug: string, description: string}>, query: string}>}
 */
export async function searchTags(keyword, limit = 20) {
    return request(`/topics/tags/search?q=${encodeURIComponent(keyword)}&limit=${limit}`);
}

// ============================================================
// 8b. 创建标签
// ============================================================

/**
 * 创建新标签
 * @param {object} data
 * @param {string} data.name        - 标签名称
 * @param {string} [data.description] - 标签描述
 * @returns {Promise<{success: boolean, message: string, tag: {id: number, name: string, slug: string, description: string}}>}
 */
export async function createTag(data) {
    return request('/topics/tags', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

// ============================================================
// 9. 审核话题（管理员）
// ============================================================

/**
 * 审核话题
 * @param {number} topicId
 * @param {string} action - "approve" 或 "reject"
 * @returns {Promise<{success: boolean, message: string, topic: object}>}
 */
export async function review(topicId, action) {
    return request(`/topics/${topicId}/review`, {
        method: 'POST',
        body: JSON.stringify({ action }),
    });
}

// ============================================================
// 10. 下架话题
// ============================================================

/**
 * 下架话题（主要作者或管理员均可操作）
 * @param {number} topicId
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function deactivate(topicId) {
    return request(`/topics/${topicId}/deactivate`, {
        method: 'POST',
    });
}

// ============================================================
// 11. 删除话题（硬删除）
// ============================================================

/**
 * 永久删除话题（仅主要作者可操作，不可恢复）
 * @param {number} topicId
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function remove(topicId) {
    return request(`/topics/${topicId}`, {
        method: 'DELETE',
    });
}

// ============================================================
// 12. 点赞/取消点赞
// ============================================================

/**
 * 切换点赞状态
 * @param {number} topicId
 * @returns {Promise<{success: boolean, liked: boolean, likes_count: number}>}
 */
export async function toggleLike(topicId) {
    return request(`/topics/${topicId}/like`, {
        method: 'POST',
    });
}

// ============================================================
// 13. 投喂电解液
// ============================================================

/**
 * 投喂电解液给话题
 * @param {number} topicId
 * @param {number} amount - 投喂数量（必须 > 0）
 * @returns {Promise<{success: boolean, message: string, electrolyte_received: number, user_balance: number, distribution: Array}>}
 */
export async function donate(topicId, amount) {
    return request(`/topics/${topicId}/donate`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
    });
}

// ============================================================
// 14. 敏感词预检
// ============================================================

/**
 * 检查文本是否包含敏感词（创建/编辑话题前调用）
 * @param {object} data
 * @param {string} data.title
 * @param {string} data.content
 * @param {string} data.prompt
 * @returns {Promise<{has_sensitive: boolean, matches: Array<{word: string, field: string, positions: Array}>}>}
 */
export async function checkSensitive(data) {
    return request('/topics/check-sensitive', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

// ============================================================
// 15. 话题状态通知
// ============================================================

/**
 * 获取当前用户的话题通知（从 notifications 表查询）
 * 有记录 → has_updates=true → 红点亮
 * @returns {Promise<{has_updates: boolean, notifications: Array}>}
 */
export async function getNotifications() {
    return request('/topics/my/notifications');
}

// ============================================================
// 16. 逐条消除某话题的通知
// ============================================================

/**
 * 删除当前用户在指定话题下的所有通知
 * 用户查看/编辑某话题时调用，该话题红点消失，其余不受影响
 * @param {number} topicId
 * @returns {Promise<{success: boolean, deleted: number}>}
 */
export async function dismissNotification(topicId) {
    return request(`/topics/my/notifications/${topicId}`, {
        method: 'DELETE',
    });
}

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 将参数对象转为 URL query string
 * 自动跳过值为 undefined / null / '' 的字段
 * @param {object} params
 * @returns {string} 如 '?skip=0&limit=20&status=approved'，无参数时返回 ''
 */
function buildQuery(params) {
    const pairs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return pairs.length ? `?${pairs.join('&')}` : '';
}
