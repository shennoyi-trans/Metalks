/**
 * 会话 API
 * 对应后端：backend/api/session_api.py
 */

import { request } from './client.js';

/**
 * 获取当前用户的全部会话列表
 * @returns {Promise<Array>}
 */
export async function list() {
    return request('/sessions');
}

/**
 * 获取某个会话的完整内容（含 messages）
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function detail(sessionId) {
    return request(`/sessions/${sessionId}`);
}

/**
 * 手动标记会话完成（用户点击"结束对话"）
 * @param {string} sessionId
 * @returns {Promise<{status: string, session_id: string}>}
 */
export async function complete(sessionId) {
    return request(`/sessions/${sessionId}/complete`, {
        method: 'POST',
    });
}

/**
 * 软删除会话
 * @param {string} sessionId
 * @returns {Promise<{status: string, session_id: string}>}
 */
export async function remove(sessionId) {
    return request(`/sessions/${sessionId}`, {
        method: 'DELETE',
    });
}

/**
 * 查询报告状态
 * @param {string} sessionId
 * @returns {Promise<{ready: boolean, session_id: string}>}
 */
export async function reportStatus(sessionId) {
    return request(`/sessions/${sessionId}/report_status`);
}

/**
 * 获取完整报告
 * @param {string} sessionId
 * @returns {Promise<{report: string, ready: boolean, session_id: string}>}
 */
export async function report(sessionId) {
    return request(`/sessions/${sessionId}/report`);
}
