/**
 * TopicCreatePage — 创建 / 编辑话题
 */

import api from '../api/index.js';
import { useToast } from '../stores/toast.js';

const { ref, reactive, computed, onMounted } = Vue;
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
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span v-for="(t,i) in allTags" :key="t.id"
              :class="['tag-pill','tag-colors-'+i%7,{active:form.tag_ids.includes(t.id)}]"
              @click="toggleTag(t.id)" style="cursor:pointer">{{ t.name }}</span>
          </div>
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

    return { isEdit, allTags, form, submitting, toggleTag, handleSubmit };
  }
};
