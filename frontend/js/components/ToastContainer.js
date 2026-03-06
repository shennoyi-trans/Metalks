/**
 * Toast 消息容器组件
 */

import { toastState } from '../stores/toast.js';

export const ToastContainer = {
  template: `
    <div class="toast-container">
      <div v-for="t in store.items" :key="t.id" :class="['toast-item', t.type]">{{ t.msg }}</div>
    </div>
  `,
  setup() {
    return { store: toastState };
  }
};
