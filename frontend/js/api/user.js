/**
 * 用户 API
 * 对应后端：backend/api/user_api.py
 */

import { request } from './client.js';

/**
 * 获取当前用户信息
 * @returns {Promise<object>}
 */
export async function getProfile() {
    return request('/user/profile');
}

/**
 * 修改用户基本信息
 * @param {object} data - { email?, phone_number? }
 * @returns {Promise<object>}
 */
export async function updateProfile(data) {
    return request('/user/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * 修改密码
 * @param {string} oldPassword
 * @param {string} newPassword
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function changePassword(oldPassword, newPassword) {
    return request('/user/password', {
        method: 'PUT',
        body: JSON.stringify({
            old_password: oldPassword,
            new_password: newPassword,
        }),
    });
}

/**
 * 检查昵称是否可用
 * @param {string} nickname
 * @returns {Promise<{available: boolean, message: string}>}
 */
export async function checkNickname(nickname) {
    return request(`/user/nickname/check?nickname=${encodeURIComponent(nickname)}`);
}

/**
 * 修改昵称（消耗电解液）
 * @param {string} newNickname
 * @returns {Promise<object>}
 */
export async function changeNickname(newNickname) {
    return request('/user/nickname', {
        method: 'PUT',
        body: JSON.stringify({ new_nickname: newNickname }),
    });
}

/**
 * 查询昵称修改历史
 * @param {number} [limit=10]
 * @param {number} [offset=0]
 * @returns {Promise<object>}
 */
export async function nicknameHistory(limit = 10, offset = 0) {
    return request(`/user/nickname/history?limit=${limit}&offset=${offset}`);
}

/**
 * 查询电解液余额
 * @returns {Promise<{balance: number, message: string}>}
 */
export async function getElectrolyte() {
    return request('/user/electrolyte');
}
