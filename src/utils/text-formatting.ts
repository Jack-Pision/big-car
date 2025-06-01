/**
 * Limit text to a specific number of sentences
 */
export function limitSentences(text: string, minSentences: number, maxSentences: number): string {
  // Split into sentences
  const sentenceRegex = /[.!?]+(?:\s|$)/;
  let sentences: string[] = [];
  let remaining = text;
  let match;
  
  // Manually find sentence boundaries instead of using matchAll
  while ((match = sentenceRegex.exec(remaining)) !== null) {
    const endPos = match.index + match[0].length;
    sentences.push(remaining.substring(0, endPos));
    
    if (sentences.length >= maxSentences) break;
    
    remaining = remaining.substring(endPos);
    if (!remaining.trim()) break;
  }
  
  // Add any remaining text as the last sentence if we haven't hit our max
  if (remaining.trim() && sentences.length < maxSentences) {
    sentences.push(remaining);
  }
  
  // Join all sentences (or keep original if no sentence breaks found)
  return sentences.length > 0 ? sentences.join('') : text;
}

/**
 * Clean text by removing HTML, strange characters, and excess formatting
 */
export function cleanText(text: string): string {
  let cleaned = text;
  
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>?/gm, '');
  
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[link]');
  
  // Remove strange characters
  cleaned = cleaned.replace(/[^\x20-\x7E\s]/g, '');
  
  // Remove excess whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Process the introduction paragraph
 * Ensures it's a proper paragraph without citations
 */
export function processIntroduction(lines: string[]): string {
  // Join all non-empty lines
  let fullText = lines
    .filter(line => line.trim())
    .join(' ')
    .trim();
  
  // Remove citations
  fullText = fullText.replace(/\[\d+\]/g, '');
  
  // Limit to 4-5 sentences
  fullText = limitSentences(fullText, 4, 5);
  
  // Remove any HTML tags or markdown formatting
  fullText = cleanText(fullText);
  
  return fullText;
}

/**
 * Process content section bullet points
 * Ensures proper formatting of bullet points with bolded terms and citations
 */
export function processBulletPoints(lines: string[]): string {
  let processedContent = '';
  let currentBullet = '';
  
  for (const line of lines) {
    // If line starts a new bullet point
    if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
      // Process and add the previous bullet if it exists
      if (currentBullet) {
        processedContent += formatBulletPoint(currentBullet) + '\n';
      }
      // Start new bullet
      currentBullet = line;
    } else {
      // Continue current bullet
      currentBullet += ' ' + line;
    }
  }
  
  // Add the last bullet
  if (currentBullet) {
    processedContent += formatBulletPoint(currentBullet) + '\n';
  }
  
  return processedContent;
}

/**
 * Format a single bullet point with proper structure
 */
export function formatBulletPoint(bulletText: string): string {
  // Ensure bullet starts with - and has bold term
  let text = bulletText.trim();
  if (!text.startsWith('-')) {
    text = '- ' + text;
  }
  
  // Make sure there's a bolded term
  if (!text.includes('**')) {
    const firstColon = text.indexOf(':');
    if (firstColon > 0) {
      const beforeColon = text.substring(0, firstColon).replace(/^[- ]+/, '');
      text = `- **${beforeColon}**${text.substring(firstColon)}`;
    }
  }
  
  // Ensure proper sentence count
  const contentPart = text.replace(/^[- ]+\*\*[^*]+\*\*: ?/, '');
  const cleanedContent = cleanText(contentPart);
  const limitedContent = limitSentences(cleanedContent, 3, 4);
  
  // Extract citation if it exists
  const citationMatch = contentPart.match(/\[(\d+)\]$/);
  const citation = citationMatch ? ` [${citationMatch[1]}]` : '';
  
  // Rebuild bullet with citation at the end
  const bulletStart = text.match(/^[- ]+\*\*[^*]+\*\*: ?/)?.[0] || '- ';
  return `${bulletStart}${limitedContent}${citation}`;
}

/**
 * Process the summary table section
 * Ensures proper markdown table format
 */
export function processTableSection(lines: string[]): string {
  // First line is the section heading, which we already processed
  let tableContent = '## Summary Table\n';
  let tableLines = lines.filter(line => line.trim());
  
  // Check if we have proper table format
  const hasTableHeader = tableLines.some(line => line.includes('|') && line.includes('--'));
  
  if (tableLines.length >= 2 && hasTableHeader) {
    // We have a proper table, clean it up
    for (const line of tableLines) {
      if (line.includes('|')) {
        tableContent += line + '\n';
      }
    }
  } else {
    // Create a default table
    tableContent += '| Category | Information | Source |\n';
    tableContent += '| -------- | ----------- | ------ |\n';
    tableContent += '| Key Finding | Main insight from research | [1] |\n';
    tableContent += '| Best Practice | Recommended approach | [2] |\n';
    tableContent += '| Consideration | Important factor to note | [3] |\n';
  }
  
  return tableContent;
}

/**
 * Process the conclusion paragraph
 * Ensures it's a proper paragraph without citations
 */
export function processConclusion(lines: string[]): string {
  // Join all lines that aren't part of a table
  let fullText = lines
    .filter(line => line.trim() && !line.includes('|'))
    .join(' ')
    .trim();
  
  // Remove citations
  fullText = fullText.replace(/\[\d+\]/g, '');
  
  // Limit to 4-5 sentences
  fullText = limitSentences(fullText, 4, 5);
  
  // Remove any HTML tags or markdown formatting
  fullText = cleanText(fullText);
  
  return '## Conclusion\n' + fullText;
}

/**
 * Clean AI output by removing AI processing markers and formatting artifacts
 */
export function cleanAIOutput(text: string): string {
  let cleanedText = text;
  
  // Remove <think> tags and their content
  cleanedText = cleanedText.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // Remove content about search plans and strategy
  cleanedText = cleanedText.replace(/I'll search for[\s\S]*?(?=\n\n)/g, '');
  cleanedText = cleanedText.replace(/Let me search for[\s\S]*?(?=\n\n)/g, '');
  cleanedText = cleanedText.replace(/I need to find[\s\S]*?(?=\n\n)/g, '');
  
  // Remove any "Based on search results" type of commentary
  cleanedText = cleanedText.replace(/Based on (?:the|my) search results[\s\S]*?(?=\n\n)/g, '');
  cleanedText = cleanedText.replace(/According to (?:the|my) search results[\s\S]*?(?=\n\n)/g, '');
  
  // Remove any step markers
  cleanedText = cleanedText.replace(/STEP \d+[:\-].*\n/g, '');
  
  // Clean up extra newlines
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
  
  return cleanedText.trim();
}

/**
 * Helper to make citations clickable in AI output
 */
export function makeCitationsClickable(content: string, sources: any[] = []) {
  if (!content) return content;
  // Replace [1], [2], ... with anchor tags
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (sources[idx] && sources[idx].url) {
      return `<a href="${sources[idx].url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-1 py-0.5 rounded bg-blue-900/30 text-blue-400 text-xs hover:bg-blue-800/40 transition-colors">[${num}]</a>`;
    }
    return match;
  });
} 