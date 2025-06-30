import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { motion } from 'framer-motion';
import { X, Download, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

interface ArtifactViewerProps {
  content: string;
  onClose: () => void;
  isStreaming?: boolean;
  title?: string; // Optional title for downloads
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ 
  content, 
  onClose, 
  isStreaming = false,
  title = "Document"
}) => {

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast.success('Content copied to clipboard!');
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full bg-[#161618] flex flex-col relative">
      {/* Floating Action Buttons */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        {/* Copy content */}
        <button
          onClick={handleCopy}
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          title="Copy content"
        >
          <Copy className="w-4 h-4" />
        </button>

        {/* Download markdown */}
        <button
          onClick={handleDownload}
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          title="Download as Markdown"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area - Uses EXACT same rendering as default chat */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent px-4 pt-12 pb-6 lg:px-6 xl:px-8">
        <div className="max-w-3xl mx-auto w-full">
          {!content ? (
            // Show loading state when content is empty
            <div className="flex flex-col items-center justify-center h-64">
              <div className="flex items-center space-x-3 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
                <span className="text-xl font-medium text-gray-300">AI is responding...</span>
              </div>
              <p className="text-gray-400 text-center max-w-md">
                Your content is being generated in real-time.
              </p>
              <div className="mt-6 flex items-center space-x-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-full overflow-hidden">
              {/* Use EXACT same ReactMarkdown setup as default chat */}
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeRaw, rehypeKatex]} 
                className="research-output"
                components={{
                  h1: ({ children }) => (<h1 className="text-xl md:text-3xl font-bold mb-6 mt-8 border-b border-cyan-500/30 pb-3" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h1>),
                  h2: ({ children }) => (<h2 className="text-lg md:text-2xl font-semibold mb-4 mt-8 flex items-center gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h2>),
                  h3: ({ children }) => (<h3 className="text-base md:text-xl font-semibold mb-3 mt-6" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h3>),
                  h4: ({ children }) => (<h4 className="text-base md:text-lg font-semibold mb-2 mt-4" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</h4>),
                  p: ({ children }) => (<p className="leading-relaxed mb-4 text-base" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</p>),
                  ul: ({ children }) => (<ul className="space-y-2 mb-4 ml-4">{children}</ul>),
                  li: ({ children }) => (<li className="flex items-start gap-2" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}><span className="text-cyan-400 mt-1.5 text-xs">●</span><span className="flex-1">{children}</span></li>),
                  ol: ({ children }) => (<ol className="space-y-2 mb-4 ml-4 list-decimal list-inside">{children}</ol>),
                  strong: ({ children }) => (<strong className="font-semibold" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</strong>),
                  table: ({ children }) => (<div className="overflow-x-auto mb-6 max-w-full scrollbar-thin"><table className="border-collapse" style={{ tableLayout: 'auto', width: 'auto' }}>{children}</table></div>),
                  thead: ({ children }) => <thead className="">{children}</thead>,
                  th: ({ children }) => (<th className="px-3 md:px-4 py-1 md:py-3 text-left font-semibold border-b-2 border-gray-600 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</th>),
                  td: ({ children }) => (<td className="px-3 md:px-4 py-1 md:py-3 border-b border-gray-700 text-xs md:text-sm" style={{ color: "var(--text-primary)", lineHeight: "1.2" }}>{children}</td>),
                  blockquote: ({ children }) => (<blockquote className="border-l-4 border-cyan-500 pl-4 py-1 rounded-r-lg mb-4 italic" style={{ background: 'transparent', color: 'var(--text-primary)' }}>{children}</blockquote>),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline
                      ? (<code className="px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>)
                      : (<code className="block p-4 rounded-lg overflow-x-auto text-xs font-mono mb-4" style={{ background: 'var(--code-bg)', color: 'var(--code-text)' }}>{children}</code>);
                  }
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
