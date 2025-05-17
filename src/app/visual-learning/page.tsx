"use client";

import Sidebar from "../../components/Sidebar";
import HamburgerMenu from "../../components/HamburgerMenu";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VisualLearningPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      {/* Main content: Two-pane split layout */}
      <div className="flex-1 h-screen flex flex-row">
        {/* Left Pane */}
        <div className="flex flex-col h-full min-w-[220px] max-w-[500px] bg-white border-r border-gray-200 justify-center items-center">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Visual Input Area</h2>
          <p className="text-gray-500">(Placeholder for input or controls)</p>
        </div>
        {/* Right Pane */}
        <div className="flex-1 flex flex-col justify-center items-center bg-white">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Visual Output Area</h2>
          <p className="text-gray-500">(Placeholder for output or visualization)</p>
        </div>
      </div>
    </div>
  );
} 