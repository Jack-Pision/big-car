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
  createNewSession,
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
import PerformanceMonitor from '@/components/PerformanceMonitor';
import { Bot, User, Paperclip, Send, XCircle, Search as SearchIcon, Trash2, PlusCircle, Settings, Zap, ExternalLink, AlertTriangle } from 'lucide-react';
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
import { shouldTriggerArtifact, getArtifactPrompt, artifactSchema, validateArtifactData, createFallbackArtifact, type ArtifactData } from '@/utils/artifact-utils';

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

function TestChatComponent() {
  const router = useRouter();
  const { user, showSettingsModal } = useAuth();
  
  // State management
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [imageContexts, setImageContexts] = useState<ImageContext[]>([]);
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
  
  // Artifact streaming states
  const [artifactStreamingContent, setArtifactStreamingContent] = useState<string>('');
  const [isArtifactStreaming, setIsArtifactStreaming] = useState(false);

  // Additional missing state variables
  const [showHeading, setShowHeading] = useState(true);
  const [selectedFilesForUpload, setSelectedFilesForUpload] = useState<File[]>([]);
  const [imageCounter, setImageCounter] = useState(0);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const isInitialLoadRef = useRef(true);

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

  // Effect to load the last active session or create a new one on initial load
  useEffect(() => {
    const loadActiveSession = async () => {
      // Check if user exists at the time of execution instead of depending on it
      if (!user) return;
      
      try {
        const savedSessionId = await getActiveSessionId();
        if (savedSessionId) {
          // Load the saved session
          setActiveSessionId(savedSessionId);
          
          // Get messages and ensure they're marked as processed
                  // Use optimized service with caching
        const sessionMessages = await optimizedSupabaseService.getSessionMessages(savedSessionId);
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
      } catch (error) {
        console.error('Error loading active session:', error);
        // Fallback to showing welcome page
        setShowHeading(true);
        setHasInteracted(false);
        setActiveSessionId(null);
        setMessages([]);
      }
    };

    // Only run this effect once when component mounts
    loadActiveSession();
  }, []); // Empty dependency array - only run once

  // Effect to save messages whenever they change for the active session
  useEffect(() => {
    // Removed automatic saving on every message change
    // Messages are now saved explicitly when queries complete
  }, []);

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
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  };

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
        const newSession = await optimizedSupabaseService.createNewSession(input.trim());
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

    // Check if we're in artifact mode
    if (activeButton === 'artifact' || shouldTriggerArtifact(input.trim())) {
      // Handle artifact creation with streaming
      let currentActiveSessionId = activeSessionId;
      
      if (!currentActiveSessionId) {
        const newSession = await optimizedSupabaseService.createNewSession(input.trim());
        setActiveSessionId(newSession.id);
        saveActiveSessionId(newSession.id);
        currentActiveSessionId = newSession.id;
        setMessages([]);
      }

      if (!hasInteracted) setHasInteracted(true);
      if (showHeading) setShowHeading(false);

      // Add user message
      const userMessageId = uuidv4();
      const userMessage: LocalMessage = {
        role: 'user',
        id: userMessageId,
        content: input,
        timestamp: Date.now(),
        isProcessed: true
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);
      setIsAiResponding(true);
      setIsArtifactStreaming(true);
      setArtifactStreamingContent('');
      setArtifactProgress('Initializing artifact generation...');

      // Add placeholder AI message for streaming
      const aiMessageId = uuidv4();
      const placeholderAiMessage: LocalMessage = {
        role: 'assistant',
        id: aiMessageId,
        content: 'Creating your artifact...',
        timestamp: Date.now(),
        parentId: userMessageId,
        contentType: 'artifact',
        isStreaming: true,
        isProcessed: false
      };
      
      setMessages(prev => [...prev, placeholderAiMessage]);

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

        let contentBuffer = '';
        let lastArtifactData: any = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    contentBuffer += content;
                    setArtifactStreamingContent(contentBuffer);
                    
                    // Update progress based on content
                    if (contentBuffer.includes('<think>')) {
                      setArtifactProgress('Analyzing your request...');
                    } else if (contentBuffer.includes('"title"')) {
                      setArtifactProgress('Creating document structure...');
                    } else if (contentBuffer.includes('"content"')) {
                      setArtifactProgress('Generating content...');
                    } else if (contentBuffer.includes('}')) {
                      setArtifactProgress('Finalizing artifact...');
                    }

                    // Try to extract and validate artifact data as we stream
                    const potentialArtifactData = extractJsonFromStreamingContent(contentBuffer);
                    if (potentialArtifactData && isArtifactContentComplete(contentBuffer)) {
                      lastArtifactData = potentialArtifactData;
                    }
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

        // Process final artifact data
        let artifactData = lastArtifactData;
        
        if (!artifactData) {
          // Try to extract JSON one more time from complete content
          artifactData = extractJsonFromStreamingContent(contentBuffer);
        }
        
        if (!artifactData || !validateArtifactData(artifactData)) {
          console.log('Creating fallback artifact from streaming content...');
          artifactData = createFallbackArtifact(contentBuffer, input.trim());
        }

        // Set artifact content and show viewer
        setArtifactContent(artifactData);
        setIsArtifactMode(true);

        // Update the AI message with final artifact
        const finalAiMessage: LocalMessage = {
          role: 'assistant',
          id: aiMessageId,
          content: `I've created a ${artifactData.type} titled "${artifactData.title}". Click to view it in the artifact viewer.`,
          timestamp: Date.now(),
          parentId: userMessageId,
          contentType: 'artifact',
          structuredContent: artifactData,
          isProcessed: true,
          isStreaming: false
        };

        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? finalAiMessage : msg
        ));
        
        // Save messages
        const updatedMessages = [...messages, userMessage, finalAiMessage];
        await saveMessagesOnQueryComplete(updatedMessages);

      } catch (error) {
        console.error('Artifact streaming error:', error);
        
        // Update the AI message with error
        const errorMessage: LocalMessage = {
          role: 'assistant',
          id: aiMessageId,
          content: `Sorry, I encountered an error while creating the artifact: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    let uploadedImageUrls: string[] = [];

    try {
    if (!input.trim() || isLoading || isAiResponding) return;

    let currentActiveSessionId = activeSessionId;

    if (!currentActiveSessionId) {
      const newSession = await optimizedSupabaseService.createNewSession(input.trim() || (selectedFilesForUpload.length > 0 ? "Image Upload" : undefined));
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
      
      // Check for cached AI response first (only for non-image requests)
      let res;
      let usedCache = false;
      
      if (uploadedImageUrls.length === 0 && queryType === 'conversation') {
        // Try cache for text-only conversation requests
        const aiOptions = {
          messages: formattedMessages,
          temperature: apiPayload.temperature,
          max_tokens: apiPayload.max_tokens,
          model: 'nvidia'
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
        // Make fresh API call
        console.log('[Performance] Making fresh API call');
        res = await fetch("/api/nvidia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiPayload),
          signal: newAbortController.signal,
        });
        
        // Cache the response for future use (only for non-image, conversation requests)
        if (uploadedImageUrls.length === 0 && queryType === 'conversation' && res.ok) {
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
      setMessages((prev) => {
        const updatedMessages = [...prev, aiMsg];
        // Save messages to Supabase now that the structured query is complete
        saveMessagesOnQueryComplete(updatedMessages);
        return updatedMessages;
      });
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
          
          // Then, after a brief delay, apply final processing WITH embedded think tags
          // to preserve thinking content for "Thought" state after completion
          setTimeout(() => {
            setMessages((prev) => {
              const updatedMessages = prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg, 
                      content: finalThinkContent.trim().length > 0 
                        ? `<think>${finalThinkContent}</think>${finalMainContent}` // Preserve thinking for permanent "Thought" state
                        : finalMainContent, // No thinking content, just main content
                      contentType: 'conversation',
                      isProcessed: true,
                    }
                  : msg
              );
              
              // Save messages to Supabase now that the chat query is complete
              saveMessagesOnQueryComplete(updatedMessages);
              
              return updatedMessages;
            });
          }, 300); // Small delay for smooth transition
        }
        
        // Clear the live thinking state with a smooth transition
        // BUT keep the thinking content embedded in the message for permanent display
        setTimeout(() => {
          setCurrentThinkingMessageId(null);
          setLiveThinking(''); // Clear live state but thinking remains in message content
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
      setMessages((prev) => {
        const updatedMessages = [
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
        ];
        // Save messages to Supabase after abort
        saveMessagesOnQueryComplete(updatedMessages);
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
              imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
              isProcessed: true // Mark as processed
            },
          ];
          // Save messages to Supabase after error
          saveMessagesOnQueryComplete(updatedMessages);
          return updatedMessages;
        });
      }
    } finally {
      setIsAiResponding(false);
      setIsLoading(false);
      setAbortController(null);
    }
    setImagePreviewUrls([]);
    setSelectedFilesForUpload([]);
  }

  function handleStopAIResponse() {
    if (abortController) {
      abortController.abort();
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


  const handleSelectSession = async (sessionId: string) => {
    if (!sessionId) { // Handling deletion or empty selection case
        handleNewChatRequest();
        return;
    }
    
    try {
      setActiveSessionId(sessionId);
      await saveActiveSessionId(sessionId); // Save the active session
      
      // Get messages and ensure they're marked as processed
      const sessionMessages = await getSessionMessages(sessionId);
      const processedMessages = sessionMessages.map(msg => ({
        ...msg,
        isProcessed: true // Mark all loaded messages as processed
      }));
      
      setMessages(processedMessages);
      setInput('');
      setImagePreviewUrls([]);
      setSelectedFilesForUpload([]);
      setShowHeading(processedMessages.length === 0); // Show heading if the loaded session is empty
      setHasInteracted(true); // Assume interaction when a session is selected
      setSidebarOpen(false); // Close sidebar
    } catch (error) {
      console.error('Error selecting session:', error);
      // Fallback to new chat
      handleNewChatRequest();
    }
  };

  const handleNewChatRequest = async () => {
    setSidebarOpen(false);
    setInput('');
    setImagePreviewUrls([]);
    setSelectedFilesForUpload([]);
    setShowHeading(true); // Show welcoming heading
    setHasInteracted(false); // Reset interaction state
    setActiveSessionId(null);
    try {
      await saveActiveSessionId(null); // Clear the active session
    } catch (error) {
      console.error('Error clearing active session:', error);
    }
    setMessages([]);
  };

  // Fix the renderMessageContent function to use LocalMessage
  const renderMessageContent = (msg: LocalMessage) => {
    // Handle artifact streaming progress
    if (msg.contentType === 'artifact' && msg.isStreaming && !msg.isProcessed) {
      return (
        <div className="flex flex-col items-center p-6 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <div className="flex items-center space-x-3 mb-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-lg font-medium text-gray-700 dark:text-gray-300">Creating Artifact</span>
          </div>
          {artifactProgress && (
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {artifactProgress}
            </div>
          )}
          {artifactStreamingContent && (
            <div className="mt-4 w-full">
              <div className="text-xs text-gray-500 dark:text-gray-500 mb-2">Preview:</div>
              <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm font-mono text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                {artifactStreamingContent.length > 200 
                  ? artifactStreamingContent.substring(0, 200) + '...' 
                  : artifactStreamingContent}
              </div>
            </div>
          )}
        </div>
      );
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
          return (
            <div 
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => {
                setArtifactContent(artifactData);
                setIsArtifactMode(true);
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {artifactData.title}
                </h3>
                <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                  {artifactData.type}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {artifactData.content.substring(0, 150)}...
              </p>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                <span>{artifactData.wordCount} words • {artifactData.readingTime}</span>
                <span className="text-blue-600 dark:text-blue-400">Click to view →</span>
              </div>
            </div>
          );
        default:
          if (typeof msg.structuredContent === 'string') {
            return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="prose dark:prose-invert max-w-none">{msg.structuredContent}</ReactMarkdown>;
          }
          return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="prose dark:prose-invert max-w-none">{`Unsupported structured content: ${JSON.stringify(msg.structuredContent)}`}</ReactMarkdown>;
      }
    } else if (msg.content) {
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



  return (
    <>
      {/* Split-screen layout when artifact mode is active */}
      {isArtifactMode ? (
        <div className="flex h-screen">
          {/* Left Pane - Chat Interface */}
          <div 
            className="flex flex-col transition-all duration-300" 
            style={{ 
              width: `${leftPaneWidth}%`,
              background: '#161618'
            }}
          >
            {/* Left Pane Header */}
            <header className="bg-[#161618] shadow-md shadow-black/30 h-14 flex items-center px-4 flex-shrink-0">
              <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
              <img src="/Logo.svg" alt="Logo" className="ml-3" style={{ width: 90, height: 90 }} />
            </header>

            {/* Left Pane Content */}
            <div className="flex-1 flex flex-col px-4 sm:px-4 md:px-8 lg:px-0">
              <GlobalStyles />
              
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
                  style={{
                    left: isArtifactMode ? `${leftPaneWidth / 2}%` : '50%'
                  }}
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

                          {/* Artifact button */}
                          <button
                            type="button"
                            className={`flex items-center gap-1.5 rounded-full transition px-3 py-1.5 flex-shrink-0 text-xs font-medium
                              ${activeButton === 'artifact' ? 'bg-gray-800 text-cyan-400' : 'bg-gray-800 text-gray-400 opacity-60'}
                              hover:bg-gray-700`}
                            style={{ height: "36px" }}
                            tabIndex={0}
                            onClick={() => handleButtonClick('artifact')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: activeButton === 'artifact' ? '#22d3ee' : '#a3a3a3' }}>
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                              <line x1="9" y1="9" x2="15" y2="9"></line>
                              <line x1="9" y1="13" x2="15" y2="13"></line>
                            </svg>
                            <span className="whitespace-nowrap text-xs font-medium">Artifact</span>
                          </button>
                        </div>

                        {/* Right group: Plus, Send */}
                        <div className="flex flex-row gap-2 items-center ml-auto pr-4">
                          {/* Plus button */}
                          <button 
                            type="button" 
                            onClick={handleFirstPlusClick}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                          </button>

                          {/* Send button */}
                          <button 
                            type="submit" 
                            disabled={isLoading || !input.trim()}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isLoading ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>

                {/* Messages */}
                {messages.map((msg, i) => {
                  if (msg.role === 'assistant') {
                    const isStoppedMsg = msg.content.includes('Response stopped by user.');
                    const cleanContent = msg.content.replace('Response stopped by user.', '').trim();
                    
                    const processedContent = processThinkTags(cleanContent, msg.isStreaming || false);
                    const finalContent = processedContent.mainContent || cleanContent;
                    
                    return (
                      <React.Fragment key={msg.id + '-assistant-' + i}>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="w-full max-w-4xl mb-6 px-4 flex flex-col"
                        >
                          {/* Bot icon and content wrapper */}
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center justify-center mt-1">
                              <Bot size={16} className="text-white" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              {/* Thinking blocks */}
                              {processedContent.thinkBlocks.map((block, blockIndex) => (
                                <ThinkBlock key={`think-${blockIndex}`} content={block.content} />
                              ))}
                              
                              {/* Live thinking display */}
                              {msg.isStreaming && currentThinkingMessageId === msg.id && liveThinking && (
                                <div className="mb-4 p-4 bg-gray-800/50 rounded-lg border-l-4 border-yellow-500">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                                    <span className="text-sm text-yellow-400 font-medium">Thinking...</span>
                                  </div>
                                  <div className="text-gray-300 text-sm">
                                    <TextReveal text={liveThinking} isLive={true} />
                                  </div>
                                </div>
                              )}
                              
                              {/* Main content */}
                              {!msg.structuredContent && finalContent && (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeKatex, rehypeRaw]}
                                  className="prose prose-invert max-w-none"
                                  components={{
                                    h1: ({ children }) => (
                                      <h1 className="text-2xl font-bold text-gray-100 mb-4 mt-6 border-b border-gray-600 pb-2">
                                        {children}
                                      </h1>
                                    ),
                                    h2: ({ children }) => (
                                      <h2 className="text-xl font-semibold text-gray-200 mb-3 mt-5">
                                        {children}
                                      </h2>
                                    ),
                                    h3: ({ children }) => (
                                      <h3 className="text-lg font-semibold text-gray-200 mb-2 mt-4">
                                        {children}
                                      </h3>
                                    ),
                                    p: ({ children }) => (
                                      <p className="text-gray-300 leading-relaxed mb-4">
                                        {children}
                                      </p>
                                    ),
                                    ul: ({ children }) => (
                                      <ul className="space-y-2 mb-4 ml-6 list-disc text-gray-300">
                                        {children}
                                      </ul>
                                    ),
                                    ol: ({ children }) => (
                                      <ol className="space-y-2 mb-4 ml-6 list-decimal text-gray-300">
                                        {children}
                                      </ol>
                                    ),
                                    li: ({ children }) => (
                                      <li className="text-gray-300">
                                        {children}
                                      </li>
                                    ),
                                    blockquote: ({ children }) => (
                                      <blockquote className="border-l-4 border-cyan-500 pl-6 py-2 mb-4 italic text-gray-400 bg-gray-800/50 rounded-r-lg">
                                        {children}
                                      </blockquote>
                                    ),
                                    code: ({ children, className }) => {
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
                          </div>
                      
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
                          setMessages(prev => {
                            const updatedMessages = [
                              ...prev,
                              {
                                role: 'assistant' as const,
                                id: uuidv4(),
                                content: result,
                                timestamp: Date.now(),
                                isProcessed: true,
                                parentId: msg.id,
                                contentType: 'search-result',
                                isSearchResult: true,
                                webSources: sources || []
                              }
                            ];
                            
                            // Save messages to Supabase now that the search query is complete
                            saveMessagesOnQueryComplete(updatedMessages);
                            
                            return updatedMessages;
                          });
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

              {/* Fixed Footer Bar Behind Input */}
              <div
                className={`fixed bottom-0 z-40 transition-opacity duration-300 ${isChatEmpty && !hasInteracted ? 'opacity-0' : 'opacity-100'}`}
                style={{ 
                  left: 0,
                  width: `${leftPaneWidth}%`,
                  height: `calc(${inputBarHeight}px + env(safe-area-inset-bottom, 0px))`, 
                  background: '#161618', 
                  pointerEvents: 'none' 
                }}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Resizable Divider */}
          <div
            className="bg-gray-600 hover:bg-gray-500 cursor-col-resize z-[10000] transition-colors"
            style={{ width: '4px' }}
            onMouseDown={handleMouseDown}
          />

          {/* Right Pane - Artifact Viewer */}
          {artifactContent && (
            <div 
              className="flex flex-col bg-[#161618]" 
              style={{ width: `${100 - leftPaneWidth}%` }}
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
        </div>
      ) : (
        // Normal single-pane layout
        <div 
          className="min-h-screen flex flex-col px-4 sm:px-4 md:px-8 lg:px-0 transition-all duration-300" 
          style={{ background: '#161618' }}
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

                      {/* Artifact button */}
                      <button
                        type="button"
                        className={`flex items-center gap-1.5 rounded-full transition px-3 py-1.5 flex-shrink-0 text-xs font-medium
                          ${activeButton === 'artifact' ? 'bg-gray-800 text-cyan-400' : 'bg-gray-800 text-gray-400 opacity-60'}
                          hover:bg-gray-700`}
                        style={{ height: "36px" }}
                        tabIndex={0}
                        onClick={() => handleButtonClick('artifact')}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: activeButton === 'artifact' ? '#22d3ee' : '#a3a3a3' }}>
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="9" y1="9" x2="15" y2="9"></line>
                          <line x1="9" y1="13" x2="15" y2="13"></line>
                        </svg>
                        <span className="whitespace-nowrap text-xs font-medium">Artifact</span>
                      </button>
                    </div>

                    {/* Right group: Plus, Send */}
                    <div className="flex flex-row gap-2 items-center ml-auto pr-4">
                      {/* Plus button */}
                      <button 
                        type="button" 
                        onClick={handleFirstPlusClick}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                      </button>

                      {/* Send button */}
                      <button 
                        type="submit" 
                        disabled={isLoading || !input.trim()}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Messages */}
            {messages.map((msg, i) => {
              if (msg.role === 'assistant') {
                return renderMessageContent(msg);
              } else if (msg.role === 'search-ui') {
                return (
                  <Search
                    key={msg.id}
                    query={msg.query || msg.content}
                    onComplete={(result: any, sources?: any[]) => {
                      console.log('Search completed:', result);
                      setMessages(prev => {
                        const updatedMessages = [
                          ...prev,
                          {
                            role: 'assistant' as const,
                            id: uuidv4(),
                            content: result,
                            timestamp: Date.now(),
                            isProcessed: true,
                            parentId: msg.id,
                            contentType: 'search-result',
                            isSearchResult: true,
                            webSources: sources || []
                          }
                        ];
                        
                        saveMessagesOnQueryComplete(updatedMessages);
                        return updatedMessages;
                      });
                    }}
                  />
                );
              } else {
                return (
                  <div
                    key={msg.id + '-user-' + i}
                    className="px-3 py-2 rounded-xl shadow bg-cyan-500 text-white self-end max-w-[80%] text-base flex flex-col items-end mb-2"
                  >
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

          {/* Fixed Footer Bar Behind Input */}
          <div
            className={`fixed left-0 right-0 bottom-0 z-40 transition-opacity duration-300 ${isChatEmpty && !hasInteracted ? 'opacity-0' : 'opacity-100'}`}
            style={{ height: `calc(${inputBarHeight}px + env(safe-area-inset-bottom, 0px))`, background: '#161618', pointerEvents: 'none' }}
            aria-hidden="true"
          />
        </div>
      )}

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
        user={user}
        onSettingsClick={showSettingsModal}
      />

      {chatError && (
        <div className="text-red-500 text-sm text-center mt-2">{chatError}</div>
      )}
      
      {/* Performance Monitor - Shows cache stats */}
      <PerformanceMonitor />
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