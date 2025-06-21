"use client";
import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import AuthProvider, { useAuth } from '../../components/AuthProvider';
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
import Search from '@/components/Search';
import { Message as ConversationMessage } from "@/utils/conversation-context";
import { filterAIThinking } from '../../utils/content-filter';
import ThinkingButton from '@/components/ThinkingButton';
import { ArtifactViewer } from '@/components/ArtifactViewer';
import { shouldTriggerArtifact, getArtifactPrompt, artifactSchema, validateArtifactData, createFallbackArtifact, createArtifactFromRawContent, extractTitleFromContent, type ArtifactData } from '@/utils/artifact-utils';
import ReasoningDisplay from '@/components/ReasoningDisplay';
import { uploadAndAnalyzeImage, uploadImageToSupabase, analyzeImageWithNVIDIA, ImageUploadResult } from '@/lib/image-upload-service';
import toast from 'react-hot-toast';

// Define a type that includes all possible query types (including the ones in SCHEMAS and 'conversation')
type QueryType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation' | 'reasoning';

// Define types for query classification and content display
type QueryClassificationType = keyof typeof SCHEMAS;
type ContentDisplayType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation' | 'reasoning';

const BASE_SYSTEM_PROMPT = `You are Tehom AI, an advanced and thoughtful assistant designed to provide dynamic, adaptive responses. Your personality is friendly yet intelligent, approachable yet knowledgeable.

**Core Response Principles:**
- Adapt your response style and length based on the complexity and nature of the user's question
- For simple questions, provide concise, direct answers
- For complex topics, offer detailed explanations with examples and context
- Always use natural, conversational tone that feels engaging and human-like
- Write in markdown formatting dynamically to enhance readability

**Response Guidelines:**
- Be genuinely helpful and aim to fully address what the user is asking
- Show enthusiasm for interesting topics while remaining professional
- Use examples, analogies, or step-by-step explanations when they would be helpful
- If a question has multiple aspects, organize your response clearly
- Feel free to ask clarifying questions when the user's intent isn't clear

**Formatting:**
- Use markdown naturally (headers, lists, code blocks, emphasis) to structure information
- Keep formatting clean and purposeful - don't over-format simple responses
- For code or technical content, use appropriate syntax highlighting
- Structure longer responses with clear sections when helpful

**Tone and Style:**
- Be warm and approachable, like talking to a knowledgeable friend
- Show genuine interest in helping solve problems or explaining concepts
- Avoid being overly formal or robotic
- Use "I" statements when appropriate to make responses feel more personal
- Acknowledge when you're uncertain and explain your reasoning

Remember: Your goal is to be genuinely useful while maintaining an engaging, thoughtful conversational style. Adapt to what each user needs in the moment.`;

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
const getDefaultChatPrompt = (basePrompt: string) => {
  return `${basePrompt}

You are Tehom AI, a helpful and intelligent assistant who provides direct, clear answers without showing your thinking process.

IMPORTANT: Do NOT show your internal reasoning, analysis, or thought process. Give direct answers only.

Your response style:
- Provide clear, direct answers immediately
- Skip explanations of how you arrived at the answer
- Do not show step-by-step reasoning or analysis
- Be concise and to the point
- Answer the question directly without preamble

Your tone is friendly and helpful, but focused on giving the answer the user needs without extra explanation.

Use markdown formatting naturally:
- **Bold** for important terms
- *Italics* for emphasis
- Bullet points for lists
- Code blocks for technical content
- Keep formatting simple and clean

Be conversational but direct - answer first, elaborate only if specifically asked.`;
};

const getThinkPrompt = (basePrompt: string) => {
  return `You are Tehom AI, an advanced assistant built for deep reasoning, clarity, and thoughtful analysis. You always aim to think before answering and explain complex ideas in a natural, human-like tone.

You always use markdown formatting in your replies to organize your output cleanly — including headings, bullet points, code blocks, and emphasis when helpful.

Your responses should be thorough and well-reasoned. Take time to consider different aspects of the question, analyze relevant factors, and provide comprehensive answers with examples and explanations.

You are here to help users understand not just the answer, but provide deep insights and clear explanations. Think deeply, then explain clearly.`;
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
  const [activeMode, setActiveMode] = useState<'chat' | 'search'>('chat');
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
  const [leftPaneWidth, setLeftPaneWidth] = useState(55); // Default 55% for left pane
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(55);

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

  // Additional missing state variables
  const [showHeading, setShowHeading] = useState(true);
  
  // Image upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageWaitingForResponse, setImageWaitingForResponse] = useState<string | null>(null);


  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInitialLoadRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null); // Store session ID for immediate access

  // Constants
  const BASE_HEIGHT = 48;
  const MAX_HEIGHT = BASE_HEIGHT * 3;
  const EXTRA_GAP = 32;
  
  // Computed values
  const isChatEmpty = messages.length === 0;
  const inputPosition = isChatEmpty && !hasInteracted && !activeSessionId ? "center" : "bottom";

  // Mouse event handlers for resizable divider
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(leftPaneWidth);
  }, [leftPaneWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - resizeStartX;
    const containerWidth = window.innerWidth;
    const deltaPercent = (deltaX / containerWidth) * 100;
    const newWidth = Math.max(30, Math.min(70, resizeStartWidth + deltaPercent)); // Constrain between 30% and 70%
    
    setLeftPaneWidth(newWidth);
  }, [isResizing, resizeStartX, resizeStartWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
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
  }, [isResizing, handleMouseMove, handleMouseUp]);

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
          
          // ONLY set messages if we're not in the middle of an active conversation
          // This prevents overwriting messages during first message flow
          if (!isAiResponding && !isLoading) {
          setMessages(processedMessages);
            setShowHeading(processedMessages.length === 0);
            setHasInteracted(processedMessages.length > 0);
          }
          
          console.log('[Session Load] Session loaded successfully:', sessionIdToLoad);
        } else {
          // Show welcome page for new users
          setShowHeading(true);
          setHasInteracted(false);
          setActiveSessionId(null);
          setMessages([]);
          
          // Clear URL if no session to load (ensure clean state)
          if (typeof window !== 'undefined' && window.location.pathname !== '/test') {
            window.history.replaceState(null, '', '/test');
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

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-scroll during live reasoning streaming
  useEffect(() => {
    if (scrollRef.current && liveReasoning) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [liveReasoning]);

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
  }, [messages, isAiResponding, liveReasoning]);



  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    
    // Handle image analysis if we have selected files
    if (selectedFiles.length > 0) {
      const file = selectedFiles[0];
      
      try {
        // Ensure we have an active session
        const currentActiveSessionId = await ensureActiveSession('Image uploaded and analyzed');
        
        // 1. IMMEDIATELY show user message with image (with shining effect)
        const userMessageId = uuidv4();
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
        
        const analysisResult = await analyzeImageWithNVIDIA(file, input.trim(), { stream: true });

        if (!analysisResult.success || !analysisResult.stream) {
          throw new Error(analysisResult.error || 'Failed to start analysis stream');
        }
        
        const reader = analysisResult.stream.getReader();
        const decoder = new TextDecoder('utf-8');
        let contentBuffer = '';
        let firstChunkReceived = false;

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

    // First check if we're in search mode
    if (activeMode === 'search') {
      // Ensure we have an active session using consolidated function
      const currentActiveSessionId = await ensureActiveSession(input.trim());

      if (!hasInteracted) setHasInteracted(true);
      if (showHeading) setShowHeading(false);

      // Add user message to chat and save instantly
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
        console.log('[Search Mode] User message saved instantly');
      } catch (error) {
        console.error('[Search Mode] Failed to instantly save user message:', error);
      }

      // Create a placeholder message for search results that will use the Search component
      const searchMessageId = uuidv4();
      const searchPlaceholder: LocalMessage = {
          role: 'search-ui',
        id: searchMessageId,
        content: "Searching for: " + input,
          query: input,
          timestamp: Date.now(),
        isProcessed: false,
        isStreaming: false
      };
      
      setMessages(prev => [...prev, searchPlaceholder]);
      
      // INSTANT SAVE: Save search placeholder immediately
      try {
        await saveMessageInstantly(currentActiveSessionId, searchPlaceholder);
        console.log('[Search Mode] Search placeholder saved instantly');
      } catch (error) {
        console.error('[Search Mode] Failed to instantly save search placeholder:', error);
      }
      
      setInput('');
      setIsLoading(true);
      
      // The actual search will be handled by the Search component in renderSearchMessage
      // This simplifies the code here and ensures consistent search behavior
      
      return;
    }

    // Check if we're in artifact mode
    if (activeButton === 'artifact' || shouldTriggerArtifact(input.trim())) {
      // Ensure we have an active session using consolidated function
      const currentActiveSessionId = await ensureActiveSession(input.trim());

      if (!hasInteracted) setHasInteracted(true);
      if (showHeading) setShowHeading(false);

      // Generate AI title quickly based on user input
      const generateQuickTitle = (query: string): string => {
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('essay') || lowerQuery.includes('write about')) {
          return query.replace(/write|create|essay|about/gi, '').trim() || 'Generated Essay';
        } else if (lowerQuery.includes('guide') || lowerQuery.includes('tutorial')) {
          return query.replace(/guide|tutorial|how to/gi, '').trim() + ' Guide' || 'User Guide';
        } else if (lowerQuery.includes('report') || lowerQuery.includes('analysis')) {
          return query.replace(/report|analysis|analyze/gi, '').trim() + ' Analysis' || 'Analysis Report';
        }
        return query.length > 50 ? query.substring(0, 50) + '...' : query;
      };

      const quickTitle = generateQuickTitle(input.trim());

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
        console.log('[Artifact Mode] User message saved instantly');
      } catch (error) {
        console.error('[Artifact Mode] Failed to instantly save user message:', error);
      }
      
      setInput('');
      setIsLoading(true);
      setIsAiResponding(true);
      setIsArtifactStreaming(true);
      setArtifactStreamingContent('');
      setArtifactProgress('Initializing artifact generation...');

      // Add immediate preview card with generated title and save instantly
      const aiMessageId = uuidv4();
      const previewMessage: LocalMessage = {
        role: 'assistant',
        id: aiMessageId,
        content: 'Creating your artifact...',
        timestamp: Date.now(),
        parentId: userMessageId,
        contentType: 'artifact',
        title: quickTitle,
        isStreaming: true,
        isProcessed: false
      };
      
      setMessages(prev => [...prev, previewMessage]);
      
      // INSTANT SAVE: Save AI preview message immediately
      try {
        await saveMessageInstantly(currentActiveSessionId, previewMessage);
        console.log('[Artifact Mode] AI preview message saved instantly');
      } catch (error) {
        console.error('[Artifact Mode] Failed to instantly save AI preview message:', error);
      }

      // Auto-open right pane immediately with placeholder content
      setIsArtifactMode(true);
      
      // Create initial placeholder artifact for streaming
      const placeholderArtifact = {
        type: 'document' as const,
        title: quickTitle,
        content: '',
        metadata: {
          wordCount: 0,
          estimatedReadTime: '0 minutes',
          category: 'General Document',
          tags: ['document', 'ai-generated']
        }
      };
      setArtifactContent(placeholderArtifact);

      try {
        // Call NVIDIA API with artifact prompt and streaming enabled
        const artifactPrompt = getArtifactPrompt(input.trim());
        
        const response = await fetch('/api/nvidia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: artifactPrompt }],
            temperature: 0.3,
            max_tokens: 8192,
            mode: 'artifact',
            stream: true // Enable streaming for artifacts
          })
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }

        let rawContent = '';
        let hasStartedContent = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    rawContent += content;
                    setArtifactStreamingContent(rawContent);
                    
                    // Update progress based on content progress
                    if (!hasStartedContent && rawContent.trim().length > 0) {
                      setArtifactProgress('Writing content...');
                      hasStartedContent = true;
                    }

                    // DIRECT STREAMING: Update artifact with raw content immediately
                    const words = rawContent.split(/\s+/).filter(word => word.length > 0).length;
                    const estimatedTime = Math.max(1, Math.ceil(words / 200));
                    
                    // Extract title from content as it streams
                    const currentTitle = extractTitleFromContent(rawContent, input.trim()) || quickTitle;
                    
                    // Update artifact content in real-time with raw markdown
                    setArtifactContent(prev => ({
                      type: 'document' as const,
                      title: currentTitle,
                      content: rawContent,
                      metadata: {
                        wordCount: words,
                        estimatedReadTime: `${estimatedTime} minute${estimatedTime !== 1 ? 's' : ''}`,
                        category: prev?.metadata.category || 'General Document',
                        tags: prev?.metadata.tags || ['document', 'ai-generated']
                      }
                    }));
                  }
                } catch (parseError) {
                  // Continue streaming even if individual chunks fail to parse
                  console.warn('Failed to parse streaming chunk:', parseError);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Create final artifact from raw content
        const finalArtifactData = createArtifactFromRawContent(rawContent, input.trim());
        
        // Set final artifact content
        setArtifactContent(finalArtifactData);

        // Update the AI message with final artifact
        const finalAiMessage: LocalMessage = {
          role: 'assistant',
          id: aiMessageId,
          content: `I've created a ${finalArtifactData.type} titled "${finalArtifactData.title}". Click to view it in the artifact viewer.`,
          timestamp: Date.now(),
          parentId: userMessageId,
          contentType: 'artifact',
          structuredContent: finalArtifactData,
          isProcessed: true,
          isStreaming: false
        };

        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? finalAiMessage : msg
        ));
        
        // FAST SAVE: Save complete artifact message instantly
        try {
          await saveMessageInstantly(currentActiveSessionId, finalAiMessage);
          console.log('[Artifact Mode] Final AI message saved instantly');
        } catch (error) {
          console.error('[Artifact Mode] Failed to instantly save AI message:', error);
        }

      } catch (error) {
        console.error('Artifact streaming error:', error);
        
        // Update the AI message with a more helpful error message
        const errorMessage: LocalMessage = {
          role: 'assistant',
          id: aiMessageId,
          content: error instanceof Error && error.message.includes('504') 
            ? `Sorry, I encountered an error while creating the artifact: API request failed: 504. The artifact generation timed out because it was taking too long. Please try again with a simpler request or try again later.`
            : `Sorry, I encountered an error while creating the artifact: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
          parentId: userMessageId,
          isProcessed: true,
          isStreaming: false
        };

        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? errorMessage : msg
        ));
      } finally {
        setIsLoading(false);
        setIsAiResponding(false);
        setIsArtifactStreaming(false);
        setArtifactStreamingContent('');
        setArtifactProgress('');
        setActiveButton(null); // Reset artifact mode
      }

      return;
    }

    // If we get here, we're in default chat mode
    let userMessageId = '';


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

      // @ts-ignore - TypeScript has trouble with activeMode scope in this context
      if (activeMode === 'search') {
        turnSpecificSystemPrompt = getSearchPrompt(BASE_SYSTEM_PROMPT);
      } else if (activeButton === 'reasoning') {
        // Use specialized Think prompt for reasoning mode
        turnSpecificSystemPrompt = getThinkPrompt(BASE_SYSTEM_PROMPT);
      } else {
        // Use default chat prompt for regular chat
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
        const chatMode = activeButton === 'reasoning' ? 'reasoning' : 'chat';
        
        // Add mode to the API payload for proper API key selection
        apiPayload.mode = chatMode;

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
                    
                    // Only extract think content for reasoning mode
                    if (activeButton === 'reasoning') {
                      // Separate thinking and main content in real-time for reasoning mode
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
                        setLiveReasoning(thinkContent);
                        setCurrentReasoningMessageId(aiMessageId);
                      }
                      } else {
                      // For default chat, use content directly without think processing
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
            // For reasoning mode, extract and embed think content
          const { thinkContent: finalThinkContent, mainContent: finalMainContent } = extractThinkContentDuringStream(contentBuffer);
          
            // 1. Update UI immediately (no delays)
          setMessages((prev) => {
            return prev.map(msg => 
              msg.id === aiMessageId 
                ? { 
                    ...msg, 
                      isStreaming: false,
                      content: finalThinkContent.trim().length > 0 
                        ? `<think>${finalThinkContent}</think>${finalMainContent}` 
                        : finalMainContent,
                      contentType: 'reasoning',
                      isProcessed: true,
                  }
                : msg
            );
          });
          
            // 2. Save final content instantly in background (no setTimeout delays)
            const currentSessionId = sessionIdRef.current;
            if (currentSessionId && aiMessageId) {
              const finalContent = finalThinkContent.trim().length > 0 
                ? `<think>${finalThinkContent}</think>${finalMainContent}` 
                : finalMainContent;
              
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
      // Add file to selected files immediately (shows loading state)
      setSelectedFiles([file]);
      setImagePreviewUrls(['']); // Empty string shows loading state

      // Upload to Supabase only
      const uploadResult = await uploadImageToSupabase(file);
      
      if (uploadResult.success && uploadResult.url) {
        // Create preview URL and update state
        const previewUrl = URL.createObjectURL(file);
        setImagePreviewUrls([previewUrl]);
        setUploadedImageUrls([uploadResult.url]); // Store Supabase URL
        
        toast.success('Image uploaded successfully! Click send to analyze.');
      } else {
        // Remove from selected files if upload failed
        setSelectedFiles([]);
        setImagePreviewUrls([]);
        setUploadedImageUrls([]);
        toast.error(uploadResult.error || 'Failed to upload image');
      }
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
    
    // Navigate to main test page for new chat
    router.push('/test', { scroll: false });
  };

  // Enhanced artifact preview card component (Claude-like)
  const renderArtifactPreviewCard = (title: string, isStreaming: boolean, progress: string) => (
    <div 
      className="bg-gray-800 rounded-lg border border-gray-600 p-4 cursor-pointer hover:bg-gray-750 transition-colors"
      onClick={() => {
        if (!isStreaming && artifactContent) {
          setArtifactContent(artifactContent);
          setIsArtifactMode(true);
        }
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-cyan-500/20 rounded-lg flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="13" x2="15" y2="13"></line>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-lg truncate">{title}</h3>
          <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
            <span>Document</span>
            {isStreaming && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-cyan-400">Writing...</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {progress && (
        <div className="text-xs text-gray-300 mb-3 bg-gray-700/50 rounded p-2">
          {progress}
        </div>
      )}
      
      {isStreaming ? (
        <div className="bg-cyan-500 text-white px-4 py-2 rounded-lg font-medium text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Creating artifact...</span>
          </div>
        </div>
      ) : (
        <div className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-center transition-colors">
          <div className="flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>View in Artifact Viewer</span>
          </div>
        </div>
      )}
    </div>
  );

  // Fix the renderMessageContent function to use LocalMessage
  const renderMessageContent = (msg: LocalMessage) => {
    // Handle artifact streaming progress with enhanced preview card
    if (msg.contentType === 'artifact' && msg.isStreaming && !msg.isProcessed) {
      const title = msg.title || 'Generated Document';
      return renderArtifactPreviewCard(title, true, artifactProgress);
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
            `${artifactData.metadata?.wordCount || 0} words • ${artifactData.metadata?.estimatedReadTime || '2 minutes'}`
          );
        case 'reasoning':
          return <ReasoningDisplay data={msg.structuredContent as string} />;
        default:
          if (typeof msg.structuredContent === 'string') {
            return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} className="prose dark:prose-invert max-w-none">{msg.structuredContent}</ReactMarkdown>;
          }
          return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} className="prose dark:prose-invert max-w-none">{`Unsupported structured content: ${JSON.stringify(msg.structuredContent)}`}</ReactMarkdown>;
      }
    } else if (msg.content) {
      const isDefaultChat = (msg.contentType === 'conversation' || msg.contentType === 'reasoning' || (msg.role === 'assistant' && !msg.contentType));
      if (isDefaultChat) {
        // Display content using standard ReactMarkdown with math rendering support
        return (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]} 
            rehypePlugins={[rehypeRaw, rehypeKatex]} 
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
        return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} className="prose dark:prose-invert max-w-none">{msg.content}</ReactMarkdown>;
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

  const TypingIndicator = () => (
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

  // Helper function to clean artifact content by removing all thinking tags
  const cleanArtifactContent = (content: string): string => {
    if (!content) return '';
    
    let result = content;
    
    // Remove any leading/trailing code fences
    result = result.replace(/^```[a-zA-Z]*\n/, '').replace(/```$/, '');
    
    // Remove all <think>...</think> tags completely
    result = result.replace(/<think>[\s\S]*?<\/think>/g, '');
    
    // Remove any <think-live></think-live> markers
    result = result.replace(/<think-live><\/think-live>/g, '');
    
    // Remove any thinking indicators
    result = result.replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '');
    
    // Clean up extra whitespace that might be left behind
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    
    return result;
  };

  // Independent artifact message rendering system
  const renderArtifactMessage = (msg: LocalMessage, i: number) => {
    // Clean the content to remove all thinking tags for artifacts
    const cleanContent = cleanArtifactContent(msg.content);
    
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
            <div className="w-full bg-gray-800 rounded-lg border border-gray-700 p-4 mb-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="9" x2="15" y2="9"></line>
                    <line x1="9" y1="13" x2="15" y2="13"></line>
                  </svg>
              </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">{msg.structuredContent.title}</h3>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="capitalize">{msg.structuredContent.type}</span>
                    <span>{msg.structuredContent.metadata.wordCount} words</span>
                    <span>{msg.structuredContent.metadata.estimatedReadTime}</span>
        </div>
                </div>
                </div>

              <p className="text-gray-300 text-xs mb-4">{cleanContent}</p>
              
                    <button
                onClick={() => {
                  // Clean the structured content before passing to artifact viewer
                  const cleanedArtifact = {
                    ...msg.structuredContent,
                    content: cleanArtifactContent(msg.structuredContent.content)
                  };
                  setArtifactContent(cleanedArtifact);
                  setIsArtifactMode(true);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                View in Artifact Viewer
                    </button>
              </div>

            {/* Action buttons for completed artifact */}
            {msg.isProcessed && (
              <div className="w-full flex justify-start gap-2 mt-2">
                    <button 
                  onClick={() => handleCopy(cleanArtifactContent(msg.structuredContent.content))}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                  aria-label="Copy artifact content"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
                  <span className="text-xs">Copy</span>
            </button>

            <button
                  onClick={() => {
                    const cleanedContent = cleanArtifactContent(msg.structuredContent.content);
                    const blob = new Blob([cleanedContent], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${msg.structuredContent.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                  aria-label="Download artifact"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7,10 12,15 17,10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
                  <span className="text-xs">Download</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Streaming Artifact - show clean content in artifact viewer style */}
            <div className="w-full bg-gray-800 rounded-lg border border-gray-700 p-4 mb-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="9" x2="15" y2="9"></line>
                    <line x1="9" y1="13" x2="15" y2="13"></line>
                        </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">
                    {msg.title || "Generating Artifact..."}
                    {msg.isStreaming && (
                      <span className="inline-block ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    )}
                  </h3>
                                      <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>Essay</span>
                    {msg.isStreaming ? (
                      <span>Streaming...</span>
                    ) : (
                      <span>Ready</span>
                    )}
                  </div>
                </div>
          </div>
              
              {/* Streaming artifact content preview - cleaned of thinking tags */}
              <div className="text-gray-300 text-xs mb-4 max-h-32 overflow-hidden">
                <ReactMarkdown className="prose prose-sm prose-invert">
                  {cleanContent.slice(0, 200) + (cleanContent.length > 200 ? "..." : "")}
                </ReactMarkdown>
      </div>

              <button
                onClick={() => {
                  // For streaming artifacts, create temporary structured content with cleaned content
                  const tempArtifact = {
                    title: msg.title || "Generated Content",
                    type: "document" as const,
                    content: cleanContent,
                    metadata: {
                      wordCount: cleanContent.split(' ').length,
                      estimatedReadTime: `${Math.ceil(cleanContent.split(' ').length / 200)} min read`,
                      category: "", // placeholder category
                      tags: [] // placeholder tags
                    }
                  };
                  setArtifactContent(tempArtifact);
                  setIsArtifactMode(true);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                disabled={!cleanContent || cleanContent.trim().length === 0}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                View in Artifact Viewer
              </button>
            </div>
            
            {/* Action buttons for streaming artifact */}
            {cleanContent && cleanContent.trim().length > 0 && (
                        <div className="w-full flex justify-start gap-2 mt-2">
                          <button
                  onClick={() => handleCopy(cleanContent)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-neutral-800/50 text-white opacity-80 hover:opacity-100 hover:bg-neutral-800 transition-all"
                  aria-label="Copy artifact content"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span className="text-xs">Copy</span>
                          </button>
                        </div>
            )}
          </>
                      )}
                    </motion.div>
                  );
  };
                
  // Independent search message rendering system
  const renderSearchMessage = (msg: LocalMessage, i: number) => {
                  return (
                    <motion.div
        key={msg.id + '-search-' + i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full"
      >
        {msg.isProcessed ? (
          <>
            {/* Render search results with proper formatting */}
            <div className="search-result-container bg-gray-900/50 rounded-lg p-4 mb-4">
              <h3 className="text-xl font-semibold text-cyan-400 mb-3">Search Results for: {msg.query}</h3>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="search-result-output">
                {msg.content}
              </ReactMarkdown>
              
              {/* Display web sources if available */}
              {msg.webSources && msg.webSources.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-white mb-2">Sources:</h4>
                          <WebSourcesCarousel sources={msg.webSources} />
                </div>
              )}
            </div>
          </>
        ) : (
          // Show Search component with progress for unprocessed messages
          <Search 
            query={msg.query || ''} 
            onComplete={(result, sources) => {
              // Update the message with the search results when complete
              setMessages(prev => prev.map(m => 
                m.id === msg.id 
                  ? {
                      ...m,
                      content: result,
                      isProcessed: true,
                      isStreaming: false,
                      webSources: sources
                    } 
                  : m
              ));
              
              // FAST SAVE: Save complete search message instantly
              const currentSessionId = sessionIdRef.current || activeSessionId;
              if (currentSessionId) {
                const completeSearchMessage: LocalMessage = {
                  role: 'search-ui',
                  id: msg.id!,
                      content: result,
                  query: msg.query,
                  timestamp: Date.now(),
                      isProcessed: true,
                      isStreaming: false,
                      webSources: sources
                };
                
                saveMessageInstantly(currentSessionId, completeSearchMessage).catch(error => {
                  console.error('[Search Mode] Failed to instantly save complete search message:', error);
                });
                    } 
            }} 
          />
                      )}
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
                      {msg.webSources && msg.webSources.length > 0 && (
                        <>
                          <WebSourcesCarousel sources={msg.webSources} />
                          <div style={{ height: '1.5rem' }} />
                        </>
                      )}
                      
                      {isStoppedMsg ? (
                        <span className="text-xs text-white italic font-light mb-2">[Response stopped by user]</span>
                      ) : (
                        <div className="w-full max-w-full overflow-hidden" style={{ minHeight: showTypingIndicator ? '2.5rem' : 'auto' }}>
                          {/* Single ReactMarkdown renderer for both streaming and final states */}
                          {showTypingIndicator ? (
                            <TypingIndicator />
                          ) : (
                            finalContent.trim().length > 0 && (
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm, remarkMath]} 
                                rehypePlugins={[rehypeRaw, rehypeKatex]} 
                                className="research-output"
                                components={{
                                  h1: ({ children }) => (<h1 className="text-3xl font-bold mb-6 mt-8 border-b border-cyan-500/30 pb-3" style={{ color: '#FCFCFC' }}>{children}</h1>),
                                  h2: ({ children }) => (<h2 className="text-2xl font-semibold mb-4 mt-8 flex items-center gap-2" style={{ color: '#FCFCFC' }}>{children}</h2>),
                                  h3: ({ children }) => (<h3 className="text-xl font-semibold mb-3 mt-6" style={{ color: '#FCFCFC' }}>{children}</h3>),
                                  p: ({ children }) => (<p className="leading-relaxed mb-4 text-sm" style={{ color: '#FCFCFC' }}>{children}</p>),
                                  ul: ({ children }) => (<ul className="space-y-2 mb-4 ml-4">{children}</ul>),
                                  li: ({ children }) => (<li className="flex items-start gap-2" style={{ color: '#FCFCFC' }}><span className="text-cyan-400 mt-1.5 text-xs">●</span><span className="flex-1">{children}</span></li>),
                                  ol: ({ children }) => (<ol className="space-y-2 mb-4 ml-4 list-decimal list-inside">{children}</ol>),
                                  strong: ({ children }) => (<strong className="font-semibold" style={{ color: '#FCFCFC' }}>{children}</strong>),
                                  table: ({ children }) => (<div className="overflow-x-auto mb-6 max-w-full scrollbar-thin"><table className="border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>{children}</table></div>),
                                  thead: ({ children }) => <thead className="">{children}</thead>,
                                  th: ({ children }) => (<th className="px-4 py-3 text-left font-semibold border-b-2 border-gray-600" style={{ fontSize: '14px', color: '#FCFCFC' }}>{children}</th>),
                                  td: ({ children }) => (<td className="px-4 py-3 border-b border-gray-700" style={{ fontSize: '14px', color: '#FCFCFC' }}>{children}</td>),
                                  blockquote: ({ children }) => (<blockquote className="border-l-4 border-cyan-500 pl-4 py-2 rounded-r-lg mb-4 italic" style={{ background: 'transparent', color: '#FCFCFC' }}>{children}</blockquote>),
                                  code: ({ children, className }) => {
                                    const isInline = !className;
                                    return isInline
                                      ? (<code className="px-2 py-1 rounded text-xs font-mono" style={{ background: 'rgba(55, 65, 81, 0.5)', color: '#FCFCFC' }}>{children}</code>)
                                      : (<code className="block p-4 rounded-lg overflow-x-auto text-xs font-mono mb-4" style={{ background: 'rgba(17, 24, 39, 0.8)', color: '#FCFCFC' }}>{children}</code>);
                                  }
                                }}
                              >
                                {finalContent}
                              </ReactMarkdown>
                            )
                          )}
                        </div>
                      )}
                  
                      {/* Action buttons for text content */}
                      {msg.isProcessed && !isStoppedMsg && (
                        <div className="w-full flex justify-start gap-2 mt-2">
                          <button
                            onClick={() => handleCopy(finalContent)}
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
  };

  // Add new renderer below default one
  const renderReasoningMessage = (msg: LocalMessage, i: number) => {
    const { content: rawContent } = cleanAIResponse(msg.content);
    const cleanContent = rawContent.replace(/<thinking-indicator.*?>\n<\/thinking-indicator>\n|<thinking-indicator.*?\/>/g, '');

    const { processedContent, thinkBlocks } = processThinkTags(cleanContent);
    
    // Always ensure we have thinking content to display in Think mode
    let thinkingContentToShow = '';
    let finalAnswerContent = processedContent;
    
    if (thinkBlocks.length > 0) {
      // Use extracted think blocks if available
      thinkingContentToShow = thinkBlocks[0].content;
    } else {
      // If no think tags, extract reasoning from the content
      if (isReasoningContent(processedContent)) {
        // Extract reasoning content and final answer
        const extractedAnswer = extractFinalAnswer(processedContent);
        if (extractedAnswer && extractedAnswer !== processedContent) {
          // We found a final answer, so the rest is reasoning
          thinkingContentToShow = processedContent.replace(extractedAnswer, '').trim();
          finalAnswerContent = extractedAnswer;
        } else {
          // Treat first part as reasoning, last part as answer
          const paragraphs = processedContent.split('\n\n');
          if (paragraphs.length > 1) {
            thinkingContentToShow = paragraphs.slice(0, -1).join('\n\n');
            finalAnswerContent = paragraphs[paragraphs.length - 1];
          } else {
            // If single paragraph, show it as thinking content with a generic final answer
            thinkingContentToShow = processedContent;
            finalAnswerContent = "Based on my analysis above, I've provided my reasoning and conclusions.";
          }
        }
      } else {
        // If content doesn't seem like reasoning, create a generic thinking message
        thinkingContentToShow = "Let me analyze this question and provide a thoughtful response.";
        finalAnswerContent = processedContent;
      }
    }
    
    const finalContent = makeCitationsClickable(finalAnswerContent, msg.webSources || []);

                return (
      <React.Fragment key={msg.id + '-reasoning-' + i}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full text-left flex flex-col items-start ai-response-text mb-4 relative"
          style={{ color: '#FCFCFC' }}
        >
          {/* Live reasoning box - during streaming */}
          {currentReasoningMessageId === msg.id && liveReasoning && (
            <ThinkingButton content={liveReasoning} isLive={true} mode="reasoning" />
          )}

          {/* Always show thinking content in Think mode - either from think blocks or extracted reasoning */}
          {currentReasoningMessageId !== msg.id && thinkingContentToShow && (
            <ThinkingButton 
              key={`${msg.id}-think-consistent`} 
              content={thinkingContentToShow} 
              isLive={false} 
              mode="reasoning" 
            />
          )}

          <ReasoningDisplay data={finalContent.replace(/<!-- think-block-\d+ -->/g, '')} />
        </motion.div>
      </React.Fragment>
    );
  };

                return (
    <>
      <div 
        className="min-h-screen flex flex-col px-4 sm:px-4 md:px-8 lg:px-0 transition-all duration-300" 
        style={{ 
          background: '#161618',
          width: isArtifactMode ? `${leftPaneWidth}%` : '100%'
        }}
      >
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
              {/* Image Preview inside input box */}
              {(selectedFiles.length > 0 || imagePreviewUrls.length > 0) && (
                <div className="w-full px-2 py-2">
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
                    className="w-full border-none outline-none bg-transparent px-2 py-1 text-gray-200 text-sm placeholder-gray-500 resize-none overflow-auto self-center rounded-lg"
                    placeholder="Ask anything..."
            disabled={isLoading}
            rows={1}
                    style={{ maxHeight: '96px', minHeight: '40px', lineHeight: '1.5' }}
                  />
                </div>

                {/* Actions row */}
                <div className="flex flex-row w-full items-center justify-between gap-2">
                  {/* Left group: Tab bar with Search, Artifact, Think */}
                  <div className="flex flex-row items-center rounded-lg p-1" style={{ backgroundColor: '#161618' }}>
                    {/* Search tab */}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch(activeMode === 'search' ? 'chat' : 'search')}
                      className={`
                        flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                      </svg>
                    </button>

                    {/* Artifact tab */}
                    <button
                      type="button"
                      className={`
                        flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 
                        ${activeButton === 'artifact' 
                          ? 'border' 
                          : 'hover:brightness-150'
                        }
                      `}
                      style={{ 
                        color: activeButton === 'artifact' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)',
                        borderColor: activeButton === 'artifact' ? '#FCFCFC' : 'transparent'
                      }}
                      onClick={() => handleButtonClick('artifact')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="9" x2="15" y2="9"></line>
                        <line x1="9" y1="13" x2="15" y2="13"></line>
                      </svg>
                    </button>

                    {/* Think tab */}
                    <button
                      type="button"
                      className={`
                        flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 
                        ${activeButton === 'reasoning' 
                          ? 'border' 
                          : 'hover:brightness-150'
                        }
                      `}
                      style={{ 
                        color: activeButton === 'reasoning' ? '#FCFCFC' : 'rgba(252, 252, 252, 0.6)',
                        borderColor: activeButton === 'reasoning' ? '#FCFCFC' : 'transparent'
                      }}
                      onClick={() => handleButtonClick('reasoning')}
                    >
                      <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 32 32" 
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path 
                          fill="currentColor" 
                          d="M10.799 4.652c-1.485 0.324-2.271 2.045-2.104 4.593 0.051 0.738 0.043 0.666 0.196 1.609 0.064 0.38 0.107 0.7 0.098 0.709-0.008 0.013-0.269 0.077-0.572 0.149-2.019 0.465-3.505 1.165-4.397 2.070-0.602 0.606-0.854 1.17-0.845 1.882 0.004 0.401 0.137 0.841 0.38 1.264 0.209 0.363 0.956 1.101 1.447 1.434 1.029 0.692 1.345 0.79 1.626 0.508 0.12-0.119 0.145-0.179 0.145-0.32 0-0.273-0.094-0.405-0.414-0.581-1.409-0.781-2.147-1.592-2.147-2.369 0-0.282 0.098-0.538 0.333-0.845 0.619-0.824 2.113-1.562 4.115-2.036 0.529-0.124 0.632-0.132 0.632-0.043 0 0.115 0.427 1.481 0.7 2.228l0.273 0.751-0.337 0.645c-0.184 0.354-0.448 0.892-0.585 1.2-1.959 4.316-2.284 7.743-0.867 9.152 0.333 0.333 0.606 0.487 1.054 0.602 1.033 0.265 2.399-0.132 3.931-1.144 0.534-0.354 0.653-0.487 0.653-0.721 0-0.282-0.307-0.555-0.581-0.512-0.077 0.013-0.376 0.179-0.662 0.367-0.632 0.422-1.34 0.773-1.853 0.926-0.525 0.154-1.093 0.162-1.417 0.021-0.995-0.44-1.225-2.215-0.606-4.678 0.29-1.17 0.956-2.928 1.558-4.128l0.239-0.482 0.132 0.299c0.248 0.572 1.212 2.437 1.588 3.073 2.079 3.534 4.422 6.125 6.501 7.184 1.473 0.751 2.689 0.683 3.517-0.201 0.61-0.645 0.909-1.584 0.96-2.992 0.081-2.425-0.709-5.579-2.254-8.96-0.205-0.453-0.41-0.862-0.448-0.905-0.094-0.102-0.333-0.171-0.495-0.137s-0.359 0.231-0.388 0.397c-0.034 0.158 0.004 0.265 0.384 1.088 1.059 2.284 1.801 4.683 2.087 6.744 0.094 0.679 0.111 2.151 0.026 2.604-0.085 0.457-0.252 0.931-0.431 1.204-0.286 0.44-0.615 0.619-1.157 0.615-1.609-0.004-4.145-2.215-6.399-5.571-1.037-1.55-1.993-3.3-2.732-5.011l-0.265-0.61 0.371-0.627c0.478-0.811 0.982-1.579 1.545-2.369l0.448-0.627h0.692c4.747 0 9.459 1.076 11.867 2.702 0.551 0.371 1.080 0.914 1.264 1.289 0.128 0.265 0.145 0.337 0.145 0.64-0.004 0.286-0.021 0.376-0.119 0.563-0.294 0.572-1.042 1.14-2.079 1.592-0.487 0.209-0.64 0.354-0.64 0.602 0 0.23 0.094 0.397 0.273 0.482 0.196 0.094 0.265 0.085 0.581-0.043 1.49-0.602 2.565-1.49 2.903-2.395 0.623-1.665-0.683-3.347-3.564-4.602-2.518-1.101-6.219-1.789-10.070-1.87l-0.423-0.009 0.482-0.555c0.555-0.645 1.78-1.87 2.305-2.309 1.246-1.050 2.361-1.716 3.321-1.989 0.474-0.137 1.059-0.132 1.362 0.004 0.41 0.184 0.696 0.598 0.854 1.238 0.098 0.388 0.098 1.575 0 2.147-0.111 0.632-0.098 0.743 0.073 0.913 0.124 0.124 0.175 0.145 0.354 0.145 0.38 0 0.478-0.141 0.593-0.832 0.060-0.354 0.081-0.692 0.081-1.387 0-0.811-0.013-0.965-0.098-1.302-0.269-1.063-0.926-1.797-1.806-2.006-2.040-0.478-5.161 1.485-8.264 5.208-0.256 0.303-0.495 0.602-0.534 0.653-0.064 0.094-0.107 0.102-0.726 0.141-0.359 0.021-1.016 0.081-1.464 0.132-1.187 0.137-1.093 0.149-1.161-0.158-0.179-0.858-0.239-1.46-0.243-2.39-0.004-1.007 0.030-1.306 0.213-1.865 0.196-0.593 0.529-0.995 0.952-1.135 0.205-0.073 0.709-0.064 1.007 0.013 0.499 0.132 1.204 0.508 1.844 0.99 0.38 0.286 0.512 0.337 0.713 0.269 0.23-0.073 0.367-0.265 0.367-0.504 0-0.179-0.017-0.213-0.205-0.393-0.265-0.256-1.033-0.768-1.498-0.999-0.879-0.44-1.648-0.581-2.339-0.431zM12.4 12.216c-0.004 0.021-0.282 0.44-0.61 0.935s-0.653 0.995-0.721 1.11l-0.124 0.209-0.102-0.277c-0.128-0.337-0.525-1.643-0.525-1.725 0-0.077 0.188-0.107 1.579-0.252 0.29-0.030 0.521-0.030 0.504 0zM15.649 14.854c-0.303 0.098-0.598 0.316-0.773 0.576-0.525 0.773-0.269 1.78 0.555 2.185 0.256 0.128 0.32 0.141 0.67 0.141s0.414-0.013 0.67-0.141c1.114-0.546 1.089-2.168-0.043-2.689-0.299-0.137-0.781-0.166-1.080-0.073z"
                        />
                      </svg>
                    </button>
              </div>

                  {/* Right group: Plus, Send */}
                  <div className="flex flex-row gap-2 items-center ml-auto pr-4">
                    {/* Plus button */}
                    <button 
                      type="button" 
                      className="p-2 rounded-full text-gray-300 hover:brightness-150 transition flex items-center justify-center flex-shrink-0"
                      style={{ 
                        width: "36px", 
                        height: "36px",
                        backgroundColor: '#161618'
                      }}
                      onClick={handlePlusClick}
                      disabled={isUploadingImage}
                    >
                      {isUploadingImage ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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
              // Assistant responses: artifacts first, then search results, then default chat
              if (msg.role === 'assistant') {
                if (msg.contentType === 'artifact') {
                  return renderArtifactMessage(msg, i);
                }
                if (msg.isSearchResult) {
                  return renderSearchMessage(msg, i);
                }
                if (msg.contentType === 'reasoning') {
                  return renderReasoningMessage(msg, i);
                }
                return renderDefaultChatMessage(msg, i);
              }
              // Search UI messages
              if (msg.role === 'search-ui') {
                return renderSearchMessage(msg, i);
              }
              // User messages
                return (
                <div
                  key={msg.id + '-user-' + i}
                  className="w-full flex justify-end items-start gap-3 mb-4"
                >
                  {/* User message bubble - dynamic width */}
                  <div className="flex flex-col items-end max-w-[85%] min-w-[100px]">
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
                      className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                      style={{ 
                        color: '#FCFCFC',
                        backgroundColor: '#212121',
                        borderBottomRightRadius: '8px', // Smaller radius for the corner near avatar
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word'
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                  
                  {/* User profile avatar */}
                  <div className="flex-shrink-0">
                    {user?.user_metadata?.avatar_url ? (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt="User avatar"
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
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
      


      {/* Resizable Divider */}
      {isArtifactMode && (
        <div
          className="fixed top-0 bottom-0 bg-gray-600 hover:bg-gray-500 cursor-col-resize z-[10001] transition-colors"
          style={{ 
            left: `${leftPaneWidth}%`, 
            width: '4px',
            transform: 'translateX(-2px)' // Center the divider on the boundary
          }}
          onMouseDown={handleMouseDown}
        />
      )}

      {/* Artifact Viewer - Right Pane Split Screen */}
      {isArtifactMode && artifactContent && (
        <div 
          className="fixed top-0 right-0 bottom-0 z-[10000] bg-[#161618] border-l border-gray-700" 
          style={{ 
            width: `${100 - leftPaneWidth}%`,
            left: `${leftPaneWidth}%`
          }}
        >
          <ArtifactViewer
            artifact={artifactContent}
            onClose={() => {
              setIsArtifactMode(false);
              setArtifactContent(null);
            }}
          />
        </div>
      )}
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