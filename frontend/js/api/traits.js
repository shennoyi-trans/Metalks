/**
 * 特质 API
 * 对应后端：backend/api/traits_api.py
 */

import { request } from './client.js';

/**
 * 获取当前用户的全局特质数据
 * @returns {Promise<{summary: string, full_report: string}>}
 */
export async function getGlobal() {
    return request('/traits/global');
}
