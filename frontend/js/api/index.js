/**
 * API 统一导出
 *
 * 使用方式:
 *   import api from './api/index.js';
 *   const sessions = await api.sessions.list();
 *   const result  = await api.auth.login(email, pw);
 *   await api.chat.stream(payload, callbacks, signal);
 */

import * as auth     from './auth.js';
import * as chat     from './chat.js';
import * as sessions from './sessions.js';
import * as topics   from './topics.js';
import * as traits   from './traits.js';
import * as user     from './user.js';

export default {
    auth,
    chat,
    sessions,
    topics,
    traits,
    user,
};

// 也允许按模块解构导入
export { auth, chat, sessions, topics, traits, user };
