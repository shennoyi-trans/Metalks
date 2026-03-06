/**
 * Markdown 渲染工具
 * 使用全局 CDN 加载的 marked + DOMPurify
 */

export function renderMarkdown(text) {
  if (!text) return '';
  const raw = marked.parse(text);
  return DOMPurify.sanitize(raw);
}
