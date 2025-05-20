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

const SYSTEM_PROMPT = `You are a friendly, knowledgeable AI tutor that helps students with their studies. You can answer questions, explain concepts, solve math problems step by step, assist with research, and provide clear, concise, and engaging academic help across all subjects.

Always use a friendly and encouraging tone. Tailor your answers to the student's level of understanding—ask clarifying questions if needed. For math problems, always show detailed steps. For essays or writing help, explain grammar and structure.

If the question is vague, ask for clarification.
If code is involved, explain it clearly with proper formatting and plain language.
Keep your tone warm, helpful, and curious—like a supportive teacher or study partner.

You are optimized to help with:

Math (from basic arithmetic to advanced topics like calculus and linear algebra)

Science (physics, chemistry, biology)

Computer science (coding, algorithms, theory)

Writing (essays, grammar, research papers)

History, literature, philosophy

Study tips and learning strategies

Research assistance, including citations

If a visual or diagram would help, mention that a visual explanation might be useful.
If something can't be answered, admit it honestly and suggest how to find the answer.

When writing math, always use \$...\$ for inline math and \$\$...\$\$ for block equations so that math renders beautifully.

For every equation, formula, or calculation step, always use block math with \$\$...\$\$ so it appears large and centered. Do not use inline math for equations or steps—only use inline math for very short expressions within sentences.`;

function cleanAIResponse(text: string): string {
  if (typeof text !== 'string') {
    return ''; // Or handle non-string input as appropriate
  }
  let cleanedText = text;
  // Iteratively remove <think>...</think> blocks
  while (/<think>[\s\S]*?<\/think>/gi.test(cleanedText)) {
    cleanedText = cleanedText.replace(/<think>[\s\S]*?<\/think>/gi, '');
  }
  return cleanedText.trim();
}

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

export default function TestChat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; imageUrl?: string }[]>([]);
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

  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [selectedFileForUpload, setSelectedFileForUpload] = useState<File | null>(null);

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
    const currentSelectedFile = selectedFileForUpload;

    if (!currentInput && !currentSelectedFile) return;

    setLoading(true);
    if (showHeading) setShowHeading(false);

    let userMessageContent = currentInput;
    let uploadedImageUrl: string | undefined = undefined;
    let userMessageForDisplay: { role: "user"; content: string; imageUrl?: string } = {
      role: "user" as const,
      content: currentInput,
    };

    // Temp message for image upload indication
    if (currentSelectedFile && !currentInput) {
      userMessageForDisplay.content = "Image selected for analysis."; // Placeholder if no text
    }

    // Add user message to chat (with or without image preview for user message)
    if (currentSelectedFile) {
      // For user message display, use the local preview URL directly
      userMessageForDisplay.imageUrl = imagePreviewUrl || undefined; 
    }
    setMessages((prev) => [...prev, userMessageForDisplay]);

    setInput("");
    setImagePreviewUrl(null);
    setSelectedFileForUpload(null);

    try {
      if (currentSelectedFile) {
        const clientSideSupabase = createSupabaseClient();
        if (!clientSideSupabase) throw new Error('Supabase client not available');
        const fileExt = currentSelectedFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;
        const { data: uploadResult, error: uploadError } = await clientSideSupabase.storage
          .from('images2')
          .upload(filePath, currentSelectedFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = clientSideSupabase.storage
          .from('images2')
          .getPublicUrl(filePath);
        uploadedImageUrl = urlData.publicUrl;
        if (!uploadedImageUrl) throw new Error('Failed to get public URL after upload');
      }

      const apiPayload: any = {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          // Filter out previous assistant messages before sending, keep user messages
          ...messages.filter(m => m.role === 'user'), 
          // Add the current user message (text part)
          { role: "user", content: userMessageContent }
        ].filter(msg => msg.content || (msg as any).imageUrl), // Ensure content or imageUrl exists
      };

      if (uploadedImageUrl) {
        apiPayload.imageUrl = uploadedImageUrl;
        // If there was no text input but an image, we construct a default prompt for the API
        // but the displayed user message might just show the image
        if (!userMessageContent) {
          apiPayload.messages[apiPayload.messages.length -1].content = "Describe this image.";
        }
      }
      
      const res = await fetch("/api/nvidia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });

      if (res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        let aiMsg = { 
          role: "assistant" as const, 
          content: "", 
          imageUrl: uploadedImageUrl // Associate assistant response with the uploaded image
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
      } else {
        const data = await res.json();
        const assistantResponseContent = cleanAIResponse(data.choices?.[0]?.message?.content || data.generated_text || data.error || JSON.stringify(data) || "No response");
        const aiMsg = {
          role: "assistant" as const,
          content: assistantResponseContent,
          imageUrl: uploadedImageUrl // Associate assistant response with the uploaded image
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, content: "Error: " + (err?.message || String(err)), imageUrl: uploadedImageUrl },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Handler for the first plus button click
  function handleFirstPlusClick() {
    fileInputRef1.current?.click();
  }

  // Handler for the first plus button file upload
  async function handleFirstFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileForUpload(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      // Do not upload or send to API here yet
    }
    // Clear the file input so the same file can be selected again if removed and re-added
    if (e.target) {
      e.target.value = '\0';
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
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
          <h1 className="text-4xl font-semibold text-gray-800 text-center">
            Seek and You'll find
          </h1>
        </div>
        {/* Conversation */}
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-4 items-center justify-center z-10 pt-12 pb-4">
          {messages.map((msg, i) => {
            if (msg.role === "assistant") {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="w-full markdown-body text-left flex flex-col items-start"
                >
                  {/* No image for assistant messages */}
                  <ReactMarkdown
                    components={markdownComponents}
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </motion.div>
              );
            } else { // User message
              return (
                <div
                  key={i}
                  className="px-5 py-3 rounded-2xl shadow bg-black text-white self-end max-w-full text-lg flex flex-col items-end"
                  style={{ wordBreak: "break-word" }}
                >
                  {msg.imageUrl && (
                     <img 
                      src={msg.imageUrl} 
                      alt="Preview" 
                      className="max-w-xs max-h-64 rounded-md mb-2 self-end" 
                    />
                  )}
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
          className="w-full max-w-5xl flex flex-col gap-2 bg-white rounded-2xl shadow-lg px-6 py-4 mx-4 mb-4 border border-gray-300"
          style={{ boxShadow: "0 4px 32px 0 rgba(0,0,0,0.08)" }}
          onSubmit={handleSend}
        >
          {/* Image Preview Area */}
          {imagePreviewUrl && (
            <div className="relative mb-2 w-24 h-24 group">
              <img src={imagePreviewUrl} alt="Preview" className="w-full h-full object-cover rounded-md" />
              <button
                type="button"
                onClick={() => {
                  setImagePreviewUrl(null);
                  setSelectedFileForUpload(null);
                }}
                className="absolute top-1 right-1 bg-black bg-opacity-50 text-white rounded-full p-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          )}
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full border-none outline-none bg-transparent px-4 text-gray-700 text-lg placeholder-gray-400 resize-none overflow-auto"
            placeholder="Ask anything"
            disabled={loading}
            rows={1}
            style={{height: '48px', maxHeight: '144px'}}
          />
          {/* Hidden file input for dark plus button */}
          <input
            ref={fileInputRef1}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFirstFileChange}
          />
          {/* Bottom row: icons left, send button right */}
          <div className="flex flex-row gap-2">
            <button type="button" className="p-2 rounded-full border border-gray-300 hover:bg-gray-100">
              <svg width="22" height="22" fill="none" stroke="#222" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button type="button" className="p-2 rounded-full bg-black text-white hover:bg-gray-900 transition" onClick={handleFirstPlusClick}>
              <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="submit"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-gray-900 transition"
              disabled={loading || !input.trim()}
            >
              <svg width="22" height="22" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 