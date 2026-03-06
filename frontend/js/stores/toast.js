/**
 * Toast 消息提示 Store
 */

const { reactive } = Vue;

/** 响应式状态（直接暴露给组件使用） */
export const toastState = reactive({ items: [] });

/** Toast 操作方法 */
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

/** Composable hook — 返回 actions（用于页面调用） */
export function useToast() {
  return toastActions;
}
