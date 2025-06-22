'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#161618] text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#161618]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/test')}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                aria-label="Back to chat"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5m7-7l-7 7 7 7"/>
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-white">Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <img src="/Logo.svg" alt="App Logo" className="h-8 w-auto" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Welcome Card */}
          <div className="col-span-full">
            <div className="rounded-2xl border shadow-lg p-6" style={{ backgroundColor: '#1a1a1a', borderColor: '#333333' }}>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to Your Dashboard</h2>
              <p className="text-gray-400">Manage your AI chat sessions, view analytics, and customize your experience.</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="rounded-2xl border shadow-lg p-6" style={{ backgroundColor: '#1a1a1a', borderColor: '#333333' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Chat Sessions</h3>
                <p className="text-2xl font-bold text-cyan-400">24</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">Total conversations</p>
          </div>

          <div className="rounded-2xl border shadow-lg p-6" style={{ backgroundColor: '#1a1a1a', borderColor: '#333333' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="9" y1="9" x2="15" y2="9"/>
                  <line x1="9" y1="13" x2="15" y2="13"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Artifacts</h3>
                <p className="text-2xl font-bold text-purple-400">12</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">Documents created</p>
          </div>

          <div className="rounded-2xl border shadow-lg p-6" style={{ backgroundColor: '#1a1a1a', borderColor: '#333333' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Activity</h3>
                <p className="text-2xl font-bold text-green-400">89%</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">This week</p>
          </div>

          {/* Quick Actions */}
          <div className="col-span-full">
            <div className="rounded-2xl border shadow-lg p-6" style={{ backgroundColor: '#1a1a1a', borderColor: '#333333' }}>
              <h3 className="text-xl font-semibold text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button 
                  onClick={() => router.push('/test')}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-gray-700/50 transition-colors"
                >
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-white">New Chat</span>
                </button>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="col-span-full lg:col-span-2">
            <div className="rounded-2xl border shadow-lg p-6" style={{ backgroundColor: '#1a1a1a', borderColor: '#333333' }}>
              <h3 className="text-xl font-semibold text-white mb-4">Recent Activity</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-700/30">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Created new chat session</p>
                    <p className="text-xs text-gray-400">2 hours ago</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-700/30">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Generated artifact: "Essay on AI"</p>
                    <p className="text-xs text-gray-400">5 hours ago</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-700/30">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm text-white">Updated profile settings</p>
                    <p className="text-xs text-gray-400">1 day ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Usage Chart Placeholder */}
          <div className="col-span-full lg:col-span-1">
            <div className="rounded-2xl border shadow-lg p-6" style={{ backgroundColor: '#1a1a1a', borderColor: '#333333' }}>
              <h3 className="text-xl font-semibold text-white mb-4">Usage Overview</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Chat Sessions</span>
                    <span className="text-white">75%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-cyan-400 h-2 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Artifacts</span>
                    <span className="text-white">60%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-purple-400 h-2 rounded-full" style={{ width: '60%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Search Queries</span>
                    <span className="text-white">45%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-green-400 h-2 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
} 