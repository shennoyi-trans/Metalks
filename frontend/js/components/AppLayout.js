/**
 * AppLayout — 全局布局（含导航栏 + router-view）
 */

import api from '../api/index.js';
import { useUser } from '../stores/user.js';
import { uuid } from '../utils/uuid.js';

const { ref, computed, onMounted, onUnmounted } = Vue;
const { useRouter, useRoute } = VueRouter;

export const AppLayout = {
  template: `
    <div>
      <!-- 普通导航栏 -->
      <nav v-if="showNavbar && !isChatPage" class="navbar">
        <div class="brand" @click="$router.push('/')" style="cursor:pointer">Metalks</div>
        <div class="nav-links">
          <router-link to="/" class="nav-link" active-class="active" exact>话题广场</router-link>
          <a class="nav-link" @click="startFreeChat" style="cursor:pointer">随便聊聊</a>
          <router-link to="/topic/create" class="nav-link" active-class="active">创建话题</router-link>
        </div>
        <div class="nav-right">
          <span class="electrolyte-badge">⚡ {{ user.electrolyteBalance }}</span>
          <div style="position:relative">
            <button class="user-menu-trigger" @click.stop="showMenu=!showMenu">
              <span class="user-avatar">{{ (user.nickname||'U')[0] }}</span>
              {{ user.nickname }}
            </button>
            <div v-if="showMenu" class="dropdown-menu">
              <button class="dropdown-item" @click="go('/me')">个人中心</button>
              <button class="dropdown-item" @click="go('/topic/mine')">我的话题</button>
              <button class="dropdown-item" @click="go('/sessions')">我的对话</button>
              <button class="dropdown-item" @click="go('/traits')">特质画像</button>
              <button class="dropdown-item danger" @click="api.auth.logout()">退出登录</button>
            </div>
          </div>
        </div>
      </nav>

      <!-- 对话页极简导航 -->
      <nav v-if="showNavbar && isChatPage" class="navbar navbar-chat">
        <div class="chat-nav-left" @click="$router.back()">← 返回</div>
        <span class="chat-title">{{ chatTitle }}</span>
        <div class="chat-nav-right">
          <button v-if="!chatCompleted" class="btn-end-chat" @click="endChatFromNav">结束对话</button>
        </div>
      </nav>

      <router-view></router-view>
      <toast-container></toast-container>
    </div>
  `,

  setup() {
    const route = useRoute();
    const router = useRouter();
    const user = useUser();
    const showMenu = ref(false);

    const showNavbar = computed(() => route.path !== '/auth');
    const isChatPage = computed(() => route.path.startsWith('/chat/'));
    const chatTitle = computed(() =>
      route.query.topicName || (route.query.mode === '2' ? '随便聊聊' : '对话')
    );
    const chatCompleted = ref(false);

    function go(path) { showMenu.value = false; router.push(path); }
    function startFreeChat() {
      const id = uuid();
      router.push(`/chat/${id}?mode=2`);
    }
    function endChatFromNav() {
      window.dispatchEvent(new CustomEvent('force-end-chat'));
    }

    // 点击外部关闭菜单
    function closeMenu() {
      if (showMenu.value) showMenu.value = false;
    }

    onMounted(() => {
      document.addEventListener('click', closeMenu);
      user.fetchProfile();
    });
    onUnmounted(() => document.removeEventListener('click', closeMenu));

    return {
      user, api, showNavbar, isChatPage, chatTitle, chatCompleted,
      showMenu, go, startFreeChat, endChatFromNav,
    };
  }
};
