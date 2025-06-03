"use client";
import { useState, useRef, useLayoutEffect, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import { useRouter } from 'next/navigation';
import { supabase, createSupabaseClient } from '@/lib/supabase-client';
import { motion } from 'framer-motion';
import PulsingDot from '@/components/PulsingDot';
import TextReveal from '@/components/TextReveal';
import ThinkingIndicator from '@/components/ThinkingIndicator';
import AdvanceSearch from '@/components/AdvanceSearch';
import { useDeepResearch } from '@/hooks/useDeepResearch';
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
import { classifyQuery } from '@/lib/query-classifier';
import DynamicResponseRenderer from '@/components/DynamicResponseRenderer';
import TutorialDisplay, { TutorialData } from '@/components/TutorialDisplay';
import ComparisonDisplay, { ComparisonData } from '@/components/ComparisonDisplay';
import InformationalSummaryDisplay, { InformationalSummaryData } from '@/components/InformationalSummaryDisplay';
import ConversationDisplay from '@/components/ConversationDisplay';
import { Bot, User, Paperclip, Send, XCircle, Search, Trash2, PlusCircle, Settings, Zap, ExternalLink, AlertTriangle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import rehypeRaw from 'rehype-raw';
import LoadingDots from '@/components/LoadingDots';
import Image from 'next/image';

const BASE_SYSTEM_PROMPT = `You are Tehom AI, a helpful and intelligent assistant.
Always respond in clean, structured Markdown format.

IMPORTANT: Do NOT include your reasoning, thought process, or step-by-step explanation. Only provide the final answer in clear, concise markdown.

Use:

#, ##, etc. for headings

**bold**, *italic*, bullet points, and numbered lists where appropriate

Triple backticks for code blocks with proper language tags

[text](url) for links

For math: Use $...$ for inline math. Use $$...$$ for display math.`;

const CITATION_INSTRUCTIONS = `IMPORTANT: You are a Deep Research AI assistant. Follow this three-step process:

STEP 1 - UNDERSTANDING (Use <think> tags):
<think>
1. Analyze the user's question in detail
2. Break down the key concepts and requirements
3. Identify what specific information you need to search for
4. Plan your research approach
</think>

STEP 2 - RESEARCH:
When researching, prioritize the most recent and up-to-date information, especially for topics that change frequently. However, if older information is important for context, background, or is still widely referenced, include it as well.
The system will provide you with search results from:
- Serper (Google Search API)
- Wikipedia
- NewsData.io
You must use ONLY these sources - do not make up sources or information.

STEP 3 - SYNTHESIS:
Based on the search results, provide a thorough, accurate, and balanced response that directly answers the query. Your response MUST include:

1. INTRODUCTION PARAGRAPH:
   Begin with a clear, engaging introduction paragraph that outlines the main topics and scope of your response.

2. MAIN CONTENT SECTIONS:
   - Organize information into logical sections with clear ## Section Headers
   - Present a balanced view of the topic, including different perspectives
   - Use bullet points for lists and key points
   - Include relevant examples, data, or case studies
   - Highlight important concepts with **bold** or *italic* text

3. SUMMARY TABLE:
   Always include a "## Summary Table" section before the conclusion with a markdown table summarizing key findings.
   For example:
   | Category | Key Points |
   | -------- | ---------- |
   | Main Concept | Summary of important information | [1] |
   | Best Practices | List of top recommendations | [2] |
   | Challenges | Overview of common difficulties |

4. CONCLUSION:
   End with a "## Conclusion" paragraph that summarizes the main points and provides final thoughts.

5. WEB CITATIONS:
   - Cite ALL sources using [1], [2], etc.
   - Each citation should correspond to the search results provided
   - Don't add fake sources or URLs
   - Don't include the URL itself in your answer

YOUR RESPONSE STRUCTURE MUST INCLUDE:
- Introduction paragraph (no heading)
- Main content sections with ## headers
- ## Summary Table with markdown table
- ## Conclusion paragraph

Format your response in clear, professional markdown.`;

interface ProcessedResponse {
  content: string;
  thinkingTime?: number;
}

function cleanAIResponse(text: string): ProcessedResponse {
  if (typeof text !== 'string') {
    return { content: '' };
  }

  let cleanedText = text;
  let thinkingTime = 0;

  // Find and process <think> tags
  const thinkTagRegex = /<think>([\s\S]*?)<\/think>/gi;
  let match;
  let lastIndex = 0;
  let processedContent = '';

  while ((match = thinkTagRegex.exec(cleanedText)) !== null) {
    // Add the text before the think tag
    processedContent += cleanedText.slice(lastIndex, match.index);
    
    // Calculate thinking time based on content length
    const tagContent = match[1];
    const tagLength = tagContent.length;
    // Estimate thinking time: 50ms per character, min 1s, max 5s
    const estimatedTime = Math.max(1000, Math.min(5000, tagLength * 50));
    thinkingTime += estimatedTime;

    // Add a marker for the thinking indicator
    processedContent += `\n<thinking-indicator duration="${estimatedTime}" />\n`;
    
    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text
  processedContent += cleanedText.slice(lastIndex);

  return {
    content: processedContent.trim(),
    thinkingTime: thinkingTime > 0 ? thinkingTime : undefined
  };
}

/**
 * Post-processes AI chat responses for default chat to ensure clean, consistent output.
 * This function implements various cleanup operations to fix common issues in AI-generated text.
 * 
 * IMPORTANT: This function is ONLY for default chat responses (currentQueryType === 'conversation')
 * and should NOT be applied to advance search or other structured responses.
 */
function postProcessAIChatResponse(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  let processedText = text;

  // 1. Remove Raw Output Artifacts
  // Remove common AI meta-language and instructional artifacts
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

  // 2. Fix Markdown Formatting
  // Remove all markdown formatting (asterisks and underscores for bold/italic) for default chat
  processedText = processedText.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove **bold**
  processedText = processedText.replace(/\*([^*]+)\*/g, '$1');     // Remove *italic*
  processedText = processedText.replace(/__([^_]+)__/g, '$1');     // Remove __bold__
  processedText = processedText.replace(/_([^_]+)_/g, '$1');       // Remove _italic_

  // Fix broken lists (ensure proper space after list markers)
  processedText = processedText.replace(/^(\s*[-*]|\s*[0-9]+\.)(?!\s)/gm, '$1 ');
  
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
    /\bwithout any doubt\b/gi,
    /\babsolutely (certain|sure)\b/gi,
    /\bI can assure you\b/gi,
    /\bI promise\b/gi,
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

interface Message {
  role: 'user' | 'assistant' | 'deep-research';
  content: string;
  contentType?: string;
  structuredContent?: any;
  imageUrls?: string[];
  webSources?: WebSource[];
  researchId?: string;
  id: string;
  timestamp: number;
  parentId?: string;
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

export default function TestChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
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
  
  // Deep Research hook - now passing processing state instead of UI state
  const {
    steps,
    activeStepId,
    isComplete,
    isInProgress,
    error,
    webData
  } = useDeepResearch(isAdvanceSearchActive, currentQuery, advanceSearchHistory);

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

  // Effect to load the last active session or create a new one on initial load
  useEffect(() => {
    const savedSessionId = getActiveSessionId();
    if (savedSessionId) {
      // Load the saved session
      setActiveSessionId(savedSessionId);
      setMessages(getSessionMessages(savedSessionId));
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
        timestamp: Date.now()
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

  // In the useEffect that processes the synthesis output, enforce the structure before displaying
  useEffect(() => {
    if (isComplete && currentQuery) {
      const synthesisStep = steps.find(step => step.id === 'synthesize');
      if (synthesisStep?.output) {
        setShowPulsingDot(true);
        let cleanedOutput = cleanAIOutput(synthesisStep.output);
        
        // Apply our improved structure enforcement
        cleanedOutput = enforceAdvanceSearchStructure(cleanedOutput);
        
        const alreadyPresent = messages.some(m => m.role === 'assistant' && m.content === cleanedOutput);
        if (!alreadyPresent) {
          setTimeout(() => {
            // Add the AI response to the messages - KEEP ALL PREVIOUS MESSAGES
            setMessages(prev => [
              ...prev, // Keep all previous messages instead of filtering
              { 
                role: 'assistant', 
                content: cleanedOutput,
                webSources: webData?.sources || [],
                id: uuidv4(),
                timestamp: Date.now()
              }
            ]);
            
            // Update the conversation history for future follow-up questions
            setAdvanceSearchHistory(prev => ({
              previousQueries: [...prev.previousQueries, currentQuery],
              previousResponses: [...prev.previousResponses, cleanedOutput]
            }));
            
            setShowPulsingDot(false);
          }, 500);
        }
      }
    }
  }, [isComplete, currentQuery, steps, messages, webData?.sources]);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading || isAiResponding) return;
    setIsLoading(true);
    setChatError("");
    setIsProcessing(true);

    const currentInput = input.trim();
    const currentSelectedFiles = selectedFilesForUpload;
    let uploadedImageUrls: string[] = [];
    const messageId = uuidv4();

    try {
    if (!currentInput && !currentSelectedFiles.length) return;

    let currentActiveSessionId = activeSessionId;

    if (!currentActiveSessionId) {
      const newSession = createNewSession(currentInput || (currentSelectedFiles.length > 0 ? "Image Upload" : undefined));
      setActiveSessionId(newSession.id);
      saveActiveSessionId(newSession.id);
      currentActiveSessionId = newSession.id;
      setMessages([]);
    }

    if (!hasInteracted) setHasInteracted(true);
    setCurrentQuery(currentInput);

    if (showAdvanceSearchUI) {
      setIsAdvanceSearchActive(true);
      const researchId = uuidv4();
      setMessages(prev => [
        ...prev,
        { role: "user", content: currentInput, id: uuidv4(), timestamp: Date.now() },
        { role: "deep-research", content: currentInput, researchId, id: uuidv4(), timestamp: Date.now() }
      ]);
      setInput("");
      setImagePreviewUrls([]);
      setSelectedFilesForUpload([]);
        setIsLoading(false);
      setIsAiResponding(false);
      return;
    }

    setIsAiResponding(true);
      setIsLoading(true);
    if (showHeading) setShowHeading(false);

    const queryType = classifyQuery(currentInput) as keyof typeof SCHEMAS;
    const responseSchema = SCHEMAS[queryType] || SCHEMAS.conversation;

    console.log("[handleSend] Query:", currentInput);
    console.log("[handleSend] Classified Query Type:", queryType);
    console.log("[handleSend] Selected Response Schema Name:", queryType);

    aiStreamAbortController.current = new AbortController();

      const userMessageForDisplay: Message = {
      role: "user" as const,
      content: currentInput,
      id: messageId,
      timestamp: Date.now()
    };

    if (currentSelectedFiles.length > 0 && !currentInput) {
      userMessageForDisplay.content = "Image selected for analysis.";
    }
    if (currentSelectedFiles.length > 0) {
      userMessageForDisplay.imageUrls = imagePreviewUrls || undefined;
    }
    setMessages((prev) => [...prev, userMessageForDisplay]);
    setInput("");

      if (currentSelectedFiles.length > 0) {
        const clientSideSupabase = createSupabaseClient();
        if (!clientSideSupabase) throw new Error('Supabase client not available');
        uploadedImageUrls = await Promise.all(
          currentSelectedFiles.map(async (file) => {
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
        if (uploadedImageUrls.length === 0 && currentSelectedFiles.length > 0) {
          throw new Error('Failed to get public URLs for any of the uploaded images.');
        }
      }

      const context = buildConversationContext(messages);
      let turnSpecificSystemPrompt = BASE_SYSTEM_PROMPT;

      // Inject NVIDIA AI thinking mode instructions for every message
      // Only add thinking mode for non-conversation (non-default) chat types
      if (queryType !== 'conversation') {
        turnSpecificSystemPrompt += `\n\nIMPORTANT: For every response, before answering, think step-by-step and include your reasoning inside <think>...</think> tags. Only after the <think> section, provide your final answer. Example:\n<think>Thinking through the problem step by step...</think>\nFinal answer here.`;
      }

      if (uploadedImageUrls.length === 0 && queryType !== 'conversation') {
        turnSpecificSystemPrompt += `\n\nIMPORTANT: For this query, classified as '${queryType}', your entire response MUST be a single JSON object that strictly conforms to the following JSON schema. Do NOT include any text, markdown, or explanations outside of this JSON object. Adhere to all field types and requirements specified in the schema.\nSchema:\n${JSON.stringify(responseSchema, null, 2)}`;
      }

      console.log("[handleSend] Turn Specific System Prompt Length:", turnSpecificSystemPrompt.length);

      const enhancedSystemPrompt = enhanceSystemPrompt(turnSpecificSystemPrompt, context, currentInput);
      
      const formattedMessages = formatMessagesForApi(
        enhancedSystemPrompt,
        messages,
        currentInput,
        true
      );

      const apiPayload: any = {
        messages: formattedMessages,
        temperature: 0.6,
        max_tokens: 3500,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.2,
        ...(uploadedImageUrls.length === 0 && queryType !== 'conversation' && {
          response_format: {
            type: "json_object", 
          }
        })
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
      
      if (res.headers.get('content-type')?.includes('application/json') && uploadedImageUrls.length === 0) {
        const rawResponseText = await res.text();
        console.log("[handleSend] Raw AI JSON Response Text:", rawResponseText);

        let structuredData;
        let parsedQueryType = queryType; // Use a mutable variable for potentially overriding

        try {
          // Attempt to parse the raw response first
          let parsedResponse = JSON.parse(rawResponseText);

          // If parsedResponse is a string, it means the AI might have sent a JSON string literal.
          // Try to parse it again.
          if (typeof parsedResponse === 'string') {
            try {
              parsedResponse = JSON.parse(parsedResponse);
            } catch (innerParseError) {
              // If the inner parse fails, it means the string was not a JSON string literal.
              // Treat the original string as the content if it was intended for conversation.
              if (parsedQueryType === 'conversation') {
                structuredData = { content: parsedResponse }; // Use the string directly
              } else {
                // For other types, this is an error, pass it through to outer catch.
                throw innerParseError;
              }
            }
          }

          structuredData = parsedResponse; // Assign potentially re-parsed object
          
          // Handle conversation schema validation and fallbacks more robustly
          if (parsedQueryType === 'conversation') {
            // Case A: structuredData is an object with a valid 'content' string.
            if (structuredData && typeof structuredData === 'object' && structuredData.content && typeof structuredData.content === 'string') {
              // Potentially, structuredData.content itself could be a stringified JSON.
              // This is common if the AI mistakenly nests JSON.
              let currentContent = structuredData.content;
              if (currentContent.trim().startsWith('{') && currentContent.trim().endsWith('}')) {
                try {
                  const nestedContent = JSON.parse(currentContent);
                  // If nestedContent is an object and has its own 'content' field, use that.
                  if (nestedContent && typeof nestedContent === 'object' && nestedContent.content && typeof nestedContent.content === 'string') {
                    structuredData.content = nestedContent.content; // Replace with deeply nested content
                  }
                  // If nestedContent is just a string (AI returned { "content": "{\"actual_text\": \"Hi!\"}"})
                  // This scenario is less likely if the outer parse worked, but good to be aware of.
                  // The current logic for BasicRenderer should handle displaying stringified JSON if it reaches there.
                } catch (e) {
                  // If parsing the nested content string fails, leave structuredData.content as is.
                  // BasicRenderer will display it (which might be the raw JSON string).
                  console.warn("[handleSend] structuredData.content looked like JSON, but failed to parse:", e);
                }
              }
              // At this point, structuredData.content should be the actual text string.
              // Ensure key_takeaway is also a string if present.
              if (structuredData.key_takeaway && typeof structuredData.key_takeaway !== 'string') {
                structuredData.key_takeaway = String(structuredData.key_takeaway);
              }
              
              // Apply post-processing to the conversation content
              if (structuredData.content && typeof structuredData.content === 'string') {
                structuredData.content = postProcessAIChatResponse(structuredData.content);
              }
            } 
            // Case B: structuredData itself is just a string (AI didn't use JSON format at all for conversation)
            else if (typeof structuredData === 'string') {
              structuredData = { content: postProcessAIChatResponse(structuredData) };
            } 
            // Case C: structuredData is an object, but no 'content' field, or 'content' is not a string.
            // Try to find other string fields or fallback.
            else if (structuredData && typeof structuredData === 'object') {
              let foundContent = '';
              if (typeof structuredData.message === 'string') foundContent = structuredData.message;
              else if (typeof structuredData.response === 'string') foundContent = structuredData.response;
              else if (typeof structuredData.text === 'string') foundContent = structuredData.text;
              // Add more common fields if necessary

              if (foundContent) {
                structuredData = { content: postProcessAIChatResponse(foundContent) };
              } else {
                // Last resort for an object without usable fields - stringify it or show error.
                console.warn("[handleSend] Conversation schema object missing 'content' or usable fields. Raw:", rawResponseText);
                structuredData = { 
                  content: "I apologize, I couldn't understand the format of my response. Here's what I received: \n\n```json\n" + 
                           JSON.stringify(structuredData, null, 2).substring(0, 500) + 
                           (JSON.stringify(structuredData, null, 2).length > 500 ? "..." : "") + "\n```"
                };
              }
            } else {
                // Fallback for completely unexpected structuredData type for conversation.
                console.warn("[handleSend] Unexpected structuredData type for conversation. Raw:", rawResponseText);
                structuredData = { content: "I apologize, my response was in an unexpected format. Raw data: " + String(structuredData).substring(0,200) };
            }
          } else if (!SCHEMAS[parsedQueryType]) { // Non-conversation types
            console.warn(`[handleSend] Unknown schema type '${parsedQueryType}'. Defaulting to conversation display.`);
            // For unknown schemas, attempt to extract content if it looks like our conversation schema,
            // otherwise, display the raw response text.
            if (structuredData && typeof structuredData === 'object' && structuredData.content && typeof structuredData.content === 'string'){
                // It has a content field, treat as conversation
                parsedQueryType = 'conversation'; // Will be handled by conversation logic above if re-processed or use as is.
                structuredData.content = postProcessAIChatResponse(structuredData.content);
            } else {
                structuredData = { content: "AI responded with an unrecognized data structure. Raw response: \n\n```json\n" + rawResponseText + "\n```" };
                parsedQueryType = 'conversation';
            }
          }
          // For non-conversation schemas, we assume `structuredData` is now the correctly parsed object for that schema.
          // No additional manipulation needed here; the specific renderers (TutorialRenderer etc.) expect the full object.

        } catch (parseError) {
          console.error("[handleSend] Outer error parsing AI JSON response:", parseError, "Raw content:", rawResponseText);
          // If parsing fails completely, treat the raw text as conversational content with an apology
          structuredData = { 
            content: "I apologize for the formatting error. Here's my response:\n\n" + postProcessAIChatResponse(rawResponseText)
          };
          parsedQueryType = 'conversation';
        }

        const aiMsg: Message = {
        role: "assistant" as const,
          content: '', 
          contentType: parsedQueryType,
          structuredContent: structuredData,
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: messageId,
          webSources: []
      };
      setMessages((prev) => [...prev, aiMsg]);

      } else {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        let contentBuffer = ''; // Buffer to accumulate content
        let hasActualContent = false; // Flag to track if we have meaningful content
        let aiMsg: Message = { 
          role: "assistant" as const,
          content: "", 
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: messageId,
          imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
          webSources: []
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
                    contentBuffer += delta; // Accumulate in buffer instead of showing immediately
                    
                    // Check if we have meaningful content (not just whitespace or processing text)
                    if (!hasActualContent && contentBuffer.trim().length > 0 && !contentBuffer.includes('thinking') && !contentBuffer.includes('processing')) {
                      hasActualContent = true;
                      aiMsg.content = contentBuffer;
                      
                      // Only now add the message to chat and hide loading
                      setIsProcessing(false);
                      setMessages((prev) => [...prev, { ...aiMsg }]);
                    } else if (hasActualContent) {
                      // Update the message content only if we're already showing it
                      aiMsg.content = contentBuffer;
                    setMessages((prev) => {
                      const updatedMessages = [...prev];
                        const aiIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
                        if (aiIndex !== -1) {
                          updatedMessages[aiIndex] = {
                            ...updatedMessages[aiIndex],
                            content: contentBuffer,
                          webSources: aiMsg.webSources
                        };
                      }
                      return updatedMessages;
                    });
                    }
                  }
                } catch (err) {
                  // Skip malformed chunks silently
                  continue;
                }
              }
            }
          }
        }
        
        // Apply post-processing after streaming is complete
        if (queryType === 'conversation' || !queryType) {
          // Removed post-processing for default chat (render raw AI output as-is)
          setMessages((prev) => {
            const updatedMessages = [...prev];
            const lastMsgIndex = updatedMessages.length - 1;
            if (lastMsgIndex >= 0 && updatedMessages[lastMsgIndex].role === 'assistant') {
              updatedMessages[lastMsgIndex] = { 
                ...updatedMessages[lastMsgIndex], 
                content: contentBuffer,
                contentType: 'conversation'
              };
            }
            return updatedMessages;
          });
          
          aiMsg.content = contentBuffer;
          aiMsg.contentType = 'conversation';
        } else if (showAdvanceSearchUI || currentQuery.includes('@AdvanceSearch')) {
          const processedResearch = enforceAdvanceSearchStructure(contentBuffer);
          
          setMessages((prev) => {
            const updatedMessages = [...prev];
            const lastMsgIndex = updatedMessages.length - 1;
            if(updatedMessages[lastMsgIndex] && updatedMessages[lastMsgIndex].role === 'assistant'){
              updatedMessages[lastMsgIndex] = { 
                ...updatedMessages[lastMsgIndex], 
                content: processedResearch,
                contentType: 'deep-research'
              };
            }
            return updatedMessages;
          });
          
          aiMsg.content = processedResearch;
          aiMsg.contentType = 'deep-research';
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
            parentId: messageId, 
            imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined
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
            parentId: messageId, 
            imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined
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
    setMessages(getSessionMessages(sessionId));
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
  };

  const renderMessageContent = (msg: Message) => {
    // If structuredContent is present, use the existing logic
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
    } else if (msg.content) {
      // Robust JSON detection and extraction
      let content = msg.content.trim();
      // 1. Strip code block fences if present
      if (content.startsWith('```')) {
        content = content.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      }
      // 2. Extract first JSON object or array from the string
      let jsonMatch = content.match(/({[\s\S]*}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          // Try to detect known structures
          if (parsed && typeof parsed === 'object') {
            if (parsed.title && parsed.steps) {
              return <TutorialDisplay data={parsed as TutorialData} />;
            } else if (parsed.title && parsed.item1_name && parsed.item2_name) {
              return <ComparisonDisplay data={parsed as ComparisonData} />;
            } else if (parsed.main_title && parsed.sections) {
              return <InformationalSummaryDisplay data={parsed as InformationalSummaryData} />;
            }
          }
          // If not a known structure, render as formatted JSON
          return <pre className="bg-neutral-900 text-white rounded p-4 overflow-x-auto"><code>{JSON.stringify(parsed, null, 2)}</code></pre>;
        } catch (e) {
          // Not valid JSON, fall through to markdown rendering
        }
      }
      // Fallback for simple text content or streamed content
        return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="prose dark:prose-invert max-w-none">{msg.content}</ReactMarkdown>;
    }
    return null;
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
        className="flex-1 overflow-y-auto w-full flex flex-col items-center justify-center relative px-4 sm:px-4 md:px-8 lg:px-0 pt-14"
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
                <div className="flex flex-row gap-2 mb-2 justify-center">
                  {imagePreviewUrls.map((url, idx) => (
                    <div key={idx} className="relative">
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
                        if (!isLoading) handleSend();
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
                      className={`flex items-center gap-1.5 rounded-full bg-gray-800 hover:bg-gray-700 transition px-3 py-1.5 flex-shrink-0 text-xs font-medium text-cyan-400`}
                      style={{ height: "36px" }}
                      onClick={handleWriteClick}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#22d3ee' }}>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z" />
              </svg>
                      <span className="whitespace-nowrap">Write</span>
            </button>

                    {/* Search button */}
                    <button
                      type="button"
                      className="rounded-full bg-gray-800 text-cyan-400 hover:bg-gray-700 transition flex items-center justify-center gap-1.5 px-3 py-1.5 flex-shrink-0"
                      style={{ height: "36px" }}
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="7"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <span className="text-xs font-medium">Search</span>
                    </button>

                    {/* Deep Research button */}
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 rounded-full bg-gray-800 hover:bg-gray-700 transition px-3 py-1.5 flex-shrink-0 ${showAdvanceSearchUI ? 'text-cyan-400' : 'text-gray-400'}`}
                      style={{ height: "36px" }}
                      tabIndex={0}
                      onClick={() => setShowAdvanceSearchUI(a => !a)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: showAdvanceSearchUI ? '#22d3ee' : '#a3a3a3' }}>
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
                      className="w-full text-left flex flex-col items-start ai-response-text mb-4"
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
                    </motion.div>
                  );
                }

                const { content: rawContent, thinkingTime } = cleanAIResponse(msg.content);
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
                    className="w-full markdown-body text-left flex flex-col items-start ai-response-text mb-4"
                    style={{ color: '#fff', maxWidth: '100%', overflowWrap: 'break-word' }}
                  >
                    {i === messages.length - 1 && showPulsingDot && !isStoppedMsg && !msg.structuredContent ? (
                      <PulsingDot isVisible={true} />
                    ) : (
                      <>
                        {msg.webSources && msg.webSources.length > 0 && (
                          <>
                            <WebSourcesCarousel sources={msg.webSources} />
                            <div style={{ height: '1.5rem' }} />
                          </>
                        )}
                        {thinkingTime && <ThinkingIndicator duration={thinkingTime} />}
                        {isStoppedMsg ? (
                          <span className="text-sm text-white italic font-light mb-2">[Response stopped by user]</span>
                        ) : (
                          <div className="w-full max-w-full overflow-hidden">
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]} 
                              rehypePlugins={[rehypeRaw]} 
                              className="prose dark:prose-invert max-w-none"
                              children={processedContent}
                            />
    </div>
                        )}
                      </>
                    )}
                  </motion.div>
                );
              } else if (msg.role === "deep-research") {
                return (
                  <DeepResearchBlock 
                    key={msg.id + '-dr-' + i}
                    query={msg.content} 
                    conversationHistory={advanceSearchHistory}
                    onClearHistory={clearAdvanceSearchHistory}
                  />
                );
              } else {
                return (
                <div
                  key={msg.id + '-user-' + i}
                  className="px-5 py-3 rounded-2xl shadow bg-gray-800 text-white self-end max-w-full text-lg flex flex-col items-end mb-4"
                  style={{ wordBreak: "break-word" }}
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
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="w-full flex justify-start mb-4"
              >
                <LoadingDots isVisible={true} />
              </motion.div>
            )}
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

function DeepResearchBlock({ query, conversationHistory, onClearHistory }: { 
  query: string, 
  conversationHistory: {
    previousQueries: string[];
    previousResponses: string[];
  },
  onClearHistory?: () => void
}) {
  // Always set the first parameter to true to ensure it processes the query
  // regardless of the parent component's state
  const {
    steps,
    activeStepId,
    isComplete,
    isInProgress,
    error,
    webData
  } = useDeepResearch(true, query, conversationHistory);
  
  const [manualStepId, setManualStepId] = useState<string | null>(null);
  const isFinalStepComplete = steps[steps.length - 1]?.status === 'completed';
  
  const hasHistory = conversationHistory.previousQueries.length > 0;
  
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
          steps={steps}
          activeStepId={isFinalStepComplete ? manualStepId || activeStepId : activeStepId}
          onManualStepClick={isFinalStepComplete ? setManualStepId : undefined}
          manualNavigationEnabled={isFinalStepComplete}
          error={error}
          webData={webData}
        />
      </div>
      {error && (
        <div className="text-red-500 text-sm text-center mt-2">{error}</div>
      )}
    </motion.div>
  );
} 