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

// Post-process AI response to enforce a single # title and regular paragraphs
function enforceSingleTitleAndParagraphs(markdown: string): string {
  if (typeof markdown !== 'string' || !markdown) return '';

  const mathPlaceholders: { id: string; content: string; type: 'block' | 'inline' }[] = [];
  let placeholderCounter = 0;

  // Temporarily replace LaTeX block expressions ($$...$$)
  let tempMarkdown = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
    const id = `__MATH_PLACEHOLDER_${placeholderCounter++}__`;
    mathPlaceholders.push({ id, content: match, type: 'block' });
    return id;
  });

  // Temporarily replace LaTeX inline expressions ($...$)
  tempMarkdown = tempMarkdown.replace(/(?<!\$)\$([^$\n\r]+?)\$(?!\$)/g, (match) => {
    const id = `__MATH_PLACEHOLDER_${placeholderCounter++}__`;
    mathPlaceholders.push({ id, content: match, type: 'inline' });
    return id;
  });

  const lines = tempMarkdown.split(/\r?\n/);
  let foundTitle = false;
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!foundTitle && /^#\s+/.test(line)) {
      processedLines.push(line); // Keep the first # heading
      foundTitle = true;
    } else if (/^#\s+/.test(line)) {
      // Skip additional # headings if a title is already found
      continue;
    } else {
      processedLines.push(line);
    }
  }
  
  let result = processedLines.join('\n');
  // Collapse multiple blank lines.
  result = result.replace(/\n(\s*\n){2,}/g, '\n\n');

  // Restore LaTeX expressions from placeholders
  // Iterate in reverse to handle potential (though unlikely here) placeholder "nesting" if IDs were not unique
  for (let i = mathPlaceholders.length - 1; i >= 0; i--) {
    const placeholder = mathPlaceholders[i];
    result = result.replace(placeholder.id, placeholder.content);
  }

  return result.trim();
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

    setLoading(true);
    if (showHeading) setShowHeading(false);

    let userMessageContent = currentInput;
    let uploadedImageUrls: string[] = [];
    let userMessageForDisplay: { role: "user"; content: string; imageUrls?: string[] } = {
      role: "user" as const,
      content: currentInput,
    };

    // Temp message for image upload indication
    if (currentSelectedFiles.length > 0 && !currentInput) {
      userMessageForDisplay.content = "Images selected for analysis."; // Placeholder if no text
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

      const apiPayload: any = {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          // Filter out previous assistant messages before sending, keep user messages
          ...messages.filter(m => m.role === 'user'), 
          // Add the current user message (text part)
          { role: "user", content: userMessageContent }
        ].filter(msg => msg.content || (msg as any).imageUrls), // Ensure content or imageUrls exists
      };

      if (uploadedImageUrls.length > 0) {
        apiPayload.imageUrls = uploadedImageUrls;
        // If there was no text input but images, we construct a default prompt for the API
        // but the displayed user message might just show the images
        if (!userMessageContent) {
          apiPayload.messages[apiPayload.messages.length -1].content = "Describe these images.";
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
        let accumulatedContent = '';
        let fullAccumulatedStreamedText = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullAccumulatedStreamedText += chunk;

          // Split by newlines in case multiple chunks arrive at once
          chunk.split('\n').forEach(line => {
            if (line.startsWith('data:')) {
              try {
                const json = JSON.parse(line.replace('data:', '').trim());
                const content = json.choices?.[0]?.delta?.content || '';
                // Insert a space if needed between accumulatedContent and new content
                if (
                  accumulatedContent &&
                  content &&
                  /[\w\)]$/.test(accumulatedContent) &&
                  /^[\w\(]/.test(content)
                ) {
                  accumulatedContent += ' ';
                }
                accumulatedContent += content;
              } catch (e) {
                // Ignore parse errors
              }
            }
          });
        }

        // Optionally, add a newline after punctuation if not followed by a newline
        accumulatedContent = accumulatedContent.replace(/([.!?])([^\n])/g, '$1\n$2');

        console.log("Raw AI Output (Before cleanAIResponse):", fullAccumulatedStreamedText);
        console.log("Accumulated AI Content:", accumulatedContent);

        let cleanedResponse = cleanAIResponse(accumulatedContent);
        console.log("AI Output (After cleanAIResponse, Before enforceSingleTitleAndParagraphs):", cleanedResponse);

        const formattedContent = enforceSingleTitleAndParagraphs(cleanedResponse);
        console.log("AI Output (After enforceSingleTitleAndParagraphs):", formattedContent);

        const aiMsg = {
          role: "assistant" as const,
          content: formattedContent,
          imageUrls: uploadedImageUrls // Preserve any uploaded image URLs
        };

        setMessages((prev) => [...prev, aiMsg]);
        setLoading(false);
      } else {
        const data = await res.json();
        const assistantResponseContent = cleanAIResponse(data.choices?.[0]?.message?.content || data.generated_text || data.error || JSON.stringify(data) || "No response");
        const formattedContent = enforceSingleTitleAndParagraphs(
          assistantResponseContent
            .replace(/\. /g, '.\n\n')
            .replace(/\n\n\n+/g, '\n\n')
        );
        const aiMsg = {
          role: "assistant" as const,
          content: formattedContent,
          imageUrls: uploadedImageUrls // Associate assistant response with the uploaded images
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, content: "Error: " + (err?.message || String(err)), imageUrls: uploadedImageUrls },
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
          className="w-full max-w-5xl flex flex-col gap-2 bg-white rounded-2xl shadow-lg px-6 py-4 mx-4 mb-4 border border-gray-300"
          style={{ boxShadow: "0 4px 32px 0 rgba(0,0,0,0.08)" }}
          onSubmit={handleSend}
        >
          {/* Image Preview Area - displays multiple images */}
          {imagePreviewUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {imagePreviewUrls.map((url, index) => (
                <div key={index} className="relative w-24 h-24 group">
                  <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-md" />
                  <button
                    type="button"
                    onClick={() => removeImagePreview(index)}
                    className="absolute top-1 right-1 bg-black bg-opacity-50 text-white rounded-full p-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
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
            multiple // Allow multiple file selection
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
      {/* Hardcoded Markdown Test Block */}
      <div className="w-full max-w-3xl mx-auto my-6">
        <ReactMarkdown
          className="markdown-body"
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {`
# Test: Markdown & Math

**Bold text** and *italic text*.

- List item 1
- List item 2

1. Numbered item 1
2. Numbered item 2

Inline math: $x^2 + y^2 = z^2$

Block math:
$$
\int_{0}^{1} x^2 dx = \frac{1}{3}
$$
          `}
        </ReactMarkdown>
      </div>
    </div>
  );
} 