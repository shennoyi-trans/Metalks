/**
 * AppLayout — 全局布局（含导航栏 + router-view）
 * v2: 压缩导航栏、丝滑过渡、审核入口、特质画像图标
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
        <div class="nav-links">
          <router-link v-if="user.isAdmin" to="/topic/review" class="nav-link nav-link--review" active-class="active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            话题审核
          </router-link>
          <router-link to="/" class="nav-link" active-class="active" exact>话题广场</router-link>
          <a class="nav-link" @click="startFreeChat" style="cursor:pointer">开始探索</a>
          <a class="nav-link nav-link--disabled" style="cursor:default;opacity:0.4">实验功能</a>
        </div>
        <div class="nav-right">
          <span class="electrolyte-badge">⚡ {{ user.electrolyteBalance }}</span>
          <button class="traits-shortcut" @click="go('/traits')" title="特质画像">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20"/>
              <path d="M2 12h20"/>
            </svg>
          </button>
          <div style="position:relative">
            <button class="user-menu-trigger" @click.stop="showMenu=!showMenu">
              <span class="user-avatar">{{ (user.nickname||'U')[0] }}</span>
            </button>
            <div v-if="showMenu" class="dropdown-menu">
              <div class="dropdown-user-info">
                <span class="user-avatar" style="width:28px;height:28px;font-size:12px">{{ (user.nickname||'U')[0] }}</span>
                <span>{{ user.nickname }}</span>
              </div>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" @click="go('/me')">个人中心</button>
              <button class="dropdown-item" @click="go('/topic/mine')">我的话题</button>
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
    const chatTitle = computed(() => {
      const name = route.query.topicName;
      if (name) return decodeURIComponent(name);
      return '';
    });
    const chatCompleted = ref(false);

    // Watch route changes to trigger navbar animation
    watch(() => route.path, (newPath, oldPath) => {
      if (newPath.startsWith('/chat/')) {
        // Small delay so the page mounts first, then animate
        nextTick(() => {
          setTimeout(() => { navHidden.value = true; }, 50);
        });
      } else {
        navHidden.value = false;
      }
      chatCompleted.value = false;
    }, { immediate: true });

    function go(path) { showMenu.value = false; router.push(path); }
    function goHome() {
      window.location.href = 'https://www.metalks.me';
    }
    function startFreeChat() {
      const id = uuid();
      router.push(`/chat/${id}?mode=2`);
    }
    function endChatFromNav() {
      window.dispatchEvent(new CustomEvent('force-end-chat'));
    }
    function doLogout() {
      showMenu.value = false;
      api.auth.logout();
    }

    // 监听对话完成状态
    function onChatCompleted() { chatCompleted.value = true; }
    function onChatStarted() { chatCompleted.value = false; }

    // 点击外部关闭菜单
    function closeMenu() {
      if (showMenu.value) showMenu.value = false;
    }

    onMounted(() => {
      document.addEventListener('click', closeMenu);
      window.addEventListener('chat-completed', onChatCompleted);
      window.addEventListener('chat-started', onChatStarted);
      user.fetchProfile();
    });
    onUnmounted(() => {
      document.removeEventListener('click', closeMenu);
      window.removeEventListener('chat-completed', onChatCompleted);
      window.removeEventListener('chat-started', onChatStarted);
    });

    return {
      user, api, showNavbar, isChatPage, chatTitle, chatCompleted,
      showMenu, navHidden, go, goHome, startFreeChat, endChatFromNav, doLogout,
    };
  }
};
