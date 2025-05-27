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
import { WebSource } from '@/utils/source-utils';
import { v4 as uuidv4 } from 'uuid';

const SYSTEM_PROMPT = `You are a helpful, knowledgeable, and friendly AI assistant. Your goal is to assist the user in a way that is clear, thoughtful, and genuinely useful. Follow these guidelines:

1. Clarity & Helpfulness

Always prioritize being helpful over being brief.

Provide clear, step-by-step explanations when appropriate.

Use examples to clarify complex ideas.

When explaining code, math, or technical topics, break it down gradually.

When the user asks "why" or "how," go into depth—don't oversimplify.

Offer analogies where helpful for deeper understanding.

Use diagrams or markdown formatting if supported by the interface.

If a question has multiple interpretations, briefly address each or ask for clarification.

Tailor your answer based on the user's apparent skill level or prior context.

Include potential edge cases, caveats, or alternatives if relevant.

2. Structure & Readability

Format responses with short paragraphs, bullet points, and headings where appropriate.

Use bold or italics to highlight key concepts.

Keep sentences concise, but don't sacrifice meaning or flow.

Avoid overly technical jargon unless the user is advanced or has used it first.

Always ensure readability and user comprehension.

Use code blocks for code, and quote blocks for referenced text.

End complex answers with a brief summary or takeaway.

3. Tone & Interaction

Be warm, polite, and conversational—like a thoughtful expert or tutor.

Express enthusiasm when users make progress or ask great questions.

Be curious about what the user might mean—anticipate needs.

Never be dismissive, sarcastic, or cold.

Empathize with confusion—encourage curiosity.

When the user asks for help, always respond with care and detail.

Use phrases like "Here's what I found", "Let's walk through it", or "A good way to think about this is…"

If appropriate, say "Does that help?" to invite clarification or follow-up.

 4. Flexibility & Adaptation

Adjust your tone and detail based on user behavior and input.

If the user asks for brevity or a summary, comply immediately.

If the user asks for code, generate clean, idiomatic, and well-commented examples.

When explaining code, describe what it does and why it works that way.

Support common formats: pseudocode, markdown, JSON, tables, etc.

Offer optional follow-up steps or related ideas after answering.

Recognize when a user is stuck and offer encouragement or a different approach.

Use emojis sparingly for friendliness if tone supports it.

Offer references or links when applicable (if available).

Mention limitations of an approach if relevant, but not excessively.

 5. AI Behavior Standards

Never make up facts; admit what you don't know.

If unsure, say "I'm not sure, but here's what I think based on available info."

Be transparent when you're making a guess or using assumptions.

Never fake citations or sources.

Don't argue—acknowledge and adapt.

Clarify misunderstandings gently if a user is incorrect.

Respect user intent—respond to what they mean, not just what they said.

6. Learning & Discovery

Encourage users to think critically and ask deeper questions.

When appropriate, suggest ways the user can verify or test an answer.

Share insights that go beyond the surface-level answer.

Encourage iterative problem solving—"try this and see what happens."

If there's a better way to do something, suggest it tactfully.

7. Conversation Management

Avoid repeating previously given information unless the user requests it.

If the user references earlier parts of the conversation, follow up accordingly.

Use memory (if supported) to improve helpfulness across multiple turns.

For long threads, help summarize or anchor back to the main topic.

When ending a conversation, offer follow-up options or future guidance.`;

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
Format your response like a professional research document with the following structure:

1. Begin with a 5–7 sentence introductory paragraph that welcomes the reader and introduces the topic. Do NOT use bullets or numbering in the introduction.
2. Use a clear main title at the top with a single # (e.g., "# The History of Artificial Intelligence"). Do NOT use bullets or numbering for the title.
3. Organize the main content into sections with subtitles using ## headings (e.g., "## Historical Context"). Do NOT use bullets or numbering for section titles.
4. Inside each section, use bullet points (*) for all lists. Each bullet point should be a detailed mini-paragraph (2–4 sentences) with facts, context, and analysis. Do NOT use numbered lists.
5. End with a "## Summary Table" (if appropriate) and a "## Conclusion" section.
6. Ensure all citations use [1], [2], etc. at the end of relevant sentences.
7. The output should be clean, well-spaced, and easy to read—like a professional research summary.
8. Do not use numbered lists or bullets for section titles or the main title. Only use bullet points for content inside sections.
9. Numbered lists are only allowed inside tables if needed.
10. DO NOT include a 'References' section or any list of references at the end. Only use in-text citations ([1], [2], etc.) after relevant sentences or bullet points.

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

  // Helper to show the image in chat
  const showImageMsg = (content: string, imgSrc: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "user" as const, content: `${content} <img src=\"${imgSrc}\" />` },
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

  // When deep research completes, automatically start the AI request
  useEffect(() => {
    if (isComplete && showAdvanceSearch && !isAiResponding && currentQuery) {
      // Get the final synthesized response from the steps
      const synthesisStep = steps.find(step => step.id === 'synthesize');
      if (synthesisStep?.output) {
        // Update messages with the final response
        setMessages(prev => [
          ...prev.filter(m => m.role !== 'assistant'), // Remove any pending assistant message
          { 
            role: 'assistant',
            content: synthesisStep.output
          }
        ]);
        setIsAiResponding(false);
        setLoading(false);
      }
    }
  }, [isComplete, showAdvanceSearch, isAiResponding, steps]);

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
        { role: "user", content: currentInput },
        { role: "deep-research", content: currentInput, researchId }
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
    let userMessageForDisplay: Message = {
      role: "user" as const,
      content: currentInput,
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
        wikipediaArticles: null as any,
        newsdataArticles: null as any,
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

      // Check if this is a follow-up question (not the first message)
      const isFollowUp = messages.filter(m => m.role === 'user').length > 0;
      
      // Add follow-up instruction to system prompt if needed
      let enhancedSystemPrompt = SYSTEM_PROMPT;
      if (isFollowUp) {
        enhancedSystemPrompt = `${SYSTEM_PROMPT}\n\nThis is a follow-up question. While maintaining your detailed and helpful approach, try to build on previous context rather than repeating information already covered. Focus on advancing the conversation and providing new insights.`;
      }
      
      // Prepend citation instructions ONLY for Deep Research
      if (showAdvanceSearch && webData) {
        // Format Wikipedia and NewsData.io articles for the prompt
        let wikiSection = '';
        if (webData.wikipediaArticles && webData.wikipediaArticles.length > 0) {
          wikiSection += '===WIKIPEDIA SEARCH RESULTS===\n';
          webData.wikipediaArticles.forEach((article: any, i: number) => {
            wikiSection += `[${i + 1}] Title: "${article.title}" (${article.url})\n`;
            if (article.summary) {
              const excerpt = article.summary.length > 200 ? article.summary.slice(0, 200) + '...' : article.summary;
              wikiSection += `Excerpt: ${excerpt}\n`;
            }
          });
          wikiSection += '===END WIKIPEDIA SEARCH RESULTS===\n';
        }
        let newsSection = '';
        if (webData.newsdataArticles && webData.newsdataArticles.length > 0) {
          newsSection += '===NEWSDATA.IO SEARCH RESULTS===\n';
          webData.newsdataArticles.forEach((article: any, i: number) => {
            newsSection += `[${i + 1}] Title: "${article.title}" (${article.url})\n`;
            if (article.description) {
              const excerpt = article.description.length > 200 ? article.description.slice(0, 200) + '...' : article.description;
              newsSection += `Excerpt: ${excerpt}\n`;
            }
          });
          newsSection += '===END NEWSDATA.IO SEARCH RESULTS===\n';
        }
        
        // Strong explicit instruction
        const combinedInstruction = 'IMPORTANT: You MUST use only the above Wikipedia and NewsData.io articles as your web sources. Do NOT use or invent any other web links. When citing, use numbered references [1], [2], etc. at the end of sentences or bullet points that use information from sources.';
        
        // Professional formatting instructions
        const formattingInstructions = `
IMPORTANT: Your answer MUST be at least 750 words. Do not stop before you reach this length. If you finish early, add more details, examples, or analysis until you reach the required length.

BULLET POINT DETAIL REQUIREMENT:
For each bullet point, write a detailed, self-contained summary (5–8 sentences) that explains the topic, provides context, and includes key facts or findings. Do not use single-sentence or headline-style bullets. Each bullet should be a mini-paragraph.

FORMATTING REQUIREMENTS:
1. Your response MUST follow a professional, well-structured format like a research document or report.
2. Start with a clear main title using # heading (e.g., "# Latest Developments in AI, 2025").
3. Divide content into logical sections with ## headings.
4. Use bullet points (*) for all key details and findings.
5. End with a "## Conclusion" section.
6. Include a "## Summary Table" if the information can be presented in tabular form.
7. For citations, use ONLY numbered references in square brackets [1], [2] at the end of sentences/bullets.`;
        
        enhancedSystemPrompt = `${wikiSection}\n${newsSection}\n${combinedInstruction}\n\n${formattingInstructions}\n\n${CITATION_INSTRUCTIONS}\n\n${enhancedSystemPrompt}`;
      }
      
      const systemPrompt = imageContextPrompt 
        ? `${enhancedSystemPrompt}\n\n${imageContextPrompt}`
        : enhancedSystemPrompt;

      const apiPayload: any = {
        messages: [
          { role: "system", content: systemPrompt },
          // Filter out previous assistant messages before sending, keep user messages
          ...messages.filter(m => m.role === 'user'), 
          // Add the current user message (text part)
          { role: "user", content: userMessageContent }
        ].filter(msg => msg.content || (msg as any).imageUrls), // Ensure content or imageUrls exists
        
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
          apiPayload.messages[apiPayload.messages.length -1].content = "Describe these images.";
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
          imageUrls: uploadedImageUrls, // Associate assistant response with the uploaded images
          webSources: [] // Initialize webSources
        };
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
          { role: "assistant" as const, content: "[Response stopped by user]", imageUrls: uploadedImageUrls },
        ]);
      } else {
      setMessages((prev) => [
        ...prev,
          { role: "assistant" as const, content: "Error: " + (err?.message || String(err)), imageUrls: uploadedImageUrls },
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

  return (
    <>
      <div className="min-h-screen flex flex-col" style={{ background: '#161618' }}>
        <GlobalStyles />
        {/* Hamburger menu and sidebar */}
        <div className="fixed top-6 left-6 z-50 md:static md:z-10">
          <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
        </div>
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
          {/* Conversation */}
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 items-center justify-center z-10 pt-12 pb-4">
            {messages.map((msg, i) => {
              if (msg.role === "assistant") {
                const { content, thinkingTime } = cleanAIResponse(msg.content);
                const cleanContent = content.replace(/<thinking-indicator.*?\/>/g, '');
                const isStoppedMsg = cleanContent.trim() === '[Response stopped by user]';
                return (
                  <motion.div
                  key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="w-full markdown-body text-left flex flex-col items-start ai-response-text"
                    style={{ color: '#fff', maxWidth: '100%', overflowWrap: 'break-word' }}
                  >
                    {i === messages.length - 1 && isAiResponding ? (
                      <PulsingDot isVisible={true} />
                    ) : (
                      <>
                        {thinkingTime && <ThinkingIndicator duration={thinkingTime} />}
                        {isStoppedMsg ? (
                          <span className="text-sm text-white italic font-light mb-2">[Response stopped by user]</span>
                        ) : (
                          <div className="w-full max-w-full overflow-hidden">
                            <TextReveal 
                              text={cleanContent}
                              markdownComponents={markdownComponents}
                              webSources={(msg as any).webSources || []}
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
        </div>
        {/* Fixed Footer Bar Behind Input */}
        <div
          className="fixed left-0 right-0 bottom-0 z-40"
          style={{ height: `${inputBarHeight}px`, background: '#161618', boxShadow: '0 -2px 16px 0 rgba(0,0,0,0.18)' }}
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