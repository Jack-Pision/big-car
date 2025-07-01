import { MindMapData } from '@/components/MindMapDisplay';

/**
 * Extracts and validates mind map JSON from content, including from code blocks
 * @param content - The content that might contain mind map JSON
 * @returns Parsed MindMapData if valid, null otherwise
 */
export function extractMindMapJson(content: string): MindMapData | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  let jsonString = content.trim();

  // Check if content is wrapped in code blocks (```json or ``` or ~~~)
  const codeBlockPatterns = [
    /```(?:json)?\s*([\s\S]*?)\s*```/i,
    /~~~(?:json)?\s*([\s\S]*?)\s*~~~/i,
    /`([\s\S]*?)`/i
  ];

  for (const pattern of codeBlockPatterns) {
    const match = jsonString.match(pattern);
    if (match) {
      jsonString = match[1].trim();
      break;
    }
  }

  // If still no clear JSON structure, try to find JSON object boundaries
  if (!jsonString.startsWith('{')) {
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonString);
    
    // Validate mind map structure
    if (isValidMindMapData(parsed)) {
      return parsed as MindMapData;
    }
  } catch (e) {
    // Not valid JSON, continue with normal processing
  }

  return null;
}

/**
 * Validates if a parsed object matches the MindMapData interface
 * @param obj - Object to validate
 * @returns true if valid MindMapData, false otherwise
 */
function isValidMindMapData(obj: any): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // Check required fields
  if (!obj.title || typeof obj.title !== 'string') {
    return false;
  }

  if (!obj.center_node || typeof obj.center_node !== 'object') {
    return false;
  }

  if (!obj.center_node.id || !obj.center_node.label) {
    return false;
  }

  if (!Array.isArray(obj.branches)) {
    return false;
  }

  // Validate branches structure
  for (const branch of obj.branches) {
    if (!branch || typeof branch !== 'object') {
      return false;
    }
    if (!branch.id || !branch.label) {
      return false;
    }
    // Children are optional, but if present should be an array
    if (branch.children && !Array.isArray(branch.children)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if content is likely a mind map request based on keywords
 * @param content - User input content
 * @returns true if appears to be a mind map request
 */
export function isMindMapRequest(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const lowerContent = content.toLowerCase();
  const mindMapKeywords = [
    'mind map',
    'mindmap',
    'create a map',
    'make a map',
    'visualize',
    'diagram',
    'concept map',
    'knowledge map',
    'map out',
    'create diagram',
    'show relationships',
    'organize concepts'
  ];

  return mindMapKeywords.some(keyword => lowerContent.includes(keyword));
} 