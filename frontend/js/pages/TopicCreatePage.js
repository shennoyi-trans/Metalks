/**
 * TopicCreatePage — 创建 / 编辑话题
 * v1.6:
 *  - 共同作者支持按 ID 或昵称搜索
 *  - 非官方账号提交前自动敏感词预检
 *  - 提示词保持必填（后端要求）
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';
import { useUser } from '../stores/user.js';
import { searchUsers, createDebouncedUserSearch } from '../utils/userSearch.js';

const { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } = Vue;
const { useRoute, useRouter } = VueRouter;

export const TopicCreatePage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:24px">{{ isEdit ? '编辑话题' : '创建话题' }}</h2>
        <div class="form-group">
          <label class="form-label">标题</label>
          <input class="form-input" v-model="form.title" placeholder="话题标题"
            :class="{'error': sensitiveHighlights.title}">
          <p v-if="sensitiveHighlights.title" class="form-error">
            ⚠️ 标题包含敏感词：<strong v-for="(w,i) in sensitiveHighlights.title" :key="i">{{ w }}<span v-if="i<sensitiveHighlights.title.length-1">、</span></strong>
          </p>
        </div>
        <div class="form-group">
          <label class="form-label">内容</label>
          <textarea class="form-textarea" v-model="form.content" placeholder="话题详细描述" rows="5"
            :class="{'error': sensitiveHighlights.content}"></textarea>
          <p v-if="sensitiveHighlights.content" class="form-error">
            ⚠️ 内容包含敏感词：<strong v-for="(w,i) in sensitiveHighlights.content" :key="i">{{ w }}<span v-if="i<sensitiveHighlights.content.length-1">、</span></strong>
          </p>
        </div>
        <div class="form-group">
          <label class="form-label">提示词</label>
          <textarea class="form-textarea" v-model="form.prompt" placeholder="AI 的对话引导词，用户不可见" rows="4"
            :class="{'error': sensitiveHighlights.prompt}"></textarea>
          <p class="form-hint">这段文字将作为 AI 的对话引导词，用户不可见</p>
          <p v-if="sensitiveHighlights.prompt" class="form-error">
            ⚠️ 提示词包含敏感词：<strong v-for="(w,i) in sensitiveHighlights.prompt" :key="i">{{ w }}<span v-if="i<sensitiveHighlights.prompt.length-1">、</span></strong>
          </p>
        </div>
        <div class="form-group">
          <label class="form-label">标签</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
            <span v-for="(t,i) in allTags" :key="t.id"
              :class="['tag-pill','tag-colors-'+i%7,{active:form.tag_ids.includes(t.id)}]"
              @click="toggleTag(t.id)" style="cursor:pointer">{{ t.name }}</span>
          </div>
          <button class="btn btn-ghost btn-sm" @click="openTagModal" style="margin-top:4px;font-size:13px">
            + 创建/搜索标签
          </button>
        </div>

        <!-- ✅ v1.6：共同作者 - 支持 ID 或昵称搜索 -->
        <div class="form-group">
          <label class="form-label">共同作者（可选）</label>
          <div v-for="(c,i) in form.coauthors" :key="i" class="coauthor-row">
            <div style="flex:1;position:relative">
              <input class="form-input" v-model="c.searchQuery" placeholder="输入用户ID或昵称搜索"
                @input="onCoauthorSearch(i)" @focus="c._showDropdown=true" @blur="hideCoauthorDropdown(i)">
              <div v-if="c.selectedUser" style="font-size:11px;color:var(--purple);margin-top:2px">
                已选择：{{ c.selectedUser.nickname }} (#{{ c.selectedUser.id }})
              </div>
              <!-- 搜索下拉 -->
              <div v-if="c._showDropdown && c._searchResults.length" class="coauthor-dropdown">
                <div v-for="u in c._searchResults" :key="u.id" class="coauthor-dropdown-item"
                  @mousedown.prevent="selectCoauthor(i, u)">
                  <span style="font-weight:500">{{ u.nickname }}</span>
                  <span style="font-size:11px;color:var(--text-muted)">#{{ u.id }}</span>
                </div>
              </div>
            </div>
            <input class="form-input share-input" v-model.number="c.share" placeholder="分成%" type="number">
            <button class="btn btn-ghost btn-sm" @click="removeCoauthor(i)" style="color:var(--error)">✕</button>
          </div>
          <button class="btn btn-ghost btn-sm" @click="addCoauthor">+ 添加共同作者</button>
        </div>

        <!-- ✅ v1.6：敏感词预检提示 -->
        <div v-if="sensitiveWarning" class="sensitive-warning-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>检测到敏感词，请修改后再提交</span>
        </div>

        <div v-if="isEdit" style="margin-bottom:16px">
          <p class="form-hint" style="color:var(--orange)">⚠️ 修改后话题将重新进入审核状态</p>
        </div>
        <div style="display:flex;gap:12px;margin-top:24px">
          <button class="btn btn-primary btn-lg" @click="handleSubmit" :disabled="submitting || sensitiveWarning">
            {{ submitting ? '提交中...' : (isEdit ? '保存修改' : '提交话题') }}
          </button>
          <button class="btn btn-ghost" @click="$router.back()">取消</button>
        </div>
      </div>

      <!-- 标签搜索/创建弹窗 -->
      <div v-if="tagModalOpen" class="search-overlay" @click.self="closeTagModal">
        <div class="search-modal" style="max-width:420px">
          <div class="search-modal-input">
            <span style="font-size:18px">🏷️</span>
            <input
              ref="tagSearchInputEl"
              v-model="tagSearchQuery"
              placeholder="输入标签名称搜索或创建..."
              @keydown.esc="closeTagModal"
              @keydown.enter.prevent="handleTagEnter"
              autofocus
            >
            <button class="search-close-btn" @click="closeTagModal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div v-if="tagSearchResults.length" class="search-results" style="max-height:240px;overflow-y:auto">
            <div v-for="tag in tagSearchResults" :key="tag.id"
              class="search-result-item" @click="selectSearchedTag(tag)">
              <span class="search-result-title">{{ tag.name }}</span>
              <span v-if="form.tag_ids.includes(tag.id)" style="color:var(--primary);font-size:12px">已选择 ✓</span>
              <span v-else style="color:var(--text-muted);font-size:12px">点击选择</span>
            </div>
          </div>
          <div v-else-if="tagSearchQuery.trim() && !tagSearching" style="padding:16px;text-align:center">
            <p style="color:var(--text-muted);margin-bottom:12px;font-size:14px">
              没有找到「{{ tagSearchQuery.trim() }}」相关标签
            </p>
            <button class="btn btn-primary btn-sm" @click="handleCreateTag" :disabled="tagCreating" style="font-size:13px">
              {{ tagCreating ? '创建中...' : '+ 创建「' + tagSearchQuery.trim() + '」标签' }}
            </button>
          </div>
          <div v-else-if="tagSearching" style="padding:20px;text-align:center">
            <div class="page-spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto"></div>
          </div>
          <div v-else style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">
            输入关键词搜索已有标签，或直接创建新标签
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const route = useRoute();
    const router = useRouter();
    const toast = useToast();
    const user = useUser();

    const isEdit = computed(() => !!route.query.edit);
    const editId = computed(() => route.query.edit ? parseInt(route.query.edit) : null);

    const allTags = ref([]);
    const submitting = ref(false);

    const form = reactive({
      title: '',
      content: '',
      prompt: '',
      tag_ids: [],
      coauthors: [],
    });

    // ✅ v1.6：敏感词状态
    const sensitiveHighlights = reactive({ title: null, content: null, prompt: null });
    const sensitiveWarning = computed(() => {
      return sensitiveHighlights.title || sensitiveHighlights.content || sensitiveHighlights.prompt;
    });

    function toggleTag(id) {
      const idx = form.tag_ids.indexOf(id);
      if (idx >= 0) form.tag_ids.splice(idx, 1);
      else form.tag_ids.push(id);
    }

    // ============================
    // ✅ v1.6：共同作者搜索
    // ============================
    function addCoauthor() {
      form.coauthors.push({
        searchQuery: '',
        selectedUser: null,
        share: 0,
        _showDropdown: false,
        _searchResults: [],
        _searchTimer: null,
      });
    }

    function removeCoauthor(index) {
      form.coauthors.splice(index, 1);
    }

    function onCoauthorSearch(index) {
      const c = form.coauthors[index];
      c.selectedUser = null;  // 清除已选择
      if (c._searchTimer) clearTimeout(c._searchTimer);
      const q = (c.searchQuery || '').trim();
      if (!q) {
        c._searchResults = [];
        return;
      }
      c._searchTimer = setTimeout(async () => {
        c._searchResults = await searchUsers(q);
      }, 300);
    }

    function selectCoauthor(index, userItem) {
      const c = form.coauthors[index];
      c.selectedUser = userItem;
      c.searchQuery = `${userItem.nickname} (#${userItem.id})`;
      c._showDropdown = false;
      c._searchResults = [];
    }

    function hideCoauthorDropdown(index) {
      // 延迟隐藏以允许点击下拉项
      setTimeout(() => {
        if (form.coauthors[index]) {
          form.coauthors[index]._showDropdown = false;
        }
      }, 200);
    }

    // ============================
    // ✅ v1.6：敏感词预检
    // ============================
    async function checkSensitiveWords() {
      // 官方账号跳过检查
      if (user.isAdmin) return true;

      sensitiveHighlights.title = null;
      sensitiveHighlights.content = null;
      sensitiveHighlights.prompt = null;

      try {
        const res = await api.topics.checkSensitive({
          title: form.title.trim(),
          content: form.content.trim(),
          prompt: form.prompt.trim(),
        });

        if (res.has_sensitive) {
          for (const match of res.matches) {
            const field = match.field;
            if (!sensitiveHighlights[field]) {
              sensitiveHighlights[field] = [];
            }
            sensitiveHighlights[field].push(match.word);
          }
          // 去重
          for (const f of ['title', 'content', 'prompt']) {
            if (sensitiveHighlights[f]) {
              sensitiveHighlights[f] = [...new Set(sensitiveHighlights[f])];
            }
          }
          return false;
        }
        return true;
      } catch (e) {
        // 预检失败不阻止提交，后端还有兜底
        return true;
      }
    }

    // ============================
    // 标签搜索/创建
    // ============================
    const tagModalOpen = ref(false);
    const tagSearchQuery = ref('');
    const tagSearchResults = ref([]);
    const tagSearching = ref(false);
    const tagCreating = ref(false);
    const tagSearchInputEl = ref(null);
    let tagSearchTimer = null;

    function openTagModal() {
      tagModalOpen.value = true;
      tagSearchQuery.value = '';
      tagSearchResults.value = [];
      nextTick(() => {
        if (tagSearchInputEl.value) tagSearchInputEl.value.focus();
      });
    }

    function closeTagModal() {
      tagModalOpen.value = false;
      tagSearchQuery.value = '';
      tagSearchResults.value = [];
    }

    watch(tagSearchQuery, (val) => {
      if (tagSearchTimer) clearTimeout(tagSearchTimer);
      const q = val.trim();
      if (!q) {
        tagSearchResults.value = [];
        tagSearching.value = false;
        return;
      }
      tagSearching.value = true;
      tagSearchTimer = setTimeout(async () => {
        try {
          const res = await api.topics.searchTags(q);
          tagSearchResults.value = res.tags || [];
        } catch (e) {
          tagSearchResults.value = [];
        }
        tagSearching.value = false;
      }, 300);
    });

    function selectSearchedTag(tag) {
      if (!allTags.value.find(t => t.id === tag.id)) {
        allTags.value.push(tag);
      }
      const idx = form.tag_ids.indexOf(tag.id);
      if (idx >= 0) form.tag_ids.splice(idx, 1);
      else form.tag_ids.push(tag.id);
    }

    async function handleCreateTag() {
      const name = tagSearchQuery.value.trim();
      if (!name) return;

      tagCreating.value = true;
      try {
        const res = await api.topics.createTag({ name });
        if (res.success && res.tag) {
          const newTag = res.tag;
          if (!allTags.value.find(t => t.id === newTag.id)) {
            allTags.value.push(newTag);
          }
          if (!form.tag_ids.includes(newTag.id)) {
            form.tag_ids.push(newTag.id);
          }
          toast.success(res.message === '标签已存在' ? '标签已存在，已为您选中' : '标签创建成功');
          closeTagModal();
        } else {
          toast.error(res.message || '创建失败');
        }
      } catch (e) {
        toast.error(e.message || '创建标签失败');
      }
      tagCreating.value = false;
    }

    function handleTagEnter() {
      if (tagSearchResults.value.length > 0) {
        selectSearchedTag(tagSearchResults.value[0]);
      } else if (tagSearchQuery.value.trim()) {
        handleCreateTag();
      }
    }

    // ============================
    // 提交逻辑
    // ============================
    async function handleSubmit() {
      if (!form.title.trim()) { toast.error('请填写标题'); return; }
      if (!form.content.trim()) { toast.error('请填写内容'); return; }
      if (!form.prompt.trim()) { toast.error('请填写提示词'); return; }

      // ✅ v1.6：非官方账号先做敏感词预检
      submitting.value = true;
      const passCheck = await checkSensitiveWords();
      if (!passCheck) {
        toast.error('内容包含敏感词，请修改后重试');
        submitting.value = false;
        return;
      }

      const data = {
        title: form.title.trim(),
        content: form.content.trim(),
        prompt: form.prompt.trim(),
        tag_ids: form.tag_ids,
      };

      // ✅ v1.6：处理共同作者（使用选中的用户ID）
      const validCoauthors = form.coauthors.filter(c => c.selectedUser && c.share > 0);
      if (validCoauthors.length) {
        data.coauthors = validCoauthors.map(c => ({
          user_id: c.selectedUser.id,
          share: c.share,
        }));
      }

      try {
        if (isEdit.value) {
          await api.topics.update(editId.value, data);
          toast.success('修改成功，话题将重新审核');
        } else {
          await api.topics.create(data);
          toast.success('话题已提交，等待审核');
        }
        router.push('/topic/mine');
      } catch (e) {
        toast.error(e.message || '提交失败');
      }
      submitting.value = false;
    }

    onMounted(async () => {
      // 加载标签
      try {
        const res = await api.topics.allTags();
        allTags.value = res.tags || res || [];
      } catch (e) {}

      // 编辑模式：加载话题数据
      if (isEdit.value && editId.value) {
        try {
          const t = await api.topics.detail(editId.value);
          form.title = t.title || '';
          form.content = t.content || '';
          form.prompt = t.prompt || '';
          form.tag_ids = (t.tags || []).map(tag => tag.id).filter(Boolean);
          // 加载共同作者
          if (t.authors) {
            form.coauthors = t.authors
              .filter(a => !a.is_primary)
              .map(a => ({
                searchQuery: `${a.nickname || ''} (#${a.user_id || ''})`,
                selectedUser: { id: a.user_id, nickname: a.nickname || `用户#${a.user_id}` },
                share: a.share || 0,
                _showDropdown: false,
                _searchResults: [],
                _searchTimer: null,
              }));
          }
        } catch (e) {
          toast.error('加载话题数据失败');
        }
      }
    });

    // 清理定时器
    onUnmounted(() => {
      form.coauthors.forEach(c => {
        if (c._searchTimer) clearTimeout(c._searchTimer);
      });
    });

    return {
      isEdit, allTags, form, submitting, toggleTag, handleSubmit,
      // 共同作者搜索
      addCoauthor, removeCoauthor, onCoauthorSearch, selectCoauthor, hideCoauthorDropdown,
      // 敏感词
      sensitiveHighlights, sensitiveWarning,
      // 标签搜索/创建
      tagModalOpen, tagSearchQuery, tagSearchResults, tagSearching,
      tagCreating, tagSearchInputEl,
      openTagModal, closeTagModal, selectSearchedTag,
      handleCreateTag, handleTagEnter,
    };
  }
};
