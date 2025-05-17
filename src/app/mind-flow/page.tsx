"use client";

import Sidebar from "../../components/Sidebar";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MindFlowPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-row min-h-screen bg-white">
      {/* Sidebar (visible for navigation) */}
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
      {/* Main content (Mind Flow page) */}
      <div className="flex flex-col items-center justify-center flex-1 p-4">
        <h1 className="text-3xl font-semibold text-gray-800 mb-4">Mind Flow</h1>
        <p className="text-lg text-gray-600">Welcome to Mind Flow! This page is under construction.</p>
      </div>
    </div>
  );
} 