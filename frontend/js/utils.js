/**
 * 纯工具函数（无 API 相关逻辑）
 */

/**
 * 格式化日期
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${date.getFullYear()}/${month}/${day} ${hours}:${minutes}`;
}

/**
 * 生成 UUID
 * @returns {string}
 */
export function generateUUID() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
}

/**
 * 显示模态框
 * @param {HTMLElement} modal
 */
export function showModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    modal.style.visibility = 'visible';
}

/**
 * 隐藏模态框
 * @param {HTMLElement} modal
 */
export function hideModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => (modal.style.visibility = 'hidden'), 300);
}

/**
 * Toast 提示（全局单例）
 */
let toastInstance = null;
let toastTimer = null;
let toastHighlightCount = 0;

export function showToast(message, highlight = false) {
    if (!toastInstance) {
        toastInstance = document.createElement('div');
        toastInstance.className = 'toast';
        document.body.appendChild(toastInstance);
    }

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    if (toastInstance.classList.contains('show') && highlight) {
        toastHighlightCount++;
        toastInstance.classList.add('highlight');
        setTimeout(() => {
            toastInstance.classList.remove('highlight');
        }, 300);
    } else {
        toastHighlightCount = 0;
    }

    toastInstance.textContent = message;
    toastInstance.classList.add('show');

    toastTimer = setTimeout(() => {
        toastInstance.classList.remove('show');
        toastHighlightCount = 0;
    }, 3000);
}
