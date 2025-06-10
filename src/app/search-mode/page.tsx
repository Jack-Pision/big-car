'use client';

import React from 'react';
import Search from '@/components/Search';

export default function SearchModePage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-white">Advanced Search Mode</h1>
      <Search query="How does artificial intelligence work?" />
    </div>
  );
} 