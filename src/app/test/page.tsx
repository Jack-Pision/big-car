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

const SYSTEM_PROMPT = `You are a helpful, knowledgeable, and friendly AI assistant. Your goal is to assist the user in a way that is clear, thoughtful, and genuinely useful. 

FORMAT YOUR RESPONSES WITH THIS EXACT STRUCTURE:
1. Start with a short summary paragraph that directly answers the question.
2. Organize information into sections with clear ## Section Title headers.
3. Under each section, use bullet points with bold labels followed by descriptions:
   * **Label:** Description text here.
   * **Another Label:** More descriptive content here.
4. Add as many sections as needed based on the topic.
5. Keep descriptions concise but informative - adapt length based on complexity.`;

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
   | Main Concept | Summary of important information |
   | Best Practices | List of top recommendations |
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
  let otherSections: {title: string, content: string}[] = [];
  
  // Track section we're currently in
  let currentSection = 'none';
  let currentSectionTitle = '';
  let currentSectionContent: string[] = [];
  
  // Analyze the content line by line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check for section headers
    if (line.match(/^#{1,2}\s+Summary(\s+Table)?$/i) || line.match(/^#{1,2}\s+Key\s+Findings$/i)) {
      // If we were in the intro section, store it
      if (currentSection === 'intro') {
        introSection = processSectionText(currentSectionContent, 3, 4);
        hasIntro = introSection.length > 10; // Ensure it's substantial
      } else if (currentSection === 'other' && currentSectionContent.length > 0) {
        // Save previous section content
        otherSections.push({
          title: currentSectionTitle,
          content: processSectionText(currentSectionContent, 3, 4)
        });
      }
      
      // Now we're in the table section
      currentSection = 'table';
      currentSectionTitle = line;
      currentSectionContent = [line];
      continue;
    }
    
    if (line.match(/^#{1,2}\s+Conclusion/i)) {
      // If we were in the table section, store it
      if (currentSection === 'table') {
        tableSection = cleanupTableSection(currentSectionContent);
        hasTable = tableSection.includes('|') || tableSection.length > 20;
      } else if (currentSection === 'other' && currentSectionContent.length > 0) {
        // Save previous section content if it wasn't a table
        otherSections.push({
          title: currentSectionTitle,
          content: processSectionText(currentSectionContent, 3, 4)
        });
      }
      
      // Now we're in the conclusion section
      currentSection = 'conclusion';
      currentSectionTitle = line;
      currentSectionContent = [line];
      continue;
    }
    
    // Handle other section headers
    if (line.startsWith('#') && !line.match(/^#{1,2}\s+(Summary|Conclusion|Key\s+Findings)/i)) {
      // Store previous section content
      if (currentSection === 'intro') {
        introSection = processSectionText(currentSectionContent, 3, 4);
        hasIntro = introSection.length > 10;
      } else if (currentSection === 'table') {
        tableSection = cleanupTableSection(currentSectionContent);
        hasTable = tableSection.includes('|') || tableSection.length > 20;
      } else if (currentSection === 'conclusion') {
        conclusionSection = processSectionText(currentSectionContent, 3, 4);
        hasConclusion = conclusionSection.length > 10;
      } else if (currentSection === 'other' && currentSectionContent.length > 0) {
        otherSections.push({
          title: currentSectionTitle,
          content: processSectionText(currentSectionContent, 3, 4)
        });
      }
      
      // Start a new section
      currentSection = 'other';
      currentSectionTitle = line;
      currentSectionContent = [line];
      continue;
    }
    
    // Handle intro section (content before any heading)
    if (currentSection === 'none' && line && !line.startsWith('#')) {
      // Skip lines that are likely part of tables
      if (line.startsWith('|') || line.includes('---')) {
        continue;
      }
      
      // Skip lines that look like HTML/URLs or contain code markers
      if (line.includes('<') && line.includes('>') || 
          line.includes('http') || 
          line.includes('```') ||
          line.includes('`')) {
        continue;
      }
      
      currentSection = 'intro';
      currentSectionContent = [line];
      continue;
    }
    
    // Add line to current section
    currentSectionContent.push(line);
  }
  
  // Process the last section
  if (currentSection === 'intro') {
    introSection = processSectionText(currentSectionContent, 3, 4);
    hasIntro = introSection.length > 10;
  } else if (currentSection === 'table') {
    tableSection = cleanupTableSection(currentSectionContent);
    hasTable = tableSection.includes('|') || tableSection.length > 20;
  } else if (currentSection === 'conclusion') {
    conclusionSection = processSectionText(currentSectionContent, 3, 4);
    hasConclusion = conclusionSection.length > 10;
  } else if (currentSection === 'other' && currentSectionContent.length > 0) {
    otherSections.push({
      title: currentSectionTitle,
      content: processSectionText(currentSectionContent, 3, 4)
    });
  }
  
  // Build the structured output
  let structuredOutput = '';
  
  // Add introduction or placeholder
  if (hasIntro) {
    structuredOutput += introSection.trim() + '\n\n';
  } else {
    structuredOutput += 'This provides valuable context for understanding the topic. Further research may offer additional insights into this area. Several key factors contribute to this phenomenon. The evidence supports these conclusions.\n\n';
  }
  
  // Add the other sections
  for (const section of otherSections) {
    structuredOutput += section.title + '\n\n';
    structuredOutput += formatBulletPoints(section.content.trim()) + '\n\n';
  }
  
  // Add table section or placeholder
  if (hasTable) {
    structuredOutput += tableSection.trim() + '\n\n';
  } else {
    structuredOutput += '## Summary Table\n\n';
    structuredOutput += '| Category | Key Points |\n';
    structuredOutput += '| -------- | ---------- |\n';
    structuredOutput += '| Main Findings | Summary of key information |\n';
    structuredOutput += '| Important Details | Overview of critical points |\n';
    structuredOutput += '| Additional Context | Background information |\n\n';
  }
  
  // Add conclusion or placeholder
  if (hasConclusion) {
    structuredOutput += conclusionSection.trim();
  } else {
    structuredOutput += '## Conclusion\n\n';
    structuredOutput += 'This research provides a comprehensive overview of the topic. The findings highlight important aspects that deserve attention. Further exploration may be warranted to gain deeper insights into specific areas discussed above.';
  }
  
  // Final post-processing to clean up any remaining issues
  return cleanupFinalOutput(structuredOutput);
}

/**
 * Helper function to process section text by:
 * 1. Limiting to specified sentence count
 * 2. Cleaning HTML and excessive links
 * 3. Removing duplicate content
 */
function processSectionText(lines: string[], minSentences: number, maxSentences: number): string {
  // Skip the first line if it's a heading
  const contentLines = lines[0].startsWith('#') ? lines.slice(1) : lines;
  
  // Join all non-empty lines
  let fullText = contentLines
    .filter(line => line.trim() && !line.startsWith('|') && !line.match(/^[-=]{3,}$/))
    .join(' ')
    .trim();
  
  // Clean HTML tags, URLs, and strange formatting
  fullText = cleanTextContent(fullText);
  
  // Split into sentences
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const matches = fullText.match(sentenceRegex);
  let sentences: string[] = matches ? [...matches] : [];
  
  // Remove duplicate sentences
  sentences = Array.from(new Set(sentences));
  
  // Clean each sentence individually
  sentences = sentences.map(sentence => {
    // Trim whitespace
    let cleaned = sentence.trim();
    
    // Fix common formatting issues
    cleaned = cleaned.replace(/\*\*/g, ''); // Remove bold markers
    cleaned = cleaned.replace(/\*/g, '');   // Remove italic markers
    cleaned = cleaned.replace(/_{1,2}/g, ''); // Remove underscore formatting
    cleaned = cleaned.replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space
    
    // Fix capitalization of first letter
    if (cleaned.length > 0 && cleaned[0].match(/[a-z]/)) {
      cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
    }
    
    // Ensure sentence ends with proper punctuation
    if (!cleaned.match(/[.!?]$/)) {
      cleaned += '.';
    }
    
    return cleaned;
  });
  
  // Filter out invalid sentences
  sentences = sentences.filter(sentence => {
    // Skip very short sentences
    if (sentence.length < 20) return false;
    
    // Skip sentences with weird patterns
    if (sentence.includes('**e. g.**')) return false;
    if (sentence.includes('**e. g. *')) return false;
    if (sentence.includes('(**e.g.,')) return false;
    if (sentence.includes('(*e.g.,')) return false;
    
    // Skip sentences that look like placeholders
    if (sentence.includes('[') && sentence.includes(']')) return false;
    
    return true;
  });
  
  // Ensure we have enough sentences
  if (sentences.length < minSentences) {
    // Add placeholder sentences if needed
    const placeholders = [
      "This provides valuable context for understanding the topic.",
      "Further research may offer additional insights into this area.",
      "Several key factors contribute to this phenomenon.",
      "The evidence supports these conclusions.",
      "Various sources confirm these findings."
    ];
    
    while (sentences.length < minSentences) {
      sentences.push(placeholders[sentences.length % placeholders.length]);
    }
  }
  
  // Limit to max sentences
  if (sentences.length > maxSentences) {
    sentences = sentences.slice(0, maxSentences);
  }
  
  // Join sentences and format paragraphs
  return sentences.join(' ');
}

/**
 * Helper function to format section content as bullet points if needed
 */
function formatBulletPoints(content: string): string {
  // Check if content already has bullet points
  if (content.includes('\n- ') || content.includes('\n* ')) {
    return content;
  }
  
  // Split into sentences
  const sentences = content.split(/(?<=[.!?])\s+/);
  
  // If more than 4 sentences, create bullet points
  if (sentences.length > 4) {
    // Group sentences into chunks of 2-3 for each bullet point
    const bulletPoints = [];
    for (let i = 0; i < sentences.length; i += 3) {
      const chunk = sentences.slice(i, Math.min(i + 3, sentences.length)).join(' ');
      if (chunk.trim().length > 0) {
        bulletPoints.push(`- ${chunk}`);
      }
    }
    return bulletPoints.join('\n');
  }
  
  // Otherwise, keep as paragraph
  return content;
}

/**
 * Helper function to clean up and format table sections properly
 */
function cleanupTableSection(lines: string[]): string {
  // Find table boundaries
  let tableStart = -1;
  let tableEnd = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|') && tableStart === -1) {
      tableStart = i;
    } else if (tableStart !== -1 && tableEnd === -1 && !lines[i].startsWith('|')) {
      tableEnd = i - 1;
      break;
    }
  }
  
  if (tableEnd === -1 && tableStart !== -1) {
    tableEnd = lines.length - 1;
  }
  
  let result = '';
  
  // Add the title
  if (lines[0].startsWith('#')) {
    result += '## Summary Table\n\n';
  } else {
    result += '## Summary Table\n\n';
  }
  
  // If no table found, create a default one
  if (tableStart === -1) {
    result += '| Category | Key Points |\n';
    result += '| -------- | ---------- |\n';
    result += '| Main Findings | Summary of key information |\n';
    result += '| Important Details | Overview of critical points |\n';
    result += '| Additional Context | Background information |\n';
    return result;
  }
  
  // Process the table - keep headers and first 5 rows max
  const tableLines = lines.slice(tableStart, tableEnd + 1);
  
  // Clean up the header row
  let headerRow = tableLines[0].replace(/\*\*/g, '').replace(/\*/g, '');
  
  // Find or create the separator row
  let separatorRow = tableLines.find(line => line.includes('-')) || '';
  if (!separatorRow || !separatorRow.includes('-')) {
    // Count number of columns in header
    const columnCount = (headerRow.match(/\|/g) || []).length - 1;
    separatorRow = '|';
    for (let i = 0; i < columnCount; i++) {
      separatorRow += ' ------ |';
    }
  }
  
  // Add header row
  result += headerRow + '\n';
  result += separatorRow + '\n';
  
  // Clean and add data rows (up to 5)
  const dataRows = tableLines.filter(line => 
    line.startsWith('|') && 
    line !== headerRow && 
    !line.includes('---')
  ).slice(0, 5);
  
  dataRows.forEach(row => {
    // Clean up formatting in the row
    const cleanedRow = row
      .replace(/\*\*/g, '')  // Remove bold markers
      .replace(/\*/g, '')    // Remove italic markers
      .replace(/`/g, '')     // Remove code markers
      .replace(/\[(\d+)\]/g, '') // Remove citation references
      .replace(/\s{2,}/g, ' ') // Replace multiple spaces
      .replace(/\|\s+/g, '| ') // Clean up spaces after pipe
      .replace(/\s+\|/g, ' |'); // Clean up spaces before pipe
    
    result += cleanedRow + '\n';
  });
  
  return result;
}

/**
 * Helper to clean text content from various formatting issues
 */
function cleanTextContent(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Clean HTML tags and URLs
  cleaned = cleaned.replace(/<[^>]*>?/gm, '');
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[link]');
  
  // Remove citation references from text paragraphs
  cleaned = cleaned.replace(/\[\d+\]/g, '');
  
  // Remove asterisks, code blocks, and other markdown
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ''); // Remove code blocks
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');     // Remove inline code
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');     // Remove italic
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');     // Remove strikethrough
  cleaned = cleaned.replace(/(\*\*e\.\s*g\.\s*\*\*|\*e\.\s*g\.\s*\*|e\.\s*g\.,)/gi, 'for example,'); // Fix "e.g." formatting
  cleaned = cleaned.replace(/(\*\*i\.\s*e\.\s*\*\*|\*i\.\s*e\.\s*\*|i\.\s*e\.,)/gi, 'that is,'); // Fix "i.e." formatting
  
  // Remove extraneous whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  
  return cleaned.trim();
}

/**
 * Final cleanup of the entire output to fix any remaining issues
 */
function cleanupFinalOutput(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Fix section headers (ensure proper formatting)
  cleaned = cleaned.replace(/^(#+)(?!\s)/gm, '$1 ');
  
  // Fix bullets (ensure proper spacing)
  cleaned = cleaned.replace(/^([*-])(?!\s)/gm, '$1 ');
  
  // Remove placeholder markers
  cleaned = cleaned.replace(/\[Introductory paragraph missing\]/g, '');
  cleaned = cleaned.replace(/\[Summary table missing\]/g, '');
  cleaned = cleaned.replace(/\[Conclusion paragraph missing\]/g, '');
  
  // Remove double line breaks and ensure single line breaks after sections
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Ensure blank line after headers
  cleaned = cleaned.replace(/(^|\n)(#+[^\n]+)(\n)(?!\n)/g, '$1$2\n\n');
  
  // Fix any remaining strange characters and placeholder text
  cleaned = cleaned.replace(/\*\*e\.\s*g\.\s*\*\*/gi, 'for example');
  cleaned = cleaned.replace(/\*e\.\s*g\.\s*\*/gi, 'for example');
  cleaned = cleaned.replace(/\(\*\*e\.g\.,/gi, '(for example,');
  cleaned = cleaned.replace(/\(\*e\.g\.,/gi, '(for example,');
  cleaned = cleaned.replace(/\*\*i\.\s*e\.\s*\*\*/gi, 'that is');
  cleaned = cleaned.replace(/\*i\.\s*e\.\s*\*/gi, 'that is');
  
  return cleaned;
}

export default function TestChat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showHeading, setShowHeading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputBarHeight, setInputBarHeight] = useState(96); // px, default
  const BASE_HEIGHT = 48; // px (h-12)
  const MAX_HEIGHT = BASE_HEIGHT * 3; // 3x
  const EXTRA_GAP = 32; // px
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chats, setChats] = useState([]); // You can implement chat history if needed
  const [activeChatId, setActiveChatId] = useState(null);
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

  const [showAdvanceSearch, setShowAdvanceSearch] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  
  // Deep Research hook
  const {
    steps,
    activeStepId,
    isComplete,
    isInProgress,
    error,
    webData
  } = useDeepResearch(showAdvanceSearch, currentQuery);

  const [manualStepId, setManualStepId] = useState<string | null>(null);
  const isFinalStepComplete = steps[steps.length - 1]?.status === 'completed';

  const [emptyBoxes, setEmptyBoxes] = useState<string[]>([]); // Array of box IDs

  const [showPulsingDot, setShowPulsingDot] = useState(false);

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
      setShowAdvanceSearch(false);
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
            setMessages(prev => [
              ...prev.filter(m => m.role !== 'assistant'),
              { 
                role: 'assistant', 
                content: cleanedOutput,
                webSources: webData?.sources || [],
                id: uuidv4(),
                timestamp: Date.now()
              }
            ]);
            setShowPulsingDot(false);
          }, 500);
        }
      }
    }
  }, [isComplete, currentQuery, steps, messages, webData?.sources]);

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

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const currentInput = input.trim();
    const currentSelectedFiles = selectedFilesForUpload;

    if (!currentInput && !currentSelectedFiles.length) return;

    // Store the current query for Deep Research
    setCurrentQuery(currentInput);
    
    // If Deep Research is active, show the view inline in the chat
    if (showAdvanceSearch) {
      setShowAdvanceSearch(true);
      const researchId = uuidv4();
      setMessages(prev => [
        ...prev,
        { role: "user", content: currentInput, id: uuidv4(), timestamp: Date.now() },
        { role: "deep-research", content: currentInput, researchId, id: uuidv4(), timestamp: Date.now() }
      ]);
      setInput("");
      setImagePreviewUrls([]);
      setSelectedFilesForUpload([]);
      return;
    }

    // This is the existing AI request code which we'll now only run when deep research is not active
    setIsAiResponding(true);
    setLoading(true);
    if (showHeading) setShowHeading(false);

    // Create a new abort controller for this AI response
    aiStreamAbortController.current = new AbortController();

    let userMessageContent = currentInput;
    let uploadedImageUrls: string[] = [];
    const messageId = uuidv4();
    let userMessageForDisplay: Message = {
      role: "user" as const,
      content: currentInput,
      id: messageId,
      timestamp: Date.now()
    };

    // Temp message for image upload indication
    if (currentSelectedFiles.length > 0 && !currentInput) {
      userMessageForDisplay.content = "Image selected for analysis."; // Placeholder if no text
    }

    // Add user message to chat (with or without image previews for user messages)
    if (currentSelectedFiles.length > 0) {
      // For user message display, use the local preview URLs directly
      userMessageForDisplay.imageUrls = imagePreviewUrls || undefined; 
    }
    setMessages((prev) => [...prev, userMessageForDisplay]);

    try {
      if (currentSelectedFiles.length > 0) {
        const clientSideSupabase = createSupabaseClient();
        if (!clientSideSupabase) throw new Error('Supabase client not available');
        
        // Upload each file individually and collect their public URLs
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

      // After file upload logic and before prompt construction
      let webData = {
        serperArticles: null as any,
        sources: [] as any[],
        webCitations: '' as string
      };

      // Build the image context system prompt for Nemotron
      let imageContextPrompt = "";
      if (imageContexts.length > 0) {
        // Build a system prompt with all image contexts
        imageContextPrompt = imageContexts
          .map(ctx => `Image ${ctx.order}: "${ctx.description}"`)
          .join('\n');
      }

      // Get enhanced system prompt with better follow-up handling
      // Build conversation context for better follow-up handling
      const context = buildConversationContext(messages);
      const baseSystemPrompt = SYSTEM_PROMPT;
      const enhancedSystemPrompt = enhanceSystemPrompt(baseSystemPrompt, context, currentInput);
      
      // Add image context if needed
      const systemPrompt = imageContextPrompt 
        ? `${enhancedSystemPrompt}\n\n${imageContextPrompt}`
        : enhancedSystemPrompt;

      // Format messages for API using the new utility
      const formattedMessages = formatMessagesForApi(
        systemPrompt,
        messages,
        currentInput,
        true // include context summary
      );

      // Add image URLs if needed
      if (uploadedImageUrls.length > 0) {
        // If there are images, add them to the last user message
        const lastUserMsgIndex = formattedMessages.length - 1;
        if (formattedMessages[lastUserMsgIndex].role === 'user') {
          formattedMessages[lastUserMsgIndex].imageUrls = uploadedImageUrls;
        }

        // Extract descriptions only for Gemma (keep existing logic)
        const previousImageDescriptions = imageContexts.map(ctx => ctx.description);
      }
      
      const apiPayload: any = {
        messages: formattedMessages,
        
        // Adjust parameters for more detailed responses
        temperature: 0.8,
        max_tokens: 2048,
        top_p: 0.95,
        frequency_penalty: 0.3,  // Lower to allow more detailed explanations
        presence_penalty: 0.3,   // Lower to allow more detailed explanations
      };

      // For Gemma's context, send the previous image descriptions
      if (uploadedImageUrls.length > 0) {
        // Extract descriptions only for Gemma
        const previousImageDescriptions = imageContexts.map(ctx => ctx.description);
        
        apiPayload.imageUrls = uploadedImageUrls;
        apiPayload.previousImageDescriptions = previousImageDescriptions;
        
        // If there was no text input but images, we construct a default prompt for the API
        if (!userMessageContent) {
          // Find the last user message in the formatted messages
          const lastUserMsgIndex = formattedMessages.findIndex(
            msg => msg.role === 'user'
          );
          if (lastUserMsgIndex !== -1) {
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

      if (res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        let aiMsg: Message = { 
        role: "assistant" as const,
          content: "", 
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: messageId, // Link to the user message
          imageUrls: uploadedImageUrls, // Associate assistant response with the uploaded images
          webSources: [] // Initialize webSources
        };

        // Add initial empty assistant message to the chat
      setMessages((prev) => [...prev, aiMsg]);

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
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
                    aiMsg.content += delta;
                    setMessages((prev) => {
                      const updatedMessages = [...prev];
                      const lastMsgIndex = updatedMessages.length - 1;
                      if(updatedMessages[lastMsgIndex] && updatedMessages[lastMsgIndex].role === 'assistant'){
                        updatedMessages[lastMsgIndex] = { 
                          ...updatedMessages[lastMsgIndex], 
                          content: aiMsg.content,
                          webSources: aiMsg.webSources // Preserve web sources
                        };
                      }
                      return updatedMessages;
                    });
                  }
                } catch (err) {
                  // console.error("Error parsing stream data:", err, "Data:", data);
                }
              }
            }
          }
        }
        
        // If this was an image request, store the image description for future context
        if (uploadedImageUrls.length > 0) {
          const { content } = cleanAIResponse(aiMsg.content);
          // Store a summary (first 150 chars) of the image description for context
          const descriptionSummary = content.slice(0, 150) + (content.length > 150 ? '...' : '');
          
          // Increment the image counter for each new image
          const newImageCount = imageCounter + uploadedImageUrls.length;
          setImageCounter(newImageCount);
          
          // Create new image context entries for each uploaded image
          const newImageContexts = uploadedImageUrls.map((url, index) => ({
            order: imageCounter + index + 1, // 1-based numbering
            description: descriptionSummary,
            imageUrl: url,
            timestamp: Date.now()
          }));
          
          // Add to existing image contexts, keeping a maximum of 10 for memory management
          setImageContexts(prev => {
            const updated = [...prev, ...newImageContexts];
            return updated.slice(-10); // Keep the 10 most recent image contexts
          });
        }
        
      } else {
        const data = await res.json();
        const assistantResponseContent = cleanAIResponse(data.choices?.[0]?.message?.content || data.generated_text || data.error || JSON.stringify(data) || "No response");
        const aiMsg: Message = {
          role: "assistant" as const,
          content: assistantResponseContent.content,
          id: uuidv4(),
          timestamp: Date.now(),
          parentId: messageId, // Link to the user message
          imageUrls: uploadedImageUrls, // Associate assistant response with the uploaded images
          webSources: [] // Initialize webSources
        };
        setMessages((prev) => [...prev, aiMsg]);
        
        // If this was an image request, store the image description for future context
        if (uploadedImageUrls.length > 0) {
          // Store a summary (first 150 chars) of the image description for context
          const descriptionSummary = assistantResponseContent.content.slice(0, 150) + 
            (assistantResponseContent.content.length > 150 ? '...' : '');
            
          // Increment the image counter for each new image
          const newImageCount = imageCounter + uploadedImageUrls.length;
          setImageCounter(newImageCount);
          
          // Create new image context entries for each uploaded image
          const newImageContexts = uploadedImageUrls.map((url, index) => ({
            order: imageCounter + index + 1, // 1-based numbering
            description: descriptionSummary,
            imageUrl: url,
            timestamp: Date.now()
          }));
          
          // Add to existing image contexts, keeping a maximum of 10 for memory management
          setImageContexts(prev => {
            const updated = [...prev, ...newImageContexts];
            return updated.slice(-10); // Keep the 10 most recent image contexts
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
            parentId: messageId, // Link to the user message
            imageUrls: uploadedImageUrls 
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
            parentId: messageId, // Link to the user message
            imageUrls: uploadedImageUrls 
          },
        ]);
      }
    } finally {
      setIsAiResponding(false);
      setLoading(false);
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

  return (
    <>
      <div className="min-h-screen flex flex-col" style={{ background: '#161618' }}>
        <GlobalStyles />
      {/* Hamburger menu and sidebar */}
        <div className="fixed top-4 left-4 z-50">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
      </div>
        {/* Overlay for sidebar, covers everything including footer */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/20 z-40" aria-hidden="true" />
        )}
      <Sidebar
        open={sidebarOpen}
        chats={chats}
        activeChatId={activeChatId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {}}
        onSelectChat={() => {}}
        onEditChat={() => {}}
        onDeleteChat={() => {}}
        onClearAll={() => {}}
        onOpenSearch={() => {}}
        onNavigateBoard={() => router.push('/board')}
      />
      {/* Conversation area (scrollable) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto w-full flex flex-col items-center justify-center relative"
        style={{ paddingBottom: `${inputBarHeight + EXTRA_GAP}px` }}
      >
        <div
          className={`absolute left-0 right-0 flex flex-col items-center transition-opacity duration-700 ${
            showHeading && messages.length === 0 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
            style={{ transitionDuration: '0.35s' }}
        >
            <h1 className="text-[3.2rem] font-normal text-gray-200 text-center">
            Seek and You'll find
          </h1>
        </div>
          {/* Empty boxes */}
          {messages.length === 0 && emptyBoxes.map(boxId => (
            <EmptyBox key={boxId} onClose={() => handleRemoveBox(boxId)} />
          ))}
        {/* Conversation */}
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 items-center justify-center z-10 pt-12 pb-4">
            {messages.map((msg, i) => {
              if (msg.role === "assistant") {
                const { content, thinkingTime } = cleanAIResponse(msg.content);
                const cleanContent = content.replace(/<thinking-indicator.*?\/>/g, '');
                const isStoppedMsg = cleanContent.trim() === '[Response stopped by user]';
                // Make citations clickable using webData.sources
                const processedContent = makeCitationsClickable(cleanContent, webData?.sources || []);
                // Hide pulsing dot as soon as output starts rendering
                if (showPulsingDot) setShowPulsingDot(false);
                return (
                  <motion.div
                  key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="w-full markdown-body text-left flex flex-col items-start ai-response-text"
                    style={{ color: '#fff', maxWidth: '100%', overflowWrap: 'break-word' }}
                  >
                    {/* PulsingDot: Only show if showPulsingDot is true */}
                    {i === messages.length - 1 && showPulsingDot ? (
                      <PulsingDot isVisible={true} />
                    ) : (
                      <>
                        {/* Show the sources carousel at the top of assistant message if sources exist */}
                        {(msg as any).webSources && (msg as any).webSources.length > 0 && (
                          <>
                            <WebSourcesCarousel sources={(msg as any).webSources} />
                            <div style={{ height: '1.5rem' }} />
                          </>
                        )}
                      
                        {thinkingTime && <ThinkingIndicator duration={thinkingTime} />}
                        {isStoppedMsg ? (
                          <span className="text-sm text-white italic font-light mb-2">[Response stopped by user]</span>
                        ) : (
                          <div className="w-full max-w-full overflow-hidden">
                            <TextReveal 
                              text={processedContent}
                              markdownComponents={markdownComponents}
                              webSources={(msg as any).webSources || []}
                              revealIntervalMs={220}
                  />
                </div>
                        )}
                      </>
                    )}
                  </motion.div>
                );
              } else if (msg.role === "deep-research") {
                return (
                  <DeepResearchBlock key={msg.researchId} query={msg.content} />
                );
              } else { // User message
                return (
                <div
                  key={i}
                    className="px-5 py-3 rounded-2xl shadow bg-gray-800 text-white self-end max-w-full text-lg flex flex-col items-end"
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
                </div>
          {/* If there are messages, show EmptyBox after the last message */}
          {messages.length > 0 && emptyBoxes.map(boxId => (
            <EmptyBox key={boxId} onClose={() => handleRemoveBox(boxId)} />
          ))}
        </div>
        {/* Fixed Footer Bar Behind Input */}
        <div
          className="fixed left-0 right-0 bottom-0 z-40"
          style={{ height: `${inputBarHeight}px`, background: '#161618' }}
          aria-hidden="true"
        />
      {/* Fixed Input Bar at Bottom */}
        <div ref={inputBarRef} className="fixed left-1/2 -translate-x-1/2 bottom-0 w-full max-w-3xl flex justify-center z-50" style={{ pointerEvents: 'auto' }}>
        <form
            className="w-full flex flex-col gap-2 rounded-2xl shadow-lg px-3 py-2 mx-4 mb-3"
            style={{ background: '#232323', border: '2px solid rgba(255,255,255,0.18)', boxShadow: '0 4px 32px 0 rgba(0,0,0,0.32)' }}
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
                  className="w-full border-none outline-none bg-transparent px-2 py-1 text-gray-200 text-sm placeholder-gray-500 resize-none overflow-auto self-center rounded-lg"
                  placeholder="Ask anything..."
            disabled={loading}
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
                  {/* Deep Research button with Molecule icon */}
                  <button
                    type="button"
                    className={`flex items-center gap-1.5 rounded-full bg-gray-800 hover:bg-gray-700 transition px-3 py-1.5 flex-shrink-0 ${showAdvanceSearch ? 'text-cyan-400' : 'text-gray-400'}`}
                    style={{ height: "36px" }}
                    tabIndex={0}
                    onClick={() => setShowAdvanceSearch(a => !a)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: showAdvanceSearch ? '#22d3ee' : '#a3a3a3' }}>
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
                <div className="flex flex-row gap-2 items-center">
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
                      style={{ width: "36px", height: "36px", pointerEvents: loading && !isAiResponding ? 'none' : 'auto' }}
                      onClick={isAiResponding ? handleStopAIResponse : undefined}
                      disabled={loading && !isAiResponding}
                      aria-label={isAiResponding ? "Stop AI response" : "Send"}
                    >
                      {isAiResponding ? (
                        // Stop icon (square in round button)
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="7" y="7" width="10" height="10" rx="2" fill="#374151" /> {/* Darker gray for stop icon */}
                  </svg>
                      ) : (
                        // Up arrow icon
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
        {/* Hidden file input */}
        <input 
          type="file"
          ref={fileInputRef1}
          style={{ display: 'none' }}
          onChange={handleFirstFileChange}
          accept="image/*"
          multiple
        />
    </div>
    </>
  );
}

function DeepResearchBlock({ query }: { query: string }) {
  const {
    steps,
    activeStepId,
    isComplete,
    isInProgress,
    error,
    webData
  } = useDeepResearch(true, query);
  const [manualStepId, setManualStepId] = useState<string | null>(null);
  const isFinalStepComplete = steps[steps.length - 1]?.status === 'completed';
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="w-full rounded-xl border border-neutral-800 overflow-hidden mb-2 mt-2 bg-neutral-900"
      style={{ minHeight: "300px", maxHeight: "500px" }}
    >
      <AdvanceSearch
        steps={steps}
        activeStepId={isFinalStepComplete ? manualStepId || activeStepId : activeStepId}
        onManualStepClick={isFinalStepComplete ? setManualStepId : undefined}
        manualNavigationEnabled={isFinalStepComplete}
        error={error}
        webData={webData}
      />
    </motion.div>
  );
} 