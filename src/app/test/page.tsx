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
You must use ONLY these sources - do not make up or reference other sources.

STEP 3 - SYNTHESIS & OUTPUT:
Format your response with the following structure:

1. Introductory Paragraph: Begin with a 3–4 sentence introductory paragraph that welcomes the reader and introduces the topic. This paragraph should be plain text and should NOT contain citations.

2. Dynamic Sections:
   - Organize the main content into as many sections as needed for the topic.
   - Each section should have a clear '## Section Title' header (e.g., '## Political Science Trends'). Do NOT use bullets or numbering for section titles.
   - Inside each section, use bullet points (*) for all lists.
   - Each bullet point should be a detailed mini-paragraph (2–4 sentences) with facts, context, and analysis, followed by an in-text citation (e.g., [1]).

3. Summary Table (Before Conclusion): Before the conclusion, include a plain text summary paragraph that synthesizes the main findings from all sections. This summary should NOT contain citations.

4. Conclusion Paragraph: End with a plain text conclusion paragraph that summarizes overall insights and key themes. This paragraph should NOT contain citations.

Citation Rules:
- Citations (e.g., [1], [2]) should ONLY appear at the end of relevant sentences within bullet points.
- Do NOT include citations in the introductory paragraph, summary paragraph, or conclusion paragraph.
- Do NOT include a 'References' section or any list of references at the end.

General Formatting:
- The output should be clean, well-spaced, and easy to read—like a professional research summary.
- Do not use numbered lists (except inside tables if needed for a Summary Table, which is optional).
- Do not use bullets or numbering for section titles or the main title.

Remember to:
- Show your thinking process using <think> tags in Step 1
- Use ONLY the provided search results as sources
- Write detailed, informative bullet points (2-4 sentences each)
- Maintain professional formatting throughout`;

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
  // Split into lines for easier processing
  const lines = output.split('\n');
  let intro = '';
  let sections: string[] = [];
  let summaryTable = '';
  let conclusion = '';
  let currentSection: string[] = [];
  let inSummaryTable = false;
  let inSection = false;
  let inConclusion = false;
  let foundIntro = false;
  let foundConclusion = false;
  let introSentenceCount = 0;

  // Helper to check if a line is a section header
  const isSectionHeader = (line: string) => line.startsWith('## ') && !/summary table|conclusion/i.test(line);
  const isSummaryTableHeader = (line: string) => line.toLowerCase().includes('summary table');
  const isConclusionHeader = (line: string) => line.toLowerCase().includes('conclusion');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Remove citations from all lines
    line = line.replace(/\s*\[\d+\]/g, '');
    // Remove citations from bullet points
    if (line.trim().startsWith('*')) {
      line = line.replace(/\s*\[\d+\]/g, '');
    }
    // Collect intro (3-4 sentences, no citations)
    if (!foundIntro && line && !line.startsWith('#')) {
      const sentences = line.match(/[^.!?]+[.!?]+/g) || [];
      for (const sentence of sentences) {
        if (introSentenceCount < 4) {
          intro += (intro ? ' ' : '') + sentence.trim();
          introSentenceCount++;
        }
      }
      if (introSentenceCount >= 3) {
        foundIntro = true;
      }
      continue;
    }
    if (isSummaryTableHeader(line)) {
      inSummaryTable = true;
      summaryTable += line + '\n';
      continue;
    }
    if (inSummaryTable) {
      if (line.startsWith('## ') && !isSummaryTableHeader(line)) {
        inSummaryTable = false;
      } else {
        summaryTable += line + '\n';
        continue;
      }
    }
    if (isConclusionHeader(line)) {
      inConclusion = true;
      foundConclusion = true;
      conclusion += line + '\n';
      continue;
    }
    if (inConclusion) {
      conclusion += line + '\n';
      continue;
    }
    if (isSectionHeader(line)) {
      if (currentSection.length) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }
      currentSection.push(line);
      inSection = true;
      continue;
    }
    if (inSection) {
      currentSection.push(line);
    }
  }
  if (currentSection.length) {
    sections.push(currentSection.join('\n'));
  }

  // Clean up and enforce order
  let result = '';
  result += intro.trim() ? intro.trim() + '\n\n' : '[Introductory paragraph missing]\n\n';
  if (sections.length) {
    result += sections.join('\n\n') + '\n\n';
  } else {
    result += '[Sections missing]\n\n';
  }
  if (summaryTable.trim()) {
    result += summaryTable.trim() + '\n\n';
  }
  result += conclusion.trim() ? conclusion.trim() : '[Conclusion paragraph missing]';
  return result.trim();
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

  // Function to clean AI output by removing any References section and unwanted content after conclusion
  const cleanAIOutput = (output: string): string => {
    if (!output) return output;
    
    // First, check if there's a References section and remove it
    const referencesMatch = output.match(/(?:^|\n)#+\s*References?.*?$/im);
    if (referencesMatch) {
      output = output.substring(0, referencesMatch.index);
    }
    
    // Next, find the Conclusion section and ensure nothing follows it
    const conclusionMatch = output.match(/(?:^|\n)#+\s*Conclusion.*?(?:$|\n#+)/im);
    if (conclusionMatch) {
      const conclusionEnd = conclusionMatch.index! + conclusionMatch[0].length;
      // If the match ends with a new heading, exclude that heading
      const nextHeadingMatch = conclusionMatch[0].match(/\n#+\s*\w+/);
      const adjustment = nextHeadingMatch ? nextHeadingMatch[0].length : 0;
      output = output.substring(0, conclusionEnd - adjustment);
    }
    
    return output.trim();
  };

  // In the useEffect that processes the synthesis output, enforce the structure before displaying
  useEffect(() => {
    if (isComplete && currentQuery) {
      const synthesisStep = steps.find(step => step.id === 'synthesize');
      if (synthesisStep?.output) {
        setShowPulsingDot(true);
        let cleanedOutput = cleanAIOutput(synthesisStep.output);
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
          }, 800);
        } else {
          setShowPulsingDot(false);
        }
        setIsAiResponding(false);
        setLoading(false);
      }
    }
  }, [isComplete, steps, currentQuery, messages]);

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