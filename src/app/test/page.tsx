"use client";
import React from "react";
import AuthProvider from '../../components/AuthProvider';

function TestChatComponent() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Tehom AI Test Page
        </h1>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <p className="text-lg text-gray-300 mb-4">
            This is a test to verify the page is working correctly.
            If you can see this message, the basic component is rendering.
          </p>
          <div className="mt-4 p-4 bg-gray-700 rounded border-l-4 border-cyan-500">
            <p className="text-cyan-400 mb-2">
              ✓ React component is mounted
            </p>
            <p className="text-cyan-400 mb-2">
              ✓ Tailwind CSS is loading
            </p>
            <p className="text-cyan-400 mb-2">
              ✓ Basic layout is functional
            </p>
            <p className="text-green-400">
              ✓ Page is successfully rendering!
            </p>
          </div>
          <div className="mt-6 text-center">
            <button className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-medium transition-colors">
              Test Button - Click Me!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestChat() {
  return (
    <AuthProvider>
      <TestChatComponent />
    </AuthProvider>
  );
} 