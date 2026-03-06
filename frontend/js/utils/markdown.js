/**
 * Markdown 渲染工具
 * 使用 CDN 加载的 marked + DOMPurify
 */

export function renderMarkdown(text) {
  if (!text) return '';
  try {
    const raw = marked.parse(text);
    return DOMPurify.sanitize(raw);
  } catch (e) {
    console.warn('[Markdown] render error:', e);
    return text;
  }
}
