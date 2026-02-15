/**
 * API 基础请求客户端
 * 封装 fetchWithAuth、API 基础 URL 等底层通信逻辑
 */

const API_BASE = '/api';

/**
 * 带认证的 fetch 请求
 * - 自动附加 credentials: 'include'（HttpOnly Cookie）
 * - 自动处理 401 跳转
 * - 自动解析 JSON（非流式请求）
 *
 * @param {string} path  - API 路径，如 '/sessions' 或 '/chat/stream'
 * @param {object} options - fetch 选项
 * @param {boolean} options.raw - 如果为 true，返回原始 Response（用于流式请求）
 * @returns {Promise<any>} JSON 数据或原始 Response
 */
export async function request(path, options = {}) {
    const { raw = false, ...fetchOpts } = options;

    const url = `${API_BASE}${path}`;

    const finalOptions = {
        method: fetchOpts.method || 'GET',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(fetchOpts.headers || {}),
        },
        body: fetchOpts.body,
        signal: fetchOpts.signal,
    };

    const response = await fetch(url, finalOptions);

    // 401 → 未登录
    if (response.status === 401) {
        const error = new Error('未登录或会话过期');
        error.status = 401;
        throw error;
    }

    // 非 2xx
    if (!response.ok) {
        let errorText = response.statusText;
        try {
            const errJson = await response.json();
            errorText = errJson.detail || JSON.stringify(errJson);
        } catch (_) { /* ignore */ }
        const error = new Error(`HTTP Error ${response.status}: ${errorText}`);
        error.status = response.status;
        throw error;
    }

    // 流式请求返回原始 Response
    if (raw) return response;

    // 普通请求返回 JSON
    return response.json();
}

export { API_BASE };
