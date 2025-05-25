/**
 * Source utilities for handling web citations and source references
 */

export interface WebSource {
  title: string;
  url: string;
  icon: string;
  type: string;
  date?: string;
}

/**
 * Regular expression to find web citations in text
 * Matches [@Web](URL) format and numbered references [1], [2], etc.
 */
export const WEB_CITATION_REGEX = /(?:\[@Web\]\(([^)]+)\))|(?:\[@Web\])|(?:\[(\d+)\])/g;

/**
 * Regular expression to find source references in markdown text
 * Matches [Source: Type|URL] format
 */
export const SOURCE_REFERENCE_REGEX = /\[Source:\s*([^|]+)\|([^[\]]+)\]/g;

/**
 * Maps source types to their respective icons
 */
export const SOURCE_ICONS: Record<string, string> = {
  reddit: '/icons/reddit-icon.svg',
  web: '/icons/web-icon.svg',
  wikipedia: '/icons/wikipedia-icon.svg',
  github: '/icons/github-icon.svg',
  default: '/icons/link-icon.svg'
};

/**
 * Extracts all source references from markdown text
 */
export function extractSourceReferences(text: string): { type: string; url: string }[] {
  const sources: { type: string; url: string }[] = [];
  let match;
  
  // Reset regex state
  SOURCE_REFERENCE_REGEX.lastIndex = 0;
  
  while ((match = SOURCE_REFERENCE_REGEX.exec(text)) !== null) {
    const [_, type, url] = match;
    sources.push({
      type: type.trim().toLowerCase(),
      url: url.trim()
    });
  }
  
  return sources;
}

/**
 * Processes markdown text to replace web citations with clickable icon links
 */
export function processWebCitations(text: string, sources?: WebSource[]): string {
  if (!text) return text;
  
  // First extract all source references from the text
  const extractedSources = extractSourceReferences(text);
  
  // Combine provided sources with extracted ones
  const allSources = [
    ...(sources || []),
    ...extractedSources.map((src, index) => ({
      title: `Source ${index + 1}`,
      url: src.url,
      icon: SOURCE_ICONS[src.type] || SOURCE_ICONS.default,
      type: src.type,
    }))
  ];
  
  // Replace [@Web] citations with clickable icon links
  let processedText = text.replace(WEB_CITATION_REGEX, (match, url, number) => {
    if (url) {
      // Handle [@Web](URL) format
      const sourceType = getSourceType(url);
      const icon = SOURCE_ICONS[sourceType] || SOURCE_ICONS.default;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="web-citation"><img src="${icon}" alt="${sourceType}" class="citation-icon" /></a>`;
    } else if (number) {
      // Handle [N] numbered reference format with professional badge styling
      const index = parseInt(number) - 1;
      if (allSources && index >= 0 && index < allSources.length) {
        const source = allSources[index];
        return `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="web-citation citation-badge">${number}</a>`;
      }
      // If no matching source, still show the badge but without a link
      return `<span class="citation-badge">${number}</span>`;
    }
    // Generic @Web without URL
    return `<a href="#" class="web-citation"><img src="${SOURCE_ICONS.web}" alt="web" class="citation-icon" /></a>`;
  });
  
  // Remove source reference markers from the final output
  processedText = processedText.replace(SOURCE_REFERENCE_REGEX, '');
  
  return processedText;
}

/**
 * Determines the source type based on URL
 */
function getSourceType(url: string): string {
  if (!url) return 'default';
  
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('reddit.com')) return 'reddit';
  if (lowerUrl.includes('wikipedia.org')) return 'wikipedia';
  if (lowerUrl.includes('github.com')) return 'github';
  
  return 'web';
}

/**
 * Formats a list of web sources as numbered references for display
 */
export function formatSourceReferences(sources: WebSource[]): string {
  if (!sources || sources.length === 0) return '';
  
  return sources.map((source, index) => {
    const date = source.date ? ` (${source.date})` : '';
    return `[${index + 1}] ${source.title}${date} - ${source.url}`;
  }).join('\n');
}
