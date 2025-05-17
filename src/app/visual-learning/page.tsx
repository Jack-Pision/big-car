"use client";

import Sidebar from "../../components/Sidebar";
import HamburgerMenu from "../../components/HamburgerMenu";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VisualLearningPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-row min-h-screen bg-white">
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
      {/* Main content (Visual Learning page) */}
      <div className="flex flex-col items-center justify-center flex-1 p-4">
         <h1 className="text-3xl font-semibold text-gray-800 mb-4">Visual Learning</h1>
         <p className="text-lg text-gray-600">Welcome to Visual Learning! This page is under construction.</p>
      </div>
    </div>
  );
} 