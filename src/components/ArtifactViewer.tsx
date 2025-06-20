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
  versions?: ArtifactData[]; // Optional list of versions, newest last
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifact, onClose, versions }) => {
  // State to track selected version (default to latest if provided)
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(
    versions && versions.length > 0 ? versions.length - 1 : 0
  );

  // State to switch between rendered markdown preview and raw markdown view
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');

  // Determine which artifact data to display (selected version or single artifact)
  const artifactData = versions && versions.length > 0 ? versions[selectedVersionIndex] : artifact;

  const handleCopy = () => {
    navigator.clipboard.writeText(artifactData.content);
    // Show toast notification
    const toast = document.createElement('div');
    toast.textContent = 'Content copied to clipboard!';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.backgroundColor = '#22c55e';
    toast.style.color = '#fff';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '9999';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifactData.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifactData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full bg-[#161618] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-[#1a1a1c] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="9" x2="15" y2="9"></line>
              <line x1="9" y1="13" x2="15" y2="13"></line>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100">{artifactData.title}</h2>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{artifactData.metadata.wordCount} words</span>
              <span>{artifactData.metadata.estimatedReadTime}</span>
              <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-xs">
                {artifactData.metadata.category}
              </span>
            </div>
          </div>
        </div>
        
        {/* Version selector & view toggle */}
        <div className="flex items-center gap-2">
          {/* Version selector (only if multiple versions are provided) */}
          {versions && versions.length > 1 && (
            <select
              value={selectedVersionIndex}
              onChange={(e) => setSelectedVersionIndex(Number(e.target.value))}
              className="bg-gray-800 text-gray-300 border border-gray-600 rounded px-2 py-1 text-xs mr-2 focus:outline-none"
              title="Select version"
            >
              {versions.map((_, idx) => (
                <option key={idx} value={idx}>{`v${idx + 1}`}</option>
              ))}
            </select>
          )}

          {/* View mode toggle */}
          <button
            onClick={() => setViewMode('preview')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'preview' ? 'bg-gray-700 text-cyan-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
            title="Preview mode"
          >
            {/* Eye icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'raw' ? 'bg-gray-700 text-cyan-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
            title="Raw markdown"
          >
            {/* Code icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </button>

          {/* Copy content */}
          <button
            onClick={handleCopy}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
            title="Copy content"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>

          {/* Download markdown */}
          <button
            onClick={handleDownload}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
            title="Download as Markdown"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7,10 12,15 17,10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>

          {/* Close viewer */}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
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
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-none">
          {!artifactData.content ? (
            // Show streaming state when content is empty
            <div className="flex flex-col items-center justify-center h-64">
              <div className="flex items-center space-x-3 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
                <span className="text-xl font-medium text-gray-300">AI is writing...</span>
              </div>
              <p className="text-gray-400 text-center max-w-md">
                Your document is being generated in real-time. You'll see the content appear as it's written.
              </p>
              <div className="mt-6 flex items-center space-x-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Streaming content */}
              {viewMode === 'preview' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  className="prose prose-invert max-w-none"
                  components={{
                  h1: ({ children }) => (
                    <h1 className="text-3xl font-bold text-gray-100 mb-6 mt-6 border-b border-gray-600 pb-3">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-2xl font-semibold text-gray-200 mb-4 mt-6">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xl font-semibold text-gray-200 mb-3 mt-5">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-lg font-semibold text-gray-200 mb-2 mt-4">
                      {children}
                    </h4>
                  ),
                  p: ({ children }) => (
                    <p className="text-gray-300 leading-relaxed mb-4 text-sm">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="space-y-2 mb-4 ml-6 list-disc text-gray-300">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="space-y-2 mb-4 ml-6 list-decimal text-gray-300">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-gray-300">
                      {children}
                    </li>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-cyan-500 pl-6 py-2 mb-4 italic text-gray-400 bg-gray-800/50 rounded-r-lg">
                      {children}
                    </blockquote>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="bg-gray-700 text-cyan-300 px-2 py-1 rounded text-xs font-mono">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="block bg-gray-900 text-gray-200 p-4 rounded-lg overflow-x-auto text-xs font-mono mb-4 border border-gray-700">
                        {children}
                      </code>
                    );
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-6">
                      <table className="w-full border-collapse border border-gray-600 rounded-lg">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-gray-800">
                      {children}
                    </thead>
                  ),
                  th: ({ children }) => (
                    <th className="border border-gray-600 px-4 py-3 text-left text-gray-200 font-semibold">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-gray-600 px-4 py-3 text-gray-300">
                      {children}
                    </td>
                  ),
                  strong: ({ children }) => (
                    <strong className="text-gray-100 font-semibold">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em className="text-gray-300 italic">
                      {children}
                    </em>
                  ),
                  a: ({ children, href }) => (
                    <a href={href} className="text-cyan-400 hover:text-cyan-300 underline">
                      {children}
                    </a>
                  )
                  }}
                >
                  {artifactData.content}
                </ReactMarkdown>
              ) : (
                <pre className="whitespace-pre-wrap text-gray-300 text-xs">
                  {artifactData.content}
                </pre>
              )}
            
            {/* Streaming indicator - show when content is being written */}
            {artifactData.content && artifactData.metadata.wordCount < 50 && (
              <div className="flex items-center gap-2 mt-4 text-cyan-400">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <span className="text-xs">AI is writing...</span>
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Footer with tags */}
      {artifactData.metadata.tags.length > 0 && (
        <div className="border-t border-gray-700 p-4 bg-[#1a1a1c]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Tags:</span>
            <div className="flex flex-wrap gap-2">
              {artifactData.metadata.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-700 text-gray-300 rounded-full text-xs"
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