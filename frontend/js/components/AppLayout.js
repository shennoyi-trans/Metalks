/**
 * AppLayout — 全局布局（含导航栏 + router-view）
 * ✅ v1.7: 修复通知红点方法名
 */

import api from '../api/index.js';
import { useUser } from '../stores/user.js';
import { uuid } from '../utils/uuid.js';

const { ref, computed, watch, onMounted, onUnmounted, nextTick } = Vue;
const { useRouter, useRoute } = VueRouter;

export const AppLayout = {
  template: `
    <div class="app-root" :class="{ 'in-chat': isChatPage, 'nav-hidden': navHidden }">
      <!-- 主导航栏 -->
      <nav v-if="showNavbar" class="navbar" :class="{ 'navbar--slide-up': navHidden }">
        <a class="brand" href="https://www.metalks.me" @click.prevent="goHome">Metalks</a>
        <div class="nav-links" :style="user.isAdmin ? 'flex:1;justify-content:center' : ''">
          <router-link v-if="user.isAdmin" to="/topic/review" class="nav-link nav-link--review" active-class="active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            话题审核
          </router-link>
          <router-link v-if="user.isAdmin" to="/topic/manage" class="nav-link nav-link--manage" active-class="active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            话题管理
          </router-link>
          <router-link to="/" class="nav-link" active-class="active" exact>话题广场</router-link>
          <a class="nav-link" @click="startFreeChat" style="cursor:pointer">开始探索</a>
          <a class="nav-link nav-link--disabled" style="cursor:default;opacity:0.4">实验功能</a>
        </div>
        <div class="nav-right">
          <span class="electrolyte-badge">⚡ {{ user.electrolyteBalance }}</span>
          <button class="traits-shortcut" @click="go('/traits')" title="特质画像">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.2 4.3-2.5 5.5-.8.8-1.5 1.8-1.5 3v.5h-6V17.5c0-1.2-.7-2.2-1.5-3C6.2 13.3 5 11.5 5 9a7 7 0 0 1 7-7z"/>
              <line x1="9" y1="21" x2="15" y2="21"/>
              <line x1="10" y1="24" x2="14" y2="24"/>
              <path d="M12 2v4"/>
              <path d="M8.5 6.5l1.5 2"/>
              <path d="M15.5 6.5l-1.5 2"/>
            </svg>
          </button>
          <div style="position:relative">
            <button class="user-menu-trigger" @click.stop="showMenu=!showMenu">
              <span class="user-avatar">{{ (user.nickname||'U')[0] }}</span>
              <span v-if="user.hasTopicUpdates" class="notification-dot notification-dot--avatar"></span>
            </button>
            <div v-if="showMenu" class="dropdown-menu">
              <div class="dropdown-user-info">
                <span class="user-avatar" style="width:28px;height:28px;font-size:12px">{{ (user.nickname||'U')[0] }}</span>
                <span>{{ user.nickname }}</span>
              </div>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" @click="go('/me')">个人中心</button>
              <button class="dropdown-item" @click="goMyTopics" style="position:relative">
                我的话题
                <span v-if="user.hasTopicUpdates" class="notification-dot notification-dot--menu"></span>
              </button>
              <button class="dropdown-item" @click="go('/sessions')">我的对话</button>
              <button class="dropdown-item danger" @click="doLogout">退出登录</button>
            </div>
          </div>
        </div>
      </nav>

      <!-- 对话页顶部操作栏（浮在聊天上方，透明渐隐背景） -->
      <div v-if="isChatPage" class="chat-topbar" :class="{ 'chat-topbar--visible': navHidden }">
        <button class="chat-topbar-btn" @click="$router.back()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <span class="chat-topbar-title">{{ chatTitle }}</span>
        <button v-if="!chatCompleted" class="btn-end-chat" @click="endChatFromNav">结束对话</button>
        <span v-else style="width:72px"></span>
      </div>

      <router-view :key="$route.fullPath"></router-view>
      <toast-container></toast-container>
    </div>
  `,

  setup() {
    const route = useRoute();
    const router = useRouter();
    const user = useUser();
    const showMenu = ref(false);
    const navHidden = ref(false);

    const showNavbar = computed(() => {
      if (route.path === '/auth') return false;
      if (route.path === '/traits') return false;
      return true;
    });
    const isChatPage = computed(() => route.path.startsWith('/chat/'));

    const chatTitle = ref('');
    const chatCompleted = ref(false);

    function goHome() { router.push('/'); }
    function go(path) { showMenu.value = false; router.push(path); }

    // ✅ v1.7：使用更新后的方法名
    function goMyTopics() {
      showMenu.value = false;
      user.markTopicNotificationsRead();
      router.push('/topic/mine');
    }

    async function doLogout() {
      showMenu.value = false;
      try { await api.auth.logout(); } catch (e) {}
      user.clear();
      router.push('/auth');
    }

    function startFreeChat() {
      const sessionId = uuid();
      router.push(`/chat/${sessionId}?mode=2&first=true`);
    }

    function endChatFromNav() {
      window.dispatchEvent(new CustomEvent('force-end-chat'));
    }

    // 监听对话状态
    function onChatStarted() { chatCompleted.value = false; }
    function onChatCompleted() { chatCompleted.value = true; }

    // 监听路由变化来更新 chatTitle
    watch(() => route.query, (q) => {
      if (q.topicName) chatTitle.value = decodeURIComponent(q.topicName);
      else if (q.mode === '2') chatTitle.value = '随便聊聊';
      else chatTitle.value = '';
    }, { immediate: true });

    // 导航栏隐藏逻辑（对话页滚动时）
    let lastScrollY = 0;
    function onScroll() {
      if (!isChatPage.value) return;
      const y = window.scrollY;
      navHidden.value = y > 60;
      lastScrollY = y;
    }

    // 点击外部关闭菜单
    function onClickOutside(e) {
      if (showMenu.value && !e.target.closest('.user-menu-trigger') && !e.target.closest('.dropdown-menu')) {
        showMenu.value = false;
      }
    }

    onMounted(async () => {
      window.addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('click', onClickOutside);
      window.addEventListener('chat-started', onChatStarted);
      window.addEventListener('chat-completed', onChatCompleted);
      await user.fetchProfile();
    });

    onUnmounted(() => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClickOutside);
      window.removeEventListener('chat-started', onChatStarted);
      window.removeEventListener('chat-completed', onChatCompleted);
    });

    return {
      user, showMenu, navHidden, showNavbar, isChatPage,
      chatTitle, chatCompleted,
      goHome, go, goMyTopics, doLogout, startFreeChat, endChatFromNav,
    };
  }
};
