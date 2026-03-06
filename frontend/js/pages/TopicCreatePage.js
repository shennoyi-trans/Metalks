/**
 * TopicCreatePage — 创建 / 编辑话题
 * v2: 新增标签搜索/创建功能
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';

const { ref, reactive, computed, onMounted, watch, nextTick } = Vue;
const { useRoute, useRouter } = VueRouter;

export const TopicCreatePage = {
  template: `
    <div class="page-content">
      <div class="page-narrow">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:24px">{{ isEdit ? '编辑话题' : '创建话题' }}</h2>
        <div class="form-group">
          <label class="form-label">标题</label>
          <input class="form-input" v-model="form.title" placeholder="话题标题">
        </div>
        <div class="form-group">
          <label class="form-label">内容</label>
          <textarea class="form-textarea" v-model="form.content" placeholder="话题详细描述" rows="5"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">提示词</label>
          <textarea class="form-textarea" v-model="form.prompt" placeholder="AI 的对话引导词，用户不可见" rows="4"></textarea>
          <p class="form-hint">这段文字将作为 AI 的对话引导词，用户不可见</p>
        </div>
        <div class="form-group">
          <label class="form-label">标签</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
            <span v-for="(t,i) in allTags" :key="t.id"
              :class="['tag-pill','tag-colors-'+i%7,{active:form.tag_ids.includes(t.id)}]"
              @click="toggleTag(t.id)" style="cursor:pointer">{{ t.name }}</span>
          </div>
          <!-- 🆕 创建/搜索标签按钮 -->
          <button class="btn btn-ghost btn-sm" @click="openTagModal" style="margin-top:4px;font-size:13px">
            + 创建/搜索标签
          </button>
        </div>
        <div class="form-group">
          <label class="form-label">共同作者（可选）</label>
          <div v-for="(c,i) in form.coauthors" :key="i" class="coauthor-row">
            <input class="form-input" v-model="c.user_id" placeholder="用户ID" type="number">
            <input class="form-input share-input" v-model.number="c.share" placeholder="分成%" type="number">
            <button class="btn btn-ghost btn-sm" @click="form.coauthors.splice(i,1)" style="color:var(--error)">✕</button>
          </div>
          <button class="btn btn-ghost btn-sm" @click="form.coauthors.push({user_id:'',share:0})">+ 添加共同作者</button>
        </div>
        <div v-if="isEdit" style="margin-bottom:16px">
          <p class="form-hint" style="color:var(--orange)">⚠️ 修改后话题将重新进入审核状态</p>
        </div>
        <div style="display:flex;gap:12px;margin-top:24px">
          <button class="btn btn-primary btn-lg" @click="handleSubmit" :disabled="submitting">
            {{ submitting ? '提交中...' : (isEdit ? '保存修改' : '提交话题') }}
          </button>
          <button class="btn btn-ghost" @click="$router.back()">取消</button>
        </div>
      </div>

      <!-- 🆕 标签搜索/创建弹窗 -->
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

          <!-- 搜索结果 -->
          <div v-if="tagSearchResults.length" class="search-results" style="max-height:240px;overflow-y:auto">
            <div v-for="tag in tagSearchResults" :key="tag.id"
              class="search-result-item"
              style="display:flex;align-items:center;justify-content:space-between"
              @click="selectSearchedTag(tag)">
              <span class="search-result-title">{{ tag.name }}</span>
              <span v-if="form.tag_ids.includes(tag.id)" style="color:var(--primary);font-size:12px">已选择 ✓</span>
              <span v-else style="color:var(--text-muted);font-size:12px">点击选择</span>
            </div>
          </div>

          <!-- 无结果 + 创建选项 -->
          <div v-else-if="tagSearchQuery.trim() && !tagSearching" style="padding:16px;text-align:center">
            <p style="color:var(--text-muted);margin-bottom:12px;font-size:14px">
              没有找到「{{ tagSearchQuery.trim() }}」相关标签
            </p>
            <button
              class="btn btn-primary btn-sm"
              @click="handleCreateTag"
              :disabled="tagCreating"
              style="font-size:13px">
              {{ tagCreating ? '创建中...' : '+ 创建「' + tagSearchQuery.trim() + '」标签' }}
            </button>
          </div>

          <!-- 搜索中 -->
          <div v-else-if="tagSearching" style="padding:20px;text-align:center">
            <div class="page-spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto"></div>
          </div>

          <!-- 空状态提示 -->
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

    function toggleTag(id) {
      const idx = form.tag_ids.indexOf(id);
      if (idx >= 0) form.tag_ids.splice(idx, 1);
      else form.tag_ids.push(id);
    }

    // ============================
    // 🆕 标签搜索/创建相关
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

    // 监听搜索词变化，防抖搜索
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
      // 确保标签在 allTags 中（方便 UI 显示）
      if (!allTags.value.find(t => t.id === tag.id)) {
        allTags.value.push(tag);
      }
      // 切换选中状态
      const idx = form.tag_ids.indexOf(tag.id);
      if (idx >= 0) {
        form.tag_ids.splice(idx, 1);
      } else {
        form.tag_ids.push(tag.id);
      }
    }

    async function handleCreateTag() {
      const name = tagSearchQuery.value.trim();
      if (!name) return;

      tagCreating.value = true;
      try {
        const res = await api.topics.createTag({ name });
        if (res.success && res.tag) {
          const newTag = res.tag;
          // 添加到 allTags
          if (!allTags.value.find(t => t.id === newTag.id)) {
            allTags.value.push(newTag);
          }
          // 自动选中
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
      // 回车时：如果有搜索结果，选中第一个；否则创建新标签
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

      submitting.value = true;
      const data = {
        title: form.title.trim(),
        content: form.content.trim(),
        prompt: form.prompt.trim(),
        tag_ids: form.tag_ids,
      };

      // 处理共同作者
      const validCoauthors = form.coauthors.filter(c => c.user_id && c.share > 0);
      if (validCoauthors.length) {
        data.coauthors = validCoauthors.map(c => ({
          user_id: parseInt(c.user_id),
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
          // coauthors如果有的话
          if (t.authors) {
            form.coauthors = t.authors
              .filter(a => !a.is_primary)
              .map(a => ({ user_id: a.user_id || '', share: a.share || 0 }));
          }
        } catch (e) {
          toast.error('加载话题数据失败');
        }
      }
    });

    return {
      isEdit, allTags, form, submitting, toggleTag, handleSubmit,
      // 🆕 标签搜索/创建
      tagModalOpen, tagSearchQuery, tagSearchResults, tagSearching,
      tagCreating, tagSearchInputEl,
      openTagModal, closeTagModal, selectSearchedTag,
      handleCreateTag, handleTagEnter,
    };
  }
};
