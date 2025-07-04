"use client";
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Sidebar from '../components/Sidebar';
import HamburgerMenu from '../components/HamburgerMenu';
import AuthProvider, { useAuth } from '../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import TextReveal from '@/components/TextReveal';
import { WebSource } from '@/utils/source-utils/index';
import { v4 as uuidv4 } from 'uuid';
import { formatMessagesForApi, enhanceSystemPrompt, buildConversationContext } from '@/utils/conversation-context';
import { Session } from '@/lib/types';
import {
  optimizedSupabaseService,
  getSessions as getSessionsFromService,
  getSessionMessages,
  saveSessionMessages,
  saveMessageInstantly,
  updateMessageContent,
  createNewSession,
  createNewSessionWithURL,
  deleteSession,
  saveActiveSessionId,
  getActiveSessionId
} from '@/lib/optimized-supabase-service';
import { aiResponseCache, cachedAIRequest } from '@/lib/ai-response-cache';
import { SCHEMAS } from '@/lib/output-schemas';
import DynamicResponseRenderer from '@/components/DynamicResponseRenderer';
import TutorialDisplay, { TutorialData } from '@/components/TutorialDisplay';
import ComparisonDisplay, { ComparisonData } from '@/components/ComparisonDisplay';
import InformationalSummaryDisplay, { InformationalSummaryData } from '@/components/InformationalSummaryDisplay';
import ConversationDisplay from '@/components/ConversationDisplay';

import { Bot, User, Paperclip, Send, XCircle, Search as SearchIcon, Trash2, PlusCircle, Settings, Zap, ExternalLink, AlertTriangle, Brain } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Image from 'next/image';
import rehypeRaw from 'rehype-raw';
import { Message as BaseMessage } from '@/utils/conversation-context';

import { Message as ConversationMessage } from "@/utils/conversation-context";
import { filterAIThinking } from '../utils/content-filter';
import ThinkingButton from '@/components/ThinkingButton';
import { ArtifactViewer } from '@/components/ArtifactViewer';
import { type ArtifactData } from '@/utils/artifact-utils';
import { analyzeImageWithNVIDIA, ImageUploadResult } from '@/lib/image-upload-service';
import toast from 'react-hot-toast';
import { EnhancedMarkdownRenderer } from '@/components/EnhancedMarkdownRenderer';
import ImageCarousel from '@/components/ImageCarousel';
import { ArtifactV2Service, type ArtifactV2 } from '@/lib/artifact-v2-service';
import NotionAuthModal from '@/components/NotionAuthModal';
import { notionOAuth } from '@/lib/notion-oauth';
import { notionIntegration } from '@/lib/notion-integration';
// import { isMindMapRequest } from '@/utils/mindmap-utils'; // Removed
import ToolStepRenderer from '../components/ToolStepRenderer';


// Define a type that includes all possible query types (including the ones in SCHEMAS and 'conversation')
type QueryType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation' | 'reasoning' | 'mind_map';

// Define types for query classification and content display
type QueryClassificationType = keyof typeof SCHEMAS;
type ContentDisplayType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation' | 'reasoning' | 'mind_map';

// Search result interface (from browser mode)
interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  url: string;
  favicon?: string;
  image?: string;
  timestamp?: string;
}

const BASE_SYSTEM_PROMPT = `You are Tehom AI, a helpful, intelligent, and friendly assistant. You communicate in a natural, conversational way that feels warm and engaging.

Your personality:
- Curious and thoughtful - you genuinely care about helping users
- Conversational but informative - explain things naturally without being overly formal
- Adaptive - match the user's energy and communication style
- Encouraging - be supportive and positive in your responses

Your communication style:
- Use natural conversation flow with appropriate explanations
- Include relevant context and examples when helpful
- Ask follow-up questions when it would be valuable
- Show enthusiasm for interesting topics
- Use contractions and casual language when appropriate.
- Vary your response beginnings - don't always start the same way

Response guidelines:
- Be thorough when the topic warrants it, concise when brevity is better
- Include markdown formatting naturally for better readability
- Share relevant insights and connections
- If you're unsure about something, say so honestly
- End with questions or suggestions when it would help continue the conversation

Remember: You're having a conversation with a human, Be helpful, be human-like, and be genuinely engaging.`;

// Remove the old system prompt - the backend now handles this

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

// Add after cleanAIResponse definition
function fixDenseMarkdown(text: string): string {
  if (!text) return text;
  // Ensure a newline before numbered items like "1." "2." etc. if not already at line start
  let fixed = text.replace(/(\d+\.)\s*/g, '\n$1 ');
  // Ensure a newline before dashes that appear like list markers but are glued
  fixed = fixed.replace(/([^-])(-\s+)/g, '$1\n- ');
  return fixed;
}

/**
 * Smart buffering for streaming content - prevents incomplete markdown from causing layout issues
 * Industry standard approach: only render complete markdown elements during streaming
 */
function smartBufferStreamingContent(content: string): string {
  if (!content) return content;
  
  const lines = content.split('\n');
  let bufferedContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLastLine = i === lines.length - 1;
    
    // If it's the last line and potentially incomplete, check for incomplete markdown
    if (isLastLine && isIncompleteMarkdown(line)) {
      // Don't render incomplete last line to prevent layout issues
      break;
    }
    
    bufferedContent += line + (i < lines.length - 1 ? '\n' : '');
  }
  
  return bufferedContent;
}

/**
 * Checks if a line contains incomplete markdown that could cause layout issues
 */
function isIncompleteMarkdown(line: string): boolean {
  if (!line.trim()) return false;
  
  // Check for incomplete bold/italic: odd number of ** or *
  const boldCount = (line.match(/\*\*/g) || []).length;
  const italicCount = (line.match(/(?<!\*)\*(?!\*)/g) || []).length;
  if (boldCount % 2 !== 0 || italicCount % 2 !== 0) return true;
  
  // Check for incomplete list items: "1. **item" or "- **item" without closing
  if (/^(\d+\.|\-)\s+\*\*[^*]*$/.test(line.trim())) return true;
  
  // Check for incomplete code blocks: single ``` without closing
  const codeBlockCount = (line.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) return true;
  
  // Check for incomplete headers: # at start but potentially cut off
  if (/^#+\s*$/.test(line.trim())) return true;
  
  return false;
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
    
    // Remove circled numbers/letters and custom symbols (e.g., ?????)
    processedText = processedText.replace(/[???????????????????????????????????????]/g, '');
    
    // Collapse repeated numbers/dashes (e.g., 20K�20K�20K�50K => 20K�50K)
    processedText = processedText.replace(/(\b\d+[KkMm]\b[�-])(?:\1)+/g, '$1');
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

    /* Metallic shining effect for images waiting for AI response */
    @keyframes metallicShine {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }
    
    .image-metallic-shine {
      position: relative;
      overflow: hidden;
    }
    
    .image-metallic-shine::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.2) 20%,
        rgba(255, 255, 255, 0.5) 50%,
        rgba(255, 255, 255, 0.2) 80%,
        transparent 100%
      );
      background-size: 200% 100%;
      animation: metallicShine 2s infinite;
      border-radius: inherit;
      pointer-events: none;
      z-index: 1;
    }

    /* Hide scrollbars completely */
    .scrollbar-none {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .scrollbar-none::-webkit-scrollbar {
      display: none;
    }

    /* Additional scrollbar hiding class for carousel */
    .scrollbar-hide {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .scrollbar-hide::-webkit-scrollbar {
      display: none;
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
  title?: string; // Add title for artifact preview cards
  root_id?: string; // Add root_id for artifact versioning
  version?: number; // Add version for artifact versioning
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
  let allThinkContent = ''; // Combine all think content into one block
  
  // Find all think tag pairs
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  
  while ((match = thinkRegex.exec(content)) !== null) {
    // Add content before the think tag
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    
    // Accumulate all think content instead of creating separate blocks
    const thinkContent = match[1].trim();
    if (thinkContent && thinkContent.length > 0) {
      if (allThinkContent) {
        allThinkContent += '\n\n' + thinkContent; // Combine with line breaks
      } else {
        allThinkContent = thinkContent;
      }
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Create only ONE think block with all combined content
  if (allThinkContent) {
    const thinkId: string = `think-block-0`;
    thinkBlocks.push({ id: thinkId, content: allThinkContent });
    parts.push(`<!-- ${thinkId} -->`);
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

const getThinkPrompt = (basePrompt: string, userQuery?: string) => {
  // Check if the user is requesting a mind map using the utility function
  // const isMindMapRequestDetected = userQuery && isMindMapRequest(userQuery); // Removed

  // Disabled mind map functionality - all mind map related code commented out

  return `You are Tehom AI, an advanced and thoughtful assistant designed for deep reasoning, clear explanation, and insightful analysis. You think carefully before responding, consider multiple perspectives, and help users understand not just the answer, but the reasoning behind it. You communicate in a natural, human-like tone that feels intelligent, calm, and genuinely helpful. You often use analogies, examples, and counterpoints to make complex ideas easier to grasp, and you're not afraid to explore ambiguity when needed. Your goal is to guide users toward clarity and understanding, uncover hidden assumptions, and bring depth to every conversation. Always respond in markdown format to keep your output clean, readable, and well-structured.

When responding, think through the problem step by step, considering multiple angles and potential complications before providing your final answer.`;
};



// Function to extract think content during streaming and update live thinking state
const extractThinkContentDuringStream = (content: string) => {
  let thinkContent = '';
  let mainContent = content;
  
  // First, handle complete think tags
  const completeThinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  
  while ((match = completeThinkRegex.exec(content)) !== null) {
    thinkContent += match[1];
    // Remove the complete think tags from main content
    mainContent = mainContent.replace(match[0], '');
  }
  
  // Only handle partial think tags if no complete tags were found
  // This prevents double-processing the same content
  if (!thinkContent) {
  const partialThinkMatch = content.match(/<think>([^<]*?)$/);
  if (partialThinkMatch) {
      thinkContent = partialThinkMatch[1];
    mainContent = mainContent.replace(partialThinkMatch[0], '');
    }
  }
  
  return {
    thinkContent: thinkContent.trim(),
    mainContent: mainContent.trim()
  };
};

// Helper function to extract JSON from streaming artifact content
const extractJsonFromStreamingContent = (content: string): any | null => {
  try {
    // Remove <think> tags and their content
    let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    // Try to find JSON object in the content
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[0];
      return JSON.parse(jsonStr);
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

// Helper function to check if streaming content looks complete for artifact
const isArtifactContentComplete = (content: string): boolean => {
  // Check if we have a complete JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return false;
  
  try {
    const jsonStr = jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    
    // Check if it has the required artifact fields
    return parsed.title && parsed.content && parsed.type;
  } catch (error) {
    return false;
  }
};

interface TestChatProps {
  initialSessionId?: string;
  initialSessionTitle?: string;
}

function TestChatComponent(props?: TestChatProps) {
  const { initialSessionId, initialSessionTitle } = props || {};
  const router = useRouter();
  const { user, showSettingsModal } = useAuth();
  
  // State management
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputBarHeight, setInputBarHeight] = useState(96);
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [currentStreamContent, setCurrentStreamContent] = useState('');
  const [isStreamingComplete, setIsStreamingComplete] = useState(false);
  const [showThinkingBox, setShowThinkingBox] = useState(false);
  const [thinkingContent, setThinkingContent] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'chat' | 'search' | 'cube'>('chat');
  const [activeButton, setActiveButton] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [isArtifactMode, setIsArtifactMode] = useState(false);
  const [pendingUrlUpdate, setPendingUrlUpdate] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<ArtifactData | null>(null);
  const [isGeneratingArtifact, setIsGeneratingArtifact] = useState(false);
  const [artifactProgress, setArtifactProgress] = useState('');
  
  // Add state for resizable panes
  // Removed leftPaneWidth and resize functionality for fixed layout
  
  // Search pane state management
  const [isSearchPaneOpen, setIsSearchPaneOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [webContextData, setWebContextData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('Sources');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  
  // Search message tab navigation state (for individual search results)
  const [searchMessageTabs, setSearchMessageTabs] = useState<{[messageId: string]: 'Answer' | 'Sources'}>({});
  
  // Filter sources into text and video categories
  const [textSources, setTextSources] = useState<SearchResult[]>([]);
  const [videoSources, setVideoSources] = useState<SearchResult[]>([]);
  
  // Filter sources into text and video categories (from browser mode)
  useEffect(() => {
    const filterSources = () => {
      if (searchResults?.length) {
        const videos = searchResults.filter(result => 
          result.url.includes('youtube.com') || 
          result.url.includes('vimeo.com') ||
          result.url.includes('youtu.be')
        );
        const texts = searchResults.filter(result => 
          !result.url.includes('youtube.com') && 
          !result.url.includes('vimeo.com') &&
          !result.url.includes('youtu.be')
        );
        setVideoSources(videos);
        setTextSources(texts);
      } else {
        setVideoSources([]);
        setTextSources([]);
      }
    };

    filterSources();
  }, [searchResults, setVideoSources, setTextSources]); // Added missing dependencies

  // Extract images from search results for the carousel
  const carouselImages = useMemo(() => {
    if (!searchResults?.length) return [];
    
    return searchResults
      .filter(result => result.image)
      .map(result => ({
        url: result.image!,
        title: result.title,
        sourceUrl: result.url
      }));
  }, [searchResults]);
  
  // -----------------------------
  // Rehydrate search results from saved messages (on reload)
  // -----------------------------
  useEffect(() => {
    // If we already have search results in memory, no action needed
    if (searchResults.length > 0) return;

    // Look for the most recent assistant message that has webSources stored
    const latestWithSources = [...messages].reverse().find(
      (m) => m.role === 'assistant' && Array.isArray(m.webSources) && m.webSources.length > 0
    );

    if (latestWithSources) {
      setSearchResults(latestWithSources.webSources as any);
      setSearchStatus('idle');
    }
  }, [messages, searchResults.length]);
  
  // Helper function to extract domain from URL (from browser mode)
  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  // Helper function to get appropriate icon for source URL
  const getSourceIcon = (url: string, favicon?: string): string => {
    if (!url) return '/icons/web-icon.svg';
    
    const lowerUrl = url.toLowerCase();
    
    // Check for specific site types
    if (lowerUrl.includes('reddit.com')) return '/icons/reddit-icon.svg';
    if (lowerUrl.includes('github.com')) return '/icons/github-icon.svg';
    if (lowerUrl.includes('wikipedia.org')) return '/icons/web-icon.svg'; // Use web icon for Wikipedia
    
    // If favicon is available and valid, use it
    if (favicon && favicon.startsWith('http')) {
      return favicon;
    }
    
    // Default to web icon
    return '/icons/web-icon.svg';
  };

  const [emptyBoxes, setEmptyBoxes] = useState<string[]>([]);
  const [showPulsingDot, setShowPulsingDot] = useState(false);
  
  // Live thinking states
  const [liveThinking, setLiveThinking] = useState<string>('');
  const [currentThinkingMessageId, setCurrentThinkingMessageId] = useState<string | null>(null);
  
  // Separate live thinking state for Reasoning mode to avoid duplication with default chat
  const [liveReasoning, setLiveReasoning] = useState('');
  const [currentReasoningMessageId, setCurrentReasoningMessageId] = useState<string | null>(null);
  


  // Artifact streaming states
  const [artifactStreamingContent, setArtifactStreamingContent] = useState<string>('');
  const [isArtifactStreaming, setIsArtifactStreaming] = useState(false);
  
  // Drag and resize states for artifact viewer
  const [artifactViewerWidth, setArtifactViewerWidth] = useState(45); // Percentage width
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(45);

  // Additional missing state variables
  const [showHeading, setShowHeading] = useState(true);
  
  // Image upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageWaitingForResponse, setImageWaitingForResponse] = useState<string | null>(null);

    // Notion OAuth states
  const [isNotionAuthModalOpen, setIsNotionAuthModalOpen] = useState(false);
  const [isNotionAuthenticated, setIsNotionAuthenticated] = useState(false);

  // Check Notion authentication status on mount
  useEffect(() => {
    const checkNotionAuth = () => {
      const isAuth = notionOAuth.isAuthenticated();
      setIsNotionAuthenticated(isAuth);
    };
    
    checkNotionAuth();
    
    // Listen for storage changes to update auth status
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'notion_oauth_tokens') {
        checkNotionAuth();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Handle successful Notion authentication
  const handleNotionAuthSuccess = () => {
    setIsNotionAuthenticated(true);
    setActiveButton('cube');
    setActiveMode('cube');
    // Don't auto-demo to avoid connection errors
  };

  // Demonstrate enhanced Notion tool calling
  const demonstrateNotionToolCalling = async () => {
    try {
      console.log('[Cube Mode] Demonstrating enhanced tool calling...');
      
      // Create a demonstration message showing tool execution
      const toolResult = await notionIntegration.createWorkspacePage(
        'Enhanced Tool Demo Page',
        'This page was created using the enhanced Notion tool calling mechanism with improved tracking and error handling.'
      );

      // Add the result as a message to show the new UI
      const newMessage: LocalMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: JSON.stringify(toolResult),
        contentType: 'tool_result',
        timestamp: Date.now(),
        isProcessed: true
      };

      setMessages(prev => [...prev, newMessage]);
      
      console.log('[Cube Mode] Tool execution demo completed:', toolResult);
    } catch (error) {
      console.error('[Cube Mode] Tool execution demo failed:', error);
      
      // Show error result
      const errorMessage: LocalMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: JSON.stringify({
          status: 'error',
          service: 'Notion',
          action: 'Create Page',
          error: error instanceof Error ? error.message : String(error),
          steps: [
            { label: 'Authenticating', status: 'done' },
            { label: 'Executing Action', status: 'error', description: error instanceof Error ? error.message : String(error) },
            { label: 'Finalizing', status: 'pending' }
          ]
        }),
        contentType: 'tool_result',
        timestamp: Date.now(),
        isProcessed: true
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Function to execute tool calls from AI responses
  // Note: Old renderToolCall and executeTool functions removed since we now use proper function calling

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInitialLoadRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null); // Store session ID for immediate access
  
  // Prevent multiple simultaneous handleSend calls
  const isHandlingSend = useRef<boolean>(false);
  
  // Debouncing mechanism for saveMessageInstantly to prevent 409 conflicts
  const saveMessageTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Debouncing mechanism for saveMessageInstantly to prevent 409 conflicts
  const debouncedSaveMessage = useCallback(async (sessionId: string, message: LocalMessage, delay: number = 100) => {
    const messageKey = `${sessionId}-${message.id}`;
    
    // Clear any existing timeout for this message
    const existingTimeout = saveMessageTimeouts.current.get(messageKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(async () => {
      try {
        await saveMessageInstantly(sessionId, message);
        console.log(`[Debounced Save] Message saved: ${message.id}`);
      } catch (error) {
        console.error(`[Debounced Save] Failed to save message ${message.id}:`, error);
      } finally {
        saveMessageTimeouts.current.delete(messageKey);
      }
    }, delay);
    
    saveMessageTimeouts.current.set(messageKey, timeout);
  }, []);

  // Constants
  const BASE_HEIGHT = 48;
  const MAX_HEIGHT = BASE_HEIGHT * 3;
  const EXTRA_GAP = 32;
  
  // Computed values
  const isChatEmpty = messages.length === 0;
  const inputPosition = isChatEmpty && !hasInteracted && !activeSessionId ? "center" : "bottom";
  
  // Drag handlers for artifact viewer
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartWidth(artifactViewerWidth);
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartX;
    const windowWidth = window.innerWidth;
    const deltaPercent = (deltaX / windowWidth) * 100;
    
    // Calculate new width (dragging left increases width, right decreases)
    const newWidth = Math.max(20, Math.min(80, dragStartWidth - deltaPercent));
    setArtifactViewerWidth(newWidth);
  }, [isDragging, dragStartX, dragStartWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Removed mouse event handlers for fixed layout

  // Effect to handle artifact streaming
  useEffect(() => {
    // If artifact streaming is active but artifact viewer is not open, open it
    if (isArtifactStreaming && !isArtifactMode && artifactContent) {
      setIsArtifactMode(true);
    }

    // Cleanup function
    return () => {
      if (isArtifactStreaming) {
        setIsArtifactStreaming(false);
        setArtifactStreamingContent('');
      }
    };
  }, [isArtifactStreaming, isArtifactMode, artifactContent]);

  // Effect to handle abort controller cleanup
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);

  // Cleanup effect for debounced save timeouts
  useEffect(() => {
    return () => {
      // Clear all pending save timeouts on unmount
      saveMessageTimeouts.current.forEach(timeout => clearTimeout(timeout));
      saveMessageTimeouts.current.clear();
    };
  }, []);

  // Effect to load the active session (from URL hash, props, or saved state)
  useEffect(() => {
    const loadActiveSession = async () => {
      // Check if user exists and prevent duplicate runs
      if (!user || !user.id) return;
      
      // SMART DUPLICATE PREVENTION: Allow page reloads but prevent browser focus/blur re-runs
      // Only skip if we have BOTH activeSessionId AND loaded messages AND this isn't initial load
      const hasActiveSession = activeSessionId && sessionIdRef.current;
      const hasLoadedMessages = messages.length > 0;
      const isInitialLoad = isInitialLoadRef.current;
      
      if (hasActiveSession && hasLoadedMessages && !isInitialLoad) {
        console.log('[Session Load] Skipping - legitimate active session with loaded messages:', activeSessionId);
        return;
      }
      
      // Mark that initial load is complete after this run
      isInitialLoadRef.current = false;
      
      try {
        let sessionIdToLoad = initialSessionId;
        
        // ENHANCED URL SESSION DETECTION: Check multiple sources for session ID
        if (!sessionIdToLoad && typeof window !== 'undefined') {
          // 1. Check if we're on a chat URL path (most reliable for reloads)
          const pathMatch = window.location.pathname.match(/^\/chat\/([a-zA-Z0-9-]+)$/);
          if (pathMatch) {
            sessionIdToLoad = pathMatch[1];
            console.log('[Session Load] Found session in URL path:', sessionIdToLoad);
          }
          
          // 2. Check URL search params (secondary)
          if (!sessionIdToLoad) {
            const urlParams = new URLSearchParams(window.location.search);
            const urlSessionId = urlParams.get('session');
            if (urlSessionId) {
              sessionIdToLoad = urlSessionId;
              console.log('[Session Load] Found session in URL params:', sessionIdToLoad);
            }
          }
          
          // 3. Check URL hash parameters (fallback for legacy URLs)
          if (!sessionIdToLoad && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashSessionId = hashParams.get('session');
          if (hashSessionId) {
            sessionIdToLoad = hashSessionId;
              console.log('[Session Load] Found session in URL hash:', sessionIdToLoad);
              // Convert hash to proper URL format for better persistence
              const newUrl = `/chat/${hashSessionId}`;
              window.history.replaceState(null, '', newUrl);
            }
          }
        }
        
        // Fallback to saved session if no other source (ONLY ONCE)
        if (!sessionIdToLoad) {
          console.log('[Session Load] Fetching saved session ID - ONE TIME ONLY');
          const savedSessionId = await getActiveSessionId();
          sessionIdToLoad = savedSessionId ?? undefined;
          
          // If we loaded from saved session, update URL for future reloads
          if (sessionIdToLoad && typeof window !== 'undefined') {
            const newUrl = `/chat/${sessionIdToLoad}`;
            window.history.replaceState(null, '', newUrl);
            console.log('[Session Load] Updated URL for persistence:', newUrl);
          }
        }
        
        if (sessionIdToLoad) {
          // Load the specified or saved session
          setActiveSessionId(sessionIdToLoad);
          sessionIdRef.current = sessionIdToLoad;
          
          // Get messages and ensure they're marked as processed
          // Use optimized service with caching
          const sessionMessages = await optimizedSupabaseService.getSessionMessages(sessionIdToLoad);
          const processedMessages = sessionMessages.map(msg => ({
            ...msg,
            isProcessed: true // Mark all loaded messages as processed
          }));
          
          // Update artifact messages with latest versions from artifacts_v2 table
          const updatedMessages = await Promise.all(
            processedMessages.map(async (msg) => {
              // If this is an artifact message with an id, fetch the latest version
              if (msg.contentType === 'artifact' && msg.structuredContent?.id) {
                try {
                  const latestArtifact = await ArtifactV2Service.getById(msg.structuredContent.id);
                  if (latestArtifact) {
                    // Update the message with the latest artifact content
                    return {
                      ...msg,
                      content: latestArtifact.content_markdown,
                      structuredContent: {
                        ...msg.structuredContent,
                        content: latestArtifact.content_markdown,
                        id: latestArtifact.id,
                        version: latestArtifact.version,
                        metadata: latestArtifact.metadata
                      }
                    };
                  }
                } catch (error) {
                  console.error('Error fetching latest artifact version:', error);
                }
              }
              return msg;
            })
          );
          
          // ONLY set messages if we're not in the middle of an active conversation
          // This prevents overwriting messages during first message flow
          // But allow setting messages if this is the initial load or if no messages exist yet
          if ((!isAiResponding && !isLoading) || messages.length === 0) {
            setMessages(updatedMessages);
            setShowHeading(updatedMessages.length === 0);
            setHasInteracted(updatedMessages.length > 0);
          }
          
          console.log('[Session Load] Session loaded successfully:', sessionIdToLoad);
        } else {
          // Show welcome page for new users
          setShowHeading(true);
          setHasInteracted(false);
          setActiveSessionId(null);
          setMessages([]);
          
          // Clear URL if no session to load (ensure clean state)
                if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/');
          }
        }
      } catch (error) {
        console.error('Error loading active session:', error);
        // Fallback to showing welcome page
        setShowHeading(true);
        setHasInteracted(false);
        setActiveSessionId(null);
        setMessages([]);
      }
    };

    // Only run this effect once when component mounts with a user
    loadActiveSession();
  }, [user?.id]); // Depend on stable user.id instead of entire user object to prevent unnecessary re-runs

  // Messages are saved explicitly when queries complete - no automatic saving

  // Consolidated session creation function to prevent redundant API calls
  const ensureActiveSession = async (messageContent?: string): Promise<string> => {
    if (activeSessionId) {
      return activeSessionId; // Already have a session, return it
    }

    try {
      let newSessionId: string;
      let newUrl: string | null = null;
      
      // Only use URL routing if we don't already have an initialSessionId (not on dynamic route)
      if (!initialSessionId && messageContent) {
        const {session, url} = await createNewSessionWithURL(messageContent);
        newSessionId = session.id;
        newUrl = url;
      } else {
        // Fallback to regular session creation
        const newSession = await optimizedSupabaseService.createNewSession(messageContent);
        newSessionId = newSession.id;
        
        // Generate URL for dynamic routes
        if (initialSessionId) {
          newUrl = `/chat/${newSessionId}`;
        }
      }
      
      // Update state and save to Supabase (single call per session)
      setActiveSessionId(newSessionId);
      sessionIdRef.current = newSessionId; // Store in ref for immediate access
      await saveActiveSessionId(newSessionId);
      
      // IMMEDIATE URL UPDATE - Don't wait for AI response completion
      if (newUrl && typeof window !== 'undefined') {
        window.history.replaceState(null, '', newUrl);
        console.log('[Session Creation] URL updated immediately:', newUrl);
      }
      
      return newSessionId;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  };

  // Function to save messages and update session title when query completes
  const saveMessagesOnQueryComplete = async (currentMessages: LocalMessage[]) => {
    if (!activeSessionId || !user || currentMessages.length === 0) return;
    
    try {
      // Use optimized batch saving
      await optimizedSupabaseService.saveSessionMessages(activeSessionId, currentMessages);
      
      // Update session title with AI-generated title after first AI response
      const userMessages = currentMessages.filter(msg => msg.role === 'user');
      const aiMessages = currentMessages.filter(msg => msg.role === 'assistant' && msg.isProcessed);
      
      // If this is the first AI response (1 user message, 1 completed AI message)
      if (userMessages.length === 1 && aiMessages.length === 1) {
        const firstUserMessage = userMessages[0];
        
        // Update title with AI-generated version
        try {
          // For performance, use simple title generation instead of AI
          const simpleTitle = firstUserMessage.content.split(' ').slice(0, 5).join(' ');
          await optimizedSupabaseService.updateSessionTitle(
          activeSessionId, 
            simpleTitle.length > 30 ? simpleTitle.substring(0, 30) + '...' : simpleTitle
          );
          // Trigger sidebar refresh to show updated title
          setSidebarRefreshTrigger(prev => prev + 1);
        } catch (error) {
          console.error('Failed to update session title:', error);
      }
    }
    
    // URL updates now happen immediately when session is created
    // No deferred URL updates needed - URLs are set instantly for better UX
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  // Function to save messages with explicit session ID (bypasses React state timing issues)
  // Build contextual system prompt for browser chat (from browser mode)
  const buildContextualSystemPrompt = (webContext: any) => {
    return `You are Tehom AI, an exceptionally intelligent and articulate AI assistant that transforms complex web information into clear, actionable insights. Your specialty is synthesizing multiple sources into comprehensive, naturally-flowing responses that feel like getting expert advice from a knowledgeable friend.

Your mission is to analyze, synthesize, and present web content in a way that's both deeply informative and refreshingly human. You're not just summarizing—you're connecting dots, revealing patterns, and providing the kind of nuanced understanding that comes from truly comprehending the material.

Core Methodology:
1.  Think like an analyst, write like a storyteller: Dive deep into the sources, identify key themes and contradictions, then weave them into a coherent narrative.
2.  Lead with insight: Start with the most important findings, then build your case with supporting details.
3.  Connect the dots: Highlight relationships between different sources, emerging patterns, and implications the user might not have considered.
4.  Address nuance: When sources disagree or information is uncertain, explore why that might be and what it means for the user.

Execution Rules:
- Start strong: Jump straight into your key finding or most important insight. Do not use introductory filler like "Based on the sources provided." Start with impact.
- Organize by insight, not by source: Group related information thematically. Use conversational transitions like "What's particularly interesting is..." "This aligns with..." "However, there's a twist..."
- Provide evidence: Include specific details like numbers, quotes, and examples that bring your points to life.
- Acknowledge complexity: Use phrases like "It's not that simple though..." or "The reality is more nuanced..."
- Handle conflicting information: Always identify contradictions and explain possible reasons. Highlight gaps in available information.
- Explain the 'so what': Connect findings to broader implications. Offer perspective on what this means for the user's specific question.

Tone and Style:
- Human, not robotic: Use contractions, varied sentence lengths, and natural phrasing.
- Confident but not arrogant: You know your stuff, but you're honest about limitations.
- Conversational but substantive: Maintain a natural flow without sacrificing depth.
- Engaging but focused: Keep it interesting while staying on-target.
- No emojis or unnecessary characters.

Core Principles:
- Comprehensive: Cover all major angles relevant to the user's question.
- Accurate: Represent sources faithfully without oversimplifying.
- Relevant: Everything you include should directly serve the user's query.
- Clear: Explain complex topics simply without talking down to the user.
- Actionable: When appropriate, help the user understand what to do with this information.

${webContext?.hasSearchResults 
  ? `Current Task: You're analyzing the query "${webContext.query}" using ${webContext.sourcesCount} web sources. Each source contains optimized content up to 6,000 characters. The user wants a comprehensive answer that goes beyond surface-level summary—they want understanding, context, and insight.`
  : 'No web sources available. Provide general assistance while maintaining your analytical, insight-driven approach.'}

IMPORTANT: Do NOT include citations, source numbers (like [1], [2], Source 1, etc.), or URLs in your answer. Write a natural, fluent response as if you are an expert summarizing the information. The user will see the sources separately in a dedicated tab.

Remember: The user's question is your north star. Everything should serve that purpose. Quality over quantity. Uncertainty handled well builds trust. Your goal isn't just to inform, but to genuinely help the user understand and make better decisions.

Transform information into understanding. Make the complex clear. Turn data into wisdom.
Do NOT use emojis or any other unnecessary characters.

IMPORTANT: Format your entire answer using markdown. Use headings, bullet points, bold, italics, and other markdown features where appropriate for clarity and readability.
`;
  };

  // Handle search and AI response (integrated from browser mode)
  const handleSearchAndAI = async (searchQuery: string, sessionId: string, userMessageId: string) => {
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setWebContextData(null);
    setSelectedSource(null);
    setSearchStatus('searching');
    
    try {
      // Step 1: Search with Exa API
      const response = await fetch('/api/exa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, enhanced: true }),
      });
      
      if (!response.ok) throw new Error('Failed to fetch search results');
      
      const data = await response.json();
      const sources = data.sources || [];
      setSearchResults(sources);
      
      // Create web context data for AI
      const contextData = {
        hasSearchResults: true,
        query: searchQuery,
        sourcesCount: sources.length,
        hasEnhancedContent: !!data.enhanced,
        enhancedData: data.enhanced,
        sources: sources,
        mode: 'browser_chat',
        modelConfig: {
          temperature: 0.8,
          top_p: 0.95,
          max_tokens: 8000,
          repetition_penalty: 1.2,
          presence_penalty: 0.4,
          frequency_penalty: 0.3
        }
      };
      setWebContextData(contextData);
      setSearchStatus('idle');
      
      // Open search pane now that we have search results
      setIsSearchPaneOpen(true);
      
      // Step 2: Get AI response
      await getFinalAnswer(searchQuery, contextData, sessionId, userMessageId);
      
    } catch (error: any) {
      setSearchError(error.message || 'An error occurred while searching.');
      setSearchStatus('error');
      setIsLoading(false);
      setIsAiResponding(false);
    } finally {
      setIsSearching(false);
    }
  };

  // Get final AI answer (from browser mode)
  const getFinalAnswer = async (userQuestion: string, webContext: any, sessionId: string, userMessageId: string) => {
    try {
      // Prepare user message with web sources
      let userMessageContent = userQuestion;
      
      if (webContext && webContext.hasSearchResults && webContext.sources) {
        let sourceTexts = '';
        
        if (webContext.enhancedData && webContext.enhancedData.full_content) {
          sourceTexts = Object.entries(webContext.enhancedData.full_content).map(([sourceId, data]: [string, any], index: number) => {
            const sourceInfo = webContext.sources.find((s: any) => s.id === sourceId) || webContext.sources[index];
            return `Source [${index + 1}]: ${sourceInfo?.url || 'Unknown URL'}\nTitle: ${sourceInfo?.title || 'Unknown Title'}\nContent: ${data.text || 'No content available'}`;
          }).join('\n\n---\n\n');
        } else {
          sourceTexts = webContext.sources.map((source: any, index: number) => (
            `Source [${index + 1}]: ${source.url}\nTitle: ${source.title}\nContent: ${source.text || source.snippet || 'No content available'}`
          )).join('\n\n---\n\n');
        }
        
        // Remove URL mapping and citation instructions from user message
        userMessageContent = `Please answer the following question based on the provided web sources. Focus your response on the user's specific question and use the web content to provide accurate, relevant information.\n\n---\n\n${sourceTexts}\n\n---\n\nUser Question: ${userQuestion}\n\nPlease provide a comprehensive answer that directly addresses this question using the information from the sources above. Do NOT include citations, source numbers, or URLs in your answer.`;
      }
      
      const messages = [
        { role: 'system', content: buildContextualSystemPrompt(webContext) },
        { role: 'user', content: userMessageContent }
      ];
      
      const modelParameters = webContext?.modelConfig || {
        temperature: 0.8,
        top_p: 0.95,
        max_tokens: 64000,
        repetition_penalty: 1.2,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
      };
      
      // Create AI message placeholder
      const aiMessageId = uuidv4();
      const aiMessage: LocalMessage = {
        role: 'assistant',
        id: aiMessageId,
        content: '',
        timestamp: Date.now(),
        parentId: userMessageId,
        isStreaming: true,
        isProcessed: false,
        contentType: 'search',
        webSources: webContext.sources,
        imageUrls: (webContext.sources || []).filter((src: any) => src.image).map((src: any) => src.image),
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          mode: 'browser_chat',
          stream: true,
          ...modelParameters
        })
      });
      
      if (!response.ok) throw new Error('Failed to get response');
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to get reader');
      
      let accumulatedContent = '';
      let buffer = '';
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6);
              if (jsonStr.trim() === '[DONE]') continue;
              
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content || '';
              
              if (content) {
                accumulatedContent += content;
                
                setMessages(prev => prev.map(m => 
                  m.id === aiMessageId 
                    ? { ...m, content: accumulatedContent, isStreaming: true }
                    : m
                ));
              }
            } catch (e) {
              console.warn('Failed to parse SSE chunk:', line);
            }
          }
        }
      }
      
      // Mark as complete
      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? { ...m, content: accumulatedContent, isStreaming: false, isProcessed: true }
          : m
      ));
      
      // Save AI message
      const finalMessage: LocalMessage = {
        role: 'assistant',
        id: aiMessageId,
        content: accumulatedContent,
        timestamp: Date.now(),
        parentId: userMessageId,
        isStreaming: false,
        isProcessed: true,
        contentType: 'search',
        webSources: webContext.sources,
        imageUrls: (webContext.sources || []).filter((src: any) => src.image).map((src: any) => src.image),
      };
      
      try {
        await saveMessageInstantly(sessionId, finalMessage);
        console.log('[Search Mode] AI message saved instantly');
      } catch (error) {
        console.error('[Search Mode] Failed to save AI message:', error);
      }
      
    } catch (error) {
      console.error('Error in getFinalAnswer:', error);
      
      const errorMessage: LocalMessage = {
        role: 'assistant',
        id: uuidv4(),
        content: 'Error: Could not fetch response.',
        timestamp: Date.now(),
        parentId: userMessageId,
        isStreaming: false,
        isProcessed: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsAiResponding(false);
    }
  };

  const saveMessagesOnQueryCompleteWithSessionId = async (currentMessages: LocalMessage[], explicitSessionId: string) => {
    if (!explicitSessionId || !user || currentMessages.length === 0) return;
    
    try {
      // Use optimized batch saving
      await optimizedSupabaseService.saveSessionMessages(explicitSessionId, currentMessages);
      
      // Update session title with AI-generated title after first AI response
      const userMessages = currentMessages.filter(msg => msg.role === 'user');
      const aiMessages = currentMessages.filter(msg => msg.role === 'assistant' && msg.isProcessed);
      
      // If this is the first AI response (1 user message, 1 completed AI message)
      if (userMessages.length === 1 && aiMessages.length === 1) {
        const firstUserMessage = userMessages[0];
        
        // Update title with AI-generated version
        try {
          // For performance, use simple title generation instead of AI
          const simpleTitle = firstUserMessage.content.split(' ').slice(0, 5).join(' ');
          await optimizedSupabaseService.updateSessionTitle(
            explicitSessionId, 
            simpleTitle.length > 30 ? simpleTitle.substring(0, 30) + '...' : simpleTitle
          );
          // Trigger sidebar refresh to show updated title
          setSidebarRefreshTrigger(prev => prev + 1);
        } catch (error) {
          console.error('Failed to update session title:', error);
        }
      }
      
      // URL updates now happen immediately when session is created
      // No deferred URL updates needed - URLs are set instantly for better UX
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

  // Helper function removed - vision mode now uses unified rendering pipeline

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

  // Auto-scroll during live reasoning streaming (Think box only)
  useEffect(() => {
    if (scrollRef.current && liveReasoning) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [liveReasoning]);

  // Memoize streaming states to prevent infinite re-renders
  const streamingStates = useMemo(() => {
    return messages.map(m => m.isStreaming).join(',');
  }, [messages]);

  // Auto-scroll during any AI response or live reasoning (simplified and reliable)
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    if (scrollRef.current && (isAiResponding || liveReasoning)) {
      // Throttle scrolling to avoid excessive scroll calls during rapid streaming
      scrollTimeout = setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 100); // Small delay to throttle scroll calls
    }
    
    return () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [streamingStates, isAiResponding, liveReasoning]);



  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    
    // Prevent multiple simultaneous calls
    if (isHandlingSend.current) {
      console.log('[HandleSend] Already processing a request, ignoring duplicate call');
      return;
    }
    
    isHandlingSend.current = true;
    
    try {
      const userMessageId = uuidv4(); // Declare at the top

    // Handle image analysis if we have selected files
    if (selectedFiles.length > 0) {
      const file = selectedFiles[0];
      
      try {
        // Ensure we have an active session
        const currentActiveSessionId = await ensureActiveSession('Image uploaded and analyzed');
        
        // 1. IMMEDIATELY show user message with image (with shining effect)
        const userMessage: LocalMessage = {
          role: 'user',
          content: input.trim(), // Include any text the user typed
          imageUrls: uploadedImageUrls, // Use Supabase URLs for persistence
          id: userMessageId,
          timestamp: Date.now(),
          isProcessed: true
        };

        setMessages(prev => [...prev, userMessage]);
        setShowHeading(false);
        setHasInteracted(true);
        setImageWaitingForResponse(uploadedImageUrls[0] || '');
        
        // INSTANT SAVE: Save user message immediately for vision mode
        if (currentActiveSessionId) {
          try {
            await saveMessageInstantly(currentActiveSessionId, userMessage);
            console.log('[Vision Mode] User message saved instantly');
          } catch (error) {
            console.error('[Vision Mode] Failed to instantly save user message:', error);
          }
        }
        
        const newAbortController = new AbortController();
        setAbortController(newAbortController);

        // Clear input and image previews
        setInput('');
        setSelectedFiles([]);
        setImagePreviewUrls([]);
        setUploadedImageUrls([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        // 2. Start AI processing (set loading states)
        setIsLoading(true);
        setIsAiResponding(true);
        
        // 3. Create placeholder for streaming AI response
        const aiMessageId = uuidv4();
        const placeholderAiMessage: LocalMessage = {
          role: "assistant",
          content: '',
          id: aiMessageId,
          timestamp: Date.now(),
          parentId: userMessageId,
          contentType: 'conversation', // Explicitly mark as conversation for consistent rendering
          isStreaming: true,
          isProcessed: false
        };

        setMessages((prev) => [...prev, placeholderAiMessage]);
        if (currentActiveSessionId) {
          await saveMessageInstantly(currentActiveSessionId, placeholderAiMessage);
        }
        
        // Build prior context (user & assistant messages only) to give Vision model conversation continuity
        const priorContext = messages.filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        const analysisResult = await analyzeImageWithNVIDIA(file, input.trim(), priorContext, { stream: true });

        if (!analysisResult.success || !analysisResult.stream) {
          throw new Error(analysisResult.error || 'Failed to start analysis stream');
        }
        
        const reader = analysisResult.stream.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
        let contentBuffer = '';
        let firstChunkReceived = false;

        // Inside handleSend, before the streaming while-loop begins (after declaring contentBuffer etc.)
        // Add throttle variable to limit liveReasoning state updates
        let lastLiveReasoningUpdate = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.replace('data:', '').trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                
                if (delta) {
                  if (!firstChunkReceived) {
                    firstChunkReceived = true;
                    setImageWaitingForResponse(null);
                  }
                  contentBuffer += delta;
                  
                  // Store raw contentBuffer like default chat - let renderDefaultChatMessage handle smart buffering
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === aiMessageId
                        ? { 
                            ...msg, 
                            content: contentBuffer,
                            isStreaming: true,
                            contentType: 'conversation' // Ensure Vision Mode uses conversation content type
                          }
                        : msg
                    )
                  );
                }
              } catch (e) { /* Ignore parse errors on incomplete chunks */ }
            }
          }
        }
        
        // Use same final processing as default chat
        const cleanedContent = contentBuffer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        
        setMessages(prev =>
          prev.map(msg =>
            msg.id === aiMessageId
              ? { 
                  ...msg, 
                  content: cleanedContent,
                  isStreaming: false, 
                  isProcessed: true,
                  contentType: 'conversation' // Maintain conversation content type for Vision Mode
                }
               : msg
          )
        );

        if (currentActiveSessionId) {
          const completeMessage: LocalMessage = {
            role: "assistant",
            content: cleanedContent,
            id: aiMessageId,
            timestamp: Date.now(),
            parentId: userMessageId,
            contentType: 'conversation', // Consistent content type for Vision Mode
            isProcessed: true,
          };
          await saveMessageInstantly(currentActiveSessionId, completeMessage);
        }
        
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Image analysis aborted by user.');
        } else {
          console.error('Error analyzing image:', error);
          toast.error('Failed to analyze image: ' + error.message);
        }
        setImageWaitingForResponse(null);
      } finally {
        setIsLoading(false);
        setIsAiResponding(false);
        setAbortController(null);
      }
      return;
    }
    
    // Regular text handling (no images)
    if (!input.trim()) return;

      // Search mode - integrated browser functionality
  if (activeMode === 'search') {
    if (!input.trim()) return;
    
    // Ensure we have an active session
    const currentActiveSessionId = await ensureActiveSession(input.trim());
    
    if (!hasInteracted) setHasInteracted(true);
    if (showHeading) setShowHeading(false);
    
    // Add user message to chat
    const userMessageId = uuidv4();
    const userMessage: LocalMessage = { 
      role: 'user',
      id: userMessageId,
      content: input,
      timestamp: Date.now(),
      isProcessed: true
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Save user message instantly
    try {
      await saveMessageInstantly(currentActiveSessionId, userMessage);
      console.log('[Search Mode] User message saved instantly');
    } catch (error) {
      console.error('[Search Mode] Failed to instantly save user message:', error);
    }
    
    setInput('');
    setIsLoading(true);
    setIsAiResponding(true);
    
    // Execute search and AI response
    await handleSearchAndAI(input.trim(), currentActiveSessionId, userMessageId);
    
    return;
  }

    // Check if we're in artifact mode (only by button click, no auto-triggering)
    if (activeButton === 'artifact') {
      // Ensure we have an active session using consolidated function
      const currentActiveSessionId = await ensureActiveSession(input.trim());

      if (!hasInteracted) setHasInteracted(true);
      if (showHeading) setShowHeading(false);

      // Add user message and save instantly
      const userMessageId = uuidv4();
      const userMessage: LocalMessage = {
        role: 'user',
        id: userMessageId,
        content: input,
        timestamp: Date.now(),
        isProcessed: true
      };
      
      setMessages(prev => [...prev, userMessage]);
      
      // INSTANT SAVE: Save user message immediately
      try {
        await saveMessageInstantly(currentActiveSessionId, userMessage);
        console.log('[Unified Mode] User message saved instantly');
      } catch (error) {
        console.error('[Unified Mode] Failed to instantly save user message:', error);
      }
      
      setInput('');
      setIsLoading(true);
      setIsAiResponding(true);
      
      // Set artifact streaming mode for UI display
      setIsArtifactStreaming(true);
      setArtifactStreamingContent('');

      // Generate a quick title for the artifact
      const quickTitle = input.trim().length > 50 
        ? input.trim().substring(0, 50) + '...' 
        : input.trim() || 'Generated Document';

      // Open artifact viewer immediately with empty content
      setArtifactContent({
        root_id: 'temp',
        version: 1,
        type: 'document',
        title: 'Generating Document...',
        content: '',
        metadata: {
          wordCount: 0,
          estimatedReadTime: '1 minute',
          category: 'Document',
          tags: ['document']
        }
      });
      setIsArtifactMode(true); // Ensure right pane is open for every artifact message

      // Create UNIFIED AI message placeholder - same as default chat
      const aiMessageId = uuidv4();
      const aiMessage: LocalMessage = {
        role: 'assistant',
        id: aiMessageId,
        content: '',
        timestamp: Date.now(),
        parentId: userMessageId,
        contentType: 'artifact', // Keep for UI routing but use unified rendering
        title: quickTitle,
        isStreaming: true,
        isProcessed: false
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      try {
        // Use BASE SYSTEM PROMPT - SAME AS DEFAULT CHAT
        const enhancedPrompt = BASE_SYSTEM_PROMPT;

        // Call NVIDIA API with UNIFIED settings - SAME AS DEFAULT CHAT
        const response = await fetch('/api/nvidia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: enhancedPrompt },
              { role: 'user', content: input }
            ],
            temperature: 0.6, // Same as default chat
            max_tokens: 8192, // Higher for artifacts
            mode: 'chat', // Use unified chat mode, not separate artifact mode
            stream: true
          })
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }

        let textContent = '';
        let wordBuffer = '';
        const wordBoundaryRegex = /[ \n.,;:!?]/;
        const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    wordBuffer += content;
                    // Check for word boundaries in the buffer
                    let lastBoundary = -1;
                    for (let i = 0; i < wordBuffer.length; i++) {
                      if (wordBoundaryRegex.test(wordBuffer[i])) {
                        lastBoundary = i;
                      }
                    }
                    if (lastBoundary !== -1) {
                      // Move up to the last boundary to textContent
                      textContent += wordBuffer.slice(0, lastBoundary + 1);
                      wordBuffer = wordBuffer.slice(lastBoundary + 1);
                    // Update the streaming content in the artifact viewer
                    setArtifactStreamingContent(textContent);
                    // Update the AI message in real-time with artifact content
                    setMessages(prev => prev.map(msg => 
                      msg.id === aiMessageId 
                        ? { ...msg, content: textContent, isStreaming: true }
                        : msg
                    ));
                    }
                  }
                } catch (parseError) {
                  // Continue streaming even if individual chunks fail to parse
                  console.warn('Failed to parse streaming chunk:', parseError);
                }
              }
            }
          }
          // After streaming is done, flush any remaining buffer
          if (wordBuffer.length > 0) {
            textContent += wordBuffer;
            setArtifactStreamingContent(textContent);
            setMessages(prev => prev.map(msg => 
              msg.id === aiMessageId 
                ? { ...msg, content: textContent, isStreaming: true }
                : msg
            ));
          }
        } finally {
          reader.releaseLock();
        }

        // Skip default chat processing - Milkdown handles raw markdown directly
        // const cleanedContent = postProcessAIChatResponse(textContent, true);

        // Create simple structured content for artifact viewer
        const structuredContent = {
          type: 'document' as const,
          title: quickTitle,
          content: textContent, // Use raw AI output for artifact content
          metadata: {
            wordCount: textContent.split(' ').length,
            estimatedReadTime: `${Math.ceil(textContent.split(' ').length / 200)} min read`,
            category: 'Document',
            tags: ['document']
          }
        };

        // Update the AI message as completed artifact
        const finalAiMessage: LocalMessage = {
          role: 'assistant',
          id: aiMessageId,
          content: textContent,
          timestamp: Date.now(),
          parentId: userMessageId,
          contentType: 'artifact',
          title: quickTitle,
          structuredContent: structuredContent,
          isProcessed: true,
          isStreaming: false
        };

        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? finalAiMessage : msg
        ));
        
        // Update artifact viewer with final content
        setArtifactContent({
          ...structuredContent,
          root_id: 'temp',
          version: 1
        });
        setIsArtifactStreaming(false);
        
        // Save final message
        try {
          await saveMessageInstantly(currentActiveSessionId, finalAiMessage);
          console.log('[Unified Mode] Final AI message saved instantly');
        } catch (error) {
          console.error('[Unified Mode] Failed to instantly save AI message:', error);
        }

      } catch (error) {
        console.error('Unified artifact streaming error:', error);
        
        // Update the AI message with a more helpful error message
        const errorMessage: LocalMessage = {
          role: 'assistant',
          id: aiMessageId,
          content: error instanceof Error && error.message.includes('504') 
            ? `Sorry, I encountered an error while creating the content: API request failed: 504. The request timed out because it was taking too long. Please try again with a simpler request or try again later.`
            : `Sorry, I encountered an error while creating the content: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
          parentId: userMessageId,
          contentType: 'artifact',
          isProcessed: true,
          isStreaming: false
        };

        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? errorMessage : msg
        ));
      } finally {
        setIsLoading(false);
        setIsAiResponding(false);
        setActiveButton(null); // Reset artifact mode
      }

      return;
    }



    // If we get here, we're in default chat mode
    try {
    if (!input.trim() || isLoading || isAiResponding) return;

    // Ensure we have an active session using consolidated function
    const currentActiveSessionId = await ensureActiveSession(input.trim() || undefined);

    if (!hasInteracted) setHasInteracted(true);
      
    setIsAiResponding(true);
    setIsLoading(true);
    if (showHeading) setShowHeading(false);

    // Always use conversation type for default chat instead of classifying
    const queryType = "conversation";
    const responseSchema = SCHEMAS.conversation;

    console.log("[handleSend] Query:", input);
    console.log("[handleSend] Using default conversation mode");

    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    const userMessageForDisplay: LocalMessage = {
      role: "user" as const,
      content: input,
      id: userMessageId, // Use the userMessageId from the top of handleSend
      timestamp: Date.now(),
      isProcessed: true // Mark the user message as processed
    };


    setMessages((prev) => [...prev, userMessageForDisplay]);
    setInput("");
    
    // INSTANT SAVE: Save user message immediately to prevent loss during race conditions
    if (currentActiveSessionId) {
      try {
        await saveMessageInstantly(currentActiveSessionId, userMessageForDisplay);
        console.log('[Default Chat] User message saved instantly');
      } catch (error) {
        console.error('[Default Chat] Failed to instantly save user message:', error);
      }
    }
    
    // Clear any previous thinking state - each query gets fresh state
    setCurrentThinkingMessageId(null);
    setLiveThinking('');
    
    // Create immediate thinking state for the upcoming AI response
    const upcomingAiMessageId = uuidv4();
    if (activeButton === 'reasoning') {
      setCurrentReasoningMessageId(upcomingAiMessageId);
      setLiveReasoning('Starting to think...');
    } else {
    setCurrentThinkingMessageId(upcomingAiMessageId);
    setLiveThinking('Starting to think...');
    }
    
    // Create placeholder AI message immediately so think box can appear
    const placeholderAiMessage: LocalMessage = {
      role: "assistant" as const,
      content: '', // Empty content initially
      id: upcomingAiMessageId,
      timestamp: Date.now(),
      parentId: userMessageId,
      webSources: [],
      contentType: activeButton === 'reasoning' ? 'reasoning' : 'conversation',
      isStreaming: true,
      isProcessed: false
    };
    
    // Add placeholder AI message immediately and save
    setMessages((prev) => [...prev, placeholderAiMessage]);
    
    // INSTANT SAVE: Save AI placeholder message immediately
    if (currentActiveSessionId) {
      try {
        await saveMessageInstantly(currentActiveSessionId, placeholderAiMessage);
        console.log('[Default Chat] AI placeholder message saved instantly');
      } catch (error) {
        console.error('[Default Chat] Failed to instantly save AI placeholder message:', error);
      }
    }
    


      const context = buildConversationContext(convertToConversationMessages(messages));

      // Determine the appropriate prompt based on mode and query type
      let turnSpecificSystemPrompt = BASE_SYSTEM_PROMPT;

      if (activeButton === 'reasoning') {
        // Use specialized Think prompt for reasoning mode
        turnSpecificSystemPrompt = getThinkPrompt(BASE_SYSTEM_PROMPT, input);
      } else {
        // Use base prompt for all other modes (default chat, search, artifact)
        turnSpecificSystemPrompt = BASE_SYSTEM_PROMPT;
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
        temperature: activeButton === 'reasoning' ? 0.6 : 0.7,        // Qwen3 recommended 0.6 for thinking mode
        max_tokens: activeButton === 'reasoning' ? 32768 : 4096,      // Qwen3 recommended 32768 for thinking mode
        top_p: activeButton === 'reasoning' ? 0.95 : 0.9,            // Qwen3 recommended 0.95 for thinking mode
        top_k: activeButton === 'reasoning' ? 20 : undefined,        // Qwen3 recommended 20 for thinking mode
        min_p: activeButton === 'reasoning' ? 0 : undefined,         // Qwen3 recommended 0 for thinking mode
        frequency_penalty: activeButton === 'reasoning' ? 0 : 0.2,   // Qwen3 recommended 0 for thinking mode
        presence_penalty: activeButton === 'reasoning' ? 0 : 0.2,    // Qwen3 recommended 0 for thinking mode
      };
      

      
      // Check for cached AI response first (only for non-image requests)
      let res;
      let usedCache = false;
      
      if (queryType === 'conversation') {
        // Try cache for text-only conversation requests
        const aiOptions = {
          messages: formattedMessages,
          temperature: apiPayload.temperature,
          max_tokens: apiPayload.max_tokens,
          model: 'google/gemini-2.0-flash-exp:free'
        };
        
        const cachedResponse = await aiResponseCache.getCachedResponse(aiOptions);
        if (cachedResponse) {
          console.log('[Performance] Using cached AI response - API call saved!');
          usedCache = true;
          
          // Create a mock response for cached content
          const mockResponse = {
            ok: true,
            json: () => Promise.resolve({
              choices: [{
                message: { content: cachedResponse }
              }]
            }),
            body: null
          };
          res = mockResponse as any;
        }
      }
      
      if (!usedCache) {
        // Use NVIDIA API for both default chat and reasoning modes
        // Only reasoning mode and default chat use NVIDIA API now
        const apiEndpoint = '/api/nvidia';
        
        // Determine the mode for API key selection
        const chatMode = activeButton === 'reasoning' ? 'reasoning' : 
                         activeMode === 'cube' ? 'cube' : 'chat';
        
        // Add mode to the API payload for proper API key selection
        apiPayload.mode = chatMode;
        
        // Add Notion access token for cube mode
        if (chatMode === 'cube') {
          const notionTokens = notionOAuth.getStoredTokens();
          if (notionTokens) {
            apiPayload.access_token = notionTokens.access_token;
          }
        }

        // Make fresh API call
        console.log(`[Performance] Making fresh API call to ${apiEndpoint} with mode: ${chatMode}`);
        res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
          signal: newAbortController.signal,
        });
        
        // Cache the response for future use (only for conversation requests)
        if (queryType === 'conversation' && res.ok && activeButton !== 'reasoning') {
          try {
            // We'll cache after processing the response
          } catch (error) {
            console.error('Failed to cache AI response:', error);
          }
        }
      }

      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`API request failed with status ${res.status}: ${errorData}`);
      }
      
      // Handle JSON response for structured queries
      if (queryType !== 'conversation') {
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
      setMessages((prev) => {
        const updatedMessages = [...prev, aiMsg];
        // INSTANT SAVE: Save structured query response immediately
        if (currentActiveSessionId) {
          saveMessageInstantly(currentActiveSessionId, aiMsg).catch(error => {
            console.error('[Structured Query] Failed to instantly save AI message:', error);
          });
        }
        return updatedMessages;
      });
      } else { 
        // Default to streaming logic for all other cases (including 'conversation')
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('No response body available for streaming');
        }

        const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
        let buffer = '';
        let done = false;
        let contentBuffer = ''; // Buffer to accumulate content
        let hasCreatedMessage = false; // Flag to track if we've created the AI message
        let aiMessageId: string | null = upcomingAiMessageId; // Use the pre-created message ID
        let lastLiveReasoningUpdate = 0; // Throttle variable to reduce frequent state updates for live reasoning content
        
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
                  const reasoningContent = parsed.choices?.[0]?.delta?.reasoning_content || '';
                  
                  // Handle DeepSeek reasoning content for thinking mode
                  if (reasoningContent && activeButton === 'reasoning') {
                    const now = Date.now();
                    if (now - lastLiveReasoningUpdate > 120) { // throttle to ~8 updates/sec
                      lastLiveReasoningUpdate = now;
                      setLiveReasoning(prev => prev + reasoningContent);
                      setCurrentReasoningMessageId(aiMessageId);
                    }
                  }
                  
                  if (delta) {
                    contentBuffer += delta;
                    
                    // Update the existing placeholder AI message with content for both modes
                    if (aiMessageId) {
                      setMessages((prev) => {
                        return prev.map(msg => 
                          msg.id === aiMessageId 
                            ? { ...msg, content: contentBuffer, isStreaming: true }
                            : msg
                        );
                      });
                      hasCreatedMessage = true; // Mark as created after first update
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
        
        // FAST FINAL SAVE - No delays, instant save when streaming completes
        if (aiMessageId) {
          if (activeButton === 'reasoning') {
            // For reasoning mode, combine thinking content with main content
            const finalThinkingContent = liveReasoning.trim();
            
            // 1. Update UI immediately (no delays)
            setMessages((prev) => {
              return prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg, 
                      isStreaming: false,
                      content: finalThinkingContent.length > 0 
                        ? `<think>${finalThinkingContent}</think>${contentBuffer}` 
                        : contentBuffer,
                      contentType: 'reasoning',
                      isProcessed: true,
                    }
                  : msg
              );
            });
            
            // 2. Save final content instantly in background (no setTimeout delays)
            const currentSessionId = sessionIdRef.current;
            if (currentSessionId && aiMessageId) {
              const finalContent = finalThinkingContent.length > 0 
                ? `<think>${finalThinkingContent}</think>${contentBuffer}` 
                : contentBuffer;
              
              // Use saveMessageInstantly for reliable UPSERT operation
              const completeMessage: LocalMessage = {
                role: "assistant",
                content: finalContent,
                id: aiMessageId,
                timestamp: Date.now(),
                parentId: userMessageId,
                contentType: 'reasoning',
                isProcessed: true,
              };
              
              // FAST SAVE - No delays, runs in background
              saveMessageInstantly(currentSessionId, completeMessage).catch(error => {
                console.error('[Fast Save] Failed to save final message:', error);
              });
            }
          } else {
            // For default chat, use content directly and strip any think tags
            const cleanedContent = contentBuffer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            
            // 1. Update UI immediately (no delays)
            setMessages((prev) => {
              return prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg, 
                      isStreaming: false,
                      content: cleanedContent,
                      contentType: 'conversation',
                      isProcessed: true,
                    }
                  : msg
              );
            });

            // 2. Save final content instantly in background (no setTimeout delays)
            const currentSessionId = sessionIdRef.current;
            if (currentSessionId && aiMessageId) {
              // Use saveMessageInstantly for reliable UPSERT operation
              const completeMessage: LocalMessage = {
                role: "assistant",
                content: cleanedContent,
                id: aiMessageId,
                timestamp: Date.now(),
                parentId: userMessageId,
                contentType: 'conversation',
                isProcessed: true,
              };
              
              // FAST SAVE - No delays, runs in background
              saveMessageInstantly(currentSessionId, completeMessage).catch(error => {
                console.error('[Fast Save] Failed to save final message:', error);
              });
            }
          }
        }
        
        // Clear the live thinking state immediately to prevent double display
        // The thinking content is now embedded in the message for permanent display
        if (activeButton === 'reasoning') {
          setLiveReasoning('');
          setCurrentReasoningMessageId(null);
        }
        // Note: No need to clear live thinking for default chat since we don't set it
        

      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
      setMessages((prev) => {
        const updatedMessages = [
        ...prev,
          { 
            role: "assistant" as const, 
            content: "[Response stopped by user]", 
            id: uuidv4(),
            timestamp: Date.now(),
            parentId: userMessageId, 
            isProcessed: true // Mark as processed
          },
        ];
                  // INSTANT SAVE: Save abort message immediately
          const currentSessionId = sessionIdRef.current || activeSessionId;
          if (currentSessionId) {
            const abortMessage = updatedMessages[updatedMessages.length - 1];
            saveMessageInstantly(currentSessionId, abortMessage).catch(error => {
              console.error('[Error Handling] Failed to instantly save abort message:', error);
            });
          }
        return updatedMessages;
      });
      } else {
        setMessages((prev) => {
          const updatedMessages = [
          ...prev,
          { 
            role: "assistant" as const, 
            content: "Error: " + (err?.message || String(err)), 
            id: uuidv4(),
            timestamp: Date.now(),
            parentId: userMessageId, 
            isProcessed: true // Mark as processed
          },
          ];
                      // INSTANT SAVE: Save error message immediately
            const currentSessionId = sessionIdRef.current || activeSessionId;
            if (currentSessionId) {
              const errorMessage = updatedMessages[updatedMessages.length - 1];
              saveMessageInstantly(currentSessionId, errorMessage).catch(error => {
                console.error('[Error Handling] Failed to instantly save error message:', error);
              });
            }
          return updatedMessages;
        });
      }
    } finally {
      setIsAiResponding(false);
      setIsLoading(false);
      setAbortController(null);
    }
    } catch (error) {
      console.error('[HandleSend] Error in handleSend:', error);
      setIsAiResponding(false);
      setIsLoading(false);
      setAbortController(null);
    } finally {
      isHandlingSend.current = false;
    }
  }

  function handleStopAIResponse() {
    if (abortController) {
      abortController.abort();
    }
  }

  // Image upload functionality
  function handlePlusClick() {
    fileInputRef.current?.click();
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploadingImage(true);

    try {
      // Disable image upload
      toast.error('Image upload is currently disabled.');
        setSelectedFiles([]);
        setImagePreviewUrls([]);
        setUploadedImageUrls([]);
      setIsUploadingImage(false);
      return;
    } catch (error) {
      console.error('Error uploading image:', error);
      setSelectedFiles([]);
      setImagePreviewUrls([]);
      setUploadedImageUrls([]);
      toast.error('Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removeImagePreview = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviewUrls(prev => {
      const newUrls = prev.filter((_, i) => i !== index);
      // Revoke the URL to free memory
      if (prev[index]) {
        URL.revokeObjectURL(prev[index]);
      }
      return newUrls;
    });
    setUploadedImageUrls(prev => prev.filter((_, i) => i !== index));
  };

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


  const handleSelectSession = async (sessionId: string) => {
    if (!sessionId) { // Handling deletion or empty selection case
        handleNewChatRequest();
        return;
    }
    
    try {
      setActiveSessionId(sessionId);
      sessionIdRef.current = sessionId; // Keep ref in sync
      await saveActiveSessionId(sessionId); // Save the active session
    
      // Get messages and ensure they're marked as processed
      const sessionMessages = await getSessionMessages(sessionId);
      const processedMessages = sessionMessages.map(msg => ({
        ...msg,
        isProcessed: true // Mark all loaded messages as processed
      }));
      
      setMessages(processedMessages);
      // Clear search state when switching sessions
      setSearchResults([]);
      setTextSources([]);
      setVideoSources([]);
      setInput('');
      setShowHeading(processedMessages.length === 0); // Show heading if the loaded session is empty
      setHasInteracted(true); // Assume interaction when a session is selected
      setSidebarOpen(false); // Close sidebar
      
      // Update URL to reflect the new session
      router.push(`/chat/${sessionId}`, { scroll: false });
    } catch (error) {
      console.error('Error selecting session:', error);
      // Fallback to new chat
      handleNewChatRequest();
    }
  };

  const handleNewChatRequest = async () => {
    setSidebarOpen(false);
    setInput('');
    setShowHeading(true); // Show welcoming heading
    setHasInteracted(false); // Reset interaction state
    setActiveSessionId(null);
    sessionIdRef.current = null; // Clear ref as well
    try {
      await saveActiveSessionId(null); // Clear the active session
    } catch (error) {
      console.error('Error clearing active session:', error);
    }
    setMessages([]);
    
    // Clear any previous search context to reset carousel
    setSearchResults([]);
    setTextSources([]);
    setVideoSources([]);
     
    // Navigate to main test page for new chat
    router.push('/', { scroll: false });
  };

  // Enhanced artifact preview card component (Claude-like)
  const renderArtifactPreviewCard = (title: string, isStreaming: boolean, progress: string) => (
    <div 
      className="rounded-2xl p-3 cursor-pointer transition-all duration-300 ease-in-out shadow-lg"
      style={{ 
        backgroundColor: '#1a1a1a',
        borderColor: '#333333',
        border: '1px solid #333333'
      }}
      onClick={() => {
        if (!isStreaming && artifactContent) {
          setArtifactContent(artifactContent);
          setIsArtifactMode(true);
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg truncate" style={{ color: "#FCFCFC", lineHeight: "1.2" }}>{title}</h3>
          <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
            {isStreaming && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-cyan-400">Writing...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Fix the renderMessageContent function to use LocalMessage

  const renderMessageContent = (msg: LocalMessage) => {
    // Artifact messages are handled by renderArtifactMessage, not here
    if (msg.contentType === 'artifact') {
      return null; // This should never be reached since artifacts use renderArtifactMessage
    }

    // Check for mind map content first (for AI assistant messages)
    if (msg.role === 'assistant') {
      // Remove mind map specific rendering
      // const mindMapData = extractMindMapJson(msg.content);
      // if (mindMapData) {
      //   return <MindMapDisplay data={mindMapData} />;
      // }
    }

    // Check for Vision Mode messages (messages with imageUrls)
    if (msg.imageUrls && msg.imageUrls.length > 0) {
      // Route Vision Mode messages through renderDefaultChatMessage for consistent rendering
      return renderDefaultChatMessage(msg, messages.findIndex(m => m.id === msg.id));
    }

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
        case 'artifact':
          // Show artifact preview card for completed artifacts
          const artifactData = msg.structuredContent;
          return renderArtifactPreviewCard(
            artifactData.title || 'Generated Document', 
            false, 
            `${artifactData.metadata?.wordCount || 0} words � ${artifactData.metadata?.estimatedReadTime || '2 minutes'}`
          );
        case 'reasoning':
          // Replace ReasoningDisplay with default markdown rendering
          return <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[rehypeRaw, rehypeKatex]} 
            className="prose dark:prose-invert max-w-none"
          >{msg.structuredContent as string}</ReactMarkdown>;
        case 'mind_map':
          // Remove mind map specific rendering
          return <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[rehypeRaw, rehypeKatex]} 
            className="prose dark:prose-invert max-w-none"
          >{msg.structuredContent as string}</ReactMarkdown>;
        default:
          if (typeof msg.structuredContent === 'string') {
            return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} className="prose dark:prose-invert max-w-none">{msg.structuredContent}</ReactMarkdown>;
          }
          return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} className="prose dark:prose-invert max-w-none">{`Unsupported structured content: ${JSON.stringify(msg.structuredContent)}`}</ReactMarkdown>;
      }
    } else if (msg.content) {
      let content = msg.content.trim();

      // Detect enhanced tool execution messages early
      const isEnhancedToolMsg = content.includes('TOOL_PROCESS:') || 
                               content.includes('TOOL_COMPLETE:') ||
                               content.includes('TOOL_THINKING:') ||
                               content.includes('TOOL_PLANNING:');

      // Check for tool execution messages (TOOL_THINKING, TOOL_PLANNING, TOOL_PROCESS, TOOL_COMPLETE)
      // If we have tool messages and we're in cube mode, use our new ToolStepRenderer
      if (isEnhancedToolMsg && activeMode === 'cube') {
        console.log('[Tool Call Parser] Using ToolStepRenderer for tool messages');
        return <ToolStepRenderer content={content} />;
      }

      // === Multi-tool card detection ===
      const toolPattern = /TOOL_(PROCESS|COMPLETE):\s*({[\s\S]*?})(?=\n|$)/g;
      const toolMatches = [];
      const DynamicResponseRenderer = require('../components/DynamicResponseRenderer').default;
      let toolCardRendered = false;
      let toolCardNodes: React.ReactNode[] = [];
      let toolMatch;
      
      console.log('[Tool Call Parser] Checking content for tool calls:', {
        contentLength: content.length,
        hasToolProcess: content.includes('TOOL_PROCESS:'),
        hasToolComplete: content.includes('TOOL_COMPLETE:'),
        contentPreview: content.substring(0, 200)
      });
      
      while ((toolMatch = toolPattern.exec(content)) !== null) {
        console.log('[Tool Call Parser] Found tool call:', {
          type: toolMatch[1],
          jsonText: toolMatch[2].substring(0, 100) + '...'
        });
        
        const jsonText = extractFirstJsonObject(toolMatch[2]) || '{}';
        try {
          const dataObj = JSON.parse(jsonText);
          const type = toolMatch[1] === 'PROCESS' ? 'tool_process' : 'tool_complete';
          console.log('[Tool Call Parser] Successfully parsed tool call:', {
            type,
            dataObj: dataObj
          });
          toolCardNodes.push(<DynamicResponseRenderer key={toolCardNodes.length} data={dataObj} type={type} />);
          toolCardRendered = true;
        } catch (e) {
          console.error('[Tool Call Parser] Failed to parse tool JSON:', e, 'JSON text:', jsonText);
        }
      }
      
      if (toolCardRendered && activeMode === 'cube') {
        // Only show the cards/stepper, hide the raw tool call text/markdown
        return <>{toolCardNodes}</>;
      }
      // --- Robust fallback: show error card if tool call detected but no card rendered ---
      if (activeMode === 'cube' && isEnhancedToolMsg && !toolCardRendered) {
        return (
          <div className="flex justify-center my-6">
            <div className="bg-red-900/20 backdrop-blur-lg border border-red-500/30 rounded-2xl px-6 py-4 shadow-2xl max-w-md w-full text-center">
              <div className="text-red-300 font-semibold mb-2">Tool call failed to render</div>
              <div className="text-red-200 text-xs">The tool call data could not be displayed. Please try again or contact support.</div>
            </div>
          </div>
        );
      }

      // We already detected enhanced tool messages earlier, so just check if it's not cube mode
      if (isEnhancedToolMsg && activeMode !== 'cube') {
        console.log('[Tool Call Parser] Enhanced tool message detected, skipping default chat handling');
        // We will parse and render below (skip default chat handling)
      } else {
        const isDefaultChat = msg.contentType === 'conversation' || msg.contentType === 'reasoning' || (msg.role === 'assistant' && !msg.contentType);
      if (isDefaultChat) {
        return (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[rehypeRaw, rehypeKatex]} 
            className="prose dark:prose-invert max-w-none default-chat-markdown"
          >
              {content}
          </ReactMarkdown>
        );
      }
      }

      // Check for enhanced tool execution patterns first (allow flexible formatting)
      const processIndex = content.indexOf('TOOL_PROCESS:');
      const completeIndex = content.indexOf('TOOL_COMPLETE:');

      console.log('[Tool Call Parser] Checking individual tool patterns:', {
        processIndex,
        completeIndex
      });

      if (processIndex !== -1) {
        const jsonStart = content.indexOf('{', processIndex);
        if (jsonStart !== -1) {
          const jsonString = content.slice(jsonStart).trim();
          try {
            const rawJson = extractFirstJsonObject(jsonString) || '{}';
            const cleaned = rawJson.replace(/```/g, '').trim();
            const processData = JSON.parse(cleaned);
            console.log('[Tool Call Parser] Successfully parsed process data:', processData);
            const DynamicResponseRenderer = require('../components/DynamicResponseRenderer').default;
            return <DynamicResponseRenderer data={processData} type="tool_process" />;
          } catch (e) {
            console.error('[Tool Call Parser] Failed to parse tool process JSON:', e, 'JSON string:', jsonString);
          }
        }
      }

      if (completeIndex !== -1) {
        const jsonStart = content.indexOf('{', completeIndex);
        if (jsonStart !== -1) {
          const jsonString = content.slice(jsonStart).trim();
          try {
            const rawJson = extractFirstJsonObject(jsonString) || '{}';
            const cleaned = rawJson.replace(/```/g, '').trim();
            const completeData = JSON.parse(cleaned);
            console.log('[Tool Call Parser] Successfully parsed complete data:', completeData);
            const DynamicResponseRenderer = require('../components/DynamicResponseRenderer').default;
            return <DynamicResponseRenderer data={completeData} type="tool_complete" />;
          } catch (e) {
            console.error('[Tool Call Parser] Failed to parse tool complete JSON:', e, 'JSON string:', jsonString);
          }
        }
      }

      // Legacy regex support with ** markers
      const toolProcessMatchLegacy = content.match(/TOOL_PROCESS:\s*({[\s\S]*})/);
      const toolCompleteMatchLegacy = content.match(/TOOL_COMPLETE:\s*({[\s\S]*})/);

      if (toolProcessMatchLegacy) {
        try {
          const rawJson = extractFirstJsonObject(toolProcessMatchLegacy[1]) || toolProcessMatchLegacy[1];
          const processData = JSON.parse(rawJson);
          const DynamicResponseRenderer = require('../components/DynamicResponseRenderer').default;
          return <DynamicResponseRenderer data={processData} type="tool_process" />;
        } catch (e) {
          console.error('Failed to parse legacy tool process:', e);
        }
      }

      if (toolCompleteMatchLegacy) {
        try {
          const rawJson = extractFirstJsonObject(toolCompleteMatchLegacy[1]) || toolCompleteMatchLegacy[1];
          const completeData = JSON.parse(rawJson);
          const DynamicResponseRenderer = require('../components/DynamicResponseRenderer').default;
          return <DynamicResponseRenderer data={completeData} type="tool_complete" />;
        } catch (e) {
          console.error('Failed to parse legacy tool complete:', e);
        }
      }

      // Remove code block markers if present
      content = content.replace(/```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      // Try to extract JSON from anywhere in the string
      let jsonMatch = content.match(/({[\s\S]*?})/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log('Parsed tool result:', parsed);
          if (parsed && typeof parsed === 'object' && (parsed.url || parsed.service || parsed.action || parsed.status)) {
            const DynamicResponseRenderer = require('../components/DynamicResponseRenderer').default;
            console.log('Rendering ActionCard with:', parsed);
            return <DynamicResponseRenderer data={parsed} type={msg.contentType || 'conversation'} />;
          }
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
        } catch (e) {
          console.error('Failed to parse tool result JSON:', e, content);
      }
      }
      return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} className="prose dark:prose-invert max-w-none">{content}</ReactMarkdown>;
    }
    return null;
  };



  const handleButtonClick = (key: string) => {
    // If the clicked button is already active, deactivate it and fall back to default chat
    if (activeButton === key) {
      setActiveButton(null);
      setActiveMode('chat');
      setIsArtifactMode(false);
    } else {
      // Switch to the new mode
      setActiveButton(key);
      if (key === 'search') {
        setActiveMode('search');
      } else if (key === 'cube') {
        // Check if user is authenticated with Notion
        const isNotionAuthenticated = typeof window !== 'undefined' && 
          localStorage.getItem('notion_oauth_tokens') !== null;
        
        if (isNotionAuthenticated) {
          setActiveMode('cube');
          // Remove the auto-demo that was causing the error
          // demonstrateNotionToolCalling();
        } else {
          // Show Notion auth modal
          setIsNotionAuthModalOpen(true);
          return; // Don't set active button until auth is complete
        }
      } else {
        setActiveMode('chat');
      }
    if (key === 'artifact') {
      setIsArtifactMode(true);
      if (!artifactContent) {
        setArtifactContent({
            root_id: 'temp',
          version: 1,
          type: 'document',
          title: 'Artifact Output',
          content: '',
          metadata: {
            wordCount: 0,
            estimatedReadTime: '1 minute',
            category: 'Document',
            tags: ['document']
          }
        });
        }
      } else {
        setIsArtifactMode(false);
      }
    }
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
    setActiveButton(newMode); // Only one mode active at a time
    if (newMode === 'chat') {
      setIsSearchPaneOpen(false);
      setSearchResults([]);
      setTextSources([]);
      setVideoSources([]);
    }
  }

  const handleRetryMessage = (originalQuery: string) => {
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
  const handleCopyContent = (content: string | any) => {
    // Check if content is an object (for structured data), and stringify it
    const textToCopy = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    
    // Remove <thinking> tags before copying
    const cleanedText = textToCopy.replace(/<\/?think>/g, '').replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '').trim();

    navigator.clipboard.writeText(cleanedText).then(() => {
      toast.success('Copied to clipboard', {
        duration: 2000,
        position: 'bottom-center',
        style: {
          background: '#333',
          color: '#fff',
        },
      });
    }).catch(err => {
      console.error('Failed to copy: ', err);
      toast.error('Failed to copy', {
        duration: 2000,
        position: 'bottom-center',
        style: {
          background: '#333',
          color: '#fff',
        },
      });
    });
  };

  const LoadingIndicator = () => (
    <motion.div
      key="typing-indicator"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center space-x-2"
      style={{ minHeight: '2.5rem' }} // This prevents the layout jump
    >
      <Bot size={20} className="text-white" />
      <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></span>
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
      </div>
    </motion.div>
  );

  // Hide the Deep Research view when research completes and AI responds
  useEffect(() => {
    // Removed advanced search logic
  }, [isAiResponding]);

  // Independent artifact message rendering system
  const renderArtifactMessage = (msg: LocalMessage, i: number) => {
    // Use the raw AI markdown for artifacts
    const rawContent = msg.structuredContent?.content || msg.content;
    
    return (
      <motion.div
        key={msg.id + '-artifact-' + i}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
        style={{ color: '#FCFCFC', maxWidth: '100%', overflowWrap: 'break-word' }}
      >
        {/* Artifact Preview Card or Streaming Content */}
        {msg.structuredContent ? (
          <>
            {/* Completed Artifact with Preview Card */}
            <div 
              className="w-full sm:max-w-sm rounded-2xl border shadow-lg px-3 mb-4 cursor-pointer transition-all duration-300 ease-in-out flex items-center gap-3" 
              style={{ backgroundColor: "#1a1a1a", borderColor: "#333333", height: "48px", alignItems: "center" }}
                onClick={() => {
                // Use raw content for artifact viewer/editor
                const simpleArtifact = {
                  root_id: msg.structuredContent?.id || msg.structuredContent?.root_id || 'temp',
                  version: msg.structuredContent?.version || 1,
                  title: msg.structuredContent.title || msg.title || "Generated Document",
                  type: "document" as const,
                  content: rawContent,
                  metadata: {
                    wordCount: rawContent.split(' ').length,
                    estimatedReadTime: `${Math.ceil(rawContent.split(' ').length / 200)} min read`,
                    category: "Document",
                    tags: ["document"]
                  }
                  };
                setArtifactContent(simpleArtifact);
                  setIsArtifactMode(true);
                }}
            >
              {/* Artifact Icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FCFCFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="9" x2="15" y2="9"></line>
                <line x1="9" y1="15" y2="15"></line>
              </svg>
              <h3 className="text-sm font-normal truncate flex-1 leading-tight" style={{ color: "#FCFCFC", margin: 0, padding: 0 }}>
                {msg.structuredContent ? msg.structuredContent.title : "Drafting document"}
              </h3>
              {msg.isStreaming && (
                <span className="inline-block w-2 h-2 bg-cyan-400 rounded-full animate-pulse flex-shrink-0" />
              )}
            </div>
            {/* Action buttons for completed artifact (copy/download) can use rawContent */}
            {msg.isProcessed && (
              <div className="w-full flex justify-start gap-2 mt-2 relative z-50">
                    <button 
                  onClick={() => handleCopyContent(rawContent)}
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                  aria-label="Copy artifact content"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button
                  onClick={() => {
                    const blob = new Blob([rawContent], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${(msg.structuredContent.title || msg.title || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                  aria-label="Download artifact"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7,10 12,15 17,10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </button>
              </div>
            )}
          </>
        ) : null}
                    </motion.div>
                  );
  };

  // Independent default chat message rendering system
  const renderDefaultChatMessage = (msg: LocalMessage, i: number) => {
                const { content: rawContent } = cleanAIResponse(msg.content);
                // For default chat, remove think tags and thinking indicators completely
                const cleanContent = rawContent
                  .replace(/<think>[\s\S]*?<\/think>/g, '')
                  .replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '')
                  .trim();
                const isStoppedMsg = cleanContent.trim() === '[Response stopped by user]';
                
                // Industry standard approach: Single ReactMarkdown renderer with smart buffering
                // Apply smart buffering for streaming content to prevent layout issues
                const processedContent = msg.isStreaming 
                  ? smartBufferStreamingContent(cleanContent)
                  : cleanContent;
                
                // Apply citations to processed content
                const finalContent = makeCitationsClickable(processedContent, msg.webSources || []);
                
                if (showPulsingDot && i === messages.length -1 ) setShowPulsingDot(false);
                const showTypingIndicator = msg.role === 'assistant' && finalContent.trim().length === 0 && !msg.isProcessed;
                
                return (
                  <React.Fragment key={msg.id + '-fragment-' + i}>
                    {/* Main AI response content - Industry Standard Single Renderer */}
                    <motion.div
                      key={msg.id + '-unified-' + i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
                      style={{ color: '#FCFCFC', maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                    >
                      {/* Image Carousel – show only when this assistant message has images */}
                      {msg.imageUrls && msg.imageUrls.length > 0 && (
                        <div className="mt-2 mb-2 w-full max-w-full overflow-hidden">
                          <ImageCarousel
                            images={msg.imageUrls.map((url) => {
                              const matchingSource = (msg.webSources || []).find((s: any) => s.image === url) || {};
                              return {
                                url,
                                title: matchingSource.title || '',
                                sourceUrl: matchingSource.url || ''
                              };
                            })}
                          />
                        </div>
                      )}


                      
                      {isStoppedMsg ? (
                        <span className="text-xs text-white italic font-light mb-2">[Response stopped by user]</span>
                      ) : (
                        <div className="w-full max-w-full overflow-hidden" style={{ minHeight: showTypingIndicator ? '2.5rem' : 'auto' }}>
                          {/* Single ReactMarkdown renderer for both streaming and final states */}
                          {showTypingIndicator ? (
                            <LoadingIndicator />
                          ) : (
                            finalContent.trim().length > 0 && (
                            <div style={{ position: 'relative' }}>
                            <ReactMarkdown 
                                remarkPlugins={[remarkGfm, remarkMath]} 
                                rehypePlugins={[rehypeRaw, rehypeKatex]} 
                              className="research-output"
                              components={{
                                    h1: ({ children }) => (<h1 className="text-xl md:text-3xl font-bold mb-6 mt-8 border-b border-cyan-500/30 pb-3" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h1>),
                                    h2: ({ children }) => (<h2 className="text-lg md:text-2xl font-semibold mb-4 mt-8 flex items-center gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h2>),
                                    h3: ({ children }) => (<h3 className="text-base md:text-xl font-semibold mb-3 mt-6" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h3>),
                                    p: ({ children }) => (<p className="leading-relaxed mb-4 text-base" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</p>),
                                  ul: ({ children }) => (<ul className="space-y-2 mb-4 ml-4">{children}</ul>),
                                    li: ({ children }) => (<li className="flex items-start gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}><span className="mt-1.5 text-xs" style={{ color: "var(--text-primary)" }}>●</span><span className="flex-1">{children}</span></li>),
                                  ol: ({ children }) => (<ol className="space-y-2 mb-4 ml-4 list-decimal list-inside">{children}</ol>),
                                    strong: ({ children }) => (<strong className="font-semibold" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</strong>),
                                  table: ({ children }) => (<div className="overflow-x-auto mb-6 max-w-full scrollbar-thin"><table className="border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>{children}</table></div>),
                                  thead: ({ children }) => <thead className="">{children}</thead>,
                                    th: ({ children }) => (<th className="px-3 md:px-4 py-1 md:py-3 text-left font-semibold border-b-2 border-gray-600 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</th>),
                                    td: ({ children }) => (<td className="px-3 md:px-4 py-1 md:py-3 border-b border-gray-700 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</td>),
                                    blockquote: ({ children }) => (<blockquote className="border-l-4 border-cyan-500 pl-4 py-1 rounded-r-lg mb-4 italic" style={{ background: 'transparent', color: 'var(--text-primary)' }}>{children}</blockquote>),
                                  code: ({ children, className }) => {
                                  const isInline = !className;
                                    return isInline
                                        ? (<code className="px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>)
                                        : (<code className="block p-4 rounded-lg overflow-x-auto text-xs font-mono mb-4" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>);
                                  }
                                }}
                              >
                                {finalContent}
                            </ReactMarkdown>
                            </div>
                            )
                          )}
                        </div>
                      )}
                  
                      {/* Action buttons for text content */}
                      {msg.isProcessed && !isStoppedMsg && (
                        <div className="w-full flex justify-start gap-2 mt-2 relative z-[60]">
                          <button
                            onClick={() => handleCopyContent(finalContent)}
                            className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                            aria-label="Copy response"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
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
                                  handleRetryMessage(userMsg.content);
                                } else {
                                  console.error('Could not find a user message to retry');
                                }
                              } catch (error) {
                                console.error('Error handling retry button click:', error);
                              }
                            }}
                            className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                            aria-label="Retry with different response"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                              <path d="M3 3v5h5"></path>
                            </svg>
                          </button>


                       
                        </div>
                      )}
                    </motion.div>
                  </React.Fragment>
                );
  };

  // Search message renderer with tab navigation
  const renderSearchMessage = (msg: LocalMessage, i: number) => {
    // Use raw content without any processing for search mode
    const finalContent = msg.content;
    const currentTab = searchMessageTabs[msg.id || ''] || 'Answer';
    const hasWebSources = msg.webSources && msg.webSources.length > 0;
    
    if (showPulsingDot && i === messages.length - 1) setShowPulsingDot(false);
    const showTypingIndicator = msg.role === 'assistant' && finalContent.trim().length === 0 && !msg.isProcessed;

    return (
      <React.Fragment key={msg.id + '-search-fragment-' + i}>
        <motion.div
          key={msg.id + '-search-' + i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
          style={{ color: '#FCFCFC', maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word' }}
        >
          {/* Tab Navigation for Search Results */}
          {msg.contentType === 'search' && (
            <div className="w-full mb-4">
              <div className="flex border-b border-gray-700">
                            <button
                  onClick={() => setSearchMessageTabs(prev => ({ ...prev, [msg.id || '']: 'Answer' }))}
                  className={`px-4 py-2 text-base font-medium transition-colors border-b-2 ${
                    currentTab === 'Answer' 
                      ? 'text-white border-cyan-500' 
                      : 'text-gray-400 hover:text-gray-200 border-transparent'
                  }`}
                >
                  Answer
                </button>
                <button
                  onClick={() => setSearchMessageTabs(prev => ({ ...prev, [msg.id || '']: 'Sources' }))}
                  className={`px-4 py-2 text-base font-medium transition-colors border-b-2 ${
                    currentTab === 'Sources' 
                      ? 'text-white border-cyan-500' 
                      : 'text-gray-400 hover:text-gray-200 border-transparent'
                  }`}
                >
                  Sources {hasWebSources && `(${msg.webSources.length})`}
                </button>
              </div>
            </div>
          )}

          {/* Tab Content */}
          {currentTab === 'Answer' ? (
            <>
              {/* Image Carousel for Answer tab */}
              {msg.imageUrls && msg.imageUrls.length > 0 && (
                <div className="mt-2 mb-2 w-full max-w-full overflow-hidden">
                  <ImageCarousel
                    images={msg.imageUrls.map((url) => {
                      const matchingSource = (msg.webSources || []).find((s: any) => s.image === url) || {};
                      return {
                        url,
                        title: matchingSource.title || '',
                        sourceUrl: matchingSource.url || ''
                      };
                    })}
                  />
                </div>
              )}

              {/* AI Response Content */}
              <div className="w-full max-w-full overflow-hidden" style={{ minHeight: showTypingIndicator ? '2.5rem' : 'auto' }}>
                {showTypingIndicator ? (
                  <LoadingIndicator />
                ) : (
                  finalContent.trim().length > 0 && (
                    <div style={{ position: 'relative' }}>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkMath]} 
                        rehypePlugins={[rehypeRaw, rehypeKatex]} 
                        className="research-output"
                        components={{
                          h1: ({ children }) => (<h1 className="text-xl md:text-3xl font-bold mb-6 mt-8 border-b border-cyan-500/30 pb-3" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h1>),
                          h2: ({ children }) => (<h2 className="text-lg md:text-2xl font-semibold mb-4 mt-8 flex items-center gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h2>),
                          h3: ({ children }) => (<h3 className="text-base md:text-xl font-semibold mb-3 mt-6" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h3>),
                          p: ({ children }) => (<p className="leading-relaxed mb-4 text-base" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</p>),
                          ul: ({ children }) => (<ul className="space-y-2 mb-4 ml-4">{children}</ul>),
                          li: ({ children }) => (<li className="flex items-start gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}><span className="mt-1.5 text-xs" style={{ color: "var(--text-primary)" }}>●</span><span className="flex-1">{children}</span></li>),
                          ol: ({ children }) => (<ol className="space-y-2 mb-4 ml-4 list-decimal list-inside">{children}</ol>),
                          strong: ({ children }) => (<strong className="font-semibold" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</strong>),
                          table: ({ children }) => (<div className="overflow-x-auto mb-6 max-w-full scrollbar-thin"><table className="border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>{children}</table></div>),
                          thead: ({ children }) => <thead className="">{children}</thead>,
                          th: ({ children }) => (<th className="px-3 md:px-4 py-1 md:py-3 text-left font-semibold border-b-2 border-gray-600 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</th>),
                          td: ({ children }) => (<td className="px-3 md:px-4 py-1 md:py-3 border-b border-gray-700 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</td>),
                          blockquote: ({ children }) => (<blockquote className="border-l-4 border-cyan-500 pl-4 py-1 rounded-r-lg mb-4 italic" style={{ background: 'transparent', color: 'var(--text-primary)' }}>{children}</blockquote>),
                          code: ({ children, className }) => {
                            const isInline = !className;
                            return isInline
                              ? (<code className="px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>)
                              : (<code className="block p-4 rounded-lg overflow-x-auto text-xs font-mono mb-4" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>);
                          }
                        }}
                      >
                        {finalContent}
                      </ReactMarkdown>
                    </div>
                  )
                )}
              </div>
            </>
          ) : (
            /* Sources Tab Content */
            <div className="w-full">
              {hasWebSources ? (
                <div className="space-y-3">
                  {msg.webSources.map((source: any, index: number) => (
                    <motion.div
                      key={source.id || index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="w-full flex items-center py-2 min-h-[48px] hover:bg-neutral-800/40 rounded-lg transition-colors px-5"
                      style={{ border: 'none', boxShadow: 'none', marginBottom: '2px' }}
                    >
                      {/* Main content (favicon/domain, title, snippet) */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Favicon + Domain row, above title/snippet */}
                        <div className="flex items-center mb-0.5">
                          <img
                            src={getSourceIcon(source.url, source.favicon)}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover bg-white border border-gray-700 flex-shrink-0"
                            style={{ marginRight: '16px' }}
                            onError={e => { e.currentTarget.src = '/icons/web-icon.svg'; }}
                          />
                          <span className="text-base text-gray-400 truncate" style={{ maxWidth: '140px' }}>
                            {extractDomain(source.url)}
                          </span>
                        </div>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                          style={{ textDecoration: 'none' }}
                        >
                          <div className="font-bold text-base text-white leading-tight mb-0.5 hover:text-cyan-400 transition-colors truncate" style={{ lineHeight: '1.25', fontWeight: 700 }}>
                            {source.title}
                          </div>
                          {source.snippet && (
                            <div className="text-base text-gray-300 leading-snug line-clamp-2" style={{ lineHeight: '1.35', fontWeight: 400 }}>
                              {source.snippet}
                            </div>
                          )}
                        </a>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>No sources available for this search.</p>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          {msg.isProcessed && currentTab === 'Answer' && (
            <div className="w-full flex justify-start gap-2 mt-4 relative z-[60]">
              <button
                onClick={() => handleCopyContent(finalContent)}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                aria-label="Copy response"
              >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
              
              <button
                onClick={() => {
                  try {
                    const userMsgIndex = messages.findIndex(m => m.id === msg.parentId);
                    let userMsg = userMsgIndex >= 0 ? messages[userMsgIndex] : 
                                messages.find(m => m.role === 'user' && m.timestamp && m.timestamp < (msg.timestamp || Infinity));
                    
                    if (!userMsg) {
                      userMsg = [...messages].reverse().find(m => m.role === 'user');
                    }
                    
                    if (userMsg) {
                      handleRetryMessage(userMsg.content);
                    }
                  } catch (error) {
                    console.error('Error handling retry button click:', error);
                  }
                }}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                aria-label="Retry with different response"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </button>
                        </div>
                      )}
                    </motion.div>
                  </React.Fragment>
                );
  };

  // Add new renderer below default one
  const renderReasoningMessage = (msg: LocalMessage, i: number) => {
    const { content: rawContent } = cleanAIResponse(msg.content);
    const cleanContent = rawContent.replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '');

    // Remove all <think>...</think> tags for the main output
    const mainMarkdownContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Removed mind map JSON detection
    // const mindMapData = isMindMapJSON(mainMarkdownContent);
    // const isMindMapResponse = !!mindMapData;

    const finalContent = makeCitationsClickable(mainMarkdownContent, msg.webSources || []);

                return (
      <React.Fragment key={`msg-${i}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full"
        >
          {finalContent.trim().length > 0 &&
            renderDefaultChatMessage({
              ...msg,
              content: finalContent.replace(/<!-- think-block-\d+ -->/g, '')
            }, i)}
        </motion.div>
      </React.Fragment>
    );
  };



                return (
    <>
      <div 
        className="min-h-screen flex flex-col px-4 sm:px-4 md:px-8 lg:px-0 transition-all duration-300" 
        style={{ 
          background: '#0A0A0A',
          width: isArtifactMode ? `${100 - artifactViewerWidth}%` : '100%',
          marginRight: isSearchPaneOpen && activeMode !== 'search' && !isArtifactMode ? '296px' : undefined // 280px pane + 16px gap
        }}
      >
        <GlobalStyles />
      {/* Single Header: always visible on all devices - constrained to left pane when right pane is open */}
      <header 
        className="fixed top-0 left-0 z-50 bg-[#0A0A0A] h-14 flex items-center px-4 text-white"
        style={{
          width: isArtifactMode ? `${100 - artifactViewerWidth}%` : (isSearchPaneOpen && activeMode !== 'search' ? 'calc(100% - 296px)' : '100%')
        }}
      >
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
        <span className="ml-3 text-2xl font-normal tracking-wide">Tehom AI</span>
        {/* Share Button - right corner */}
        {activeSessionId && (
          <button
            onClick={() => {
              const shareUrl = `${window.location.origin}/chat/${activeSessionId}`;
              navigator.clipboard.writeText(shareUrl);
              toast.success('Link copied to clipboard!', {
                duration: 2000,
                position: 'top-center',
                style: { background: '#232323', color: '#fff' },
              });
            }}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-500/20 transition-colors text-white font-medium"
            style={{ marginLeft: 'auto', fontSize: '1.1rem' }}
            aria-label="Share chat link"
          >
            {/* Share icon SVG */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
            <span>Share</span>
          </button>
        )}
      </header>

      {/* Conversation area (scrollable) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto w-full flex flex-col items-center justify-center relative px-4 sm:px-4 md:px-8 lg:px-0 pt-8"
          style={{ paddingBottom: `${isChatEmpty && !hasInteracted ? 0 : inputBarHeight + EXTRA_GAP}px` }}
      >
          {/* Mobile: Separate heading (centered) and input (bottom) */}
          {/* Desktop: Combined wrapper with current behavior */}
          
          {/* Mobile-only: Centered heading */}
          <div 
            className={`md:hidden absolute top-1/2 -translate-y-1/2 max-w-4xl flex flex-col items-center justify-center z-40 transition-opacity duration-500 ${inputPosition === "center" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{
              left: '50%',
              width: '100%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            <h1 className="text-2xl sm:text-3xl font-normal text-gray-200 text-center whitespace-nowrap">
            Seek and You'll find
          </h1>
          </div>

          {/* Mobile-only: Bottom input */}
          <div 
            className="md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 translate-y-0 w-full max-w-4xl flex flex-col items-center justify-center z-50 px-4 pb-4"
            style={{
              width: '100%'
            }}
          >
            {/* Input form for mobile */}
            <form
              className="flex flex-col gap-2 rounded-2xl shadow-lg py-1 w-full px-4 pl-4 sm:px-6 md:px-8 lg:pl-4 lg:pr-0 mb-3 bg-[#232323]"
              onSubmit={handleSend}
            >
              {/* Image Preview inside input box */}
              {(selectedFiles.length > 0 || imagePreviewUrls.length > 0) && (
                <div className="w-full px-2 py-1">
                  <div className="flex gap-2 flex-wrap">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="relative">
                        {imagePreviewUrls[index] ? (
                          <img 
                            src={imagePreviewUrls[index]} 
                            alt={`Preview ${index + 1}`} 
                            className="w-16 h-16 object-cover rounded-lg border border-gray-600"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-700 rounded-lg border border-gray-600 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                      <button
                        type="button"
                          onClick={() => removeImagePreview(index)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                      >
                          ×
                      </button>
              </div>
          ))}
                  </div>
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
                    className="w-full border-none outline-none bg-transparent px-2 py-1 text-gray-200 text-[16px] placeholder-gray-500 resize-none overflow-auto self-center rounded-lg"
                    placeholder="Ask anything..."
            disabled={isLoading}
            rows={1}
                    style={{ maxHeight: '96px', minHeight: '56px', lineHeight: '1.5' }}
                  />
                </div>

                {/* Actions row */}
                <div className="flex flex-row w-full items-center justify-between gap-2">
                  {/* Left group: Tab bar with Search, Artifact, Think */}
                  <div className="flex flex-row items-center rounded-lg p-1 mb-1" style={{ backgroundColor: '#0A0A0A' }}>
                    {/* Search tab */}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch(activeMode === 'search' ? 'chat' : 'search')}
                      className={`
                        flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 
                        ${activeMode === 'search' 
                          ? 'border' 
                          : 'hover:brightness-150'
                        }
                      `}
                      style={{ 
                        color: activeMode === 'search' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)',
                        borderColor: activeMode === 'search' ? '#FCFCFC' : 'transparent'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                      </svg>
                    </button>

                    {/* Artifact tab */}
                    <button
                      type="button"
                      className={`
                        flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 
                        ${activeButton === 'artifact' ? 'border' : 'hover:brightness-150'}
                      `}
                      style={{ 
                        color: activeButton === 'artifact' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)',
                        borderColor: activeButton === 'artifact' ? '#FCFCFC' : 'transparent'
                      }}
                      onClick={() => handleButtonClick('artifact')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="9" x2="15" y2="9"></line>
                        <line x1="9" y1="13" x2="15" y2="13"></line>
                      </svg>
                    </button>

                    {/* Cube toggle button */}
                    <button
                      type="button"
                      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${activeButton === 'cube' ? 'border' : 'hover:brightness-150'}`}
                      style={{ color: activeButton === 'cube' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)', borderColor: activeButton === 'cube' ? '#FCFCFC' : 'transparent', display: activeMode === 'cube' ? 'none' : 'flex' }}
                      aria-label="Toggle Cube Mode"
                      onClick={() => handleButtonClick('cube')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                    </button>

                  </div>

                  {/* Right group: Plus, Send */}
                  <div className="flex flex-row gap-2 items-center ml-auto p-1 mb-1">
                    {/* Plus button */}
                    <button 
                      type="button" 
                      className="p-2 rounded-full text-gray-300 hover:brightness-150 transition flex items-center justify-center flex-shrink-0"
                      style={{ 
                        width: "40px", 
                        height: "40px",
                        backgroundColor: '#0A0A0A'
                      }}
                      onClick={handlePlusClick}
                      disabled={isUploadingImage}
                    >
                      {isUploadingImage ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                    </button>
                    
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />

                    {/* Send/Stop button */}
                    <button
                      type={isAiResponding ? "button" : "submit"}
                      className="rounded-full bg-gray-200 hover:bg-white transition flex items-center justify-center flex-shrink-0"
                      style={{ width: "40px", height: "40px", pointerEvents: isLoading && !isAiResponding ? 'none' : 'auto' }}
                      onClick={isAiResponding ? handleStopAIResponse : undefined}
                      disabled={isLoading && !isAiResponding}
                      aria-label={isAiResponding ? "Stop AI response" : "Send"}
                    >
                      {isAiResponding ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="7" y="7" width="10" height="10" rx="2" fill="#374151" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" fill="none" stroke="#374151" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* Desktop: Combined wrapper with current behavior */}
          <div
            className={`hidden md:flex fixed flex-col w-full max-w-4xl items-center justify-center z-50 transition-all duration-500 ease-in-out ${
              inputPosition === "center" ? "top-1/2 -translate-y-1/2" : "bottom-0 translate-y-0"
            }`}
            style={{
              left: isArtifactMode ? `${(100 - artifactViewerWidth) / 2}%` : '50%',
              width: isArtifactMode ? `${100 - artifactViewerWidth}%` : '100%',
              maxWidth: isArtifactMode ? 'none' : '56rem',
              transform: inputPosition === 'center' ? 'translate(-50%, -50%)' : 'translateX(-50%)',
            }}
          >
            {/* Heading with fade animation - show on desktop when centered */}
            <h1 className={`text-2xl sm:text-3xl md:text-4xl lg:text-[3.2rem] font-normal text-gray-200 text-center mb-3 md:mb-6 transition-opacity duration-500 whitespace-nowrap ${inputPosition === "center" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              Seek and You'll find
            </h1>



            {/* Input form for desktop */}
            <form
              className="flex flex-col gap-2 rounded-2xl shadow-lg py-1 w-full px-4 mb-3 bg-[#232323]"
              onSubmit={handleSend}
            >
              {/* Image Preview inside input box */}
              {(selectedFiles.length > 0 || imagePreviewUrls.length > 0) && (
                <div className="w-full px-2 py-1">
                  <div className="flex gap-2 flex-wrap">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="relative">
                        {imagePreviewUrls[index] ? (
                          <img 
                            src={imagePreviewUrls[index]} 
                            alt={`Preview ${index + 1}`} 
                            className="w-16 h-16 object-cover rounded-lg border border-gray-600"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-700 rounded-lg border border-gray-600 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImagePreview(index)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
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
                    className="w-full border-none outline-none bg-transparent px-2 py-1 text-gray-200 text-[16px] placeholder-gray-500 resize-none overflow-auto self-center rounded-lg"
                    placeholder="Ask anything..."
                    disabled={isLoading}
                    rows={1}
                    style={{ maxHeight: '96px', minHeight: '56px', lineHeight: '1.5' }}
                  />
                </div>

                {/* Actions row */}
                <div className="flex flex-row w-full items-center justify-between gap-2">
                  {/* Left group: Tab bar with Search, Artifact, Think */}
                  <div className="flex flex-row items-center rounded-lg p-1 mb-1" style={{ backgroundColor: '#0A0A0A' }}>
                    {/* Search tab */}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch(activeMode === 'search' ? 'chat' : 'search')}
                      className={`
                        flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 
                        ${activeMode === 'search' 
                          ? 'border' 
                          : 'hover:brightness-150'
                        }
                      `}
                      style={{ 
                        color: activeMode === 'search' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)',
                        borderColor: activeMode === 'search' ? '#FCFCFC' : 'transparent'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                      </svg>
                    </button>

                    {/* Artifact tab */}
                    <button
                      type="button"
                      className={`
                        flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 
                        ${activeButton === 'artifact' ? 'border' : 'hover:brightness-150'}
                      `}
                      style={{ 
                        color: activeButton === 'artifact' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)',
                        borderColor: activeButton === 'artifact' ? '#FCFCFC' : 'transparent'
                      }}
                      onClick={() => handleButtonClick('artifact')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="9" x2="15" y2="9"></line>
                        <line x1="9" y1="13" x2="15" y2="13"></line>
                      </svg>
                    </button>

                    {/* Cube toggle button */}
                    <button
                      type="button"
                      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${activeButton === 'cube' ? 'border' : 'hover:brightness-150'}`}
                      style={{ color: activeButton === 'cube' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)', borderColor: activeButton === 'cube' ? '#FCFCFC' : 'transparent', display: activeMode === 'cube' ? 'none' : 'flex' }}
                      aria-label="Toggle Cube Mode"
                      onClick={() => handleButtonClick('cube')}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                    </button>

              </div>

                  {/* Right group: Plus, Send */}
                  <div className="flex flex-row gap-2 items-center ml-auto p-1 mb-1">
                    {/* Plus button */}
                    <button 
                      type="button" 
                      className="p-2 rounded-full text-gray-300 hover:brightness-150 transition flex items-center justify-center flex-shrink-0"
                      style={{ 
                        width: "40px", 
                        height: "40px",
                        backgroundColor: '#0A0A0A'
                      }}
                      onClick={handlePlusClick}
                      disabled={isUploadingImage}
                    >
                      {isUploadingImage ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
                      )}
            </button>
                    
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                    />

                    {/* Send/Stop button */}
            <button
                      type={isAiResponding ? "button" : "submit"}
                      className="rounded-full bg-gray-200 hover:bg-white transition flex items-center justify-center flex-shrink-0"
                      style={{ width: "40px", height: "40px", pointerEvents: isLoading && !isAiResponding ? 'none' : 'auto' }}
                      onClick={isAiResponding ? handleStopAIResponse : undefined}
                      disabled={isLoading && !isAiResponding}
                      aria-label={isAiResponding ? "Stop AI response" : "Send"}
                    >
                      {isAiResponding ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="7" y="7" width="10" height="10" rx="2" fill="#374151" />
              </svg>
                      ) : (
                        <svg width="20" height="20" fill="none" stroke="#374151" strokeWidth="2.5" viewBox="0 0 24 24">
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
          <div className={`w-full max-w-4xl mx-auto flex flex-col gap-4 items-center justify-center z-10 pt-12 pb-4 ${isArtifactMode ? 'px-4 sm:px-6' : ''}`}>
            {messages.map((msg, i) => {
              console.log('[CUBE MODE DEBUG] activeMode:', activeMode, 'msg:', msg);
              // Assistant responses: artifacts first, then search, then reasoning, then default chat
              if (msg.role === 'assistant') {
                if (msg.contentType === 'artifact') {
                  // Show a minimal preview card in chat for artifact messages
                  return (
                    <div
                      key={msg.id + '-artifact-preview'}
                      className="w-full flex justify-start items-center mb-4"
                    >
                      <button
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-700 bg-[#18181a] hover:bg-gray-800 transition-colors shadow-md cursor-pointer min-w-[180px] max-w-xs"
                        style={{ color: '#FCFCFC' }}
                        onClick={() => {
                          setArtifactContent({
                            root_id: msg.structuredContent?.id || msg.structuredContent?.root_id || msg.root_id || 'temp',
                            version: msg.structuredContent?.version || msg.version || 1,
                            title: msg.title || msg.structuredContent?.title || 'Generated Document',
                            type: 'document',
                            content: msg.content,
                            metadata: msg.structuredContent?.metadata || {}
                          });
                          setIsArtifactMode(true);
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCFCFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="9" y1="9" x2="15" y2="9"></line>
                          <line x1="9" y1="15" x2="15" y2="15"></line>
                        </svg>
                        <span className="font-medium text-sm truncate flex-1">
                          {msg.isStreaming ? 'Writing artifact' : 'Preview artifact'}
                        </span>
                      </button>
                    </div>
                  );
                }
                if (msg.contentType === 'search') {
                  return renderSearchMessage(msg, i);
                }
                if (msg.contentType === 'reasoning') {
                  return renderReasoningMessage(msg, i);
                }

                return renderDefaultChatMessage(msg, i);
              }
              // Search UI messages removed - will be replaced with browser mode integration
              // User messages
                return (
                <div
                  key={msg.id + '-user-' + i}
                  className="w-full flex justify-end items-center gap-3 mb-4"
                >
                  {/* User message bubble - dynamic width */}
                  <div className="flex flex-col items-end max-w-[600px] min-w-[100px]">
                    {/* Image previews if any */}
                    {msg.imageUrls && msg.imageUrls.map((url, index) => (
                      <img 
                        key={index} 
                        src={url} 
                        alt={`Preview ${index + 1}`} 
                        className={`max-w-xs max-h-64 rounded-md mb-2 ${
                          imageWaitingForResponse === url ? 'image-metallic-shine' : ''
                        }`}
                      />
                    ))}
                    {/* Message content bubble */}
                    <div
                      className="px-6 py-4 rounded-2xl text-base leading-relaxed text-left bg-[#232323] text-white"
                      style={{ 
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                  {/* User profile avatar */}
                  <div className="flex-shrink-0 ml-3 flex items-center justify-center">
                    {user?.user_metadata?.avatar_url ? (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt="User avatar"
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-base font-medium">
                        {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                </div>
                );
            })}
            
            {/* Remove the standalone thinking box since it's now integrated within the messages flow */}
      </div>
        </div>

        {/* Fixed Footer Bar Behind Input */}
        <div
          className={`fixed bottom-0 z-40 transition-opacity duration-300 ${isChatEmpty && !hasInteracted ? 'opacity-0' : 'opacity-100'}`}
          style={{ 
            height: `calc(${inputBarHeight}px + env(safe-area-inset-bottom, 0px))`, 
            background: '#0A0A0A', 
            pointerEvents: 'none',
            left: '0',
            width: isArtifactMode ? `${100 - artifactViewerWidth}%` : '100%',
            marginRight: isSearchPaneOpen && !isArtifactMode ? '296px' : undefined
          }}
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



        {/* Sidebar */}
        <Sidebar
          open={sidebarOpen}
          activeSessionId={activeSessionId}
          onClose={() => setSidebarOpen(false)}
          onNewChat={handleNewChatRequest}
          onSelectSession={handleSelectSession}
          refreshTrigger={sidebarRefreshTrigger}
          user={user}
          onSettingsClick={showSettingsModal}
        />
      </div>
      {chatError && (
        <div className="text-red-500 text-sm text-center mt-2">{chatError}</div>
      )}
      




      {/* Search Pane - Right Edge Corner - Only show when NOT in search mode */}
      {(isSearchPaneOpen && activeMode !== 'search' && (isSearching || searchResults.length > 0 || searchStatus === 'error')) && (
        <div 
          className="fixed top-14 bottom-0 right-0 z-50 bg-[#161618] border-l border-gray-600/50" 
          style={{ 
            width: '280px'
          }}
        >
          <div className="h-full flex flex-col">
            {/* Search Pane Header */}
            <div className="flex items-center justify-between px-4 h-14">
              {/* Tab Navigation moved into header */}
              <div className="flex">
                {['Sources'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-1 text-sm font-medium transition-colors ${
                      activeTab === tab 
                        ? 'text-white' 
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Close button */}
              <button
                onClick={() => {
                  setIsSearchPaneOpen(false);
                  setActiveMode('chat');
                }}
                className="p-1 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                title="Close Search Pane"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {searchStatus !== 'idle' && searchResults.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                {searchStatus === 'error' ? (
                  <>
                    <span className="text-red-500 text-2xl mb-2">Search Failed</span>
                    <p className="text-gray-400 mb-4">{searchError}</p>
                  </>
                ) : (
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-200">Searching...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
                {/* Tab Content */}
                <div className="flex-1 px-4 py-4 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', height: '100%' }}>
                  {activeTab === 'Sources' && (
                    <div className="space-y-2 pb-4">
                      {textSources.map((result, index) => (
                        <motion.div
                          key={result.id || index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="bg-transparent p-2 rounded-lg transition-colors border-l-2 border-gray-500/50"
                        >
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                            onClick={() => setSelectedSource(result.url)}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <img 
                                src={getSourceIcon(result.url, result.favicon)} 
                                alt="" 
                                className="w-4 h-4 rounded-sm flex-shrink-0"
                                onError={(e) => {
                                  // Fallback to web icon if image fails to load
                                  e.currentTarget.src = '/icons/web-icon.svg';
                                }}
                              />
                              <span className="text-base text-gray-400 truncate">
                                {extractDomain(result.url)}
                              </span>
                              {index < 3 && (
                                <span className="flex-shrink-0 ml-auto bg-gray-700 text-gray-200 text-xs w-4 h-4 flex items-center justify-center rounded-full">
                                  {index + 1}
                                </span>
                              )}
                            </div>
                            <h3 className="font-normal text-white text-sm mb-1 hover:text-blue-400 transition-colors line-clamp-2">
                              {result.title}
                            </h3>
                            {result.snippet && (
                              <p className="text-base text-gray-300 leading-snug line-clamp-2">
                                {result.snippet}
                              </p>
                            )}
                          </a>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Artifact Viewer - Right Pane Split Screen */}
      {isArtifactMode && artifactContent && (
        <div 
          className="fixed top-0 right-0 bottom-0 z-[10000] bg-[#161618] border-l border-gray-700" 
          style={{ 
            width: `${artifactViewerWidth}%`,
            left: `${100 - artifactViewerWidth}%`
          }}
        >
          {/* Drag Handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1 bg-gray-600/30 hover:bg-gray-500/50 cursor-col-resize z-50 group"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-gray-400/60 rounded-full group-hover:bg-gray-300/80 transition-colors" />
          </div>
          
          <ArtifactViewer
            artifactId={artifactContent?.root_id || 'temp'}
            content={isArtifactStreaming ? artifactStreamingContent : (artifactContent?.content || '')}
            title={artifactContent?.title || 'Document'}
            onClose={() => {
              setIsArtifactMode(false);
              setArtifactContent(null);
              // If we were streaming, also reset streaming state
              if (isArtifactStreaming) {
                setIsArtifactStreaming(false);
                setArtifactStreamingContent('');
              }
            }}
            isStreaming={isArtifactStreaming}
            onContentUpdate={async (newContent: string) => {
              if (artifactContent) {
                const updatedMetadata = {
                    ...artifactContent.metadata,
                    wordCount: newContent.split(' ').length,
                    estimatedReadTime: `${Math.ceil(newContent.split(' ').length / 200)} min read`
                };
                
                // If no id, this is a new artifact
                if (!artifactContent.root_id || artifactContent.root_id === 'temp') {
                  try {
                    const newArtifact = await ArtifactV2Service.create({
                      user_id: user!.id,
                      session_id: activeSessionId || 'unknown',
                      title: artifactContent.title,
                      content_markdown: newContent,
                      metadata: updatedMetadata,
                      version: 1
                    });
                    
                    if (newArtifact) {
                      const updatedArtifact = {
                        ...artifactContent,
                        root_id: newArtifact.id!,
                        content: newContent,
                        metadata: updatedMetadata,
                    version: 1
                  };
                  setArtifactContent(updatedArtifact);
                      toast.success('Artifact created and saved!');
                    }
                  } catch (error) {
                    toast.error('Failed to create artifact');
                    console.error('Artifact create error:', error);
                  }
                } else {
                  // Existing artifact, update it
                  try {
                    const updated = await ArtifactV2Service.update(artifactContent.root_id, {
                      content_markdown: newContent,
                      metadata: updatedMetadata,
                    version: (artifactContent.version || 1) + 1
                    });
                    
                    if (updated) {
                      const updatedArtifact = {
                        ...artifactContent,
                        content: newContent,
                        metadata: updatedMetadata,
                        version: updated.version || (artifactContent.version || 1) + 1
                  };
                  setArtifactContent(updatedArtifact);
                      toast.success('Artifact updated and saved!');
                    }
                  } catch (error) {
                    toast.error('Failed to update artifact');
                    console.error('Artifact update error:', error);
                  }
                }
              }
              if (isArtifactStreaming) {
                setArtifactStreamingContent(newContent);
              }
              setMessages(prev => prev.map(msg => {
                if (msg.contentType === 'artifact' && msg.content) {
                  return {
                    ...msg,
                    content: newContent,
                    structuredContent: artifactContent ? {
                      ...msg.structuredContent,
                      content: newContent,
                      metadata: {
                        ...msg.structuredContent?.metadata,
                        wordCount: newContent.split(' ').length,
                        estimatedReadTime: `${Math.ceil(newContent.split(' ').length / 200)} min read`
                      }
                    } : msg.structuredContent
                  };
                }
                return msg;
              }));
            }}
          />
        </div>
      )}

      {/* Notion Auth Modal */}
      <NotionAuthModal
        isOpen={isNotionAuthModalOpen}
        onClose={() => setIsNotionAuthModalOpen(false)}
        onSuccess={handleNotionAuthSuccess}
      />

    </>
  );
}

export default function TestChat() {
  return (
    <AuthProvider>
      <TestChatComponent />
    </AuthProvider>
  );
}

// Add this helper function near the top or with other helpers:
function replaceLinksWithCitations(content: string, sources: any[]): string {
  if (!content || !Array.isArray(sources) || sources.length === 0) return content;
  let idx = 0;
  // Replace Markdown links [text](url) and bare URLs
  // Markdown links
  content = content.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (match: string, text: string, url: string) => {
    const sourceIdx = sources.findIndex((s: any) => s.url === url);
    if (sourceIdx !== -1) {
      return `${text} [${sourceIdx + 1}]`;
    } else if (idx < sources.length) {
      return `${text} [${++idx}]`;
    } else {
      return text;
    }
  });
  // Bare URLs
  content = content.replace(/(https?:\/\/[^\s)]+)/g, (url: string) => {
    const sourceIdx = sources.findIndex((s: any) => s.url === url);
    if (sourceIdx !== -1) {
      return `[${sourceIdx + 1}]`;
    } else if (idx < sources.length) {
      return `[${++idx}]`;
    } else {
      return '';
    }
  });
  return content;
}
// Utility to detect Bengali characters and wrap in a span
function wrapBengali(children: React.ReactNode): React.ReactNode {
  const bengaliRegex = /[\u0980-\u09FF]/;
  if (typeof children === 'string' && bengaliRegex.test(children)) {
    return <span className="bengali-text">{children}</span>;
  }
  if (Array.isArray(children)) {
    return React.Children.map(children, child => wrapBengali(child));
  }
  return children;
}

// Helper: extract first balanced JSON object string from content
function extractFirstJsonObject(text: string): string | null {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;
  let depth = 0;
  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(firstBrace, i + 1);
      }
    }
  }
  return null;
}
