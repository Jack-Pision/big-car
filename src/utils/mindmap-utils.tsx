import React from 'react';
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

  // Try strict JSON parse first
  try {
    const parsed = JSON.parse(jsonString);
    if (isValidMindMapData(parsed)) {
      return parsed as MindMapData;
    }
  } catch (e) {
    // Not valid JSON, try fallback
  }

  // Fallback: try to convert pseudo-JSON to valid JSON
  const fallback = pseudoJsonToJson(jsonString);
  if (fallback) {
    try {
      const parsed = JSON.parse(fallback);
      if (isValidMindMapData(parsed)) {
        return parsed as MindMapData;
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Attempts to convert pseudo-JSON (single quotes, missing quotes, etc.) to valid JSON
 * @param input - Pseudo-JSON string
 * @returns Valid JSON string or null
 */
function pseudoJsonToJson(input: string): string | null {
  let s = input;
  try {
    // Replace single quotes with double quotes
    s = s.replace(/'/g, '"');
    // Add double quotes around unquoted keys (very basic, not perfect)
    s = s.replace(/([,{\s])(\w+)\s*:/g, '$1"$2":');
    // Remove trailing commas
    s = s.replace(/,\s*([}\]])/g, '$1');
    // Remove stray whitespace between keys/colons
    s = s.replace(/\s*:\s*/g, ':');
    // Remove stray whitespace between commas and values
    s = s.replace(/,\s+/g, ',');
    // Remove stray whitespace between braces/brackets
    s = s.replace(/\{\s+/g, '{').replace(/\s+\}/g, '}');
    s = s.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
    // Remove stray newlines
    s = s.replace(/\n/g, ' ');
    // Remove stray tabs
    s = s.replace(/\t/g, ' ');
    // Remove multiple spaces
    s = s.replace(/\s{2,}/g, ' ');
    // Remove stray colons at the end of lines
    s = s.replace(/:([\s,}\]])/g, ':$1');
    // Remove stray commas at the start of lines
    s = s.replace(/\n,\s*/g, '\n');
    // Remove stray commas before closing braces/brackets
    s = s.replace(/,\s*([}\]])/g, '$1');
    // Remove stray commas at the end
    s = s.replace(/,\s*$/g, '');
    // Remove stray spaces at the start/end
    s = s.trim();
    // Final check: must start with { and end with }
    if (!s.startsWith('{') || !s.endsWith('}')) return null;
    return s;
  } catch (e) {
    return null;
  }
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

/**
 * Returns a user-friendly error message if mind map parsing fails
 */
export function mindMapParseErrorMessage(): React.ReactNode {
  return (
    <div className="bg-red-900 text-red-200 rounded p-4 my-4">
      <b>Could not render mind map:</b> The AI did not return valid JSON. Please try again or rephrase your request.<br />
      <span className="text-xs opacity-80">Tip: Ask the AI to use double quotes for all keys and string values, and avoid trailing commas.</span>
    </div>
  );
} 