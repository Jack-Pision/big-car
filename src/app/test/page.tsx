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
  createNewSessionWithAITitle,
  updateSessionTitleWithAI,
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
    @keyframes shimmerMove {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(100%);
      }
    }

    .shimmer-button {
      position: relative;
      overflow: hidden;
      background: rgba(31, 41, 55, 1) !important;
    }

    .shimmer-button::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent 0%,
        transparent 40%,
        rgba(6, 182, 212, 0.6) 50%,
        transparent 60%,
        transparent 100%
      );
      animation: shimmerMove 1s ease-in-out infinite;
      z-index: 1;
    }

    .shimmer-button > * {
      position: relative;
      z-index: 2;
    }
    
    .ai-response-text {
      line-height: 1.6;
    }
    
    .ai-response-text h1, .ai-response-text h2, .ai-response-text h3 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    
    .ai-response-text p {
      margin-bottom: 1em;
    }
    
    .ai-response-text ul, .ai-response-text ol {
      margin-bottom: 1em;
      padding-left: 1.5em;
    }
    
    .ai-response-text li {
      margin-bottom: 0.5em;
    }
    
    .ai-response-text blockquote {
      border-left: 4px solid #06b6d4;
      padding-left: 1em;
      margin: 1em 0;
      font-style: italic;
      color: #9ca3af;
    }
    
    .ai-response-text code {
      background-color: #374151;
      padding: 0.2em 0.4em;
      border-radius: 0.25em;
      font-size: 0.9em;
    }
    
    .ai-response-text pre {
      background-color: #1f2937;
      padding: 1em;
      border-radius: 0.5em;
      overflow-x: auto;
      margin: 1em 0;
    }
    
    .ai-response-text pre code {
      background-color: transparent;
      padding: 0;
    }
    
    .ai-response-text table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    
    .ai-response-text th, .ai-response-text td {
      border: 1px solid #374151;
      padding: 0.5em;
      text-align: left;
    }
    
    .ai-response-text th {
      background-color: #374151;
      font-weight: bold;
    }
    
    .ai-response-text a {
      color: #06b6d4;
      text-decoration: underline;
    }
    
    .ai-response-text a:hover {
      color: #0891b2;
    }
    
    .ai-response-text img {
      max-width: 100%;
      height: auto;
      border-radius: 0.5em;
      margin: 1em 0;
    }
    
    .ai-response-text hr {
      border: none;
      border-top: 1px solid #374151;
      margin: 2em 0;
    }
    
    .ai-response-text .highlight {
      background-color: #fbbf24;
      color: #1f2937;
      padding: 0.1em 0.3em;
      border-radius: 0.25em;
    }
    
    .ai-response-text .warning {
      background-color: #f59e0b;
      color: #1f2937;
      padding: 0.5em;
      border-radius: 0.5em;
      margin: 1em 0;
    }
    
    .ai-response-text .info {
      background-color: #06b6d4;
      color: #1f2937;
      padding: 0.5em;
      border-radius: 0.5em;
      margin: 1em 0;
    }
    
    .ai-response-text .success {
      background-color: #10b981;
      color: #1f2937;
      padding: 0.5em;
      border-radius: 0.5em;
      margin: 1em 0;
    }
    
    .ai-response-text .error {
      background-color: #ef4444;
      color: #ffffff;
      padding: 0.5em;
      border-radius: 0.5em;
      margin: 1em 0;
    }
    
    .markdown-body {
      color: #ffffff;
    }
    
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      color: #ffffff;
      border-bottom: none;
    }
    
    .markdown-body p, .markdown-body li, .markdown-body td, .markdown-body th {
      color: #ffffff;
    }
    
    .markdown-body code {
      color: #06b6d4;
      background-color: #374151;
    }
    
    .markdown-body pre {
      background-color: #1f2937;
    }
    
    .markdown-body pre code {
      color: #ffffff;
    }
    
    .markdown-body blockquote {
      color: #9ca3af;
      border-left-color: #06b6d4;
    }

    
    .markdown-body table {
      color: #ffffff;
    }
    
    .markdown-body th {
      background-color: #374151;
      color: #ffffff;
    }
    
    .markdown-body td {
      border-color: #374151;
    }
    
    .markdown-body a {
      color: #06b6d4;
    }
    
    .markdown-body a:hover {
      color: #0891b2;
    }
    
    .markdown-body strong {
      color: #ffffff;
    }
    
    .markdown-body em {
      color: #d1d5db;
    }
    
    .prose {
      max-width: none;
    }
    
    .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
      color: #ffffff;
    }
    
    .prose p, .prose li {
      color: #ffffff;
    }
    
    .prose strong {
      color: #ffffff;
    }
    
    .prose code {
      color: #06b6d4;
    }
    
    .prose pre {
      background-color: #1f2937;
    }
    
    .prose blockquote {
      color: #9ca3af;
      border-left-color: #06b6d4;
    }
    
    .prose a {
      color: #06b6d4;
    }
    
    .prose a:hover {
      color: #0891b2;
    }
    
    .prose table {
      color: #ffffff;
    }
    
    .prose th {
      color: #ffffff;
      background-color: #374151;
    }
    
    .prose td {
      color: #ffffff;
      border-color: #374151;
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
  isSearchResult?: boolean; // Add this property for search result messages
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
  // Replace [1], [2], ... with small, round citation badges
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    if (sources[idx] && sources[idx].url) {
      return `<a href="${sources[idx].url}" target="_blank" rel="noopener noreferrer" class="citation-badge">${num}</a>`;
    }
    return `<span class="citation-badge-inactive">${num}</span>`;
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
  <div className="bg-gray-800 border border-gray-700 p-3 rounded-md text-cyan-300 mb-2">
    <div className="font-semibold mb-1 text-sm text-cyan-400">AI Thought Process:</div>
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
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
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
      
      // Update session title with AI-generated title after first AI response
      const userMessages = messages.filter(msg => msg.role === 'user');
      const aiMessages = messages.filter(msg => msg.role === 'assistant' && msg.isProcessed);
      
      // If this is the first AI response (1 user message, 1 completed AI message)
      if (userMessages.length === 1 && aiMessages.length === 1) {
        const firstUserMessage = userMessages[0];
        const firstAiMessage = aiMessages[0];
        
        // Update title with AI-generated version
        updateSessionTitleWithAI(
          activeSessionId, 
          firstUserMessage.content,
          firstAiMessage.content
        ).then(() => {
          // Trigger sidebar refresh to show updated title
          setSidebarRefreshTrigger(prev => prev + 1);
        }).catch(error => {
          console.error('Failed to update session title:', error);
        });
      }
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
      // Create session if needed for search mode
      let currentActiveSessionId = activeSessionId;
      
      if (!currentActiveSessionId) {
        const newSession = await createNewSessionWithAITitle(input.trim());
        setActiveSessionId(newSession.id);
        saveActiveSessionId(newSession.id);
        currentActiveSessionId = newSession.id;
        setMessages([]);
      }

      if (!hasInteracted) setHasInteracted(true);
      if (showHeading) setShowHeading(false);

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
      const newSession = await createNewSessionWithAITitle(input.trim() || (selectedFilesForUpload.length > 0 ? "Image Upload" : undefined));
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
    
    // Create placeholder AI message immediately so think box can appear
    const placeholderAiMessage: LocalMessage = {
      role: "assistant" as const,
      content: '', // Empty content initially
      id: upcomingAiMessageId,
      timestamp: Date.now(),
      parentId: userMessageId,
      imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
      webSources: [],
      contentType: 'conversation',
      isStreaming: true,
      isProcessed: false
    };
    
    // Add placeholder AI message immediately
    setMessages((prev) => [...prev, placeholderAiMessage]);
    
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
        max_tokens: 4096,
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
                    
                    // Update the existing placeholder AI message with content
                    if (aiMessageId) {
                      setMessages((prev) => {
                        return prev.map(msg => 
                          msg.id === aiMessageId 
                            ? { ...msg, content: mainContent, isStreaming: true }
                            : msg
                        );
                      });
                      hasCreatedMessage = true; // Mark as created after first update
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
    // This filters out search-ui messages and search results since ConversationMessage doesn't support those roles
    // Search results are handled separately and shouldn't be part of conversation context
    return messages.filter(
      msg => msg.role !== 'search-ui' && !msg.isSearchResult
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
        {/* Morphing button/box container */}
        <div
          className={`transition-all duration-300 ease-in-out rounded-md border border-gray-700 text-cyan-300 ${
            isLive ? 'shimmer-button' : `bg-gray-800 ${!isExpanded ? 'hover:bg-gray-700' : ''}`
          } ${
            isExpanded ? 'p-3 w-full' : 'px-3 py-2 w-auto inline-block'
          }`}
        >
          {/* Button header - always visible */}
          <div 
            className="flex items-center gap-2 text-sm cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {/* Clean Atom icon - no animations */}
            <div className="w-4 h-4 relative flex-shrink-0">
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 32 32" 
                fill="#06b6d4"
              >
                <path d="M10.799 4.652c-1.485 0.324-2.271 2.045-2.104 4.593 0.051 0.738 0.043 0.666 0.196 1.609 0.064 0.38 0.107 0.7 0.098 0.709-0.008 0.013-0.269 0.077-0.572 0.149-2.019 0.465-3.505 1.165-4.397 2.070-0.602 0.606-0.854 1.17-0.845 1.882 0.004 0.401 0.137 0.841 0.38 1.264 0.209 0.363 0.956 1.101 1.447 1.434 1.029 0.692 1.345 0.79 1.626 0.508 0.12-0.119 0.145-0.179 0.145-0.32 0-0.273-0.094-0.405-0.414-0.581-1.409-0.781-2.147-1.592-2.147-2.369 0-0.282 0.098-0.538 0.333-0.845 0.619-0.824 2.113-1.562 4.115-2.036 0.529-0.124 0.632-0.132 0.632-0.043 0 0.115 0.427 1.481 0.7 2.228l0.273 0.751-0.337 0.645c-0.184 0.354-0.448 0.892-0.585 1.2-1.959 4.316-2.284 7.743-0.867 9.152 0.333 0.333 0.606 0.487 1.054 0.602 1.033 0.265 2.399-0.132 3.931-1.144 0.534-0.354 0.653-0.487 0.653-0.721 0-0.282-0.307-0.555-0.581-0.512-0.077 0.013-0.376 0.179-0.662 0.367-0.632 0.422-1.34 0.773-1.853 0.926-0.525 0.154-1.093 0.162-1.417 0.021-0.995-0.44-1.225-2.215-0.606-4.678 0.29-1.17 0.956-2.928 1.558-4.128l0.239-0.482 0.132 0.299c0.248 0.572 1.212 2.437 1.588 3.073 2.079 3.534 4.422 6.125 6.501 7.184 1.473 0.751 2.689 0.683 3.517-0.201 0.61-0.645 0.909-1.584 0.96-2.992 0.081-2.425-0.709-5.579-2.254-8.96-0.205-0.453-0.41-0.862-0.448-0.905-0.094-0.102-0.333-0.171-0.495-0.137s-0.359 0.231-0.388 0.397c-0.034 0.158 0.004 0.265 0.384 1.088 1.059 2.284 1.801 4.683 2.087 6.744 0.094 0.679 0.111 2.151 0.026 2.604-0.085 0.457-0.252 0.931-0.431 1.204-0.286 0.44-0.615 0.619-1.157 0.615-1.609-0.004-4.145-2.215-6.399-5.571-1.037-1.55-1.993-3.3-2.732-5.011l-0.265-0.61 0.371-0.627c0.478-0.811 0.982-1.579 1.545-2.369l0.448-0.627h0.692c4.747 0 9.459 1.076 11.867 2.702 0.551 0.371 1.080 0.914 1.264 1.289 0.128 0.265 0.145 0.337 0.145 0.64-0.004 0.286-0.021 0.376-0.119 0.563-0.294 0.572-1.042 1.14-2.079 1.592-0.487 0.209-0.64 0.354-0.64 0.602 0 0.23 0.094 0.397 0.273 0.482 0.196 0.094 0.265 0.085 0.581-0.043 1.49-0.602 2.565-1.49 2.903-2.395 0.623-1.665-0.683-3.347-3.564-4.602-2.518-1.101-6.219-1.789-10.070-1.87l-0.423-0.009 0.482-0.555c0.555-0.645 1.78-1.87 2.305-2.309 1.246-1.050 2.361-1.716 3.321-1.989 0.474-0.137 1.059-0.132 1.362 0.004 0.41 0.184 0.696 0.598 0.854 1.238 0.098 0.388 0.098 1.575 0 2.147-0.111 0.632-0.098 0.743 0.073 0.913 0.124 0.124 0.175 0.145 0.354 0.145 0.38 0 0.478-0.141 0.593-0.832 0.060-0.354 0.081-0.692 0.081-1.387 0-0.811-0.013-0.965-0.098-1.302-0.269-1.063-0.926-1.797-1.806-2.006-2.040-0.478-5.161 1.485-8.264 5.208-0.256 0.303-0.495 0.602-0.534 0.653-0.064 0.094-0.107 0.102-0.726 0.141-0.359 0.021-1.016 0.081-1.464 0.132-1.187 0.137-1.093 0.149-1.161-0.158-0.179-0.858-0.239-1.46-0.243-2.39-0.004-1.007 0.030-1.306 0.213-1.865 0.196-0.593 0.529-0.995 0.952-1.135 0.205-0.073 0.709-0.064 1.007 0.013 0.499 0.132 1.204 0.508 1.844 0.99 0.38 0.286 0.512 0.337 0.713 0.269 0.23-0.073 0.367-0.265 0.367-0.504 0-0.179-0.017-0.213-0.205-0.393-0.265-0.256-1.033-0.768-1.498-0.999-0.879-0.44-1.648-0.581-2.339-0.431zM12.4 12.216c-0.004 0.021-0.282 0.44-0.61 0.935s-0.653 0.995-0.721 1.11l-0.124 0.209-0.102-0.277c-0.128-0.337-0.525-1.643-0.525-1.725 0-0.077 0.188-0.107 1.579-0.252 0.29-0.030 0.521-0.030 0.504 0zM15.649 14.854c-0.303 0.098-0.598 0.316-0.773 0.576-0.525 0.773-0.269 1.78 0.555 2.185 0.256 0.128 0.32 0.141 0.67 0.141s0.414-0.013 0.67-0.141c1.114-0.546 1.089-2.168-0.043-2.689-0.299-0.137-0.781-0.166-1.080-0.073z"/>
              </svg>
            </div>
            
            <span className="font-medium flex-1">
              {isLive ? 'Thinking' : 'Thought'}
            </span>
            
            {/* Expand/collapse indicator */}
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={`transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
          </div>
          
          {/* Expanded content - appears below the button header when expanded */}
          {isExpanded && (
            <div className="pt-6">
              <div className="whitespace-pre-line text-sm leading-relaxed select-text">
                {content}
              </div>
            </div>
          )}
        </div>
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
                // Handle search results separately - process content to remove reasoning but hide Think boxes
                if (msg.isSearchResult) {
                  // Apply content processing to extract and remove any reasoning/thinking content
                  const { content: rawContent } = cleanAIResponse(msg.content);
                  const cleanContent = rawContent.replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '');
                  
                  // Process think tags to extract reasoning (but we won't render the Think blocks)
                  const { processedContent } = processThinkTags(cleanContent);
                  
                  // Remove emojis from search results
                  let contentForDisplay = processedContent;
                  contentForDisplay = contentForDisplay.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, ''); // Surrogate pairs
                  contentForDisplay = contentForDisplay.replace(/[\u2600-\u27BF]/g, ''); // Miscellaneous symbols
                  contentForDisplay = contentForDisplay.replace(/[\u1F300-\u1F6FF]/g, ''); // Emoticons
                  contentForDisplay = contentForDisplay.replace(/[\u1F1E0-\u1F1FF]/g, ''); // Flags
                  contentForDisplay = contentForDisplay.replace(/:[a-zA-Z0-9_+-]+:/g, ''); // Remove emoji shortcodes
                  contentForDisplay = contentForDisplay.replace(/[🔍📋📊💡🚀⚡🎯📈📉🔥💪🌟✨🎉🎊👍👎❤️💯🔔📢📣🎪🎭🎨🎬🎵🎶🎸🎹🎺🎻🥁🎤🎧🎮🕹️🎲🎳]/g, '');
                  contentForDisplay = contentForDisplay.replace(/\s+/g, ' ').trim();
                  
                  const finalContent = makeCitationsClickable(contentForDisplay, msg.webSources || []);

                  return (
                    <motion.div
                      key={msg.id + '-search-result-' + i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
                      style={{ color: '#fff', maxWidth: '100%', overflowWrap: 'break-word' }}
                    >
                      {/* Clean search result rendering - reasoning extracted and hidden, only clean content shown */}
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]} 
                        rehypePlugins={[rehypeRaw]} 
                        className="research-output"
                        components={{
                          // Enhanced components for professional research output (same as normal messages)
                          h1: ({children}) => (
                            <h1 className="text-4xl font-bold text-white mb-8 mt-10 border-b-2 border-cyan-500/40 pb-4 leading-tight">
                              {children}
                            </h1>
                          ),
                          h2: ({children}) => (
                            <h2 className="text-2xl font-semibold text-cyan-400 mb-5 mt-10 leading-tight">
                              {children}
                            </h2>
                          ),
                          h3: ({children}) => (
                            <h3 className="text-xl font-semibold text-white mb-4 mt-8 leading-tight">
                              {children}
                            </h3>
                          ),
                          p: ({children}) => (
                            <p className="text-gray-200 leading-relaxed mb-5 text-base font-normal">
                              {children}
                            </p>
                          ),
                          ul: ({children}) => (
                            <ul className="space-y-3 mb-6 ml-6">
                              {children}
                            </ul>
                          ),
                          li: ({children}) => (
                            <li className="text-gray-200 leading-relaxed relative">
                              <span className="absolute -left-6 text-cyan-400 font-bold">•</span>
                              {children}
                            </li>
                          ),
                          ol: ({children}) => (
                            <ol className="space-y-3 mb-6 ml-6 list-decimal">
                              {children}
                            </ol>
                          ),
                          strong: ({children}) => (
                            <strong className="text-white font-bold">
                              {children}
                            </strong>
                          ),
                          table: ({children}) => (
                            <div className="overflow-x-auto mb-8 max-w-full rounded-lg border border-gray-600">
                              <table className="w-full border-collapse" style={{tableLayout: 'auto', maxWidth: '100%'}}>
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({children}) => (
                            <thead className="bg-gray-800/80">
                              {children}
                            </thead>
                          ),
                          th: ({children}) => (
                            <th className="border-r border-gray-600 px-6 py-4 text-left text-cyan-400 font-bold text-sm uppercase tracking-wide" style={{wordWrap: 'break-word', overflowWrap: 'break-word'}}>
                              {children}
                            </th>
                          ),
                          td: ({children}) => (
                            <td className="border-r border-b border-gray-600 px-6 py-4 text-gray-200 leading-relaxed" style={{wordWrap: 'break-word', overflowWrap: 'break-word'}}>
                              {children}
                            </td>
                          ),
                          blockquote: ({children}) => (
                            <blockquote className="border-l-4 border-cyan-500 pl-4 py-2 rounded-r-lg mb-4 italic text-gray-300" style={{background: 'transparent'}}>
                              {children}
                            </blockquote>
                          ),
                          code: ({children, className}) => {
                            const isInline = !className;
                            if (isInline) {
                              return (
                                <code className="text-cyan-400 px-2 py-1 rounded text-sm font-mono" style={{background: 'rgba(55, 65, 81, 0.5)'}}>
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <code className="block text-gray-200 p-4 rounded-lg overflow-x-auto text-sm font-mono mb-4" style={{background: 'rgba(17, 24, 39, 0.8)'}}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {finalContent.replace(/<!-- think-block-\d+ -->/g, '')}
                      </ReactMarkdown>
                      
                      {/* Action buttons for search results */}
                      {msg.isProcessed && (
                        <div className="w-full flex justify-start gap-2 mt-2">
                          <button
                            onClick={() => handleCopy(finalContent)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                            aria-label="Copy search result"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span className="text-xs">Copy</span>
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                }
                
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
                
                // Remove emojis from search results
                let contentForDisplay = processedContent;
                if (msg.isSearchResult) {
                  // Remove all emojis using ES5-compatible regex patterns
                  contentForDisplay = contentForDisplay.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, ''); // Surrogate pairs
                  contentForDisplay = contentForDisplay.replace(/[\u2600-\u27BF]/g, ''); // Miscellaneous symbols
                  contentForDisplay = contentForDisplay.replace(/[\u1F300-\u1F6FF]/g, ''); // Emoticons
                  contentForDisplay = contentForDisplay.replace(/[\u1F1E0-\u1F1FF]/g, ''); // Flags
                  // Remove emoji shortcodes like :emoji_name:
                  contentForDisplay = contentForDisplay.replace(/:[a-zA-Z0-9_+-]+:/g, '');
                  // Remove specific common emojis that might not be caught by ranges
                  contentForDisplay = contentForDisplay.replace(/[🔍📋📊💡🚀⚡🎯📈📉🔥💪🌟✨🎉🎊👍👎❤️💯🔔📢📣🎪🎭🎨🎬🎵🎶🎸🎹🎺🎻🥁🎤🎧🎮🕹️🎲🎳]/g, '');
                  // Clean up any double spaces left by emoji removal
                  contentForDisplay = contentForDisplay.replace(/\s+/g, ' ').trim();
                }
                
                const finalContent = makeCitationsClickable(contentForDisplay, msg.webSources || []);
                
                if (showPulsingDot && i === messages.length -1 ) setShowPulsingDot(false);
                
                return (
                  <React.Fragment key={msg.id + '-fragment-' + i}>
                    {/* Main AI response content */}
                    <motion.div
                      key={msg.id + '-text-' + i}
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
                      
                      {isStoppedMsg ? (
                        <span className="text-sm text-white italic font-light mb-2">[Response stopped by user]</span>
                      ) : (
                        <div className="w-full max-w-full overflow-hidden">
                          {/* Single consolidated thinking button - handles all thinking scenarios - DISABLED for search results */}
                          {!msg.isSearchResult && (currentThinkingMessageId === msg.id && liveThinking) && (
                            <ThinkingButton 
                              key={`${msg.id}-live-thinking`} 
                              content={liveThinking} 
                              isLive={true} 
                            />
                          )}
                          
                          {/* Think blocks from processed content - show for all messages except the one currently live thinking - DISABLED for search results */}
                          {!msg.isSearchResult && currentThinkingMessageId !== msg.id && thinkBlocks.length > 0 && thinkBlocks.map((block, index) => (
                            <ThinkingButton key={`${msg.id}-think-${index}`} content={block.content} isLive={false} />
                          ))}
                          
                          {/* Main content - show if there's content or thinking is complete */}
                          {(processedContent.trim().length > 0 || !currentThinkingMessageId || currentThinkingMessageId !== msg.id) && (
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]} 
                              rehypePlugins={[rehypeRaw]} 
                              className="research-output"
                              components={{
                                // Enhanced components for professional research output
                                h1: ({children}) => (
                                  <h1 className="text-4xl font-bold text-white mb-8 mt-10 border-b-2 border-cyan-500/40 pb-4 leading-tight">
                                    {children}
                                  </h1>
                                ),
                                h2: ({children}) => (
                                  <h2 className="text-2xl font-semibold text-cyan-400 mb-5 mt-10 leading-tight">
                                    {children}
                                  </h2>
                                ),
                                h3: ({children}) => (
                                  <h3 className="text-xl font-semibold text-white mb-4 mt-8 leading-tight">
                                    {children}
                                  </h3>
                                ),
                                p: ({children}) => (
                                  <p className="text-gray-200 leading-relaxed mb-5 text-base font-normal">
                                    {children}
                                  </p>
                                ),
                                ul: ({children}) => (
                                  <ul className="space-y-3 mb-6 ml-6">
                                    {children}
                                  </ul>
                                ),
                                li: ({children}) => (
                                  <li className="text-gray-200 flex items-start gap-3 leading-relaxed">
                                    <span className="text-cyan-400 mt-1.5 text-sm font-bold">•</span>
                                    <span className="flex-1">{children}</span>
                                  </li>
                                ),
                                ol: ({children}) => (
                                  <ol className="space-y-2 mb-4 ml-4 list-decimal list-inside">
                                    {children}
                                  </ol>
                                ),
                                strong: ({children}) => (
                                  <strong className="text-white font-bold">
                                    {children}
                                  </strong>
                                ),
                                table: ({children}) => (
                                  <div className="overflow-x-auto mb-8 max-w-full rounded-lg border border-gray-600">
                                    <table className="w-full border-collapse" style={{tableLayout: 'auto', maxWidth: '100%'}}>
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({children}) => (
                                  <thead className="bg-gray-800/80">
                                    {children}
                                  </thead>
                                ),
                                th: ({children}) => (
                                  <th className="border-r border-gray-600 px-6 py-4 text-left text-cyan-400 font-bold text-sm uppercase tracking-wide" style={{wordWrap: 'break-word', overflowWrap: 'break-word'}}>
                                    {children}
                                  </th>
                                ),
                                td: ({children}) => (
                                  <td className="border-r border-b border-gray-600 px-6 py-4 text-gray-200 leading-relaxed" style={{wordWrap: 'break-word', overflowWrap: 'break-word'}}>
                                    {children}
                                  </td>
                                ),
                                blockquote: ({children}) => (
                                  <blockquote className="border-l-4 border-cyan-500 pl-4 py-2 rounded-r-lg mb-4 italic text-gray-300" style={{background: 'transparent'}}>
                                    {children}
                                  </blockquote>
                                ),
                                code: ({children, className}) => {
                                  const isInline = !className;
                                  if (isInline) {
                                    return (
                                      <code className="text-cyan-400 px-2 py-1 rounded text-sm font-mono" style={{background: 'rgba(55, 65, 81, 0.5)'}}>
                                        {children}
                                      </code>
                                    );
                                  }
                                  return (
                                    <code className="block text-gray-200 p-4 rounded-lg overflow-x-auto text-sm font-mono mb-4" style={{background: 'rgba(17, 24, 39, 0.8)'}}>
                                      {children}
                                    </code>
                                  );
                                }
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
                    onComplete={(result: any, sources?: any[]) => {
                      // Add the search result as a new assistant message with search-specific flag and sources
                      console.log('Search completed:', result);
                      setMessages(prev => [
                        ...prev,
                        {
                          role: 'assistant',
                          id: uuidv4(),
                          content: result,
                          timestamp: Date.now(),
                          isProcessed: true,
                          parentId: msg.id,
                          contentType: 'search-result',
                          isSearchResult: true,
                          webSources: sources || []
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
          refreshTrigger={sidebarRefreshTrigger}
        />
      </div>
      {chatError && (
        <div className="text-red-500 text-sm text-center mt-2">{chatError}</div>
      )}
    </>
  );
} 