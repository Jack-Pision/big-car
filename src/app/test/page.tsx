"use client";
import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
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
import TextReveal from '@/components/TextReveal';
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
import Image from 'next/image';
import rehypeRaw from 'rehype-raw';
import { isSearchCompleted, getCompletedSearch, saveCompletedSearch } from '@/utils/advance-search-state';
import { makeCitationsClickable } from '@/utils/citation-utils';
import { 
  processIntroduction, 
  processContentSection, 
  formatBulletPoint, 
  formatParagraph, 
  processTableSection, 
  processConclusion, 
  generateDynamicTable, 
  generateDynamicConclusion,
  cleanAIOutput
} from '@/utils/post-processing';
import DeepResearchBlock from '@/components/AdvanceSearch';

// Define a type that includes all possible query types (including the ones in SCHEMAS and 'conversation')
type QueryType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation' | 'deep-research';

// Define types for query classification and content display
type QueryClassificationType = keyof typeof SCHEMAS;
type ContentDisplayType = 'tutorial' | 'comparison' | 'informational_summary' | 'conversation' | 'deep-research';

const BASE_SYSTEM_PROMPT = `You are Tehom AI, a helpful and intelligent assistant. Respond in a natural, conversational tone. Do not show internal reasoning, interpretive commentary, or self-narration. provide the answer in a friendly structured. Always write in markdown formatting in every output dynamically.

IMPORTANT: For general conversation, do NOT format your responses as JSON structures. Always provide plain text or simple markdown responses. Never return JSON objects or arrays in your replies unless specifically requested to do so.`;

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
You must use ONLY these sources - do not make up sources or information.

STEP 3 - SYNTHESIS:
You are tasked with creating an in-depth, research-driven response that synthesizes web search results into a comprehensive analysis. Follow these requirements precisely:
Structure Requirements
1. Introduction Paragraph

Craft a compelling, context-setting introduction that clearly defines the scope and key dimensions of your analysis
Establish the significance and relevance of the topic
Preview the main areas of investigation without revealing conclusions
Strict requirement: No citations in the introduction section

2. Dynamic Main Content Sections (3-5 sections)
Content Development:

Analyze web results to identify the most significant themes, trends, controversies, or perspectives
Create section titles that reflect substantive topics, not generic categories
Prioritize current developments, expert opinions, statistical data, and emerging patterns

Section Structure:

Each section must synthesize information from multiple sources
Use a mix of bullet points for key facts and short paragraphs for complex explanations
Include specific data points, quotes from experts, statistical trends, and concrete examples
Maintain analytical depth while ensuring readability

Citation Protocol:

Use numbered citations [1], [2], [3] etc. immediately after relevant statements
Every significant claim, statistic, or expert opinion must be cited
Citations should correspond directly to provided web search results
Balance citation frequency to maintain flow while ensuring credibility

3. Adaptive Summary Table
Dynamic Structure:

Design table columns and rows based on the actual content discovered, not predetermined templates
Examples of adaptive approaches:

Comparative analysis: "Factor | Position A | Position B | Evidence"
Trend analysis: "Time Period | Key Development | Impact Level | Source"
Stakeholder analysis: "Group | Primary Concern | Proposed Solution | Status"
Geographic analysis: "Region | Current Status | Challenges | Opportunities"


Ensure 4-8 rows with substantive information
Include quantitative data where available

4. Conclusion

Synthesize findings into 2-3 key overarching insights
Identify implications, future directions, or unresolved questions
Avoid introducing new information
Strict requirement: No citations in conclusion

Format your response in clear, professional markdown.`;

interface ProcessedResponse {
  content: string;
}

function cleanAIResponse(text: string): ProcessedResponse {
  if (typeof text !== 'string') {
    return { content: '' };
  }

  let cleanedText = text;
  let processedContent = '';

  // Find and process <think> tags
  const thinkTagRegex = /<think>([\s\S]*?)<\/think>/gi;
  let match;
  let lastIndex = 0;

  while ((match = thinkTagRegex.exec(cleanedText)) !== null) {
    // Add the text before the think tag
    processedContent += cleanedText.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text
  processedContent += cleanedText.slice(lastIndex);

  return {
    content: processedContent.trim()
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
    
    // REMOVED: lines that strip markdown formatting
    // processedText = processedText.replace(/\*\*([^*]+)\*\*/g, '$1');
    // processedText = processedText.replace(/\*([^*]+)\*/g, '$1');
    // processedText = processedText.replace(/__([^_]+)__/g, '$1');
    // processedText = processedText.replace(/_([^_]+)_/g, '$1');
    
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

interface Message {
  role: 'user' | 'assistant' | 'deep-research';
  content: string;
  contentType?: ContentDisplayType;
  structuredContent?: any;
  imageUrls?: string[];
  webSources?: WebSource[];
  researchId?: string;
  id: string;
  timestamp: number;
  parentId?: string;
  isProcessed?: boolean; // Flag to indicate messages that have been processed and shouldn't trigger new API calls
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
  
  // Enhanced section detection
  const isContentSection = (title: string) => {
    const lowerTitle = title.toLowerCase();
    return !lowerTitle.includes('introduction') && 
           !lowerTitle.includes('conclusion') && 
           !lowerTitle.includes('summary table');
  };
  
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
          // Ensure we don't exceed 5 content sections
          if (contentSections.length < 5) {
            contentSections.push({
              title: currentSectionTitle,
              content: processContentSection(currentSectionContent)
            });
          }
        }
      }
      
      // Start new section with enhanced detection
      currentSectionTitle = line.substring(3).trim();
      currentSectionContent = [];
      
      if (currentSectionTitle.toLowerCase().includes('introduction')) {
        currentSection = 'intro';
      } else if (currentSectionTitle.toLowerCase().includes('conclusion')) {
        currentSection = 'conclusion';
      } else if (currentSectionTitle.toLowerCase().includes('table')) {
        currentSection = 'table';
      } else if (isContentSection(currentSectionTitle)) {
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
      if (contentSections.length < 5) {
        contentSections.push({
          title: currentSectionTitle,
          content: processContentSection(currentSectionContent)
        });
      }
    }
  }
  
  // Enhanced fallback content
  if (!hasIntro) {
    introSection = "This analysis provides a comprehensive examination of the topic, drawing from multiple authoritative sources. The following sections present key findings, expert insights, and practical implications.";
  }
  
  if (!hasTable) {
    tableSection = "## Summary Table\n" + generateDynamicTable(contentSections);
  }
  
  if (!hasConclusion) {
    conclusionSection = "## Conclusion\n" + generateDynamicConclusion(contentSections);
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
    /My name is\s+(.+)/i
  ];
  
  // Loop through each pattern and check if it matches
  for (const marker of conclusionMarkers) {
    const match = text.match(marker);
    if (match && match[1]) {
      const remaining = text.substring(text.indexOf(match[0]));
      return remaining;
    }
  }
  
  // If we find paragraphs after reasoning, try to extract them
  const paragraphs = text.split('\n\n');
  if (paragraphs.length > 1) {
    // Check if first paragraph is reasoning and later ones aren't
    if (isReasoningContent(paragraphs[0])) {
      // Find the first non-reasoning paragraph
      for (let i = 1; i < paragraphs.length; i++) {
        if (!isReasoningContent(paragraphs[i]) && paragraphs[i].trim().length > 20) {
          return paragraphs.slice(i).join('\n\n');
        }
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
  
  // Last resort: just return the last 70% of the text
  // This is based on the observation that reasoning usually appears at the beginning
  const startPosition = Math.floor(text.length * 0.3);
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
    'mapping out', 'outlining', 'conceptualizing', 'i\'ll try to'
  ];
  
  const lowerText = text.toLowerCase();
  
  // Check for reasoning keywords - Only check at the beginning of the text or a new paragraph
  // This reduces false positives for casual mentions of these terms
  const paragraphs = lowerText.split('\n\n');
  for (const paragraph of paragraphs) {
    // Check first 40 characters of each paragraph for reasoning keywords
    const paragraphStart = paragraph.trim().slice(0, 40);
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
    /^(When we|When I|If we|If I) (look at|consider|analyze|examine|think about)/i
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
    /begin by\W+(?:.*\W+)then\W+(?:.*\W+)lastly/i
  ];
  
  for (const pattern of sequentialPatterns) {
    if (pattern.test(lowerText)) {
      return true;
    }
  }
  
  // Check for reasoning structure transitions
  const transitionWords = [
    'therefore', 'thus', 'hence', 'so', 'as a result', 'consequently',
    'it follows that', 'we can conclude', 'this means that', 'this implies',
    'which suggests', 'indicating that'
  ];
  
  // Check if text has reasoning structure with "if...then" or condition analysis
  const hasReasoningStructure = 
    (lowerText.includes("if") && lowerText.includes("then")) ||
    (lowerText.includes("when") && lowerText.includes("we get")) ||
    (lowerText.includes("because") && lowerText.includes("this means"));
    
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
  if (!buffer || buffer.length < 5) {
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
      // Not complete JSON yet, continue with normal processing
    }
  }

  // Remove thinking tags
  const processedBuffer = buffer.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // If buffer only contained thinking tags and nothing else, don't show yet
  if (!processedBuffer.trim()) {
    return { 
      showContent: false, 
      processedContent: '',
      hasCompletedReasoning: false
    };
  }

  // Check if we detect reasoning content (heuristic)
  const isCurrentlyReasoning = isReasoningContent(processedBuffer);
  
  // Has the reasoning phase been completed? (i.e. we have content after reasoning)
  // We look for signs of a transition from reasoning to final content
  const reasoningPatterns = [
    /thinking through this step[\s\S]*?Let me provide|thinking[\s\S]*?Here's|reasoning[\s\S]*?Therefore|analyzing[\s\S]*?In conclusion/i,
    /Let me think[\s\S]*?Based on this|Let me analyze[\s\S]*?So the answer|Let me solve[\s\S]*?Thus|Let me work[\s\S]*?Hence/i,
    /I'll approach[\s\S]*?The answer is|I need to consider[\s\S]*?In summary|step by step[\s\S]*?In conclusion/i,
    /first[\s\S]*?second[\s\S]*?third[\s\S]*?therefore/i,
    /thinking aloud[\s\S]*?to summarize/i,
  ];

  // Check if we've completed the reasoning phase based on our patterns
  const hasCompletedReasoning = reasoningPatterns.some(pattern => pattern.test(processedBuffer));
  
  // Length-based heuristics for showing content - OPTIMIZATION 1: Reduce threshold from 40 to 20
  const hasSubstantialContent = processedBuffer.length > 20;
  
  // If we've completed reasoning or have substantial non-reasoning content, show it
  // Prioritize showing completed reasoning, but fallback to showing substantial content
  const shouldShow = hasCompletedReasoning || (hasSubstantialContent && !isCurrentlyReasoning);

  // Final content cleaning for display
  let cleanedContent = processedBuffer;
  
  // Apply extractFinalAnswer to filter out reasoning content
  if (isCurrentlyReasoning && cleanedContent.length > 50) {
    cleanedContent = extractFinalAnswer(cleanedContent);
  }
  
  // Always apply postProcessAIChatResponse and handlePotentialJsonInConversation to the content
  cleanedContent = postProcessAIChatResponse(cleanedContent, true);
  
  return {
    showContent: shouldShow,
    processedContent: cleanedContent.trim(),
    hasCompletedReasoning: hasCompletedReasoning
  };
}

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

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    
    // Initialize variables at the function scope level
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
    // --- FIX: Always reset restoration state for new Advance Search queries ---
    if (showAdvanceSearchUI) {
      setIsRestoredFromStorage(false); // Always reset before new query
      setRestoredDeepResearchState({}); // Clear any old state
    }
    setCurrentQuery(input);
    setIsRestoredFromStorage(false); // Reset the restored flag when sending a new message

    if (showAdvanceSearchUI) {
      setIsAdvanceSearchActive(true);
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

    setIsAiResponding(true);
      setIsLoading(true);
    if (showHeading) setShowHeading(false);

    const queryType = classifyQuery(input) as QueryClassificationType;
    const responseSchema = SCHEMAS[queryType] || SCHEMAS.conversation;

    console.log("[handleSend] Query:", input);
    console.log("[handleSend] Classified Query Type:", queryType);
    console.log("[handleSend] Selected Response Schema Name:", queryType);

    aiStreamAbortController.current = new AbortController();

      const userMessageForDisplay: Message = {
      role: "user" as const,
      content: input,
      id: uuidv4(),
      timestamp: Date.now(),
      isProcessed: true // Mark the user message as processed
    };
    
    // Store the user message ID to use as parentId for AI responses
    userMessageId = userMessageForDisplay.id;

    if (selectedFilesForUpload.length > 0 && !input) {
      userMessageForDisplay.content = "Image selected for analysis.";
    }
    if (selectedFilesForUpload.length > 0) {
      userMessageForDisplay.imageUrls = imagePreviewUrls || undefined;
    }
    setMessages((prev) => [...prev, userMessageForDisplay]);
    setInput("");

      if (selectedFilesForUpload.length > 0) {
        const clientSideSupabase = createSupabaseClient();
        if (!clientSideSupabase) throw new Error('Supabase client not available');
        uploadedImageUrls = await Promise.all(
          selectedFilesForUpload.map(async (file: File) => {
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
        if (uploadedImageUrls.length === 0 && selectedFilesForUpload.length > 0) {
          throw new Error('Failed to get public URLs for any of the uploaded images.');
        }
      }

      const context = buildConversationContext(messages);
      let turnSpecificSystemPrompt = BASE_SYSTEM_PROMPT;

      // Add explicit instruction to never show reasoning
      if (!showAdvanceSearchUI && !input.includes('@AdvanceSearch')) {
        turnSpecificSystemPrompt += `\n\nIMPORTANT: Provide direct answers without showing your reasoning or thinking process. Never include any step-by-step analysis in your response. Only provide the final answer in a clear, concise format.`;
      }

      // Remove the thinking mode instructions that were causing reasoning text to appear
      // if (queryType !== 'conversation') {
      //   turnSpecificSystemPrompt += `\n\nIMPORTANT: For every response, before answering, think step-by-step and include your reasoning inside <think>...</think> tags. Only after the <think> section, provide your final answer. Example:\n<think>Thinking through the problem step by step...</think>\nFinal answer here.`;
      // }

      if (uploadedImageUrls.length === 0 && queryType !== 'conversation') {
        turnSpecificSystemPrompt += `\n\nIMPORTANT: For this query, classified as '${queryType}', your entire response MUST be a single JSON object that strictly conforms to the following JSON schema. Do NOT include any text, markdown, or explanations outside of this JSON object. Adhere to all field types and requirements specified in the schema.\nSchema:\n${JSON.stringify(responseSchema, null, 2)}`;
      }

      console.log("[handleSend] Turn Specific System Prompt Length:", turnSpecificSystemPrompt.length);

      const enhancedSystemPrompt = enhanceSystemPrompt(turnSpecificSystemPrompt, context, input);
      
      const formattedMessages = formatMessagesForApi(
        enhancedSystemPrompt,
        messages,
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
      
      // REMOVED: Non-streaming block for 'conversation' as server always streams.
      // if (queryType === 'conversation') { ... } 
      
      // All responses from /api/nvidia are now handled as either JSON or stream.
      // The server always sends 'text/event-stream', so this 'application/json' check
      // for non-image uploads will likely not be met directly from /api/nvidia.
      // This block might be relevant if other API routes returned direct JSON.
      if (res.headers.get('content-type')?.includes('application/json') && uploadedImageUrls.length === 0 && queryType !== 'conversation') {
        const rawResponseText = await res.text();
        console.log("[handleSend] Raw AI JSON Response Text (for non-conversation, non-image):", rawResponseText);

        let structuredData;
        // Ensure parsedQueryType is correctly initialized for this path.
        // It should be a type that expects structured data (not 'conversation' or 'deep-research' which are handled differently).
        let parsedQueryType: ContentDisplayType = queryType as unknown as ContentDisplayType; 

        try {
          let parsedJson = JSON.parse(rawResponseText);
          if (typeof parsedJson === 'string') { // Handle double-encoded JSON
            parsedJson = JSON.parse(parsedJson);
          }
          structuredData = parsedJson;
        } catch (parseError) {
          console.error("[handleSend] Error parsing AI JSON response (for non-conversation, non-image):", parseError, "Raw content:", rawResponseText);
          structuredData = { 
            content: "I apologize for the formatting error in structured data. Here's the raw response:\\n\\n" + rawResponseText 
          };
          parsedQueryType = 'conversation'; // Fallback to conversation display for the error
        }

        const aiMsg: Message = {
        role: "assistant" as const,
          content: '', 
          contentType: parsedQueryType,
          structuredContent: structuredData,
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: userMessageId,
          webSources: [],
          isProcessed: true // Mark message as processed
      };
      setMessages((prev) => [...prev, aiMsg]);
      } else { // Default to streaming logic for all other cases (including 'conversation')
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        let contentBuffer = ''; // Buffer to accumulate content
        let hasActualContent = false; // Flag to track if we have meaningful content
        let isReasoningPhase = false; // Flag to track if we're in the reasoning phase
        let hasProcessedFinalContent = false; // Flag to know if we've already shown final content
        
        // Initialize aiMsg for the streaming case. 
        // We'll set its contentType more definitively after the stream.
        let aiMsg: Message = { 
          role: "assistant" as const,
          content: "", 
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: userMessageId,
          imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
          webSources: [],
          contentType: 'conversation', // Default to conversation, will be confirmed/overridden after stream
          isProcessed: true // Mark the assistant message as processed
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
                    
                    // Use the new stream buffer processor to intelligently detect final content
                    const { showContent, processedContent, hasCompletedReasoning } = processStreamBuffer(contentBuffer);
                    
                    // If we've detected final content to show
                    if ((showContent) && !hasProcessedFinalContent) {
                      if (!hasActualContent) {
                        // First time showing content - initialize
                        hasActualContent = true;
                        aiMsg.content = processedContent;
                        
                        // Only now add the message to chat and hide loading
                        setIsProcessing(false);
                        setMessages((prev) => [...prev, { ...aiMsg }]);
                      } else {
                        // Update existing content
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
                      
                      // If we've definitively detected the transition from reasoning to final content,
                      // mark that we've processed it, so we don't flip back
                      if (hasCompletedReasoning) {
                        hasProcessedFinalContent = true;
                      }
                    } else if (hasActualContent && showContent) {
                      // We've already started showing content, continue updating
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
                    // Note: If showContent is false (we detect we're still in reasoning),
                    // we don't update the display
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
        // If it was an advance search, it would have been handled by its specific UI state.
        // Otherwise, it's treated as a conversation, potentially needing post-processing.
        if (showAdvanceSearchUI || input.includes('@AdvanceSearch')) {
          // Keep the Advance Search processing intact
          const processedResearch = enforceAdvanceSearchStructure(contentBuffer);
          setMessages((prev) => {
            const updatedMessages = [...prev];
            const msgIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
            if (msgIndex !== -1) {
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: processedResearch,
                contentType: 'deep-research' // Explicitly set for advance search
              };
            }
            return updatedMessages;
          });
          aiMsg.content = processedResearch;
          aiMsg.contentType = 'deep-research';
        } else { // Handles conversation and image description streams
          // First, try our smart processing to extract final content from the full response
          const { showContent, processedContent, hasCompletedReasoning } = processStreamBuffer(contentBuffer);
          
          // If smart processing found a clear final answer, use that
          const finalContent = hasCompletedReasoning ? processedContent : postProcessAIChatResponse(contentBuffer, true);
          
          setMessages((prev) => {
            const updatedMessages = [...prev];
            const msgIndex = updatedMessages.findIndex(m => m.id === aiMsg.id);
            if (msgIndex !== -1) {
              updatedMessages[msgIndex] = {
                ...updatedMessages[msgIndex],
                content: finalContent,
                contentType: 'conversation' // Confirmed as conversation
              };
            }
            return updatedMessages;
          });
          aiMsg.content = finalContent;
          aiMsg.contentType = 'conversation';
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

  const renderMessageContent = (msg: Message) => {
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
      const isDefaultChat = msg.contentType === 'conversation' || (msg.role === 'assistant' && !msg.contentType);
      if (isDefaultChat) {
        const processedContent = postProcessAIChatResponse(msg.content, true);
        return (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]} 
            rehypePlugins={[rehypeRaw]} 
            className="prose dark:prose-invert max-w-none default-chat-markdown"
            components={{
              h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 mt-6" {...props} />, 
              h2: ({node, ...props}) => <h2 className="text-xl font-semibold mb-3 mt-5" {...props} />, 
              h3: ({node, ...props}) => <h3 className="text-lg font-semibold mb-2 mt-4" {...props} />, 
              h4: ({node, ...props}) => <h4 className="text-base font-semibold mb-2 mt-3" {...props} />, 
              p: ({node, ...props}) => <p className="mb-2 leading-relaxed" {...props} />, 
              ul: ({node, ...props}) => <ul className="list-disc ml-6 mb-2" {...props} />, 
              ol: ({node, ...props}) => <ol className="list-decimal ml-6 mb-2" {...props} />, 
              li: ({node, ...props}) => <li className="mb-1" {...props} />, 
              code: ({node, ...props}) => <code className="bg-neutral-900 text-white rounded px-1.5 py-1" {...props} />, 
              pre: ({node, ...props}) => <pre className="bg-neutral-900 text-white rounded p-4 overflow-x-auto my-2" {...props} />, 
              table: ({node, ...props}) => <table className="min-w-full border-collapse my-4" {...props} />, 
              th: ({node, ...props}) => <th className="border-b border-gray-700 px-4 py-2 text-left" {...props} />, 
              td: ({node, ...props}) => <td className="border-b border-gray-800 px-4 py-2" {...props} />, 
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-cyan-400 pl-4 italic my-2" {...props} />,
            }}
          >
            {processedContent}
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

  // Clear Advance Search state from localStorage when a new search is started
  useEffect(() => {
    // Don't clear during initial load phase
    if (isInitialLoadRef.current) {
      return;
    }
    
    // Only clear if the user explicitly closed the UI or stopped the process
    if (!showAdvanceSearchUI || !isAdvanceSearchActive) {
      // Only clear if this was an explicit action, not a page load
      localStorage.removeItem(ADVANCE_SEARCH_STORAGE_KEY);
    }
  }, [showAdvanceSearchUI, isAdvanceSearchActive]);

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

                const { content: rawContent } = cleanAIResponse(msg.content);
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
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]} 
                              rehypePlugins={[rehypeRaw]} 
                              className="prose dark:prose-invert max-w-none"
                            >
                              {processedContent}
                            </ReactMarkdown>
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
                    steps={steps}
                    activeStepId={activeStepId}
                    error={error}
                    webData={webData}
                    onFinalAnswer={(answer: string, sources?: any[]) => {
                      // Check if we already have this answer in messages to prevent duplicates
                      const isDuplicate = messages.some(existingMsg => 
                        existingMsg.role === "assistant" && 
                        existingMsg.contentType === 'deep-research' && 
                        existingMsg.content.includes(answer.substring(0, 100))
                      );
                      // Only add if not a duplicate
                      if (!isDuplicate) {
                        setMessages(prev => [
                          ...prev,
                          {
                            role: "assistant",
                            content: makeCitationsClickable(answer, sources),
                            id: uuidv4(),
                            timestamp: Date.now(),
                            isProcessed: true,
                            contentType: 'deep-research',
                            webSources: sources || []
                          }
                        ]);
                      }
                    }}
                  />
                );
              } else {
                return (
                <div
                  key={msg.id + '-user-' + i}
                  className="px-5 py-3 rounded-2xl shadow bg-gray-800 text-white self-end max-w-full text-lg flex flex-col items-end mb-4 relative"
                  style={{ wordBreak: "break-word" }}
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