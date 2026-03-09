/**
 * Metalks — 应用主入口
 */

import api from './api/index.js';

// Stores
import { toastState } from './stores/toast.js';

// Components
import { ToastContainer } from './components/ToastContainer.js';
import { AppLayout } from './components/AppLayout.js';

// Pages
import { AuthPage }        from './pages/AuthPage.js';
import { HomePage }         from './pages/HomePage.js';
import { TopicDetailPage }  from './pages/TopicDetailPage.js';
import { ChatPage }         from './pages/ChatPage.js';
import { ReportPage }       from './pages/ReportPage.js';
import { TraitsPage }       from './pages/TraitsPage.js';
import { ProfilePage }      from './pages/ProfilePage.js';
import { SessionsPage }     from './pages/SessionsPage.js';
import { TopicCreatePage }  from './pages/TopicCreatePage.js';
import { MyTopicsPage }     from './pages/MyTopicsPage.js';
import { TopicReviewPage }  from './pages/TopicReviewPage.js';
import { TopicManagePage }  from './pages/TopicManagePage.js';

// ============================================================
// Vue Router
// ============================================================
const { createApp } = Vue;
const { createRouter, createWebHistory } = VueRouter;

const routes = [
  { path: '/auth',                component: AuthPage,        meta: { public: true } },
  { path: '/',                    component: HomePage },
  { path: '/topic/create',       component: TopicCreatePage },
  { path: '/topic/mine',         component: MyTopicsPage },
  { path: '/topic/review',       component: TopicReviewPage },
  { path: '/topic/manage',       component: TopicManagePage },
  { path: '/topic/:id',          component: TopicDetailPage },
  { path: '/chat/:sessionId',    component: ChatPage },
  { path: '/session/:id/report', component: ReportPage },
  { path: '/sessions',           component: SessionsPage },
  { path: '/traits',             component: TraitsPage },
  { path: '/me',                 component: ProfilePage },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫：未登录重定向到 /auth
router.beforeEach(async (to, from, next) => {
  if (to.meta.public) return next();
  try {
    const ok = await api.auth.checkAuth();
    if (ok) return next();
    return next('/auth');
  } catch (e) {
    return next('/auth');
  }
});

// ============================================================
// Create & Mount App
// ============================================================
const app = createApp(AppLayout);
app.component('toast-container', ToastContainer);
app.use(router);
app.mount('#app');
