/**
 * 聊天 API
 * 对应后端：backend/api/chat_api.py
 *
 * 核心：stream() 完整封装 SSE 流式请求，页面只需传入回调即可。
 */

import { request, API_BASE } from './client.js';

/**
 * @typedef {object} StreamPayload
 * @property {1|2} mode          - 1=话题, 2=漫游
 * @property {string} session_id
 * @property {string} message
 * @property {number} [topic_id]
 * @property {boolean} is_first
 */

/**
 * @typedef {object} StreamCallbacks
 * @property {(text: string) => void} onChunk         - 收到文本增量
 * @property {(event: object) => void} onEnd          - 收到 end 事件（含 trait_summary 等）
 * @property {(code: string, msg: string) => void} onError - 收到 error 事件
 * @property {() => void} onQuit                      - 收到 user_want_quit 事件
 * @property {() => void} [onEmptyStream]              - 流结束但未收到任何内容（兜底）
 */

/**
 * 发起流式聊天请求
 *
 * @param {StreamPayload} payload - 请求体
 * @param {StreamCallbacks} callbacks - 回调函数集
 * @param {AbortSignal} [signal] - 用于中断请求的 AbortSignal
 * @returns {Promise<string>} 完整的 AI 回复文本（用于存入 conversationHistory）
 */
export async function stream(payload, callbacks, signal) {
    const {
        onChunk = () => {},
        onEnd = () => {},
        onError = () => {},
        onQuit = () => {},
        onEmptyStream = () => {},
    } = callbacks;

    // 1. 发起请求，拿到原始 Response
    const response = await request('/chat/stream', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
        raw: true,  // 不自动解析 JSON
    });

    // 2. 读取 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = '';
    let buffer = '';
    let hasContent = false;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop(); // 保留未完成的行

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;

                const jsonStr = trimmed.slice(6);
                if (jsonStr === '[DONE]') break;

                let event;
                try {
                    event = JSON.parse(jsonStr);
                } catch (e) {
                    console.warn('[SSE] JSON parse error:', e);
                    continue;
                }

                // ---- 按 event.type 分发 ----

                if (event.type === 'error') {
                    onError(event.error_code || 'UNKNOWN', event.content || '未知错误');
                    return fullContent;
                }

                if (event.type === 'user_want_quit') {
                    onQuit();
                    continue;
                }

                if (event.type === 'end') {
                    onEnd(event);
                    continue;
                }

                // 普通文本增量
                if (event.content) {
                    hasContent = true;
                    fullContent += event.content;
                    onChunk(event.content);
                }
            }
        }

        // 3. 兜底：空流检测
        if (!hasContent) {
            onEmptyStream();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            // 用户主动中断，不抛出
            return fullContent;
        }
        throw error;
    }

    return fullContent;
}
