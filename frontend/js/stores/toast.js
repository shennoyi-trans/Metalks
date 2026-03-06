/**
 * Toast 消息提示 Store
 */

const { reactive } = Vue;

export const toastState = reactive({ items: [] });

export const toastActions = {
  show(msg, type = 'info') {
    const id = Date.now() + Math.random();
    toastState.items.push({ id, msg, type });
    setTimeout(() => {
      toastState.items = toastState.items.filter(t => t.id !== id);
    }, 3000);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  info(msg)    { this.show(msg, 'info'); },
};

export function useToast() { return toastActions; }
