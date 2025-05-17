"use client";

import Sidebar from "../../components/Sidebar";
import HamburgerMenu from "../../components/HamburgerMenu";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Split from "react-split";

export default function VisualLearningPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const router = useRouter();

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
          {/* Left Pane */}
          <div className="flex flex-col h-full min-w-[220px] max-w-[500px] bg-white border-r border-gray-200">
            <div className="flex-1 overflow-y-auto px-3 pt-6 pb-2 flex flex-col items-center justify-center">
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Visual Input Area</h2>
              <p className="text-gray-500">(Placeholder for input or controls)</p>
            </div>
            {/* Board-style input box at bottom */}
            <form className="bg-white rounded-2xl shadow-lg w-full max-w-[480px] mx-auto flex items-center px-4 py-2 gap-2 transition-all duration-200 focus-within:ring-2 focus-within:ring-black/10 mb-6"
              autoComplete="off"
              onSubmit={e => { e.preventDefault(); }}
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
              />
              <button
                type="submit"
                aria-label="Send"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-neutral-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/30 flex-shrink-0"
                disabled={!input.trim()}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </form>
          </div>
          {/* Right Pane */}
          <div className="flex-1 flex flex-col justify-center items-center bg-white">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Visual Output Area</h2>
            <p className="text-gray-500">(Placeholder for output or visualization)</p>
          </div>
        </Split>
      </div>
    </div>
  );
} 