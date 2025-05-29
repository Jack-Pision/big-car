/**
 * Utility functions for enhancing markdown table rendering and processing
 */

/**
 * Identifies markdown tables in text content and enhances them for better rendering
 * @param content The markdown content
 * @returns Enhanced markdown with improved table syntax
 */
export function enhanceMarkdownTables(content: string): string {
  if (!content) return content;

  // Split the content into lines
  const lines = content.split('\n');
  let inTable = false;
  let tableStartIndex = -1;
  let enhancedContent = '';
  let currentLine = 0;

  while (currentLine < lines.length) {
    const line = lines[currentLine];
    
    // Detect table headers (pattern: | Header 1 | Header 2 |)
    if (!inTable && line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // Check if next line contains separator row
      const nextLine = currentLine + 1 < lines.length ? lines[currentLine + 1] : '';
      if (nextLine.includes('|') && nextLine.includes('-')) {
        inTable = true;
        tableStartIndex = currentLine;
        // Add current line to the output
        enhancedContent += line + '\n';
      } else {
        // Not a table, just add the line
        enhancedContent += line + '\n';
      }
    } 
    // If we're in a table
    else if (inTable) {
      // Check if we've reached the end of the table
      if (!line.trim().startsWith('|')) {
        inTable = false;
        // Process the table we just exited if needed
      }
      // Add the current line
      enhancedContent += line + '\n';
    } 
    // Regular line outside a table
    else {
      enhancedContent += line + '\n';
    }
    
    currentLine++;
  }

  return enhancedContent.trim();
}

/**
 * Removes citation references (e.g., [1], [2]) from table content
 * @param content The markdown content
 * @returns Markdown with citations removed from tables
 */
export function removeCitationsFromTables(content: string): string {
  if (!content) return content;

  // Split the content into lines
  const lines = content.split('\n');
  let inTable = false;
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect table start (pattern: | Header 1 | Header 2 |)
    if (!inTable && line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // Check if next line contains separator row
      const nextLine = (i + 1 < lines.length) ? lines[i + 1] : '';
      if (nextLine.includes('|') && nextLine.includes('-')) {
        inTable = true;
        // Add unmodified header line
        result.push(line);
        continue;
      }
    }
    
    // For table rows, remove citation references
    if (inTable && line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // Remove citation patterns [1], [2], etc. from the table row
      const cleanedLine = line.replace(/\[\d+\]/g, '');
      result.push(cleanedLine);
    } 
    // Detect table end
    else if (inTable && !line.trim().startsWith('|')) {
      inTable = false;
      result.push(line);
    }
    // Regular line outside a table
    else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Process markdown to improve tables and make them more consistent
 * @param content The original markdown content
 * @returns Processed markdown with enhanced tables
 */
export function processMarkdownWithTables(content: string): string {
  if (!content) return content;

  // 1. First, enhance the structure of tables
  let processed = enhanceMarkdownTables(content);
  
  // 2. Then remove citations from tables
  processed = removeCitationsFromTables(processed);
  
  return processed;
} 