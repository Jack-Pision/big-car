'use client';

import React from 'react';
import Search from '@/components/Search';

export default function SearchModePage() {
  return (
    <div className="min-h-screen bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col">
      <header className="bg-black/75 shadow-md py-4 px-4">
        <div className="container mx-auto">
          <h1 className="text-xl text-white font-semibold">AI Study App - Advanced Search</h1>
        </div>
      </header>
      
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto py-8 px-4">
          <Search query="How does artificial intelligence work?" />
        </div>
      </main>
      
      <footer className="bg-black/75 text-neutral-300 py-4 px-4">
        <div className="container mx-auto">
          <p className="text-sm">© {new Date().getFullYear()} AI Study App</p>
        </div>
      </footer>
    </div>
  );
} 