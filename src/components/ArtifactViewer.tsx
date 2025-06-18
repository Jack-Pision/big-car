import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ArtifactData {
  type: 'document' | 'guide' | 'report' | 'analysis';
  title: string;
  content: string;
  metadata: {
    wordCount: number;
    estimatedReadTime: string;
    category: string;
    tags: string[];
  };
}

interface ArtifactViewerProps {
  artifact: ArtifactData;
  onClose: () => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifact, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'} bg-white flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="9" x2="15" y2="9"></line>
              <line x1="9" y1="13" x2="15" y2="13"></line>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{artifact.title}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{artifact.metadata.wordCount} words</span>
              <span>{artifact.metadata.estimatedReadTime}</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                {artifact.metadata.category}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Copy content"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          
          <button
            onClick={handleDownload}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Download as Markdown"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7,10 12,15 17,10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
            )}
          </button>
          
          <button
            onClick={onClose}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            className="prose prose-lg max-w-none"
            components={{
              h1: ({ children }) => (
                <h1 className="text-4xl font-bold text-gray-900 mb-6 mt-8 border-b border-gray-200 pb-3">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-3xl font-semibold text-gray-800 mb-4 mt-8">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-2xl font-semibold text-gray-800 mb-3 mt-6">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-xl font-semibold text-gray-800 mb-2 mt-4">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="text-gray-700 leading-relaxed mb-4 text-base">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="space-y-2 mb-4 ml-6 list-disc">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="space-y-2 mb-4 ml-6 list-decimal">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-gray-700">
                  {children}
                </li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-blue-500 pl-6 py-2 mb-4 italic text-gray-600 bg-blue-50 rounded-r-lg">
                  {children}
                </blockquote>
              ),
              code: ({ children, className }) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm font-mono">
                      {children}
                    </code>
                  );
                }
                return (
                  <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono mb-4">
                    {children}
                  </code>
                );
              },
              table: ({ children }) => (
                <div className="overflow-x-auto mb-6">
                  <table className="w-full border-collapse border border-gray-300 rounded-lg">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-gray-100">
                  {children}
                </thead>
              ),
              th: ({ children }) => (
                <th className="border border-gray-300 px-4 py-3 text-left text-gray-800 font-semibold">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-gray-300 px-4 py-3 text-gray-700">
                  {children}
                </td>
              ),
              strong: ({ children }) => (
                <strong className="text-gray-900 font-semibold">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="text-gray-700 italic">
                  {children}
                </em>
              )
            }}
          >
            {artifact.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Footer with tags */}
      {artifact.metadata.tags.length > 0 && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Tags:</span>
            <div className="flex flex-wrap gap-2">
              {artifact.metadata.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 