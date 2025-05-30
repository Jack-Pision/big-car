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
import SessionSidebar from '../../components/SessionSidebar';
import { Session, Chat as ChatType, Message as DbMessage } from '../../lib/types';
import { 
  createSession, 
  getSessions, 
  getSession,
  createChat, 
  getChat,
  updateChatMessages,
  ensureTablesExist,
  getChats
} from '../../lib/session-service';

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

// Define the Message interface locally to avoid conflicts
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

// Convert between DB Message type and local Message type
function convertDbMessagesToLocal(dbMessages: DbMessage[]): Message[] {
  return dbMessages.map(msg => {
    // Convert WebSource from DB format to local format
    const webSources = msg.webSources?.map(source => ({
      title: source.title,
      url: source.url,
      icon: source.icon || '/icons/web-icon.svg', // Default icon
      type: source.type || 'web', // Default type
      favicon: source.favicon,
      snippet: source.snippet
    })) as WebSource[] | undefined;

    return {
      ...msg,
      webSources
    };
  });
}

// Convert local Message type to DB Message type
function convertLocalMessagesToDb(messages: Message[]): DbMessage[] {
  return messages;
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
  // Track if the user has sent the first message (for animation)
  const [hasInteracted, setHasInteracted] = useState(false);

  // This will control the position of the input box and heading (centered vs bottom)
  const inputPosition = isChatEmpty && !hasInteracted ? "center" : "bottom";

  // Add session state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

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

  // Initialize sessions and tables
  useEffect(() => {
    // Ensure tables exist when component mounts
    const initializeSupabase = async () => {
      await ensureTablesExist();
      
      // Check for default session
      const sessions = await getSessions();
      if (sessions.length === 0) {
        // Create a default session if none exist
        const defaultSession = await createSession('Default Session');
        if (defaultSession) {
          setCurrentSessionId(defaultSession.id);
          // Create a default chat
          const defaultChat = await createChat(defaultSession.id);
          if (defaultChat) {
            setCurrentChatId(defaultChat.id);
          }
        }
      } else {
        // Use the first session
        setCurrentSessionId(sessions[0].id);
        // Get chats for this session
        const chats = await getChats(sessions[0].id);
        if (chats.length > 0) {
          setCurrentChatId(chats[0].id);
          // Load chat messages with conversion
          setMessages(convertDbMessagesToLocal(chats[0].messages || []));
        } else {
          // Create a new chat if none exist
          const newChat = await createChat(sessions[0].id);
          if (newChat) {
            setCurrentChatId(newChat.id);
          }
        }
      }
    };

    initializeSupabase();
  }, []);

  // Save messages when they change
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      updateChatMessages(currentChatId, convertLocalMessagesToDb(messages));
    }
  }, [messages, currentChatId]);

  // Handle selecting a chat
  const handleSelectChat = async (chatId: string, sessionId: string) => {
    setIsLoadingChat(true);
    setCurrentSessionId(sessionId);
    setCurrentChatId(chatId);
    
    // Load chat messages
    const chat = await getChat(chatId);
    if (chat) {
      setMessages(convertDbMessagesToLocal(chat.messages || []));
    } else {
      setMessages([]);
    }
    setIsLoadingChat(false);
  };

  // Handle creating a new chat
  const handleNewChat = (sessionId: string) => {
    // Clear current messages
    setMessages([]);
    setCurrentSessionId(sessionId);
    // The created chat ID will be set by the sidebar component
  };

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const currentInput = input.trim();
    const currentSelectedFiles = selectedFilesForUpload;

    if (!currentInput && !currentSelectedFiles.length) return;
    if (!hasInteracted) setHasInteracted(true);

    // Store the current query for Deep Research
    setCurrentQuery(currentInput);
    
    // If Advance Search UI mode is active, process as Advance Search
    if (showAdvanceSearchUI) {
      setIsAdvanceSearchActive(true); // Activate the processing state
      const researchId = uuidv4();
      
      // Always add a new user message and research block for each query
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

  // Add a function to clear the Advance Search conversation history
  function clearAdvanceSearchHistory() {
    setAdvanceSearchHistory({
      previousQueries: [],
      previousResponses: []
    });
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 antialiased text-gray-900 dark:text-gray-100">
      {/* Session sidebar */}
      {sidebarOpen && (
        <SessionSidebar
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          currentChatId={currentChatId || undefined}
          currentSessionId={currentSessionId || undefined}
        />
      )}
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center border-b border-gray-200 dark:border-gray-800 px-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {sidebarOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <h1 className="ml-4 text-xl font-semibold">AI Study App</h1>
        </header>
        
        {/* Main content area */}
        <main className="flex-1 overflow-hidden">
          {isLoadingChat ? (
            <div className="flex items-center justify-center h-full">
              <div className="loader">Loading...</div>
            </div>
          ) : (
            <div className="min-h-screen flex flex-col" style={{ background: '#161618' }}>
              {/* Existing chat interface */}
              <div className="flex-1 flex flex-col">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 pb-0">
                  {/* Rest of the existing UI */}
                  <GlobalStyles />
                  
                  {/* The rest of your existing chat UI */}
                  {/* ... existing chat message rendering code ... */}
                </div>
                
                {/* Input area */}
                <div className="px-4 pb-4" style={{ marginBottom: `${EXTRA_GAP}px` }}>
                  {/* ... existing input UI ... */}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
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
    </motion.div>
  );
} 