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

const SYSTEM_PROMPT = `You are a helpful, friendly, and knowledgeable AI assistant designed to provide accurate and concise answers to user queries. Respond in a conversational tone, as if you are a trusted friend explaining things clearly and naturally. Follow these guidelines:
- Provide accurate, factual, and relevant information.
- Use a neutral, respectful tone unless otherwise specified by the user.
- Break down complex topics into simple, clear explanations with examples or analogies when appropriate.
- If the query is ambiguous, ask clarifying questions to ensure the response meets the user's needs.
- For creative tasks, be imaginative but stay grounded in the user's request.
- If you don't know the answer or lack sufficient information, admit it humbly and suggest how the user might find the answer.
- Avoid biased, harmful, or offensive content, and prioritize user privacy.`;

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
    }
    .ai-response-text pre,
    .ai-response-text code {
      color: #fff !important;
      background: #232323 !important;
      border-radius: 6px;
      padding: 0.2em 0.4em;
    }
    .ai-response-text blockquote {
      color: #fff !important;
      background: #232323 !important;
      border-left: 4px solid #00bcd4;
      padding: 0.5em 1em;
      margin: 0.5em 0;
      border-radius: 6px;
    }
    .ai-response-text li {
      color: #fff !important;
      background: transparent !important;
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

export default function TestChat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; imageUrls?: string[] }[]>([]);
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

  const [deepResearchActive, setDeepResearchActive] = useState(false);

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

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const currentInput = input.trim();
    const currentSelectedFiles = selectedFilesForUpload;

    if (!currentInput && !currentSelectedFiles.length) return;

    setIsAiResponding(true);
    setLoading(true);
    if (showHeading) setShowHeading(false);

    // Create a new abort controller for this AI response
    aiStreamAbortController.current = new AbortController();

    let userMessageContent = currentInput;
    let uploadedImageUrls: string[] = [];
    let userMessageForDisplay: { role: "user"; content: string; imageUrls?: string[] } = {
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

    setInput("");
    setImagePreviewUrls([]);
    setSelectedFilesForUpload([]);

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

      // Build the image context system prompt for Nemotron
      let imageContextPrompt = "";
      if (imageContexts.length > 0) {
        // Build a system prompt with all image contexts
        imageContextPrompt = imageContexts
          .map(ctx => `Image ${ctx.order}: "${ctx.description}"`)
          .join('\n');
      }

      const systemPrompt = imageContextPrompt 
        ? `${SYSTEM_PROMPT}\n\n${imageContextPrompt}`
        : SYSTEM_PROMPT;

      const apiPayload: any = {
        messages: [
          { role: "system", content: systemPrompt },
          // Filter out previous assistant messages before sending, keep user messages
          ...messages.filter(m => m.role === 'user'), 
          // Add the current user message (text part)
          { role: "user", content: userMessageContent }
        ].filter(msg => msg.content || (msg as any).imageUrls), // Ensure content or imageUrls exists
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
        let aiMsg = { 
          role: "assistant" as const, 
          content: "", 
          imageUrls: uploadedImageUrls // Associate assistant response with the uploaded images
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
                        updatedMessages[lastMsgIndex] = { ...updatedMessages[lastMsgIndex], content: aiMsg.content };
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
        const aiMsg = {
          role: "assistant" as const,
          content: assistantResponseContent.content,
          imageUrls: uploadedImageUrls // Associate assistant response with the uploaded images
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
      e.target.value = '\0';
    }
  }

  function removeImagePreview(indexToRemove: number) {
    setImagePreviewUrls((prevUrls) => prevUrls.filter((_, index) => index !== indexToRemove));
    setSelectedFilesForUpload((prevFiles) => prevFiles.filter((_, index) => index !== indexToRemove));
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#232323' }}>
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
        >
          <h1 className="text-4xl font-semibold text-gray-200 text-center">
            Seek and You'll find
          </h1>
        </div>
        {/* Conversation */}
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-4 items-center justify-center z-10 pt-12 pb-4">
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
                  style={{ color: '#fff' }}
                >
                  {i === messages.length - 1 && isAiResponding ? (
                    <PulsingDot isVisible={true} />
                  ) : (
                    <>
                      {thinkingTime && <ThinkingIndicator duration={thinkingTime} />}
                      {isStoppedMsg ? (
                        <span className="text-sm text-white italic font-light mb-2">[Response stopped by user]</span>
                      ) : (
                        <TextReveal 
                          text={cleanContent}
                          markdownComponents={markdownComponents}
                        />
                      )}
                    </>
                  )}
                </motion.div>
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
      {/* Fixed Input Bar at Bottom */}
      <div ref={inputBarRef} className="fixed left-0 right-0 bottom-0 w-full flex justify-center z-50" style={{ pointerEvents: 'auto' }}>
        <form
          className="w-full max-w-5xl flex flex-col gap-2 rounded-2xl shadow-lg px-4 py-3 mx-4 mb-4"
          style={{ background: '#232323', border: '2px solid rgba(255,255,255,0.18)', boxShadow: '0 4px 32px 0 rgba(0,0,0,0.32)' }}
          onSubmit={handleSend}
        >
          {/* Image Preview Area - displays multiple images */}
          {imagePreviewUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {imagePreviewUrls.map((url, index) => (
                <div key={index} className="relative w-20 h-20 group">
                  <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-md" />
                  <button
                    type="button"
                    onClick={() => removeImagePreview(index)}
                    className="absolute top-1 right-1 bg-black bg-opacity-60 text-white rounded-full p-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Textarea and send/stop button row */}
          <div className="relative flex w-full gap-3 items-center">
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
            
            {/* Deep Research button with Atom icon */}
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-full bg-gray-800 hover:bg-gray-700 transition px-3 py-1.5 flex-shrink-0
                ${deepResearchActive ? 'text-cyan-400' : 'text-gray-400'}
              `}
              style={{ height: "36px" }}
              tabIndex={0}
              onClick={() => setDeepResearchActive(a => !a)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <ellipse cx="12" cy="12" rx="9" ry="3.5" />
                <ellipse cx="12" cy="12" rx="3.5" ry="9" transform="rotate(60 12 12)" />
                <ellipse cx="12" cy="12" rx="3.5" ry="9" transform="rotate(-60 12 12)" />
              </svg>
              <span className="whitespace-nowrap text-xs font-medium">Deep Research</span>
            </button>
            
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              className="flex-1 border-none outline-none bg-transparent px-2 py-1.5 text-gray-200 text-sm placeholder-gray-500 resize-none overflow-auto self-center"
              placeholder="Ask anything..."
              disabled={loading}
              rows={1}
              style={{ maxHeight: '72px', minHeight: '36px', lineHeight: '1.5' }}
            />
            
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
        </form>
      </div>
    </div>
  );
} 