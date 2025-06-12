"use client";
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import { useRouter } from 'next/navigation';
import { supabase, createSupabaseClient } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';
import TextReveal from '@/components/TextReveal';
import { WebSource } from '@/utils/source-utils/index';
import { v4 as uuidv4 } from 'uuid';
import EmptyBox from '@/components/EmptyBox';
import WebSourcesCarousel from '../../components/WebSourcesCarousel';
import { formatMessagesForApi, enhanceSystemPrompt, buildConversationContext } from '@/utils/conversation-context';
import { Session } from '@/lib/types';
import {
  createNewSession,
  getSessionMessages,
  saveSessionMessages,
  updateSessionTimestamp,
  getSessionTitleFromMessage,
  getSessions as getSessionsFromService,
  saveActiveSessionId,
  getActiveSessionId
} from '@/lib/session-service';
import { SCHEMAS } from '@/lib/output-schemas';
import DynamicResponseRenderer from '@/components/DynamicResponseRenderer';
import TutorialDisplay, { TutorialData } from '@/components/TutorialDisplay';
import ComparisonDisplay, { ComparisonData } from '@/components/ComparisonDisplay';
import InformationalSummaryDisplay, { InformationalSummaryData } from '@/components/InformationalSummaryDisplay';
import ConversationDisplay from '@/components/ConversationDisplay';
import { Bot, User, Paperclip, Send, XCircle, Search, Trash2, PlusCircle, Settings, Zap, ExternalLink, AlertTriangle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Image from 'next/image';
import rehypeRaw from 'rehype-raw';
import { Message as BaseMessage } from '@/utils/conversation-context';
import SearchPanel from '@/components/Search';
import { Message as ConversationMessage } from "@/utils/conversation-context";

// Define a type that includes all possible query types (including the ones in SCHEMAS and 'conversation')
type QueryType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation';

// Define types for query classification and content display
type QueryClassificationType = keyof typeof SCHEMAS;
type ContentDisplayType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation';

const BASE_SYSTEM_PROMPT = `You are Tehom AI, a helpful and intelligent assistant. Respond in a natural, conversational tone. Always write in markdown formatting in every output dynamically. Feel free to show your thinking process using <think> tags.

IMPORTANT: For general conversation, do NOT format your responses as JSON structures. Always provide plain text or simple markdown responses. Never return JSON objects or arrays in your replies unless specifically requested to do so. For default chat mode, do NOT use structured formats like Summary Tables, Conclusion sections, or heavily formatted outputs with multiple headers.`;

interface ProcessedResponse {
  content: string;
}

function cleanAIResponse(text: string): ProcessedResponse {
  if (typeof text !== 'string') {
    return { content: '' };
  }

  let cleanedText = text;
  
  // We want to preserve <think> tags, so we return the original text
  return {
    content: cleanedText.trim()
  };
}

/**
 * Detects and handles potential JSON responses in conversation mode.
 * If the text appears to be JSON, it extracts and formats the content as plain text.
 */
function handlePotentialJsonInConversation(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  // Check if the entire text looks like a JSON object
  if ((text.trim().startsWith('{') && text.trim().endsWith('}')) ||
      (text.trim().startsWith('[') && text.trim().endsWith(']'))) {
    try {
      const parsed = JSON.parse(text.trim());
      
      // Handle tutorial-style JSON
      if (parsed.title && parsed.steps) {
        let plainText = `# ${parsed.title}\n\n`;
        if (parsed.introduction) plainText += `${parsed.introduction}\n\n`;
        
        if (Array.isArray(parsed.steps)) {
          parsed.steps.forEach((step: any, index: number) => {
            plainText += `## ${index + 1}. ${step.step_title || 'Step'}\n`;
            plainText += `${step.instruction || ''}\n\n`;
          });
        }
        
        if (parsed.conclusion) plainText += `${parsed.conclusion}`;
        return plainText;
      }
      
      // Handle comparison-style JSON
      if (parsed.title && parsed.item1_name && parsed.item2_name) {
        let plainText = `# ${parsed.title}\n\n`;
        if (parsed.introduction) plainText += `${parsed.introduction}\n\n`;
        
        plainText += `## ${parsed.item1_name}\n`;
        if (parsed.item1_description) plainText += `${parsed.item1_description}\n\n`;
        if (Array.isArray(parsed.item1_pros)) {
          plainText += "Pros:\n";
          parsed.item1_pros.forEach((pro: string) => {
            plainText += `- ${pro}\n`;
          });
          plainText += "\n";
        }
        if (Array.isArray(parsed.item1_cons)) {
          plainText += "Cons:\n";
          parsed.item1_cons.forEach((con: string) => {
            plainText += `- ${con}\n`;
          });
          plainText += "\n";
        }
        
        plainText += `## ${parsed.item2_name}\n`;
        if (parsed.item2_description) plainText += `${parsed.item2_description}\n\n`;
        if (Array.isArray(parsed.item2_pros)) {
          plainText += "Pros:\n";
          parsed.item2_pros.forEach((pro: string) => {
            plainText += `- ${pro}\n`;
          });
          plainText += "\n";
        }
        if (Array.isArray(parsed.item2_cons)) {
          plainText += "Cons:\n";
          parsed.item2_cons.forEach((con: string) => {
            plainText += `- ${con}\n`;
          });
          plainText += "\n";
        }
        
        if (parsed.summary) plainText += `## Summary\n${parsed.summary}`;
        return plainText;
      }
      
      // Handle informational summary JSON
      if (parsed.main_title && parsed.sections) {
        let plainText = `# ${parsed.main_title}\n\n`;
        
        if (parsed.introduction) {
          plainText += `${parsed.introduction}\n\n`;
        }
        
        if (Array.isArray(parsed.sections)) {
          parsed.sections.forEach((section: any) => {
            if (section.section_title) {
              plainText += `## ${section.section_title}\n\n`;
              
              if (Array.isArray(section.content_items)) {
                section.content_items.forEach((item: any) => {
                  if (item.item_type === "paragraph" && item.text_content) {
                    plainText += `${item.text_content}\n\n`;
                  } else if (item.item_type === "bullet_list" && Array.isArray(item.list_items)) {
                    item.list_items.forEach((bullet: string) => {
                      plainText += `- ${bullet}\n`;
                    });
                    plainText += "\n";
                  } else if (item.item_type === "key_value_list" && Array.isArray(item.key_value_pairs)) {
                    item.key_value_pairs.forEach((pair: any) => {
                      if (pair.key && pair.value) {
                        plainText += `**${pair.key}**: ${pair.value}\n`;
                      }
                    });
                    plainText += "\n";
                  }
                });
              }
            }
          });
        }
        
        if (parsed.conclusion) {
          plainText += `## Conclusion\n\n${parsed.conclusion}`;
        }
        
        return plainText;
      }
      
      // Handle any JSON with a content field (fallback)
      if (parsed.content) {
        return parsed.content;
      }
      
      // Generic JSON handler - just convert to string representation
      return "I found this information:\n\n" + 
             JSON.stringify(parsed, null, 2).replace(/"([^"]+)":/g, '$1:');
    } catch (e) {
      // Not valid JSON, return original text
      return text;
    }
  }
  
  return text;
}

/**
 * Post-processes AI chat responses for default chat to ensure clean, consistent output.
 * This function implements various cleanup operations to fix common issues in AI-generated text.
 * 
 * IMPORTANT: This function is ONLY for default chat responses (currentQueryType === 'conversation')
 * and should NOT be applied to advance search or other structured responses.
 */
function postProcessAIChatResponse(text: string, isDefaultChat: boolean): string {
  if (typeof text !== 'string') {
    return '';
  }
  let processedText = handlePotentialJsonInConversation(text);
  if (isDefaultChat) {
  const artifactPatterns = [
    /\[Your response here\]/gi,
    /\[End of response\]/gi,
    /\[AI response continues\]/gi,
    /\[AI Assistant\]/gi,
    /\[I'll create a (.*?) for you\]/gi,
    /\[Let me help you with that\]/gi,
    /\[I understand you're asking about\]/gi,
    /As an AI assistant[,.]/gi,
    /As an AI language model[,.]/gi,
    /I'm an AI assistant and /gi,
    /I'll generate /gi,
    /I'll create /gi,
    /Here's (a|an|the) (answer|response|information|summary)/gi,
    /Thank you for your question/gi,
    /AI: /g,
    /User: /g,
  ];
  artifactPatterns.forEach(pattern => {
    processedText = processedText.replace(pattern, '');
  });

    // Fix markdown formatting issues
    
    // 1. Ensure proper spacing for markdown elements

  // Fix broken lists (ensure proper space after list markers)
  processedText = processedText.replace(/^(\s*[-*]|\s*[0-9]+\.)(?!\s)/gm, '$1 ');
    
    // 2. Fix broken/incomplete markdown emphasis and strong syntax
    
    // Fix cases where asterisks for emphasis have inconsistent spacing
    // Match *text* pattern and ensure it's properly formatted
    processedText = processedText.replace(/\*([^\s*][^*]*?[^\s*])\*/g, '*$1*');
    processedText = processedText.replace(/\*([^\s*])\*/g, '*$1*');
    
    // Match **text** pattern and ensure it's properly formatted
    processedText = processedText.replace(/\*\*([^\s*][^*]*?[^\s*])\*\*/g, '**$1**');
    processedText = processedText.replace(/\*\*([^\s*])\*\*/g, '**$1**');
    
    // Fix incomplete or mismatched markdown (e.g., unclosed asterisks)
    // Count asterisks to detect unclosed patterns
    const countAsterisks = (str: string) => {
      return (str.match(/\*/g) || []).length;
    };
    
    // If there's an odd number of asterisks, try to fix by matching patterns
    if (countAsterisks(processedText) % 2 !== 0) {
      // Fix cases like "This is *important but unclosed
      processedText = processedText.replace(/\*([^*\n]+)(?!\*)/g, '*$1*');
      
      // Fix cases like "This is **bold but unclosed
      processedText = processedText.replace(/\*\*([^*\n]+)(?!\*\*)/g, '**$1**');
    }
    
    // 3. Fix cases where * is used for lists but might be confused with emphasis
    processedText = processedText.replace(/^(\s*)\*(?!\s)([^*]+)$/gm, '$1* $2');
    
    // Remove circled numbers/letters and custom symbols (e.g., ⓵ⓇⓉⓐⓢ)
    processedText = processedText.replace(/[⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾ⓇⓉⓐⓢⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ]/g, '');
    
    // Collapse repeated numbers/dashes (e.g., 20K–20K–20K–50K => 20K–50K)
    processedText = processedText.replace(/(\b\d+[KkMm]\b[–-])(?:\1)+/g, '$1');
    // Remove accidental number/letter repetition at the start of lines (e.g., 2 2 Solution: => 2 Solution:)
    processedText = processedText.replace(/^(\d+)\s+\1\s+/gm, '$1 ');
    // Remove accidental dash repetition (e.g., - - - Item => - Item)
    processedText = processedText.replace(/^(?:-\s+)+(-\s+)/gm, '$1');
  
  // Normalize multiple consecutive blank lines to at most two
  processedText = processedText.replace(/\n{3,}/g, '\n\n');

  // 3. Remove Biased or Overconfident Phrasing
  const overconfidentPhrases = [
    /\bI'm (100% )?certain\b/gi,
    /\bI guarantee\b/gi,
  ];

  overconfidentPhrases.forEach(phrase => {
    processedText = processedText.replace(phrase, match => {
      // Replace with more measured alternatives
      const alternatives = {
        "I'm certain": "I believe",
        "I'm 100% certain": "I believe",
        "I guarantee": "I think",
        "without any doubt": "based on available information",
        "absolutely certain": "confident",
        "absolutely sure": "confident",
        "I can assure you": "It appears that",
        "I promise": "I expect"
      };
      
      const key = match.toLowerCase();
      for (const [pattern, replacement] of Object.entries(alternatives)) {
        if (key.includes(pattern.toLowerCase())) {
          return replacement;
        }
      }
      return "I believe"; // Default fallback
    });
  });

  // 4. Fix Incomplete or Broken Text
  // Close unclosed code blocks
  const codeBlockFence = '```';
  let openFenceCount = 0;
  let lastFenceIndex = -1;
  let fenceIndex = processedText.indexOf(codeBlockFence);
  
  while (fenceIndex !== -1) {
    openFenceCount++;
    lastFenceIndex = fenceIndex;
    fenceIndex = processedText.indexOf(codeBlockFence, lastFenceIndex + codeBlockFence.length);
  }
  
  // If odd number of fences, add a closing fence
  if (openFenceCount % 2 !== 0) {
    processedText += `\n${codeBlockFence}`;
  }
  
  // Fix sentences that end abruptly
  processedText = processedText.replace(/([a-z])(\s*\n|\s*$)/g, '$1.$2');

  // 5. Filter Unsafe or Sensitive Content
  // Basic HTML script tag removal
  processedText = processedText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Filter other potentially unsafe HTML
  processedText = processedText.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  
  // 6. Final Cleanup
  // Trim trailing whitespace from each line
  processedText = processedText.split('\n').map(line => line.trimRight()).join('\n');
  
  // Remove trailing line breaks and spaces
  processedText = processedText.trim();
  
  // 7. Visual Formatting & Readability
  // Add a line break after every full stop followed by a capital letter if no line break exists
  // This helps break up dense text paragraphs
  processedText = processedText.replace(/\.([A-Z])/g, '.\n$1');
  
  // Clean up multiple consecutive line breaks again after formatting changes
  processedText = processedText.replace(/\n{3,}/g, '\n\n');

    // 8. Fix bullet point gaps: join bullet and text if separated by blank line
    processedText = processedText.replace(/(^[-*]\s*)\n+([^\n*-].*)/gm, '$1$2');
  }
  
  return processedText;
}

// Add global style to force all AI text to be white
const GlobalStyles = () => (
  <style jsx global>{`
    .ai-response-text, 
    .ai-response-text * {
      color: #ffffff !important;
    }
    
    .ai-response-text h1,
    .ai-response-text h2,
    .ai-response-text h3,
    .ai-response-text h4,
    .ai-response-text h5,
    .ai-response-text h6,
    .ai-response-text p,
    .ai-response-text a,
    .ai-response-text li,
    .ai-response-text span,
    .ai-response-text strong,
    .ai-response-text em {
      color: #ffffff !important;
      max-width: 100% !important;
      word-wrap: break-word !important;
      white-space: pre-wrap !important;
      overflow-wrap: break-word !important;
    }
    
    .ai-response-text pre,
    .ai-response-text code {
      color: #fff !important;
      background: #232323 !important;
      border-radius: 6px;
      padding: 0.2em 0.4em;
      max-width: 100% !important;
      white-space: pre-wrap !important;
      overflow-x: hidden !important;
      word-break: break-word !important;
    }
    
    .ai-response-text blockquote {
      color: #fff !important;
      background: #232323 !important;
      border-left: 4px solid #00bcd4;
      padding: 0.5em 1em;
      margin: 0.5em 0;
      border-radius: 6px;
      max-width: 100% !important;
      word-wrap: break-word !important;
    }
    
    .ai-response-text li {
      color: #fff !important;
      background: transparent !important;
      margin-left: 1.5rem !important;
      position: relative !important;
      display: list-item !important;
    }
    
    .ai-response-text ul {
      list-style-type: disc !important;
      margin: 0.5em 0 !important;
      padding-left: 1.5em !important;
    }
    
    .ai-response-text ol {
      list-style-type: decimal !important;
      margin: 0.5em 0 !important;
      padding-left: 1.5em !important;
    }
    
    .ai-response-text ul li {
      list-style-type: disc !important;
      display: list-item !important;
    }
    
    .ai-response-text ol li {
      list-style-type: decimal !important;
      display: list-item !important;
    }
    
    .ai-response-text * {
      max-width: 100% !important;
      overflow-wrap: break-word !important;
    }
    .default-chat-markdown {
      h1, h2, h3, h4, h5, h6 {
        margin-top: 1.5em;
        margin-bottom: 0.75em;
        line-height: 1.3;
        color: #e5e5e5;
      }
      p {
        margin-bottom: 1em;
        line-height: 1.7;
        color: #e5e5e5;
      }
      ul, ol {
        margin: 0.5em 0 1em 2em;
        padding-left: 1.5em;
      }
      li {
        margin-bottom: 0.5em;
        color: #e5e5e5;
      }
      code {
        background: #232323;
        color: #fff;
        border-radius: 6px;
        padding: 0.2em 0.4em;
        font-size: 0.95em;
      }
      pre {
        background: #232323;
        color: #fff;
        border-radius: 8px;
        padding: 1em;
        overflow-x: auto;
        margin: 1em 0;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 1.5em 0;
      }
      th, td {
        border: 1px solid #333;
        padding: 0.5em 1em;
        text-align: left;
      }
      blockquote {
        border-left: 4px solid #00bcd4;
        background: #232323;
        color: #fff;
        padding: 0.5em 1em;
        margin: 1em 0;
        border-radius: 6px;
      }
    }
  `}</style>
);

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => (
    <h1
      className="ai-title text-[2.5rem] font-medium leading-tight mb-2 mt-4"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2
      className="ai-section-title text-[1.7rem] font-medium leading-snug mb-1 mt-3"
      {...props}
    />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p
      className="ai-body-text text-[1.08rem] font-normal leading-relaxed mb-2"
      {...props}
    />
  ),
};

interface ImageContext {
  order: number;        // The order in which this image was uploaded (1-based)
  description: string;  // The description from Gemma
  imageUrl: string;     // URL of the image for reference
  timestamp: number;    // When this image was processed
}

// Define a local (renamed) Message interface (not extending BaseMessage) to avoid type incompatibility
interface LocalMessage {
  role: 'user' | 'assistant' | 'search-ui';
  isProcessed?: boolean;
  isStreaming?: boolean;
  imageUrls?: string[];
  content: string;
  id?: string;
  contentType?: string;
  timestamp?: number;
  webSources?: any;
  structuredContent?: any;
  parentId?: string;
  query?: string; // Add this property for search-ui messages
}

// Helper to enforce Advance Search output structure
function enforceAdvanceSearchStructure(output: string): string {
  if (!output) return output;
  const lines = output.split('\n');
  
  // Initialize variables to track sections
  let hasIntro = false;
  let hasTable = false;
  let hasConclusion = false;
  let introSection = '';
  let tableSection = '';
  let conclusionSection = '';
  let contentSections: {title: string, content: string}[] = [];
  
  // Track the current section being processed
  let currentSection = 'none';
  let currentSectionTitle = '';
  let currentSectionContent: string[] = [];
  let inTable = false;
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Detect headings
    if (line.startsWith('# ')) {
      // Main title - remove it
      continue;
    } else if (line.startsWith('## ')) {
      // Finish previous section
      if (currentSection !== 'none' && currentSectionContent.length > 0) {
        if (currentSection === 'intro') {
          introSection = processIntroduction(currentSectionContent);
          hasIntro = true;
        } else if (currentSection === 'conclusion') {
          conclusionSection = processConclusion(currentSectionContent);
          hasConclusion = true;
        } else if (currentSection === 'table') {
          tableSection = processTableSection(currentSectionContent);
          hasTable = true;
        } else if (currentSection === 'content') {
          contentSections.push({
            title: currentSectionTitle,
            content: processBulletPoints(currentSectionContent)
          });
        }
      }
      
      // Start new section
      currentSectionTitle = line.substring(3).trim();
      currentSectionContent = [];
      inTable = false;
      
      // Identify section type
      if (currentSectionTitle.toLowerCase().includes('summary table')) {
        currentSection = 'table';
        inTable = true;
      } else if (currentSectionTitle.toLowerCase().includes('conclusion')) {
        currentSection = 'conclusion';
      } else {
        currentSection = 'content';
      }
    } else {
      // If this is the first content without a heading, it's the introduction
      if (currentSection === 'none') {
        currentSection = 'intro';
        currentSectionContent.push(line);
      } else {
        // Add line to current section
        currentSectionContent.push(line);
      }
    }
  }
  
  // Process the last section
  if (currentSection !== 'none' && currentSectionContent.length > 0) {
    if (currentSection === 'intro') {
      introSection = processIntroduction(currentSectionContent);
      hasIntro = true;
    } else if (currentSection === 'conclusion') {
      conclusionSection = processConclusion(currentSectionContent);
      hasConclusion = true;
    } else if (currentSection === 'table') {
      tableSection = processTableSection(currentSectionContent);
      hasTable = true;
    } else if (currentSection === 'content') {
      contentSections.push({
        title: currentSectionTitle,
        content: processBulletPoints(currentSectionContent)
      });
    }
  }
  
  // Ensure we have required sections
  if (!hasIntro) {
    introSection = "The research findings provide insights into the requested topic. This introduction serves as an overview of the key points that will be discussed in detail in the following sections.";
  }
  
  if (!hasTable) {
    tableSection = "## Summary Table\n| Category | Key Points |\n| -------- | ---------- |\n| Key Finding | Main insight from research | [1] |\n| Best Practice | Recommended approach | [2] |\n| Consideration | Important factor to note | [3] |";
  }
  
  if (!hasConclusion) {
    conclusionSection = "## Conclusion\nIn conclusion, the research highlights several important aspects of the topic. The key findings demonstrate the significance and implications of the subject matter. Understanding these elements can help in developing a more comprehensive approach to addressing related challenges and opportunities.";
  }
  
  // Rebuild the output with proper structure
  let formattedOutput = '';
  
  // Add introduction (without heading)
  formattedOutput += introSection + '\n\n';
  
  // Add content sections
  for (const section of contentSections) {
    formattedOutput += `## ${section.title}\n${section.content}\n\n`;
  }
  
  // Add summary table
  formattedOutput += tableSection + '\n\n';
  
  // Add conclusion
  formattedOutput += conclusionSection;
  
  return formattedOutput;
}

/**
 * Process the introduction paragraph
 * Ensures it's a proper paragraph without citations
 */
function processIntroduction(lines: string[]): string {
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
function processBulletPoints(lines: string[]): string {
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
function formatBulletPoint(bulletText: string): string {
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
function processTableSection(lines: string[]): string {
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
function processConclusion(lines: string[]): string {
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
 * Limit text to a specific number of sentences
 */
function limitSentences(text: string, minSentences: number, maxSentences: number): string {
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
function cleanText(text: string): string {
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

// Helper to clean AI output
function cleanAIOutput(text: string): string {
  let cleanedText = text;
  
  // We want to preserve <think> tags, so we don't remove them anymore
  // cleanedText = cleanedText.replace(/<think>[\s\S]*?<\/think>/g, '');
  
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

// Helper to make citations clickable in AI output
const makeCitationsClickable = (content: string, sources: any[] = []) => {
  if (!content) return content;
  // Replace [1], [2], ... with anchor tags
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (sources[idx] && sources[idx].url) {
      return `<a href="${sources[idx].url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-1 py-0.5 rounded bg-blue-900/30 text-blue-400 text-xs hover:bg-blue-800/40 transition-colors">[${num}]</a>`;
    }
    return match;
  });
};

// Add a simple Stack component for vertical spacing
const Stack = ({ spacing = 20, children }: { spacing?: number; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing}px` }}>
    {children}
  </div>
);

function DeepResearchBlock({ query, conversationHistory, onClearHistory, onFinalAnswer }: { 
  query: string, 
  conversationHistory: {
    previousQueries: string[];
    previousResponses: string[];
  },
  onClearHistory?: () => void,
  onFinalAnswer?: (answer: string, sources?: any[]) => void
}) {
  // State to track if content is restored from storage
  const [isBlockRestoredFromStorage, setIsBlockRestoredFromStorage] = useState(false);
  
  // State to track if this search is already completed
  const [isSearchAlreadyCompleted, setIsSearchAlreadyCompleted] = useState(false);
  
  // Add ref to track initial load and restoration
  const isInitialLoadRef = useRef(true);
  const restorationAttemptedRef = useRef(false);
  
  // Track if answer has been added to the main chat to prevent duplicates
  const [answerAddedToMainChat, setAnswerAddedToMainChat] = useState(false);
  
  // Store final answer for completed searches
  const [completedSearchAnswer, setCompletedSearchAnswer] = useState<string | null>(null);
  const [completedSearchSources, setCompletedSearchSources] = useState<any[] | null>(null);
  
  // Track if we're streaming the response to main chat
  const [isStreamingToMainChat, setIsStreamingToMainChat] = useState(false);
  const streamedContentRef = useRef<string>('');
  
  // State to hold restored deep research state
  const [restoredState, setRestoredState] = useState<{
    steps?: any[];
    activeStepId?: string | null;
    isComplete?: boolean;
    isInProgress?: boolean;
    webData?: any | null;
    isFullyCompleted?: boolean;
  }>({});
  
  // Store the previous query to detect changes
  const [previousQuery, setPreviousQuery] = useState(query);
  
  // Check if the main chat already contains this answer
  const checkIfAnswerAlreadyInMainChat = useCallback(() => {
    const answerKey = `advance_search_answer_added_${query.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (typeof window !== 'undefined') {
      return localStorage.getItem(answerKey) === 'true';
    }
    return false;
  }, [query]);
  
  // Mark an answer as added to the main chat
  const markAnswerAddedToMainChat = useCallback(() => {
    const answerKey = `advance_search_answer_added_${query.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(answerKey, 'true');
      setAnswerAddedToMainChat(true);
    }
  }, [query]);
  
  // Consolidated state restoration logic
  useEffect(() => {
    if (typeof window === 'undefined' || restorationAttemptedRef.current) {
      return;
    }

    restorationAttemptedRef.current = true;
      const alreadyInMainChat = checkIfAnswerAlreadyInMainChat();
      setAnswerAddedToMainChat(alreadyInMainChat);
      
    // Try to restore from completed searches first
      if (isSearchCompleted(query)) {
        const completedSearch = getCompletedSearch(query);
        if (completedSearch && completedSearch.finalAnswer) {
          setRestoredState({
            steps: completedSearch.steps,
            activeStepId: completedSearch.activeStepId,
            isComplete: true,
            isInProgress: false,
            webData: completedSearch.webData,
          isFullyCompleted: true
          });
          
          setIsBlockRestoredFromStorage(true);
          setIsSearchAlreadyCompleted(true);
          setCompletedSearchAnswer(completedSearch.finalAnswer);
          setCompletedSearchSources(completedSearch.webData?.sources || []);
          
        if (onFinalAnswer && !alreadyInMainChat && typeof completedSearch.finalAnswer === 'string') {
            setTimeout(() => {
              onFinalAnswer(completedSearch.finalAnswer as string, completedSearch.webData?.sources || []);
              markAnswerAddedToMainChat();
            }, 100);
          }
          
        // Mark initial load as complete
        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 100);
        return;
        }
      }
      
    // If not found in completed searches, try localStorage
      const saved = localStorage.getItem('advanceSearchState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
        if (parsed && parsed.steps) {
          const isFullyCompleted = parsed.isFullyCompleted === true && 
                                 parsed.currentQuery === query && 
                                 parsed.finalAnswer;
          
          if (isFullyCompleted) {
            setIsSearchAlreadyCompleted(true);
            setCompletedSearchAnswer(parsed.finalAnswer);
            setCompletedSearchSources(parsed.webData?.sources || []);
            
            if (onFinalAnswer && !alreadyInMainChat && typeof parsed.finalAnswer === 'string') {
              setTimeout(() => {
                onFinalAnswer(parsed.finalAnswer as string, parsed.webData?.sources || []);
                markAnswerAddedToMainChat();
              }, 100);
            }
          }
          
            setRestoredState({
              steps: parsed.steps,
              activeStepId: parsed.activeStepId,
              isComplete: parsed.isComplete,
              isInProgress: parsed.isInProgress,
            webData: parsed.webData,
            isFullyCompleted
            });
            setIsBlockRestoredFromStorage(true);
          }
        } catch (err) {
          console.error("Error restoring deep research state:", err);
          setIsBlockRestoredFromStorage(false);
        }
      } else {
        setIsBlockRestoredFromStorage(false);
      }
      
    // Mark initial load as complete
      setTimeout(() => {
        isInitialLoadRef.current = false;
    }, 100);
  }, [query, onFinalAnswer, checkIfAnswerAlreadyInMainChat, markAnswerAddedToMainChat]);
  
  // Reset state when query changes (but not during initial load)
  useEffect(() => {
    if (!isInitialLoadRef.current && query !== previousQuery) {
      setPreviousQuery(query);
      setIsBlockRestoredFromStorage(false);
      setIsSearchAlreadyCompleted(false);
      setCompletedSearchAnswer(null);
      setCompletedSearchSources(null);
      setAnswerAddedToMainChat(false);
      restorationAttemptedRef.current = false;
    }
  }, [query, previousQuery]);
  
  // Always set the first parameter to true to ensure it processes the query
  // regardless of the parent component's state, EXCEPT when the search is already completed
  const {
    steps,
    activeStepId,
    isComplete,
    isInProgress,
    error,
    webData
  } = useDeepResearch(
    // Always activate the hook for UI, but pass in completed state
    true, 
    query, 
    conversationHistory, 
    isBlockRestoredFromStorage, 
    restoredState
  );
  
  // Save state to localStorage when it changes
  useEffect(() => {
    if (steps.length > 0 && typeof window !== 'undefined') {
      const stateToSave = {
        steps,
        activeStepId,
        isComplete,
        isInProgress,
        webData,
        currentQuery: query
      };
      localStorage.setItem('advanceSearchState', JSON.stringify(stateToSave));
      
      // If search is complete, save it to our completed searches registry
      if (isComplete && steps[steps.length - 1]?.status === 'completed' && steps[steps.length - 1]?.output) {
        // Get the final answer
        const finalAnswer = steps[steps.length - 1].output;
        
        // Save to completed searches
        saveCompletedSearch({
          query,
          steps,
          activeStepId,
          isComplete,
          isInProgress,
          webData,
          finalAnswer,
          timestamp: Date.now(),
          conversationHistory
        });
      }
    }
  }, [steps, activeStepId, isComplete, isInProgress, webData, query, conversationHistory]);
  
  // Wrap the onFinalAnswer callback to prevent duplicate calls
  const safeOnFinalAnswer = useCallback((answer: string, sources?: any[]) => {
    if (!answerAddedToMainChat && onFinalAnswer) {
      onFinalAnswer(answer, sources);
      markAnswerAddedToMainChat();
    }
  }, [answerAddedToMainChat, onFinalAnswer, markAnswerAddedToMainChat]);

  // New function to handle streaming synthesis output to the main chat
  const handleStreamingSynthesisOutput = useCallback((content: string, sources?: any[]) => {
    if (!answerAddedToMainChat && onFinalAnswer && content) {
      if (!isStreamingToMainChat) {
        // Create an initial message with empty content to start the streaming process
        setIsStreamingToMainChat(true);
        onFinalAnswer('', sources);
        streamedContentRef.current = '';
      }
      
      // Only send updates if we've added more content
      if (content.length > streamedContentRef.current.length) {
        streamedContentRef.current = content;
        // Call onFinalAnswer with updated content
        onFinalAnswer(content, sources);
      }
    }
  }, [answerAddedToMainChat, onFinalAnswer, isStreamingToMainChat]);
  
  // Handle onFinalAnswer callback for completed searches
  useEffect(() => {
    const synthStep = steps.find(s => s.id === 'synthesize');
    
    // If synthesis is active and has output, send as streaming content
    if (synthStep && 
        synthStep.status === 'active' && 
        typeof synthStep.output === 'string' && 
        synthStep.output) {
      handleStreamingSynthesisOutput(synthStep.output, webData?.sources || []);
    }
    
    // When synthesis completes, mark as done and save completed search
    if (synthStep && 
        synthStep.status === 'completed' && 
        typeof synthStep.output === 'string' && 
        synthStep.output !== null) {
      
      // Final update with complete content
      handleStreamingSynthesisOutput(synthStep.output, webData?.sources || []);
      
      // Mark as complete
      setIsStreamingToMainChat(false);
      markAnswerAddedToMainChat();
      
      // Save the final answer to our completed searches
      saveCompletedSearch({
        query,
        steps,
        activeStepId,
        isComplete,
        isInProgress,
        webData,
        finalAnswer: synthStep.output,
        timestamp: Date.now(),
        conversationHistory
      });
    }
  }, [steps, isComplete, query, activeStepId, isInProgress, webData, conversationHistory, answerAddedToMainChat, handleStreamingSynthesisOutput, markAnswerAddedToMainChat]);
  
  const [manualStepId, setManualStepId] = useState<string | null>(null);
  const isFinalStepComplete = steps[steps.length - 1]?.status === 'completed';
  
  const hasHistory = conversationHistory.previousQueries.length > 0;
  
  // Use completed search data or live data based on what's available
  const displaySteps = isSearchAlreadyCompleted && restoredState.steps ? restoredState.steps : steps;
  const displayActiveStepId = isSearchAlreadyCompleted ? null : (isFinalStepComplete ? manualStepId || activeStepId : activeStepId);
  const displayWebData = isSearchAlreadyCompleted && restoredState.webData ? restoredState.webData : webData;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-full rounded-xl border border-neutral-800 overflow-hidden mb-2 mt-2 bg-neutral-900 h-full flex flex-col"
      style={{ minHeight: "350px", height: "calc(100vh - 180px)", maxHeight: "550px" }}
    >
      {hasHistory && onClearHistory && (
        <div className="sr-only">
            <button
            onClick={onClearHistory}
            className="text-xs text-cyan-500 hover:text-cyan-400 flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
              </svg>
            Clear history ({conversationHistory.previousQueries.length})
            </button>
          </div>
      )}
      <div className="flex-1 flex flex-col h-full">
        <AdvanceSearch
          steps={displaySteps}
          activeStepId={displayActiveStepId}
          onManualStepClick={isFinalStepComplete ? setManualStepId : undefined}
          manualNavigationEnabled={isFinalStepComplete}
          error={error}
          webData={displayWebData}
          onFinalAnswer={safeOnFinalAnswer}
        />
      </div>
      {error && (
        <div className="text-red-500 text-sm text-center mt-2">{error}</div>
      )}
    </motion.div>
  );
}

/**
 * Smart content extraction function that attempts to identify and extract
 * only the final answer portion of content that might contain reasoning.
 * This helps remove reasoning text without delaying content display.
 */
function extractFinalAnswer(text: string): string {
  if (!text) return '';
  
  // If no reasoning is detected, return the original text
  if (!isReasoningContent(text)) {
    return text;
  }
  
  // Check for common concluding markers that indicate the final answer is starting
  const conclusionMarkers = [
    /In conclusion[,:]?\s+(.+)/i,
    /To (summarize|conclude)[,:]?\s+(.+)/i,
    /The answer (is|would be)[,:]?\s+(.+)/i,
    /So,?\s+(.+)/i,
    /Therefore[,:]?\s+(.+)/i,
    /Based on (this|the above|my analysis)[,:]?\s+(.+)/i,
    /In summary[,:]?\s+(.+)/i,
    /To answer your question[,:]?\s+(.+)/i,
    /In short[,:]?\s+(.+)/i,
    /My answer is[,:]?\s+(.+)/i,
    /To (respond|reply) (to your|to the) question[,:]?\s+(.+)/i,
    /The (result|solution|response) is[,:]?\s+(.+)/i,
    /Ultimately[,:]?\s+(.+)/i,
    /In the end[,:]?\s+(.+)/i,
    /Finally[,:]?\s+(.+)/i,
    /In simple terms[,:]?\s+(.+)/i,
    /Thus[,:]?\s+(.+)/i,
    /Hence[,:]?\s+(.+)/i,
    /As a result[,:]?\s+(.+)/i,
    /Consequently[,:]?\s+(.+)/i,
    /This means[,:]?\s+(.+)/i,
    /To put it simply[,:]?\s+(.+)/i,
    /Simply put[,:]?\s+(.+)/i,
    /My name is\s+(.+)/i,
    /To summarize[,:]?\s+(.+)/i,
    /In essence[,:]?\s+(.+)/i,
    /Putting it together[,:]?\s+(.+)/i,
    /To conclude[,:]?\s+(.+)/i,
    /In brief[,:]?\s+(.+)/i,
    /In a nutshell[,:]?\s+(.+)/i,
    /To sum up[,:]?\s+(.+)/i,
    /In short[,:]?\s+(.+)/i,
    /My conclusion is[,:]?\s+(.+)/i,
    /My final answer is[,:]?\s+(.+)/i
  ];
  
  // Loop through each pattern and check if it matches
  for (const marker of conclusionMarkers) {
    const match = text.match(marker);
    if (match && match[1]) {
      const remaining = text.substring(text.indexOf(match[0]));
      return remaining;
    }
  }
  
  // Try more aggressively to remove reasoning content
  // Split by paragraphs and check each for reasoning
  const paragraphs = text.split('\n\n');
  if (paragraphs.length > 1) {
    // Check if first paragraph is reasoning
    if (isReasoningContent(paragraphs[0])) {
      // Try to find the first non-reasoning paragraph
      for (let i = 1; i < paragraphs.length; i++) {
        // If paragraph is substantial enough (20+ chars) and not reasoning
        if (!isReasoningContent(paragraphs[i]) && paragraphs[i].trim().length > 20) {
          // Return everything from this paragraph onwards
          return paragraphs.slice(i).join('\n\n');
        }
      }
      
      // If all paragraphs have reasoning, try to return only the last paragraph
      // which often contains a conclusion even if it has some reasoning indicators
      if (paragraphs[paragraphs.length - 1].length > 50) {
        return paragraphs[paragraphs.length - 1];
      }
    }
  }
  
  // Try splitting by sentences and finding where reasoning ends
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length > 3) {
    let reasoningEnded = false;
    let finalAnswer = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const currentSentence = sentences[i];
      
      // Skip very short sentences
      if (currentSentence.trim().length < 5) continue;
      
      // If we've found the end of reasoning, collect remaining sentences
      if (reasoningEnded) {
        finalAnswer.push(currentSentence);
      } 
      // Check if this sentence contains transition markers that indicate the end of reasoning
      else if (
        /therefore|thus|hence|so|as a result|consequently|in conclusion|to summarize|to conclude|in summary/.test(currentSentence.toLowerCase())
      ) {
        reasoningEnded = true;
        finalAnswer.push(currentSentence);
      }
    }
    
    // If we found content after reasoning
    if (finalAnswer.length > 0) {
      return finalAnswer.join(' ');
    }
  }
  
  // If we couldn't find a clear transition, check for a content section starting with a heading
  const headingMatch = text.match(/#{1,3}\s+([^\n]+)/);
  if (headingMatch) {
    const headingPos = text.indexOf(headingMatch[0]);
    if (headingPos > 0) {
      // Return everything from the first heading onwards
      return text.substring(headingPos);
    }
  }
  
  // Last resort: just return the last 60% of the text
  // This is based on the observation that reasoning usually appears at the beginning
  const startPosition = Math.floor(text.length * 0.4);
  return text.substring(startPosition);
}

/**
 * Advanced detection of AI reasoning/thinking content.
 * This function identifies text patterns that indicate the AI is still in its reasoning process
 * rather than providing a final answer.
 */
function isReasoningContent(text: string): boolean {
  if (!text) return false;
  
  // Simple keyword matching - Expanded with more reasoning indicators
  const reasoningKeywords = [
    'thinking', 'processing', 'let me think', 'let me analyze', 
    'reasoning:', 'first,', 'let\'s break this down', 'step by step',
    'let\'s think about', 'analyzing', 'i need to consider',
    'thinking through', 'breaking down', 'step 1', 'step 2',
    'first step', 'second step', 'let me understand',
    'let me approach this', 'reasoning through',
    // Additional reasoning keywords
    'to solve this', 'to answer this', 'i\'ll start by', 
    'considering', 'my approach', 'if we analyze', 
    'thinking about', 'let\'s see', 'examine', 'breaking this down',
    'to determine', 'let\'s look at', 'to figure out', 
    'working through', 'to solve this problem', 'to understand this',
    'going step by step', 'let\'s consider', 'let\'s tackle',
    'approaching this question', 'first and foremost', 
    'start by identifying', 'i should first', 'we need to',
    'to begin with', 'before answering', 'think about',
    'in order to answer', 'the key is to', 'dissecting',
    'let me work through', 'my thought process', 'i\'m thinking',
    'when we consider', 'let\'s reason', 'this requires',
    'what do we know', 'given that', 'we can determine',
    'let\'s establish', 'going to approach', 'trying to figure out',
    'mapping out', 'outlining', 'conceptualizing', 'i\'ll try to',
    // New reasoning keywords
    'alright,', 'okay,', 'i\'ll help', 'i need to understand', 
    'to address this', 'i\'ll explore', 'i\'ll investigate',
    'let\'s explore', 'i can see that', 'to approach this',
    'i\'ll need to', 'we should examine', 'i\'ll outline',
    'i can approach', 'in this case', 'for this query',
    'i\'ll provide', 'i\'ll first', 'i\'ll now',
    'breaking this into', 'looking at this', 'analyzing this',
    'addressing your question', 'tackling this problem',
    'addressing this task', 'starting with', 'beginning with',
    'understanding the problem', 'understanding the question',
    'understanding your query', 'unpacking this', 'diving into',
    'to solve this problem', 'taking a step back', 'thinking broadly',
    'from a broader perspective', 'from my analysis', 'based on this information',
    'according to my understanding', 'to fully address', 'to properly answer',
    'to accurately respond', 'i can definitely help', 'i\'ll assist you',
    'to help with this', 'based on your question', 'based on what you\'ve asked'
  ];
  
  const lowerText = text.toLowerCase();
  
  // Check for reasoning keywords at beginning of text
  const firstFewChars = lowerText.trim().slice(0, 50);
  for (const keyword of reasoningKeywords) {
    if (firstFewChars.includes(keyword)) {
      return true;
    }
  }
  
  // Check for reasoning keywords - Only check at the beginning of the text or a new paragraph
  // This reduces false positives for casual mentions of these terms
  const paragraphs = lowerText.split('\n\n');
  for (const paragraph of paragraphs) {
    // Check first 50 characters (up from 40) of each paragraph for reasoning keywords
    const paragraphStart = paragraph.trim().slice(0, 50);
    for (const keyword of reasoningKeywords) {
      if (paragraphStart.includes(keyword)) {
        return true;
      }
    }
  }
  
  // Check for typical reasoning structures
  const reasoningPatterns = [
    /^(I'll|I will|Let me|I'm going to|I can) (think|analyze|break|approach|consider|explore|tackle|address|unpack)/i,
    /^(First|To start|Let's start|To begin|Beginning|Initially|Let's first|First of all|For starters)/i,
    /^(Step \d|[1-9]\.)/i,
    /^(Looking at|Analyzing|Examining|Considering|Exploring|Assessing|Investigating) (this|the|your|these)/i,
    /^(I need to|I should|I must|We need to|Let's|I'll need to) (analyze|consider|think|examine|understand|determine|figure out)/i,
    /^(Let's|I'll) (break|take|work|go|reason|think|walk) (this|it) (down|through|step by step|apart)/i,
    /^(To determine|To figure out|To understand|To solve|To address|To answer)/i,
    /^(My approach|My reasoning|My thought process|The approach|The strategy|The key|The way) (is|will be|involves)/i,
    /^(Given|Since|Because|With) (the|this|these|that)/i,
    /^(The first thing|The next step|The final step|One important aspect|Another consideration)/i,
    /^(Let me break|Let me walk|Let me guide|Let me help|Let me show)/i,
    /^(In order to|Before I|So I|Therefore I|Thus, I)/i,
    /^(When we|When I|If we|If I) (look at|consider|analyze|examine|think about)/i,
    // New reasoning patterns
    /^(Alright|Okay|I'll help|Let's dive into|To address)/i,
    /^(I can see that|I'll outline|I can approach|In this case|For this query)/i,
    /^(I'll provide|I'll first|I'll now|Breaking this|Looking at this)/i,
    /^(Addressing your|Tackling this|Starting with|Beginning with|Understanding the)/i,
    /^(From a|Based on|According to|To fully|To properly|To accurately)/i,
    /^(I understand that|I can help|I'll assist|Let me assist|Let me provide)/i,
    /^(For your|Regarding your|Concerning your|About your|To elaborate)/i,
    /^(Let me clarify|Let me explain|Let me elaborate|Let me share|Let me offer)/i,
    /^(I'm happy to|I'd be happy to|I'd love to|I'm glad to|I'll now)/i,
    /^(Here's how|Here's what|Here's a|Here's my|Here, I'll)/i,
  ];
  
  for (const pattern of reasoningPatterns) {
    if (pattern.test(lowerText)) {
      return true;
    }
  }
  
  // Check for thinking tag remnants even if they're being filtered elsewhere
  if (lowerText.includes("<think>") || lowerText.includes("</think>")) {
    return true;
  }
  
  // Check for sequential reasoning indicators
  const sequentialPatterns = [
    /first\W+(?:.*\W+)second/i,
    /1\.\W+(?:.*\W+)2\./i,
    /step 1\W+(?:.*\W+)step 2/i,
    /firstly\W+(?:.*\W+)secondly/i,
    /one\W+(?:.*\W+)two\W+(?:.*\W+)three/i,
    /begins with\W+(?:.*\W+)then\W+(?:.*\W+)finally/i,
    /start by\W+(?:.*\W+)next\W+(?:.*\W+)finally/i,
    /begin by\W+(?:.*\W+)then\W+(?:.*\W+)lastly/i,
    // New sequential patterns
    /initially\W+(?:.*\W+)then\W+(?:.*\W+)finally/i,
    /first\W+(?:.*\W+)next\W+(?:.*\W+)finally/i,
    /first\W+(?:.*\W+)then\W+(?:.*\W+)lastly/i,
    /first\W+(?:.*\W+)next\W+(?:.*\W+)last/i,
    /to begin\W+(?:.*\W+)next\W+(?:.*\W+)finally/i,
    /starting with\W+(?:.*\W+)followed by\W+(?:.*\W+)finally/i,
    /starting with\W+(?:.*\W+)then\W+(?:.*\W+)ending with/i,
    /begin with\W+(?:.*\W+)move to\W+(?:.*\W+)finish with/i
  ];
  
  for (const pattern of sequentialPatterns) {
    if (pattern.test(lowerText)) {
      return true;
    }
  }
  
  // Check if text has reasoning structure with "if...then" or condition analysis
  const hasReasoningStructure = 
    (lowerText.includes("if") && lowerText.includes("then")) ||
    (lowerText.includes("when") && lowerText.includes("we get")) ||
    (lowerText.includes("because") && lowerText.includes("this means")) ||
    (lowerText.includes("consider") && lowerText.includes("we find"));
    
  if (hasReasoningStructure) {
    return true;
  }
  
  return false;
}

/**
 * Smart content buffer processor that determines when the AI has finished reasoning
 * and is providing its final answer. This helps prevent showing the reasoning process
 * to the user and only displays the final output.
 */
function processStreamBuffer(buffer: string): {
  showContent: boolean;
  processedContent: string;
  hasCompletedReasoning: boolean;
} {
  // Don't show anything until we have some content
  if (!buffer || buffer.length < 10) {
    return { 
      showContent: false, 
      processedContent: '',
      hasCompletedReasoning: false
    };
  }

  // First, check if the entire buffer is JSON
  if ((buffer.trim().startsWith('{') && buffer.trim().endsWith('}')) ||
      (buffer.trim().startsWith('[') && buffer.trim().endsWith(']'))) {
    try {
      // Try to parse as JSON
      JSON.parse(buffer.trim());
      // If successful, process it through our JSON handler
      return { 
        showContent: true, 
        processedContent: handlePotentialJsonInConversation(buffer),
        hasCompletedReasoning: true
      };
    } catch (e) {
      // Not valid JSON yet or incomplete
    }
  }

  // Check for and clean advanced search structure elements in the streamed content
  let processedContent = buffer;
  
  // Early detection of advanced search structure formation
  const hasSummaryTableMarker = processedContent.includes("## Summary Table");
  const hasConclusionMarker = processedContent.includes("## Conclusion");
  const hasMarkdownTableStart = processedContent.includes("| ") && processedContent.includes(" |") && processedContent.includes("\n|");
  
  // If we detect advanced search patterns forming, clean them
  if (hasSummaryTableMarker || hasConclusionMarker || hasMarkdownTableStart) {
    // Apply cleaning rules for specific patterns
    if (hasSummaryTableMarker) {
      processedContent = processedContent.replace(/##\s*Summary\s*Table[\s\S]*?(?=##|$)/gi, '');
    }
    if (hasConclusionMarker) {
      processedContent = processedContent.replace(/##\s*Conclusion\s*/gi, '');
    }
    if (hasMarkdownTableStart) {
      processedContent = processedContent.replace(/\|[\s\S]*?\|[\s\S]*?\|[\s\S]*?(?=\n\n|\n$|$)/g, '');
    }
    
    // Remove any section headers
    processedContent = processedContent.replace(/##\s*[A-Za-z][A-Za-z\s]+/gi, '');
    
    // Clean up spacing
    processedContent = processedContent.replace(/\n{3,}/g, '\n\n').trim();
  }
  
  // Check if reasoning is complete (keep this logic intact)
  const hasCompletedReasoning = 
    processedContent.includes('</think>') && 
    !processedContent.endsWith('</think>') &&
    processedContent.lastIndexOf('</think>') < processedContent.length - 10;
  
    return { 
    showContent: true, 
    processedContent,
    hasCompletedReasoning
  };
}

/**
 * Detects and cleans advanced search structure from default chat messages
 * @param content The chat message content to check and clean
 * @returns An object with detection flag and cleaned content
 */
function detectAndCleanAdvancedStructure(content: string): { 
  hasAdvancedStructure: boolean;
  cleanedContent: string;
} {
  if (!content) return { hasAdvancedStructure: false, cleanedContent: content };
  
  // Check for advanced search structural elements
  const hasSummaryTable = content.includes("## Summary Table");
  const hasConclusion = content.includes("## Conclusion");
  const hasMarkdownTable = (content.match(/\|\s*-+\s*\|/g)?.length || 0) > 0;
  const hasMultipleHeaders = (content.match(/##\s+[A-Za-z]/g)?.length || 0) >= 2;
  
  const hasAdvancedStructure = hasSummaryTable || 
                              (hasConclusion && hasMultipleHeaders) || 
                              (hasMarkdownTable && hasMultipleHeaders);
  
  if (!hasAdvancedStructure) {
    return { hasAdvancedStructure: false, cleanedContent: content };
  }
  
  // Clean the content if advanced structure is detected
  let cleanedContent = content;
  
  // Remove summary table section (including the table)
  cleanedContent = cleanedContent.replace(/##\s*Summary\s*Table[\s\S]*?(?=##|$)/gi, '');
  
  // Remove markdown tables (matching table headers and separators)
  cleanedContent = cleanedContent.replace(/\|[\s\S]*?\|[\s\S]*?\|[\s\S]*?(?=\n\n|\n$|$)/g, '');
  
  // Remove conclusion header but keep its content
  cleanedContent = cleanedContent.replace(/##\s*Conclusion\s*/gi, '');
  
  // Remove any other section headers that might be part of the structure
  cleanedContent = cleanedContent.replace(/##\s*[A-Za-z][A-Za-z\s]+/gi, '');
  
  // Fix spacing issues from removals
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  
  // Clean up trailing whitespace
  cleanedContent = cleanedContent.trim();
  
  return { hasAdvancedStructure, cleanedContent };
}

// Add prompt handler functions after the BASE_SYSTEM_PROMPT and before the TestChat component
const getDefaultChatPrompt = (basePrompt: string) => {
  return `${basePrompt}

IMPORTANT FOR DEFAULT CHAT:
- You are encouraged to show your thinking process using <think> tags, like this:
  <think>
  First, I need to analyze this question...
  Here's what I know about this topic...
  My reasoning process is...
  </think>
- After your thinking process, provide your final answer
- Use markdown formatting for better readability
- Format code blocks with proper syntax highlighting
- DO NOT use structured formats like Summary Tables or Conclusion sections
- DO NOT use multiple section headers (##) in your responses
- Keep your responses conversational and natural`;
};

const getSearchPrompt = (basePrompt: string) => {
  return `${basePrompt}

IMPORTANT FOR SEARCH:
- Focus on finding and presenting relevant information
- Include source citations when available
- Structure the response with clear sections
- Highlight key findings
- Provide a summary of search results`;
};

const getStructuredQueryPrompt = (basePrompt: string, queryType: string, schema: any) => {
  return `${basePrompt}

IMPORTANT FOR STRUCTURED QUERY (${queryType}):
- Response MUST be a single JSON object
- Strictly conform to the provided schema
- Include all required fields
- Maintain proper data types
- No additional text outside the JSON object
- ONLY use this format when explicitly requested by the user

Schema:
${JSON.stringify(schema, null, 2)}`;
};

export default function TestChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatError, setChatError] = useState(""); // Renamed from error to chatError
  const [showHeading, setShowHeading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputBarHeight, setInputBarHeight] = useState(96); // px, default
  const BASE_HEIGHT = 48; // px (h-12)
  const MAX_HEIGHT = BASE_HEIGHT * 3; // 3x
  const EXTRA_GAP = 32; // px
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef1 = useRef<HTMLInputElement>(null);

  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [selectedFilesForUpload, setSelectedFilesForUpload] = useState<File[]>([]);
  const [isAiResponding, setIsAiResponding] = useState(false);
  
  // Replace the simple string array with a more structured approach
  const [imageContexts, setImageContexts] = useState<ImageContext[]>([]);
  // Keep track of how many images have been uploaded
  const [imageCounter, setImageCounter] = useState(0);

  const aiStreamAbortController = useRef<AbortController | null>(null);

  // Separate UI state from processing state for Advance Search
  const [showAdvanceSearchUI, setShowAdvanceSearchUI] = useState(false); // UI state for the button
  const [isAdvanceSearchActive, setIsAdvanceSearchActive] = useState(false); // Processing state
  const [currentQuery, setCurrentQuery] = useState('');
  
  // Add state for tracking Advance Search conversation history
  const [advanceSearchHistory, setAdvanceSearchHistory] = useState<{
    previousQueries: string[];
    previousResponses: string[];
  }>({
    previousQueries: [],
    previousResponses: []
  });
  
  // Add state to track if the chat was restored from storage
  const [isRestoredFromStorage, setIsRestoredFromStorage] = useState(false);
  
  // Add state to hold the restored deep research state
  const [restoredDeepResearchState, setRestoredDeepResearchState] = useState<{
    steps?: any[];
    activeStepId?: string | null;
    isComplete?: boolean;
    isInProgress?: boolean;
    webData?: any | null;
  }>({});
  
  // Deep Research hook - now passing processing state instead of UI state
  const {
    steps,
    activeStepId,
    isComplete,
    isInProgress,
    error,
    webData
  } = useDeepResearch(
    isAdvanceSearchActive, 
    currentQuery, 
    advanceSearchHistory,
    isRestoredFromStorage, // Pass the flag to control process start
    restoredDeepResearchState // Pass the restored state
  );

  const [manualStepId, setManualStepId] = useState<string | null>(null);
  const isFinalStepComplete = steps[steps.length - 1]?.status === 'completed';

  const [emptyBoxes, setEmptyBoxes] = useState<string[]>([]); // Array of box IDs

  const [showPulsingDot, setShowPulsingDot] = useState(false);

  // Add a state to track if the chat is empty (no messages)
  const isChatEmpty = messages.length === 0;
  // Track if the user has sent the first message (for animation and session creation)
  const [hasInteracted, setHasInteracted] = useState(false);

  // This will control the position of the input box and heading (centered vs bottom)
  const inputPosition = isChatEmpty && !hasInteracted && !activeSessionId ? "center" : "bottom";

  // Add ref to track initial load - put this near the top with other state
  const isInitialLoadRef = useRef(true);

  // Effect to load the last active session or create a new one on initial load
  useEffect(() => {
    const savedSessionId = getActiveSessionId();
    if (savedSessionId) {
      // Load the saved session
      setActiveSessionId(savedSessionId);
      
      // Get messages and ensure they're marked as processed
      const sessionMessages = getSessionMessages(savedSessionId);
      const processedMessages = sessionMessages.map(msg => ({
        ...msg,
        isProcessed: true // Mark all loaded messages as processed
      }));
      
      setMessages(processedMessages);
      setShowHeading(false);
      setHasInteracted(true);
      setIsRestoredFromStorage(true); // Set the flag to indicate restoration from storage
    } else {
      // Show welcome page for new users
      setShowHeading(true);
      setHasInteracted(false);
      setActiveSessionId(null);
      setMessages([]);
      setIsRestoredFromStorage(false); // Not restored from storage
    }
  }, []);

  // Effect to save messages whenever they change for the active session
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      saveSessionMessages(activeSessionId, messages);
      updateSessionTimestamp(activeSessionId); // Also update timestamp on new message
    }
  }, [messages, activeSessionId]);

  // Helper to show the image in chat
  const showImageMsg = (content: string, imgSrc: string) => {
    setMessages((prev) => [
      ...prev,
      { 
        role: "user" as const, 
        content: `${content} <img src=\"${imgSrc}\" />`,
        id: uuidv4(),
        timestamp: Date.now(),
        isProcessed: true // Mark as processed
      },
    ]);
  };

  // Auto-resize textarea
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, MAX_HEIGHT) + 'px';
    }
  }, [input]);

  // Measure input bar height dynamically
  useLayoutEffect(() => {
    if (inputBarRef.current) {
      setInputBarHeight(inputBarRef.current.offsetHeight);
    }
  }, [input]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Hide the Deep Research view when research completes and AI responds
  useEffect(() => {
    if (isComplete && !isAiResponding) {
      // Only hide the research view when both research is complete and AI has responded
      setIsAdvanceSearchActive(false); // Turn off the processing state
      // But keep the UI state the same for the next query
    }
  }, [isComplete, isAiResponding]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    // First check if we're in search mode
    if (activeButton === 'search') {
      // Add user message to chat
      setMessages(prev => [
        ...prev,
        { 
          role: 'user',
          id: uuidv4(),
          content: input,
          timestamp: Date.now(),
          isProcessed: true
        },
        { 
          role: 'search-ui',
          id: uuidv4(), 
          content: input,
          query: input,
          timestamp: Date.now(),
          isProcessed: true
        }
      ]);
      
      setInput('');
      return;
    }

    // Then check if we're in advance search mode
    if (activeButton === 'advance' || input.includes('@AdvanceSearch')) {
      setIsAdvanceSearchActive(true);
      setShowAdvanceSearchUI(true);
      const researchId = uuidv4();
      setMessages(prev => [
        ...prev,
        { role: "user", content: input, id: uuidv4(), timestamp: Date.now(), isProcessed: true },
        { role: "deep-research", content: input, researchId, id: uuidv4(), timestamp: Date.now(), isProcessed: true }
      ]);
      setInput("");
      setImagePreviewUrls([]);
      setSelectedFilesForUpload([]);
      setIsLoading(false);
      setIsAiResponding(false);
      return;
    }

    // If we get here, we're in default chat mode
    let userMessageId = '';
    let uploadedImageUrls: string[] = [];

    try {
    if (!input.trim() || isLoading || isAiResponding) return;

    let currentActiveSessionId = activeSessionId;

    if (!currentActiveSessionId) {
      const newSession = createNewSession(input.trim() || (selectedFilesForUpload.length > 0 ? "Image Upload" : undefined));
      setActiveSessionId(newSession.id);
      saveActiveSessionId(newSession.id);
      currentActiveSessionId = newSession.id;
      setMessages([]);
    }

    if (!hasInteracted) setHasInteracted(true);
      
      // Reset any advance search state when in default chat mode
    if (showAdvanceSearchUI) {
        setShowAdvanceSearchUI(false);
        setIsAdvanceSearchActive(false);
        setIsRestoredFromStorage(false);
        setRestoredDeepResearchState({});
    }

    setIsAiResponding(true);
      setIsLoading(true);
    if (showHeading) setShowHeading(false);

    // Always use conversation type for default chat instead of classifying
    const queryType = "conversation";
    const responseSchema = SCHEMAS.conversation;

    console.log("[handleSend] Query:", input);
    console.log("[handleSend] Using default conversation mode");

    aiStreamAbortController.current = new AbortController();

      let userMessageId = uuidv4();
      const userMessageForDisplay: LocalMessage = {
      role: "user" as const,
      content: input,
      id: userMessageId,
      timestamp: Date.now(),
      isProcessed: true // Mark the user message as processed
    };
    
    // Ensure we're using the final ID from the message object
    userMessageId = userMessageForDisplay.id!;

    if (selectedFilesForUpload.length > 0 && !input) {
      userMessageForDisplay.content = "Image selected for analysis.";
    }
    if (selectedFilesForUpload.length > 0) {
        (userMessageForDisplay as any).imageUrls = imagePreviewUrls || undefined;
    }
    setMessages((prev) => [...prev, userMessageForDisplay]);
    setInput("");

      if (selectedFilesForUpload.length > 0) {
        const clientSideSupabase = createSupabaseClient();
        if (!clientSideSupabase) throw new Error('Supabase client not available');
        
        // Fix the type error by explicitly typing the Promise.all result
        const uploadedUrls: string[] = await Promise.all(
          selectedFilesForUpload.map(async (file: File): Promise<string> => {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;
            const { error: uploadError } = await clientSideSupabase.storage
              .from('images2')
              .upload(filePath, file);
            if (uploadError) {
              console.error('Supabase upload error for file:', file.name, uploadError);
              throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
            }
            const { data: urlData } = clientSideSupabase.storage
              .from('images2')
              .getPublicUrl(filePath);
            if (!urlData.publicUrl) {
              console.error('Failed to get public URL for file:', file.name);
              throw new Error(`Failed to get public URL for ${file.name}`);
            }
            return urlData.publicUrl;
          })
        );
        
        uploadedImageUrls = uploadedUrls;
        
        if (uploadedImageUrls.length === 0 && selectedFilesForUpload.length > 0) {
          throw new Error('Failed to get public URLs for any of the uploaded images.');
        }
      }

      const context = buildConversationContext(convertToConversationMessages(messages));

      // Determine the appropriate prompt based on mode and query type
      let turnSpecificSystemPrompt = BASE_SYSTEM_PROMPT;

      if (activeButton === 'search') {
        turnSpecificSystemPrompt = getSearchPrompt(BASE_SYSTEM_PROMPT);
      } else if (activeButton === 'advance' || input.includes('@AdvanceSearch')) {
        turnSpecificSystemPrompt = getAdvanceSearchPrompt(BASE_SYSTEM_PROMPT);
      } else {
        // Always use default chat prompt for regular chat
        turnSpecificSystemPrompt = getDefaultChatPrompt(BASE_SYSTEM_PROMPT);
      }

      console.log("[handleSend] Turn Specific System Prompt Length:", turnSpecificSystemPrompt.length);

      const enhancedSystemPrompt = enhanceSystemPrompt(turnSpecificSystemPrompt, context, input);
      
      const formattedMessages = formatMessagesForApi(
        enhancedSystemPrompt,
        convertToConversationMessages(messages),
        input,
        true
      );

      const apiPayload: any = {
        messages: formattedMessages,
        temperature: 0.7,        // OPTIMIZATION 3: Increased from 0.6 for faster initial responses
        max_tokens: 3500,
        top_p: 0.9,
        frequency_penalty: 0.2,  // OPTIMIZATION 3: Decreased from 0.5 
        presence_penalty: 0.2,   // OPTIMIZATION 3: Decreased from 0.8
      };
      
      if (uploadedImageUrls.length > 0) {
        const lastUserMsgIndex = formattedMessages.length - 1;
        if (formattedMessages[lastUserMsgIndex].role === 'user') {
          formattedMessages[lastUserMsgIndex].imageUrls = uploadedImageUrls;
        }
        apiPayload.imageUrls = uploadedImageUrls;
        const previousImageDescriptions = imageContexts.map(ctx => ctx.description);
        apiPayload.previousImageDescriptions = previousImageDescriptions;
        if (!userMessageForDisplay.content || userMessageForDisplay.content === "Image selected for analysis.") {
             if (formattedMessages[lastUserMsgIndex]) {
                formattedMessages[lastUserMsgIndex].content = "Describe these images.";
             }
        }
      }
      
      const res = await fetch("/api/nvidia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
        signal: aiStreamAbortController.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`API request failed with status ${res.status}: ${errorData}`);
      }
      
      // Handle JSON response for structured queries
      if (uploadedImageUrls.length === 0 && queryType !== 'conversation') {
        const jsonData = await res.json();
        const structuredData = jsonData.choices?.[0]?.message?.content || jsonData.choices?.[0]?.text || jsonData.content || '';
        let parsedData;
        try {
          parsedData = JSON.parse(structuredData);
        } catch (e) {
          console.error("Failed to parse structured data:", e);
          throw new Error("Failed to parse structured response");
        }

        const aiMsg: LocalMessage = {
        role: "assistant" as const,
          content: '', 
          contentType: queryType,
          structuredContent: parsedData,
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: userMessageId,
          webSources: [],
          isProcessed: true
      };
      setMessages((prev) => [...prev, aiMsg]);
      } else { 
        // Default to streaming logic for all other cases (including 'conversation')
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('No response body available for streaming');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        let contentBuffer = ''; // Buffer to accumulate content
        let hasActualContent = false; // Flag to track if we have meaningful content
        let isReasoningPhase = false; // Flag to track if we're in the reasoning phase
        let hasProcessedFinalContent = false; // Flag to know if we've already shown final content
        
        // Initialize aiMsg for streaming
        const aiMsg: LocalMessage = {
          role: "assistant" as const,
          content: "", 
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: userMessageId,
          imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
          webSources: [],
          contentType: 'conversation',
          isProcessed: true
        };

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            let lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (let line of lines) {
              if (line.startsWith('data:')) {
                const data = line.replace('data:', '').trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.text || parsed.content || '';
                  
                  if (delta) {
                    contentBuffer += delta;
                    
                    // For default chat mode, don't process - just show raw content
                    if (!showAdvanceSearchUI && !input.includes('@AdvanceSearch')) {
                      if (!hasActualContent) {
                        hasActualContent = true;
                        aiMsg.content = contentBuffer;
                        setIsProcessing(false);
                        setMessages((prev) => [...prev, { ...aiMsg }]);
                      } else {
                        aiMsg.content = contentBuffer;
                        setMessages((prev) => {
                          const updatedMessages = [...prev];
                          const aiIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
                          if (aiIndex !== -1) {
                            updatedMessages[aiIndex] = {
                              ...updatedMessages[aiIndex],
                              content: contentBuffer,
                              webSources: aiMsg.webSources,
                              isProcessed: true
                            };
                          }
                          return updatedMessages;
                        });
                      }
                    } else {
                      // For advanced search mode, keep existing processing
                    const { showContent, processedContent, hasCompletedReasoning } = processStreamBuffer(contentBuffer);
                    
                      if (showContent && !hasProcessedFinalContent) {
                      if (!hasActualContent) {
                        hasActualContent = true;
                        aiMsg.content = processedContent;
                        setIsProcessing(false);
                        setMessages((prev) => [...prev, { ...aiMsg }]);
                      } else {
                        aiMsg.content = processedContent;
                    setMessages((prev) => {
                      const updatedMessages = [...prev];
                          const aiIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
                          if (aiIndex !== -1) {
                            updatedMessages[aiIndex] = {
                              ...updatedMessages[aiIndex],
                              content: processedContent,
                              webSources: aiMsg.webSources,
                              isProcessed: true
                        };
                      }
                      return updatedMessages;
                    });
                      }
                      
                      if (hasCompletedReasoning) {
                        hasProcessedFinalContent = true;
                      }
                    } else if (hasActualContent && showContent) {
                      aiMsg.content = processedContent;
                      setMessages((prev) => {
                        const updatedMessages = [...prev];
                        const aiIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
                        if (aiIndex !== -1) {
                          updatedMessages[aiIndex] = {
                            ...updatedMessages[aiIndex],
                            content: processedContent,
                            webSources: aiMsg.webSources,
                            isProcessed: true
                          };
                        }
                        return updatedMessages;
                      });
                    }
                    }
                  }
                } catch (err) {
                  console.error('Error parsing streaming response:', err);
                  continue;
                }
              }
            }
          }
        }
        
        // Apply post-processing after streaming is complete
        if (showAdvanceSearchUI || input.includes('@AdvanceSearch')) {
          const processedResearch = enforceAdvanceSearchStructure(contentBuffer);
          setMessages((prev) => {
            const updatedMessages = [...prev];
            const msgIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
            if (msgIndex !== -1) {
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: processedResearch,
                contentType: 'deep-research',
                isProcessed: true // Ensure message is marked as processed
              };
            }
            return updatedMessages;
          });
        } else {
          // For default chat, detect if it has advanced search structure and clean it if needed
          const { hasAdvancedStructure, cleanedContent } = detectAndCleanAdvancedStructure(contentBuffer);
          
          setMessages((prev) => {
            const updatedMessages = [...prev];
            const msgIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
            if (msgIndex !== -1) {
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: hasAdvancedStructure ? cleanedContent : contentBuffer,
                contentType: 'conversation',
                isProcessed: true // Ensure message is marked as processed
              };
            }
            return updatedMessages;
          });
        }
        
        if (uploadedImageUrls.length > 0) {
            const { content: cleanedContent } = cleanAIResponse(aiMsg.content);
            const descriptionSummary = cleanedContent.slice(0, 150) + (cleanedContent.length > 150 ? '...' : '');
            const newImageCount = imageCounter + uploadedImageUrls.length;
            setImageCounter(newImageCount);
            const newImageContexts = uploadedImageUrls.map((url, index) => ({
                order: imageCounter + index + 1,
                description: descriptionSummary,
                imageUrl: url,
                timestamp: Date.now()
            }));
            setImageContexts(prev => {
                const updated = [...prev, ...newImageContexts];
                return updated.slice(-10);
            });
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
      setMessages((prev) => [
        ...prev,
          { 
            role: "assistant" as const, 
            content: "[Response stopped by user]", 
            id: uuidv4(),
            timestamp: Date.now(),
            parentId: userMessageId, 
            imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
            isProcessed: true // Mark as processed
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { 
            role: "assistant" as const, 
            content: "Error: " + (err?.message || String(err)), 
            id: uuidv4(),
            timestamp: Date.now(),
            parentId: userMessageId, 
            imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
            isProcessed: true // Mark as processed
          },
        ]);
      }
    } finally {
      setIsAiResponding(false);
      setIsLoading(false);
      aiStreamAbortController.current = null;
    }
    setImagePreviewUrls([]);
    setSelectedFilesForUpload([]);
  }

  function handleStopAIResponse() {
    if (aiStreamAbortController.current) {
      aiStreamAbortController.current.abort();
    }
  }

  // Handler for the first plus button click
  function handleFirstPlusClick() {
    fileInputRef1.current?.click();
  }

  // Handler for the first plus button file upload
  async function handleFirstFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setSelectedFilesForUpload((prevFiles) => [...prevFiles, ...newFiles]);
      
      const newPreviewUrls = newFiles.map(file => URL.createObjectURL(file));
      setImagePreviewUrls((prevUrls) => [...prevUrls, ...newPreviewUrls]);
    }
    // Clear the file input so the same file can be selected again if removed and re-added
    if (e.target) {
      e.target.value = '';
    }
  }

  function removeImagePreview(indexToRemove: number) {
    setImagePreviewUrls((prevUrls) => prevUrls.filter((_, index) => index !== indexToRemove));
    setSelectedFilesForUpload((prevFiles) => prevFiles.filter((_, index) => index !== indexToRemove));
  }

  // Add function to handle Write label click
  const handleWriteClick = () => {
    const newBoxId = uuidv4();
    setEmptyBoxes(prev => [...prev, newBoxId]);
  };

  // Add function to handle box removal
  const handleRemoveBox = (boxId: string) => {
    setEmptyBoxes(prev => prev.filter(id => id !== boxId));
  };

  // Add a function to clear the Advance Search conversation history
  function clearAdvanceSearchHistory() {
    setAdvanceSearchHistory({
      previousQueries: [],
      previousResponses: []
    });
  }

  const handleSelectSession = (sessionId: string) => {
    if (!sessionId) { // Handling deletion or empty selection case
        handleNewChatRequest();
        return;
    }
    setActiveSessionId(sessionId);
    saveActiveSessionId(sessionId); // Save the active session
    
    // Get messages and ensure they're marked as processed
    const sessionMessages = getSessionMessages(sessionId);
    const processedMessages = sessionMessages.map(msg => ({
      ...msg,
      isProcessed: true // Mark all loaded messages as processed
    }));
    
    setMessages(processedMessages);
    setInput('');
    setImagePreviewUrls([]);
    setSelectedFilesForUpload([]);
    setCurrentQuery(''); // Clear current query when switching sessions
    setAdvanceSearchHistory({ previousQueries: [], previousResponses: [] }); // Reset deep research history
    setIsAdvanceSearchActive(false); // Reset deep research active state
    setShowAdvanceSearchUI(false); // Reset deep research UI toggle
    setShowHeading(messages.length === 0); // Show heading if the loaded session is empty
    setHasInteracted(true); // Assume interaction when a session is selected
    setSidebarOpen(false); // Close sidebar
    setIsRestoredFromStorage(true); // Set flag to indicate restoration from storage
  };

  const handleNewChatRequest = () => {
    setSidebarOpen(false);
    setInput('');
    setImagePreviewUrls([]);
    setSelectedFilesForUpload([]);
    setCurrentQuery('');
    setAdvanceSearchHistory({ previousQueries: [], previousResponses: [] });
    setIsAdvanceSearchActive(false);
    setShowAdvanceSearchUI(false);
    setShowHeading(true); // Show welcoming heading
    setHasInteracted(false); // Reset interaction state
    setActiveSessionId(null);
    saveActiveSessionId(null); // Clear the active session
    setMessages([]);
    setIsRestoredFromStorage(false); // Reset the restored flag
  };

  // Fix the renderMessageContent function to use LocalMessage
  const renderMessageContent = (msg: LocalMessage) => {
    if (msg.contentType && msg.structuredContent) {
      switch (msg.contentType) {
        case 'tutorial':
          return <TutorialDisplay data={msg.structuredContent as TutorialData} />;
        case 'comparison':
          return <ComparisonDisplay data={msg.structuredContent as ComparisonData} />;
        case 'informational_summary':
          return <InformationalSummaryDisplay data={msg.structuredContent as InformationalSummaryData} />;
        case 'conversation':
          return <ConversationDisplay data={msg.structuredContent as string} />;
        default:
          if (typeof msg.structuredContent === 'string') {
            return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="prose dark:prose-invert max-w-none">{msg.structuredContent}</ReactMarkdown>;
          }
          return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="prose dark:prose-invert max-w-none">{`Unsupported structured content: ${JSON.stringify(msg.structuredContent)}`}</ReactMarkdown>;
      }
    }     else if (msg.content) {
      const isDefaultChat = msg.contentType === 'conversation' || (msg.role === 'assistant' && !msg.contentType);
      if (isDefaultChat) {
        // Display raw content without post-processing for default chat
        // Custom components for MarkdownRenderer to handle <think> tags
        return (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]} 
            rehypePlugins={[rehypeRaw]} 
            className="prose dark:prose-invert max-w-none default-chat-markdown"
            components={{
              // Custom renderer for <think> tags to display them properly
              p: ({node, ...props}) => {
                const content = String(props.children);
                if (content.includes('<think>') && content.includes('</think>')) {
                  // Extract think content and wrap it in a styled div
                  const beforeThink = content.split('<think>')[0];
                  const thinkContent = content.split('<think>')[1]?.split('</think>')[0];
                  const afterThink = content.split('</think>')[1];
                  
                  return (
                    <div>
                      {beforeThink && <p>{beforeThink}</p>}
                      {thinkContent && (
                        <div className="bg-gray-800 border border-gray-700 p-3 my-2 rounded-md text-cyan-300">
                          <div className="font-semibold mb-1 text-sm text-cyan-400">AI Thinking Process:</div>
                          <p className="whitespace-pre-line">{thinkContent}</p>
                        </div>
                      )}
                      {afterThink && <p>{afterThink}</p>}
                    </div>
                  );
                }
                return <p {...props} />;
              }
            }}
          >
            {msg.content}
          </ReactMarkdown>
        );
      }
      let content = msg.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      }
      let jsonMatch = content.match(/({[\s\S]*}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && typeof parsed === 'object') {
            if (parsed.title && parsed.steps) {
              return <TutorialDisplay data={parsed as TutorialData} />;
            } else if (parsed.title && parsed.item1_name && parsed.item2_name) {
              return <ComparisonDisplay data={parsed as ComparisonData} />;
            } else if (parsed.main_title && parsed.sections) {
              return <InformationalSummaryDisplay data={parsed as InformationalSummaryData} />;
            }
          }
          return <pre className="bg-neutral-900 text-white rounded p-4 overflow-x-auto"><code>{JSON.stringify(parsed, null, 2)}</code></pre>;
        } catch (e) {}
      }
        return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="prose dark:prose-invert max-w-none">{msg.content}</ReactMarkdown>;
    }
    return null;
  };

  // Key for localStorage
  const ADVANCE_SEARCH_STORAGE_KEY = 'advanceSearchState';

  // Restore Advance Search state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(ADVANCE_SEARCH_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.steps && parsed.currentQuery) {
            // Restore all the necessary state from localStorage
            setCurrentQuery(parsed.currentQuery);
            setAdvanceSearchHistory(parsed.advanceSearchHistory || { previousQueries: [], previousResponses: [] });
            
            // Set the restored deep research state
            setRestoredDeepResearchState({
              steps: parsed.steps,
              activeStepId: parsed.activeStepId,
              isComplete: parsed.isComplete,
              isInProgress: parsed.isInProgress,
              webData: parsed.webData
            });
            
            // Set the isRestoredFromStorage flag to true to prevent API calls
            setIsRestoredFromStorage(true);
            
            // Also restore the UI state to show the advance search
            setShowAdvanceSearchUI(true);
            
            // Check if we should also make the advance search active
            if (parsed.isComplete) {
              setIsAdvanceSearchActive(true);
            }
          }
        } catch (err) {
          console.error("Error restoring advance search state:", err);
        }
      }
      
      // Mark that initial load is complete after trying to restore
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
    }
  }, []); // Only run once on mount

  // Save Advance Search state to localStorage whenever it changes
  useEffect(() => {
    if (showAdvanceSearchUI) {
      const stateToSave = {
        steps,
        activeStepId,
        isComplete,
        isInProgress,
        webData,
        currentQuery,
        advanceSearchHistory
      };
      localStorage.setItem(ADVANCE_SEARCH_STORAGE_KEY, JSON.stringify(stateToSave));
    }
  }, [steps, activeStepId, isComplete, isInProgress, webData, currentQuery, advanceSearchHistory, showAdvanceSearchUI]);

  // Add at the top of the component
  const [activeButton, setActiveButton] = useState<string | null>(null);

  const handleButtonClick = (key: string) => {
    setActiveButton(prev => (prev === key ? null : key));
  };

  // Add helper function to convert LocalMessage[] to ConversationMessage[] by type casting
  function convertToConversationMessages(messages: LocalMessage[]): ConversationMessage[] {
    // This filters out any messages with role 'search-ui' since ConversationMessage doesn't support that role
    return messages.filter(
      msg => msg.role !== 'search-ui'
    ) as unknown as ConversationMessage[];
  }

  // Add at the top of TestChat
  const [activeMode, setActiveMode] = useState<'chat' | 'search' | 'advance'>('chat');
  const chatAbortController = useRef<AbortController | null>(null);
  const searchAbortController = useRef<AbortController | null>(null);
  const advanceAbortController = useRef<AbortController | null>(null);

  function handleModeSwitch(newMode: 'chat' | 'search' | 'advance') {
    if (activeMode !== newMode) {
      if (chatAbortController.current) chatAbortController.current.abort();
      if (searchAbortController.current) searchAbortController.current.abort();
      if (advanceAbortController.current) advanceAbortController.current.abort();
    }
    setActiveMode(newMode);
  }

  // Add a new function to handle retry/regenerate
  const handleRetry = (originalQuery: string) => {
    try {
      // Create a slightly modified query to ensure a different response
      const retryQuery = `${originalQuery} (please provide alternative information)`;
      
      // Find the last user message to get the original query
      const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
      
      if (lastUserMessage) {
        console.log('Retrying with query:', retryQuery);
        
        // Add the messages to the chat
        setMessages(prev => [
          ...prev,
          {
            role: 'user',
            id: uuidv4(),
            content: retryQuery,
            timestamp: Date.now(),
            isProcessed: true
          }
        ]);
        
        // Submit the modified query
        // We're using the input state to leverage the existing handleSend function
        setInput(retryQuery);
        
        // Give a small delay to ensure state is updated before submitting
        setTimeout(() => {
          const form = document.querySelector('form');
          if (form) {
            console.log('Submitting retry form');
            form.dispatchEvent(new Event('submit', { cancelable: true }));
          } else {
            console.error('Form element not found for retry submission');
          }
        }, 200);
      } else {
        console.error('No user message found for retry');
      }
    } catch (error) {
      console.error('Error in handleRetry:', error);
    }
  };

  // Function to handle copying content to clipboard
  const handleCopy = (content: string | any) => {
    try {
      // For structured content that might be an object, ensure it's a string
      let textToCopy = '';
      
      if (typeof content === 'object') {
        // If it's an object, format it as JSON
        textToCopy = JSON.stringify(content, null, 2);
      } else if (typeof content === 'string') {
        // If it's a string, use it directly
        textToCopy = content;
      } else {
        // For any other type, convert to string
        textToCopy = String(content);
      }
      
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          console.log('Content copied to clipboard');
          // Create a temporary element for the toast notification
          const toast = document.createElement('div');
          toast.textContent = 'Copied to clipboard!';
          toast.style.position = 'fixed';
          toast.style.bottom = '20px';
          toast.style.left = '50%';
          toast.style.transform = 'translateX(-50%)';
          toast.style.backgroundColor = '#22c55e';
          toast.style.color = '#fff';
          toast.style.padding = '8px 16px';
          toast.style.borderRadius = '4px';
          toast.style.zIndex = '9999';
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s ease';
          
          document.body.appendChild(toast);
          
          // Animate in
          setTimeout(() => {
            toast.style.opacity = '1';
          }, 10);
          
          // Remove after 2 seconds
          setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
              document.body.removeChild(toast);
            }, 300);
          }, 2000);
        })
        .catch(err => {
          console.error('Failed to copy content to clipboard', err);
          alert('Failed to copy content. Please try again.');
        });
    } catch (error) {
      console.error('Error preparing content for clipboard:', error);
      alert('Failed to prepare content for copying. Please try again.');
    }
  };

  return (
    <>
      <div className="min-h-screen flex flex-col px-4 sm:px-4 md:px-8 lg:px-0" style={{ background: '#161618' }}>
        <GlobalStyles />
      {/* Single Header: always visible on all devices */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#161618] shadow-md shadow-black/30 lg:shadow-none h-14 flex items-center px-4">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
        <img src="/Logo.svg" alt="Logo" className="ml-3" style={{ width: 90, height: 90 }} />
      </header>

      {/* Conversation area (scrollable) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto w-full flex flex-col items-center justify-center relative px-4 sm:px-4 md:px-8 lg:px-0 pt-8"
          style={{ paddingBottom: `${isChatEmpty && !hasInteracted ? 0 : inputBarHeight + EXTRA_GAP}px` }}
      >
          {/* Centered wrapper for heading and input */}
        <div
            className={`fixed left-1/2 -translate-x-1/2 w-full max-w-3xl flex flex-col items-center justify-center z-50 transition-all duration-500 ease-in-out ${
              inputPosition === "center" ? "top-1/2 -translate-y-1/2" : "bottom-0 translate-y-0"
          }`}
        >
            {/* Heading with fade animation */}
            <h1 className={`text-[3.2rem] font-normal text-gray-200 text-center mb-6 transition-opacity duration-500 ${inputPosition === "center" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            Seek and You'll find
          </h1>

            {/* Input form */}
            <form
              className="flex flex-col gap-2 rounded-2xl shadow-lg py-2 w-full px-4 pl-4 sm:px-6 md:px-8 lg:pl-4 lg:pr-0 mb-3 bg-[#232323] border border-white/20"
              style={{ boxShadow: '0 4px 32px 0 rgba(0,0,0,0.32)' }}
              onSubmit={handleSend}
            >
              {/* Image previews above textarea */}
              {imagePreviewUrls.length > 0 && (
                <div className="flex flex-row gap-2 mb-2 justify-start overflow-x-auto max-w-full">
                  {imagePreviewUrls.map((url, idx) => (
                    <div key={idx} className="relative flex-shrink-0">
                      <img src={url} alt={`Preview ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg" />
                      <button
                        type="button"
                        className="absolute top-0 right-0 bg-black bg-opacity-60 text-white rounded-full p-1"
                        onClick={() => removeImagePreview(idx)}
                      >
                        &times;
                      </button>
              </div>
          ))}
        </div>
              )}

              {/* Input area: textarea on top, actions below */}
              <div className="flex flex-col w-full gap-2 items-center">
                {/* Textarea row */}
                <div className="w-full">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                        e.preventDefault();
                        if (!isLoading) handleSend(e);
                      }
                    }}
                    className="w-full border-none outline-none bg-transparent px-2 py-1 text-gray-200 text-sm placeholder-gray-500 resize-none overflow-auto self-center rounded-lg"
                    placeholder="Ask anything..."
            disabled={isLoading}
            rows={1}
                    style={{ maxHeight: '96px', minHeight: '40px', lineHeight: '1.5' }}
                  />
                </div>

                {/* Actions row */}
                <div className="flex flex-row w-full items-center justify-between gap-2">
                  {/* Left group: Write, Search, Deep Research */}
                  <div className="flex flex-row gap-2 items-center">
                    {/* Write button */}
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 rounded-full transition px-3 py-1.5 flex-shrink-0 text-xs font-medium
                        ${activeButton === 'write' ? 'bg-gray-800 text-cyan-400' : 'bg-gray-800 text-gray-400 opacity-60'}
                        hover:bg-gray-700`}
                      style={{ height: "36px" }}
                      onClick={() => handleButtonClick('write')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: activeButton === 'write' ? '#22d3ee' : '#a3a3a3' }}>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z" />
              </svg>
                      <span className="whitespace-nowrap">Write</span>
            </button>

                    {/* Search button */}
                    <button
                      type="button"
                      className={`rounded-full transition flex items-center justify-center gap-1.5 px-3 py-1.5 flex-shrink-0 text-xs font-medium
                        ${activeButton === 'search' ? 'bg-gray-800 text-cyan-400' : 'bg-gray-800 text-gray-400 opacity-60'}
                        hover:bg-gray-700`}
                      style={{ height: "36px" }}
                      onClick={() => handleButtonClick('search')}
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ color: activeButton === 'search' ? '#22d3ee' : '#a3a3a3' }}>
                        <circle cx="11" cy="11" r="7"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <span className="text-xs font-medium">Search</span>
                    </button>

                    {/* Deep Research button (Advance Search) */}
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 rounded-full transition px-3 py-1.5 flex-shrink-0 text-xs font-medium
                        ${activeButton === 'advance' ? 'bg-gray-800 text-cyan-400' : 'bg-gray-800 text-gray-400 opacity-60'}
                        hover:bg-gray-700`}
                      style={{ height: "36px" }}
                      tabIndex={0}
                      onClick={() => handleButtonClick('advance')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: activeButton === 'advance' ? '#22d3ee' : '#a3a3a3' }}>
                        <circle cx="12" cy="12" r="3" />
                        <circle cx="19" cy="5" r="2" />
                        <circle cx="5" cy="19" r="2" />
                        <line x1="14.15" y1="14.15" x2="17" y2="17" />
                        <line x1="6.85" y1="17.15" x2="10.15" y2="13.85" />
                        <line x1="13.85" y1="10.15" x2="17.15" y2="6.85" />
                      </svg>
                      <span className="whitespace-nowrap text-xs font-medium">Advance Search</span>
                    </button>
              </div>

                  {/* Right group: Plus, Send */}
                  <div className="flex flex-row gap-2 items-center ml-auto pr-4">
                    {/* Plus button */}
                    <button 
                      type="button" 
                      className="p-2 rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 transition flex items-center justify-center flex-shrink-0"
                      style={{ width: "36px", height: "36px" }}
                      onClick={handleFirstPlusClick}
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

                    {/* Send/Stop button */}
            <button
                      type={isAiResponding ? "button" : "submit"}
                      className="rounded-full bg-gray-200 hover:bg-white transition flex items-center justify-center flex-shrink-0"
                      style={{ width: "36px", height: "36px", pointerEvents: isLoading && !isAiResponding ? 'none' : 'auto' }}
                      onClick={isAiResponding ? handleStopAIResponse : undefined}
                      disabled={isLoading && !isAiResponding}
                      aria-label={isAiResponding ? "Stop AI response" : "Send"}
                    >
                      {isAiResponding ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="7" y="7" width="10" height="10" rx="2" fill="#374151" />
              </svg>
                      ) : (
                        <svg width="16" height="16" fill="none" stroke="#374151" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      )}
            </button>
                  </div>
                </div>
          </div>
        </form>
      </div>

          {/* Conversation and other UI below */}
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 items-center justify-center z-10 pt-12 pb-4">
            {messages.map((msg, i) => {
              if (msg.role === "assistant") {
                if (msg.contentType && msg.structuredContent) {
                  return (
                    <motion.div
                      key={msg.id + '-structured-' + i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
                      style={{ color: '#fff', maxWidth: '100%', overflowWrap: 'break-word' }}
                    >
                      {msg.webSources && msg.webSources.length > 0 && (
                        <>
                          <WebSourcesCarousel sources={msg.webSources} />
                          <div style={{ height: '1.5rem' }} />
                        </>
                      )}
                      <DynamicResponseRenderer 
                        data={msg.structuredContent} 
                        type={msg.contentType} 
                      />
                      
                      {/* Action buttons for structured content */}
                      {msg.isProcessed && (
                        <div className="w-full flex justify-start gap-2 mt-2">
                          <button
                            onClick={() => handleCopy(msg.structuredContent)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                            aria-label="Copy response"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span className="text-xs">Copy</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              try {
                                // Find the corresponding user message
                                const userMsgIndex = messages.findIndex(m => m.id === msg.parentId);
                                let userMsg = userMsgIndex >= 0 ? messages[userMsgIndex] : 
                                            messages.find(m => m.role === 'user' && m.timestamp && m.timestamp < (msg.timestamp || Infinity));
                                
                                // If we still don't have a user message, use the last one as fallback
                                if (!userMsg) {
                                  userMsg = [...messages].reverse().find(m => m.role === 'user');
                                }
                                
                                if (userMsg) {
                                  handleRetry(userMsg.content);
                                } else {
                                  console.error('Could not find a user message to retry');
                                }
                              } catch (error) {
                                console.error('Error handling retry button click:', error);
                              }
                            }}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                            aria-label="Retry with different response"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                              <path d="M3 3v5h5"></path>
                            </svg>
                            <span className="text-xs">Retry</span>
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                }

                const { content: rawContent } = cleanAIResponse(msg.content);
                // Don't filter out <think> tags, only remove thinking indicators
                const cleanContent = rawContent.replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '');
                const isStoppedMsg = cleanContent.trim() === '[Response stopped by user]';
                const processedContent = makeCitationsClickable(cleanContent, msg.webSources || []);
                if (showPulsingDot && i === messages.length -1 ) setShowPulsingDot(false);
                
                return (
                  <motion.div
                    key={msg.id + '-text-' + i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="w-full markdown-body text-left flex flex-col items-start ai-response-text mb-4 relative"
                    style={{ color: '#fff', maxWidth: '100%', overflowWrap: 'break-word' }}
                  >
                        {msg.webSources && msg.webSources.length > 0 && (
                          <>
                            <WebSourcesCarousel sources={msg.webSources} />
                            <div style={{ height: '1.5rem' }} />
                          </>
                        )}
                        {isStoppedMsg ? (
                          <span className="text-sm text-white italic font-light mb-2">[Response stopped by user]</span>
                        ) : (
                          <div className="w-full max-w-full overflow-hidden">
                        {/* Customize ReactMarkdown to handle <think> tags properly */}
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]} 
                          rehypePlugins={[rehypeRaw]} 
                          className="prose dark:prose-invert max-w-none"
                          components={{
                            // Custom renderer for <think> tags to display them properly
                            p: ({node, ...props}) => {
                              const content = String(props.children);
                              if (content.includes('<think>') && content.includes('</think>')) {
                                // Extract think content and wrap it in a styled div
                                const beforeThink = content.split('<think>')[0];
                                const thinkContent = content.split('<think>')[1]?.split('</think>')[0];
                                const afterThink = content.split('</think>')[1];
                                
                                return (
                                  <div>
                                    {beforeThink && <p>{beforeThink}</p>}
                                    {thinkContent && (
                                      <div className="bg-gray-800 border border-gray-700 p-3 my-2 rounded-md text-cyan-300">
                                        <div className="font-semibold mb-1 text-sm text-cyan-400">AI Thinking Process:</div>
                                        <p className="whitespace-pre-line">{thinkContent}</p>
                                      </div>
                                    )}
                                    {afterThink && <p>{afterThink}</p>}
                                  </div>
                                );
                              }
                              return <p {...props} />;
                            }
                          }}
                          children={processedContent}
                            />
    </div>
                    )}
                    
                    {/* Action buttons for text content */}
                    {msg.isProcessed && !isStoppedMsg && (
                      <div className="w-full flex justify-start gap-2 mt-2">
                        <button
                          onClick={() => handleCopy(cleanContent)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                          aria-label="Copy response"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          <span className="text-xs">Copy</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            try {
                              // Find the corresponding user message
                              const userMsgIndex = messages.findIndex(m => m.id === msg.parentId);
                              let userMsg = userMsgIndex >= 0 ? messages[userMsgIndex] : 
                                          messages.find(m => m.role === 'user' && m.timestamp && m.timestamp < (msg.timestamp || Infinity));
                              
                              // If we still don't have a user message, use the last one as fallback
                              if (!userMsg) {
                                userMsg = [...messages].reverse().find(m => m.role === 'user');
                              }
                              
                              if (userMsg) {
                                handleRetry(userMsg.content);
                              } else {
                                console.error('Could not find a user message to retry');
                              }
                            } catch (error) {
                              console.error('Error handling retry button click:', error);
                            }
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                          aria-label="Retry with different response"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                            <path d="M3 3v5h5"></path>
                          </svg>
                          <span className="text-xs">Retry</span>
                        </button>
    </div>
                    )}
                  </motion.div>
                );
              } else if (msg.role === "deep-research") {
                // Always render DeepResearchBlock for every deep-research message
                return (
                  <DeepResearchBlock 
                    key={msg.id + '-dr-' + i}
                    query={msg.content} 
                    conversationHistory={advanceSearchHistory}
                    onClearHistory={clearAdvanceSearchHistory}
                    onFinalAnswer={(answer: string, sources?: any[]) => {
                      // Check if we have an existing message with no content (streaming placeholder)
                      const existingMessageIndex = messages.findIndex(existingMsg => 
                        existingMsg.role === "assistant" && 
                        existingMsg.contentType === 'deep-research' && 
                        existingMsg.content === '' // Empty content means it's our streaming placeholder
                      );
                      
                      if (existingMessageIndex >= 0 && answer.length > 0) {
                        // Update the existing streaming message
                        setMessages(prev => {
                          const updatedMessages = [...prev];
                          updatedMessages[existingMessageIndex] = {
                            ...updatedMessages[existingMessageIndex],
                            content: makeCitationsClickable(answer, sources),
                            webSources: sources || [],
                            isProcessed: true
                          };
                          return updatedMessages;
                        });
                      } else {
                        // Only check for duplicates for non-empty messages
                        const isDuplicate = answer.length > 0 && messages.some(existingMsg => 
                        existingMsg.role === "assistant" && 
                        existingMsg.contentType === 'deep-research' && 
                        existingMsg.content.includes(answer.substring(0, 100))
                      );
                        
                        // Add a new message if not a duplicate
                      if (!isDuplicate) {
                        setMessages(prev => [
                          ...prev,
                          {
                            role: "assistant",
                            content: makeCitationsClickable(answer, sources),
                            id: uuidv4(),
                            timestamp: Date.now(),
                              isProcessed: answer.length > 0,
                            contentType: 'deep-research',
                            webSources: sources || []
                          }
                        ]);
                        }
                      }
                    }}
                  />
                );
              } else if (msg.role === 'search-ui') {
                return (
                  <SearchPanel 
                    key={msg.id + '-search-' + i}
                    query={msg.content} 
                    onComplete={(result) => {
                      // When search is complete, add the result as an assistant message
                      setMessages(prev => [
                        ...prev,
                        {
                          id: uuidv4(),
                          role: 'assistant',
                          content: result,
                          timestamp: Date.now(),
                          isProcessed: true
                        }
                      ]);
                    }}
                  />
                );
              } else {
                return (
                <div
                  key={msg.id + '-user-' + i}
                  className="px-3 py-2 rounded-xl shadow bg-cyan-500 text-white self-end max-w-[80%] text-base flex flex-col items-end mb-2"
                >
                  {/* Only show message content and images, no menu */}
                    {msg.imageUrls && msg.imageUrls.map((url, index) => (
                      <img 
                        key={index}
                        src={url} 
                        alt={`Preview ${index + 1}`} 
                        className="max-w-xs max-h-64 rounded-md mb-2 self-end" 
                      />
                    ))}
                    <div>{msg.content}</div>
                </div>
                );
              }
            })}
      </div>
        </div>

        {/* Fixed Footer Bar Behind Input */}
        <div
          className={`fixed left-0 right-0 bottom-0 z-40 transition-opacity duration-300 ${isChatEmpty && !hasInteracted ? 'opacity-0' : 'opacity-100'}`}
          style={{ height: `calc(${inputBarHeight}px + env(safe-area-inset-bottom, 0px))`, background: '#161618', pointerEvents: 'none' }}
          aria-hidden="true"
        />

        {/* Overlay for sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-[9998]"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Hidden file input */}
          <input
            type="file"
          ref={fileInputRef1}
            style={{ display: 'none' }}
          onChange={handleFirstFileChange}
          accept="image/*"
          multiple
        />

        {/* Sidebar */}
        <Sidebar
          open={sidebarOpen}
          activeSessionId={activeSessionId}
          onClose={() => setSidebarOpen(false)}
          onNewChat={handleNewChatRequest}
          onSelectSession={handleSelectSession}
        />
      </div>
      {chatError && (
        <div className="text-red-500 text-sm text-center mt-2">{chatError}</div>
      )}
    </>
  );
} 