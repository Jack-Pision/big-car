"use client";

import Sidebar from "../../components/Sidebar";
import HamburgerMenu from "../../components/HamburgerMenu";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Split from "react-split";

const SYSTEM_PROMPT = `You are a Manim animation generator. For every user request, respond ONLY with valid Python code using the Manim library. Do not include explanations, markdown, or images—just the code for a Scene class.`;

// Utility to clean code fences from AI response
function cleanManimCode(aiContent: string): string {
  let code = aiContent.replace(/```[a-zA-Z]*\n?|```/g, '').trim();
  // Auto-insert math import if sqrt is used but not imported
  if (code.includes('sqrt(') && !code.includes('from math import sqrt')) {
    code = 'from math import sqrt\n' + code;
  }
  // Auto-wrap in Scene class if missing
  if (!/class [A-Za-z0-9_]+\(Scene\)/.test(code)) {
    code = `from manim import *\n\nclass AutoScene(Scene):\n    def construct(self):\n        ${code.split('\n').map(line => '        ' + line).join('\n')}\n`;
  }
  return code;
}

export default function VisualLearningPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [manimLoading, setManimLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);
    setVideoUrl(null); // Reset video on new input
    setRenderError(null); // Reset error on new input
    // Send to AI (placeholder logic, can be replaced with your own endpoint)
    try {
      const res = await fetch("/api/nvidia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
            { role: "user", content: userMsg }
          ],
          stream: false,
        }),
      });
      const data = await res.json();
      const aiContent = data.choices?.[0]?.message?.content || "[No response]";
      setMessages(prev => [...prev, { role: "assistant", content: aiContent }]);
      // Detect Manim code (simple heuristic)
      let manimCode = cleanManimCode(aiContent);
      console.log("Sending Manim code:", manimCode);
      if (/from manim import/.test(aiContent) && /class [A-Za-z0-9_]+\(Scene\)/.test(aiContent)) {
        setManimLoading(true);
        try {
          const formData = new FormData();
          formData.append("code", manimCode);
          const manimRes = await fetch("https://big-car-1.onrender.com/render", {
            method: "POST",
            body: formData,
          });
          if (manimRes.ok) {
            const blob = await manimRes.blob();
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
            setRenderError(null);
          } else {
            const errorData = await manimRes.json();
            setRenderError(errorData.error || "Unknown rendering error");
            setVideoUrl(null);
          }
        } catch (err) {
          setRenderError("Failed to communicate with backend: " + (err instanceof Error ? err.message : String(err)));
          setVideoUrl(null);
        }
        setManimLoading(false);
      } else {
        // Fallback: use a hardcoded valid Manim scene
        const fallbackCode = `from manim import *\n\nclass FallbackScene(Scene):\n    def construct(self):\n        text = Text(\"This is a fallback animation.\").scale(1.5)\n        self.play(Write(text))\n        self.wait(2)\n`;
        setManimLoading(true);
        try {
          const formData = new FormData();
          formData.append("code", fallbackCode);
          const manimRes = await fetch("https://big-car-1.onrender.com/render", {
            method: "POST",
            body: formData,
          });
          if (manimRes.ok) {
            const blob = await manimRes.blob();
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
            setRenderError(null);
          } else {
            const errorData = await manimRes.json();
            setRenderError(errorData.error || "Unknown rendering error");
            setVideoUrl(null);
          }
        } catch (err) {
          setRenderError("Failed to communicate with backend: " + (err instanceof Error ? err.message : String(err)));
          setVideoUrl(null);
        }
        setManimLoading(false);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "[Error: Failed to get response from AI]" }]);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-row bg-white">
      {/* Hamburger menu and sidebar */}
      <div className="fixed top-4 left-4 z-50 md:static md:z-10">
        <HamburgerMenu open={sidebarOpen} onClick={() => setSidebarOpen(o => !o)} />
      </div>
      <Sidebar
        open={sidebarOpen}
        chats={[]}
        activeChatId={null}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {}}
        onSelectChat={() => {}}
        onEditChat={() => {}}
        onDeleteChat={() => {}}
        onClearAll={() => {}}
        onOpenSearch={() => {}}
        onNavigateBoard={() => router.push('/board')}
      />
      {/* Main content: Movable split layout */}
      <div className="flex-1 h-screen flex flex-col">
        <Split
          className="flex-1 h-full custom-split-gutter"
          sizes={[30, 70]}
          minSize={[220, 320]}
          expandToMin={false}
          gutterSize={8}
          gutterAlign="center"
          snapOffset={0}
          dragInterval={1}
          direction="horizontal"
          cursor="col-resize"
          style={{ display: 'flex', flex: 1, height: '100%' }}
        >
          {/* Left Pane: Chat */}
          <div className="flex flex-col h-full min-w-[220px] max-w-[500px] bg-white border-r border-gray-200">
            <div className="flex-1 overflow-y-auto px-3 pt-6 pb-2" ref={chatRef}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2`}>
                  <div
                    className={`rounded-xl px-3 py-2 text-sm shadow ${msg.role === "user" ? "bg-blue-100 text-[#1A1A1A]" : "bg-gray-100 text-[#1A1A1A]"}`}
                    style={{ maxWidth: "80%" }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start mb-2">
                  <div className="rounded-xl px-3 py-2 text-sm shadow bg-gray-100 text-[#1A1A1A] opacity-70" style={{ maxWidth: "80%" }}>
                    ...
                  </div>
                </div>
              )}
            </div>
            {/* Input box at bottom */}
            <form className="bg-white rounded-2xl shadow-lg w-full max-w-[480px] mx-auto flex items-center px-4 py-2 gap-2 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10 mb-6"
              autoComplete="off"
              onSubmit={handleSend}
              aria-label="Visual input form"
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type something..."
                className="flex-1 bg-transparent outline-none border-none text-base text-neutral-900 placeholder-gray-400 px-2 py-2 focus:ring-0 min-w-0"
                aria-label="Type something"
                maxLength={200}
                disabled={loading}
              />
              <button
                type="submit"
                aria-label="Send"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30 flex-shrink-0"
                disabled={!input.trim() || loading}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </form>
          </div>
          {/* Right Pane: Video player or placeholder */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {videoUrl ? (
              <video src={videoUrl} controls autoPlay style={{ width: "100%", maxHeight: "500px", borderRadius: "8px" }} />
            ) : (
              <div style={{ color: "#888" }}>AI-generated animations will appear here.</div>
            )}
          </div>
        </Split>
      </div>
    </div>
  );
} 