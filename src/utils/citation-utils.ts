/**
 * Utility functions for handling citations in AI responses
 */

/**
 * Makes citations in text clickable by converting [1], [2], etc. into clickable links
 * when source URLs are available
 */
export const makeCitationsClickable = (content: string, sources: any[] = []) => {
  if (!content) return content;
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    const source = sources[parseInt(num) - 1];
    if (source?.url) {
      return `<a href="${source.url}" target="_blank" rel="noopener noreferrer" 
                class="inline-flex items-center px-1 py-0.5 rounded bg-blue-900/30 text-blue-400 text-xs hover:bg-blue-800/40 transition-colors">[${num}]</a>`;
    }
    return match;
  });
}; 