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
import { Bot, User, Paperclip, Send, XCircle, Search as SearchIcon, Trash2, PlusCircle, Settings, Zap, ExternalLink, AlertTriangle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Image from 'next/image';
import rehypeRaw from 'rehype-raw';
import { Message as BaseMessage } from '@/utils/conversation-context';
import Search from '@/components/Search';
import { Message as ConversationMessage } from "@/utils/conversation-context";
import { filterAIThinking } from '../../utils/content-filter';

// Define a type that includes all possible query types (including the ones in SCHEMAS and 'conversation')
type QueryType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation';

// Define types for query classification and content display
type QueryClassificationType = keyof typeof SCHEMAS;
type ContentDisplayType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation';

const BASE_SYSTEM_PROMPT = `You are Tehom AI, a helpful and intelligent assistant. Respond in a natural, conversational tone. Always write in markdown formatting in every output dynamically. 

CRITICAL: Always show your thinking process using <think> tags before providing your final answer. This is required for all responses. Use this format:

<think>
Let me think about this question...
I need to consider...
My reasoning is...
</think>

Then provide your final answer after the thinking process.

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
    @keyframes typing {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    
    @keyframes shine {
      0% { 
        filter: brightness(1) drop-shadow(0 0 2px rgba(34, 211, 238, 0.3));
      }
      50% { 
        filter: brightness(1.3) drop-shadow(0 0 8px rgba(34, 211, 238, 0.6)) drop-shadow(0 0 12px rgba(192, 192, 192, 0.4));
      }
      100% { 
        filter: brightness(1) drop-shadow(0 0 2px rgba(34, 211, 238, 0.3));
      }
    }
    
    .physics-icon {
      animation: shine 2s ease-in-out infinite;
    }
    
    .physics-icon-live {
      animation: shine 1.5s ease-in-out infinite;
    }
    
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
  
  return text;
}

/**
 * Process table section content
 * Ensures proper table formatting with citations
 */
function processTableSection(lines: string[]): string {
  let tableContent = '';
  let inTable = false;
  
  for (const line of lines) {
    if (line.includes('|')) {
      inTable = true;
      tableContent += line + '\n';
    } else if (inTable && line.trim() === '') {
      // End of table
      break;
    } else if (!inTable) {
      // Content before table
      tableContent += line + '\n';
    }
  }
  
  return tableContent;
}

/**
 * Process conclusion section
 * Ensures proper conclusion formatting
 */
function processConclusion(lines: string[]): string {
  let fullText = lines
    .filter(line => line.trim())
    .join(' ')
    .trim();
  
  // Limit to 3-4 sentences
  fullText = limitSentences(fullText, 3, 4);
  
  // Clean text
  fullText = cleanText(fullText);
  
  return fullText;
}

/**
 * Limit text to a specific number of sentences
 */
function limitSentences(text: string, minSentences: number, maxSentences: number): string {
  if (!text) return text;
  
  // Split by sentence endings
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (sentences.length <= minSentences) {
    return text;
  }
  
  if (sentences.length > maxSentences) {
    return sentences.slice(0, maxSentences).join('. ') + '.';
  }
  
  return text;
}

/**
 * Clean text of unwanted formatting
 */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold formatting
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic formatting
    .replace(/\[\d+\]/g, '') // Remove citations
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
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

// Function to process think tags and render them as React components
const processThinkTags = (content: string, isLive: boolean = false) => {
  // Handle live thinking marker
  if (content.includes('<think-live></think-live>')) {
    return { 
      processedContent: '', 
      thinkBlocks: [], 
      isLiveThinking: true 
    };
  }
  
  if (!content || !content.includes('<think>')) {
    return { processedContent: content, thinkBlocks: [], isLiveThinking: false };
  }

  const parts = [];
  const thinkBlocks = [];
  let lastIndex = 0;
  
  // Find all think tag pairs
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  
  while ((match = thinkRegex.exec(content)) !== null) {
    // Add content before the think tag
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    
    // Store the think content only if it's meaningful (not empty or just whitespace)
    const thinkContent = match[1].trim();
    if (thinkContent && thinkContent.length > 0) {
      const thinkId: string = `think-block-${thinkBlocks.length}`;
      thinkBlocks.push({ id: thinkId, content: thinkContent });
      parts.push(`<!-- ${thinkId} -->`);
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining content after the last think tag
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  
  return { 
    processedContent: parts.join(''), 
    thinkBlocks,
    isLiveThinking: false
  };
};

// Component to render think blocks
const ThinkBlock = ({ content }: { content: string }) => (
  <div className="bg-gray-800 border border-gray-700 p-3 my-2 rounded-md text-cyan-300">
    <div className="font-semibold mb-1 text-sm text-cyan-400">AI Thinking Process:</div>
    <div className="whitespace-pre-line text-sm">{content}</div>
  </div>
);

// Add a simple Stack component for vertical spacing
const Stack = ({ spacing = 20, children }: { spacing?: number; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing}px` }}>
    {children}
  </div>
);

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
- ALWAYS use <think> tags to show your reasoning process before answering
- Structure your response as: thinking process in <think> tags, then your final answer
- Use markdown formatting for better readability
- Format code blocks with proper syntax highlighting
- DO NOT use structured formats like Summary Tables or Conclusion sections
- DO NOT use multiple section headers (##) in your responses
- Keep your responses conversational and natural

Example format:
<think>
I need to analyze this question about...
The key points to consider are...
Based on my reasoning...
</think>

[Your final answer here]`;
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

// Function to extract think content during streaming and update live thinking state
const extractThinkContentDuringStream = (content: string) => {
  const thinkRegex = /<think>([\s\S]*?)(<\/think>|$)/g;
  let thinkContent = '';
  let mainContent = content;
  let match;
  
  // Extract all think content
  while ((match = thinkRegex.exec(content)) !== null) {
    thinkContent += match[1];
    // Remove the think tags from main content
    mainContent = mainContent.replace(match[0], '');
  }
  
  // Also handle partial think tags (when streaming)
  const partialThinkMatch = content.match(/<think>([^<]*?)$/);
  if (partialThinkMatch) {
    thinkContent += partialThinkMatch[1];
    mainContent = mainContent.replace(partialThinkMatch[0], '');
  }
  
  return {
    thinkContent: thinkContent.trim(),
    mainContent: mainContent.trim()
  };
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
  const [activeMode, setActiveMode] = useState<'chat' | 'search'>('chat');
  const [activeButton, setActiveButton] = useState<string | null>(null);
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



  const [emptyBoxes, setEmptyBoxes] = useState<string[]>([]); // Array of box IDs

  const [showPulsingDot, setShowPulsingDot] = useState(false);

  // Add a state to track if the chat is empty (no messages)
  const isChatEmpty = messages.length === 0;
  // Track if the user has sent the first message (for animation and session creation)
  const [hasInteracted, setHasInteracted] = useState(false);
  
  // Live thinking states
  const [liveThinking, setLiveThinking] = useState<string>('');
  const [currentThinkingMessageId, setCurrentThinkingMessageId] = useState<string | null>(null);

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
    } else {
      // Show welcome page for new users
      setShowHeading(true);
      setHasInteracted(false);
      setActiveSessionId(null);
      setMessages([]);
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



  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    // First check if we're in search mode
    if (activeMode === 'search') {
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
    
    // Clear any previous thinking state - each query gets fresh state
    setCurrentThinkingMessageId(null);
    setLiveThinking('');
    
    // Create immediate thinking state for the upcoming AI response
    const upcomingAiMessageId = uuidv4();
    setCurrentThinkingMessageId(upcomingAiMessageId);
    setLiveThinking('Starting to think...');
    
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

      // @ts-ignore - TypeScript has trouble with activeMode scope in this context
      if (activeMode === 'search') {
        turnSpecificSystemPrompt = getSearchPrompt(BASE_SYSTEM_PROMPT);

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
        let hasCreatedMessage = false; // Flag to track if we've created the AI message
        let aiMessageId: string | null = upcomingAiMessageId; // Use the pre-created message ID
        
        // We'll create the AI message when we first get content

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
                    
                    // Separate thinking and main content in real-time
                    const { thinkContent, mainContent } = extractThinkContentDuringStream(contentBuffer);
                    
                    // Create the AI message on first meaningful content (either thinking or main)
                    if (!hasCreatedMessage && (thinkContent.trim().length > 0 || mainContent.trim().length > 0)) {
                      hasCreatedMessage = true;
                      // aiMessageId is already set to upcomingAiMessageId
                      
                      setMessages((prev) => [...prev, {
                        role: "assistant" as const,
                        content: mainContent, // Store only main content in the message
                        id: aiMessageId!,
                        timestamp: Date.now(),
                        parentId: userMessageId,
                        imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
                        webSources: [],
                        contentType: 'conversation',
                        isStreaming: true,
                        isProcessed: false
                      }]);
                    } else if (aiMessageId) {
                      // Update the single AI message with only main content
                      setMessages((prev) => {
                        return prev.map(msg => 
                          msg.id === aiMessageId 
                            ? { ...msg, content: mainContent, isStreaming: true }
                            : msg
                        );
                      });
                    }
                    
                    // Update live thinking display - this goes directly to think box
                    if (thinkContent && thinkContent.trim().length > 0) {
                      setLiveThinking(thinkContent);
                      setCurrentThinkingMessageId(aiMessageId); // Link thinking to the main message
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
        
        // Apply smooth post-processing after streaming is complete
        if (aiMessageId) {
          const { thinkContent: finalThinkContent, mainContent: finalMainContent } = extractThinkContentDuringStream(contentBuffer);
          
          // First, stop streaming but keep content as-is for smooth transition
          setMessages((prev) => {
            return prev.map(msg => 
              msg.id === aiMessageId 
                ? { 
                    ...msg, 
                    isStreaming: false, // Stop streaming animation
                    // Keep existing content for now - no jarring replacement
                  }
                : msg
            );
          });
          
          // Then, after a brief delay, apply final processing with embedded think tags
          setTimeout(() => {
            setMessages((prev) => {
              return prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg, 
                      content: finalThinkContent.trim().length > 0 
                        ? `<think>${finalThinkContent}</think>${finalMainContent}` // Embed think tags for ThinkingButton to process
                        : finalMainContent, // No thinking content, just main content
                      contentType: 'conversation',
                      isProcessed: true,
                    }
                  : msg
              );
            });
          }, 300); // Small delay for smooth transition
        }
        
        // Clear the live thinking state with a smooth transition
        setTimeout(() => {
          setCurrentThinkingMessageId(null);
          setLiveThinking('');
        }, 400); // Clear thinking state after content transition
        
        // Handle image context if needed
        if (uploadedImageUrls.length > 0 && aiMessageId) {
          const { mainContent: finalMainContent } = extractThinkContentDuringStream(contentBuffer);
          const { content: cleanedContent } = cleanAIResponse(finalMainContent);
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
    setShowHeading(messages.length === 0); // Show heading if the loaded session is empty
    setHasInteracted(true); // Assume interaction when a session is selected
    setSidebarOpen(false); // Close sidebar
  };

  const handleNewChatRequest = () => {
    setSidebarOpen(false);
    setInput('');
    setImagePreviewUrls([]);
    setSelectedFilesForUpload([]);
    setShowHeading(true); // Show welcoming heading
    setHasInteracted(false); // Reset interaction state
    setActiveSessionId(null);
    saveActiveSessionId(null); // Clear the active session
    setMessages([]);
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
        // Display content using standard ReactMarkdown - think tags are handled separately by processThinkTags
        return (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]} 
            rehypePlugins={[rehypeRaw]} 
            className="prose dark:prose-invert max-w-none default-chat-markdown"
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
  const chatAbortController = useRef<AbortController | null>(null);
  const searchAbortController = useRef<AbortController | null>(null);

  function handleModeSwitch(newMode: 'chat' | 'search') {
    setActiveMode(newMode);
    setActiveButton(newMode);
  }

  const handleRetry = (originalQuery: string) => {
    setInput(originalQuery);
    // Clear the last assistant message if it exists
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        return prev.slice(0, -1);
      }
      return prev;
    });
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

  // Hide the Deep Research view when research completes and AI responds
  useEffect(() => {
    // Removed advanced search logic
  }, [isAiResponding]);

  // Component to render think blocks as expandable buttons
  const ThinkingButton = ({ content, isLive = false }: { content: string, isLive?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Reset expanded state when content changes, but NOT during live thinking to allow real-time transparency
    useEffect(() => {
      if (!isLive) {
        setIsExpanded(false);
      }
    }, [content, isLive]);
    
    return (
      <div className="my-2">
        {/* Compact thinking button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-cyan-300 hover:bg-gray-700 transition-all text-sm"
        >
          {/* Physics/Atom icon with shining effects */}
          <div className="w-4 h-4 relative">
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 32 32" 
              fill="#06b6d4"
              className={`${isLive ? 'physics-icon-live' : 'physics-icon'}`}
            >
              <path d="M26.617 16c2.332-2.762 3.246-5.488 2.157-7.375s-3.907-2.459-7.465-1.821c-1.226-3.4-3.129-5.554-5.308-5.554-2.184 0-4.090 2.164-5.316 5.576-0.348-0.063-0.711-0.155-1.047-0.195-3.17-0.374-5.449 0.33-6.41 1.994s-0.436 3.99 1.479 6.549c0.207 0.277 0.473 0.55 0.707 0.826-0.234 0.276-0.5 0.549-0.707 0.826-1.915 2.559-2.439 4.885-1.479 6.549 0.955 1.298 2.477 2.132 4.194 2.132 0.221 0 0.438-0.014 0.652-0.040l-0.025 0.003c0.563-0.002 1.114-0.038 1.656-0.106l-0.066 0.007c0.336-0.040 0.699-0.133 1.047-0.196 1.226 3.413 3.132 5.577 5.316 5.577 2.179 0 4.082-2.154 5.308-5.553 0.78 0.153 1.682 0.246 2.603 0.254l0.007 0c0.192 0.025 0.413 0.039 0.638 0.039 1.721 0 3.249-0.825 4.21-2.102l0.010-0.013c1.089-1.887 0.173-4.613-2.159-7.375zM23.938 8.053c1.773 0 3.043 0.464 3.537 1.322 0.677 1.172-0.046 3.232-1.901 5.489-0.927-0.933-1.921-1.796-2.976-2.582l-0.070-0.050c-0.173-1.506-0.441-2.857-0.808-4.167l0.044 0.185c0.65-0.119 1.401-0.19 2.168-0.197l0.006-0zM18.625 20.545c-0.875 0.506-1.756 0.949-2.634 1.352-0.855-0.392-1.729-0.839-2.616-1.352-0.875-0.505-1.699-1.046-2.487-1.605-0.088-0.936-0.138-1.916-0.138-2.940s0.050-2.005 0.138-2.941c0.787-0.559 1.612-1.101 2.487-1.606 0.89-0.514 1.766-0.955 2.623-1.348 0.876 0.402 1.754 0.844 2.627 1.348 0.892 0.515 1.716 1.053 2.486 1.601 0.089 0.938 0.139 1.92 0.139 2.946s-0.050 2.008-0.139 2.945c-0.77 0.548-1.594 1.085-2.486 1.6zM20.847 20.941c-0.165 0.996-0.358 1.838-0.594 2.661l0.041-0.165c-1.005-0.258-1.828-0.525-2.629-0.835l0.16 0.054c0.518-0.264 1.037-0.514 1.551-0.81 0.508-0.293 0.996-0.597 1.472-0.905zM14.14 22.67c-0.629 0.252-1.439 0.517-2.267 0.739l-0.165 0.037c-0.2-0.671-0.395-1.528-0.542-2.4l-0.019-0.138c0.488 0.317 0.963 0.641 1.477 0.938q0.759 0.438 1.515 0.824zM9.298 17.727c-0.689-0.564-1.308-1.128-1.896-1.724l-0.003-0.003c0.59-0.598 1.209-1.163 1.857-1.694l0.042-0.033c-0.029 0.566-0.048 1.141-0.048 1.727s0.019 1.16 0.048 1.727zM12.625 10.154c-0.514 0.297-0.99 0.621-1.477 0.938 0.166-1.010 0.362-1.867 0.602-2.704l-0.041 0.166c0.994 0.26 1.805 0.526 2.596 0.833l-0.161-0.055c-0.505 0.258-1.012 0.529-1.519 0.822zM17.816 9.34c0.645-0.255 1.471-0.52 2.316-0.739l0.162-0.036c0.196 0.657 0.388 1.499 0.534 2.356l0.019 0.138c-0.476-0.308-0.964-0.612-1.472-0.905-0.516-0.298-1.038-0.549-1.559-0.815zM22.703 14.287c0.68 0.559 1.292 1.119 1.872 1.71l0.003 0.003c-0.584 0.594-1.195 1.153-1.835 1.68l-0.040 0.032c0.029-0.562 0.047-1.131 0.047-1.712s-0.018-1.151-0.047-1.713zM16 2.75c1.357 0 2.796 1.634 3.825 4.383-1.506 0.399-2.787 0.857-4.017 1.406l0.167-0.067c-1.045-0.477-2.308-0.934-3.611-1.295l-0.188-0.044c1.029-2.749 2.468-4.383 3.825-4.383zM4.525 9.375c0.715-0.848 1.778-1.383 2.966-1.383 0.194 0 0.385 0.014 0.571 0.042l-0.021-0.003c0.502 0.002 0.994 0.034 1.477 0.095l-0.059-0.006c0.248 0.030 0.518 0.102 0.773 0.145-0.323 1.128-0.591 2.483-0.751 3.871l-0.011 0.122c-1.128 0.833-2.124 1.689-3.053 2.614l0.001-0.001c-0.165-0.199-0.362-0.397-0.511-0.596-1.511-2.019-2.014-3.805-1.381-4.9zM9.459 23.879c-2.501 0.297-4.302-0.16-4.934-1.254-0.633-1.096-0.13-2.881 1.381-4.9 0.149-0.199 0.346-0.397 0.511-0.596 0.928 0.923 1.924 1.78 2.979 2.561l0.073 0.051c0.171 1.51 0.439 2.865 0.807 4.178l-0.044-0.185c-0.255 0.043-0.525 0.115-0.772 0.145zM16 29.25c-1.357 0-2.796-1.634-3.825-4.383 1.49-0.406 2.752-0.862 3.967-1.407l-0.17 0.068c1.064 0.483 2.345 0.94 3.668 1.298l0.184 0.042c-1.029 2.749-2.468 4.383-3.824 4.383zM27.477 22.625c-0.679 1.177-2.815 1.606-5.711 1.121 0.322-1.123 0.59-2.473 0.751-3.855l0.012-0.123c1.125-0.836 2.12-1.699 3.045-2.631l0.002-0.002c1.854 2.257 2.578 4.317 1.902 5.489zM16 13.25c-1.519 0-2.75 1.231-2.75 2.75s1.231 2.75 2.75 2.75c1.519 0 2.75-1.231 2.75-2.75v0c-0.002-1.518-1.232-2.748-2.75-2.75h-0zM16 17.25c-0.69 0-1.25-0.56-1.25-1.25s0.56-1.25 1.25-1.25c0.69 0 1.25 0.56 1.25 1.25v0c-0.001 0.69-0.56 1.249-1.25 1.25h-0z"/>
            </svg>
          </div>
          
          <span className="font-medium">
            {isLive ? 'AI Thinking...' : 'AI Thinking Process'}
          </span>
          
          {/* Expand/collapse indicator */}
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
        </button>
        
        {/* Expanded thinking content (same as before) */}
        {isExpanded && (
          <div className="mt-2 bg-gray-800 border border-gray-700 p-3 rounded-md text-cyan-300">
            <div className="font-semibold mb-1 text-sm text-cyan-400">AI Thinking Process:</div>
            <div className="whitespace-pre-line text-sm">{content}</div>
          </div>
        )}
      </div>
    );
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
                  {/* Left group: Search button only */}
                  <div className="flex flex-row gap-2 items-center">
                    {/* Search button */}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch(activeMode === 'search' ? 'chat' : 'search')}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 
                        ${activeMode === 'search' ? 'bg-gray-800 text-cyan-400' : 'bg-gray-800 text-gray-400 opacity-60'}
                        hover:opacity-100 hover:scale-105 active:scale-95
                      `}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: activeMode === 'search' ? '#22d3ee' : '#a3a3a3' }}>
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                      </svg>
                      Search
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
                
                // Process think tags and extract them
                const { processedContent, thinkBlocks, isLiveThinking } = processThinkTags(cleanContent);
                const finalContent = makeCitationsClickable(processedContent, msg.webSources || []);
                
                if (showPulsingDot && i === messages.length -1 ) setShowPulsingDot(false);
                
                return (
                  <React.Fragment key={msg.id + '-fragment-' + i}>
                    {/* Show immediate thinking box for this specific message if it's the current thinking message */}
                    {currentThinkingMessageId === msg.id && liveThinking && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="w-full markdown-body text-left flex flex-col items-start ai-response-text mb-4 relative"
                        style={{ color: '#fff', maxWidth: '100%', overflowWrap: 'break-word', zIndex: 10 }}
                      >
                        <div className="w-full max-w-full overflow-hidden">
                          <ThinkingButton 
                            key={`${currentThinkingMessageId}-immediate-thinking`} 
                            content={liveThinking} 
                            isLive={true} 
                          />
                        </div>
                      </motion.div>
                    )}
                    
                    {/* Main AI response content */}
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
                          ) : (isLiveThinking && !currentThinkingMessageId) ? (
                            <div className="w-full max-w-full overflow-hidden">
                              {/* Show live thinking button - only when no standalone thinking box is active */}
                              <ThinkingButton 
                                key={`${msg.id}-live-thinking`} 
                                content={msg.content.includes('<think-live>') ? 
                                  msg.content.replace(/<think-live>(.*?)<\/think-live>/g, '$1') : 
                                  'Starting to think...'
                                } 
                                isLive={msg.isStreaming} 
                              />
                            </div>
                          ) : (
                            <div className="w-full max-w-full overflow-hidden">
                              {/* Render think blocks first - only if they contain meaningful content and no live thinking */}
                              {!currentThinkingMessageId && thinkBlocks.length > 0 && thinkBlocks.map((block, index) => (
                                <ThinkingButton key={`${msg.id}-think-${index}`} content={block.content} isLive={false} />
                              ))}
                              
                              {/* Render the main content with ReactMarkdown - only show if there's actual content or if thinking is complete */}
                              {(processedContent.trim().length > 0 || !currentThinkingMessageId || currentThinkingMessageId !== msg.id) && (
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm]} 
                                  rehypePlugins={[rehypeRaw]} 
                                  className="prose dark:prose-invert max-w-none"
                                  components={{
                                    // Remove the think tag component override since we handle it above
                                  }}
                                >
                                  {finalContent.replace(/<!-- think-block-\d+ -->/g, '')}
                                </ReactMarkdown>
                              )}
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
                  </React.Fragment>
                );
              } else if (msg.role === 'search-ui') {
                return (
                  <Search
                    key={msg.id}
                    query={msg.query || msg.content}
                    onComplete={(result: any) => {
                      // Handle search completion if needed
                      console.log('Search completed:', result);
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
            
            {/* Remove the standalone thinking box since it's now integrated within the messages flow */}
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