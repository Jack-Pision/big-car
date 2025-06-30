import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { motion } from 'framer-motion';
import { X, Download, Copy, ExternalLink } from 'lucide-react';
import { ArtifactData } from '@/utils/artifact-utils';
import toast from 'react-hot-toast';

interface ArtifactViewerProps {
  artifact: ArtifactData;
  onClose: () => void;
  versions?: ArtifactData[]; // Optional list of versions, newest last
  isStreaming?: boolean; // New prop to indicate if content is streaming
  streamingContent?: string; // New prop for streaming content
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ 
  artifact, 
  onClose, 
  versions,
  isStreaming = false,
  streamingContent = ''
}) => {
  // State to track selected version (default to latest if provided)
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(
    versions && versions.length > 0 ? versions.length - 1 : 0
  );

  // State to track raw view toggle
  const [showRawContent, setShowRawContent] = useState(false);

  // Determine which artifact data to display (selected version or single artifact)
  const artifactData = versions && versions.length > 0 ? versions[selectedVersionIndex] : artifact;

  // Determine if we should show streaming content or artifact content
  const displayContent = isStreaming ? streamingContent : artifactData.content;
  const isContentEmpty = isStreaming ? !streamingContent : !artifactData.content;

  const handleCopy = () => {
    const contentToCopy = isStreaming ? streamingContent : artifactData.content;
    navigator.clipboard.writeText(contentToCopy);
    // Show toast notification
    toast.success('Content copied to clipboard!');
  };

  const handleDownload = () => {
    const contentToDownload = isStreaming ? streamingContent : artifactData.content;
    const titleToUse = isStreaming ? "Streaming Document" : artifactData.title;
    
    const blob = new Blob([contentToDownload], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titleToUse.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full bg-[#161618] flex flex-col relative">
      {/* Floating Action Buttons */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        {/* Version selector (only if multiple versions are provided) */}
        {!isStreaming && versions && versions.length > 1 && (
          <select
            value={selectedVersionIndex}
            onChange={(e) => setSelectedVersionIndex(Number(e.target.value))}
            className="bg-gray-800/80 text-gray-300 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none backdrop-blur-sm"
            title="Select version"
          >
            {versions.map((_, idx) => (
              <option key={idx} value={idx}>{`v${idx + 1}`}</option>
            ))}
          </select>
        )}

        {/* Raw content toggle - only show when not streaming */}
        {!isStreaming && (
          <button
            onClick={() => setShowRawContent(!showRawContent)}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors backdrop-blur-sm ${
              showRawContent 
                ? 'bg-cyan-600/80 text-white hover:bg-cyan-500' 
                : 'bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
            title={showRawContent ? "Hide raw markdown" : "Show raw markdown"}
          >
            Raw
          </button>
        )}

        {/* Copy content */}
        <button
          onClick={handleCopy}
          className="p-2 bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors backdrop-blur-sm"
          title="Copy content"
        >
          <Copy className="w-4 h-4" />
        </button>

        {/* Download markdown */}
        <button
          onClick={handleDownload}
          className="p-2 bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors backdrop-blur-sm"
          title="Download as Markdown"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-2 bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors backdrop-blur-sm"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent px-4 pt-12 pb-6 lg:px-6 xl:px-8">
        <div className="max-w-3xl mx-auto w-full">
          {isContentEmpty ? (
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
            <div className="space-y-4">
              {/* Document title */}
              <div className="border-b border-gray-700 pb-4">
                <h1 className="text-2xl font-bold text-white mb-2">
                  {isStreaming ? "Streaming Document" : artifactData.title}
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{artifactData.metadata.wordCount} words</span>
                  <span>{artifactData.metadata.estimatedReadTime}</span>
                  <span className="capitalize">{artifactData.metadata.category}</span>
                </div>
              </div>

              {/* Document content - always show rendered markdown */}
              <div className="w-full max-w-full overflow-hidden" style={{ position: 'relative' }}>
                <div>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                    className="prose prose-invert max-w-none text-base"
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
                    {displayContent}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Raw markdown content - shown below main content when not streaming */}
              {!isStreaming && showRawContent && (
                <div className="mt-8 pt-6 border-t border-gray-700">
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-300">Raw Markdown Source</h3>
                      <span className="text-xs text-gray-500">Toggle with Raw button above</span>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed overflow-auto max-h-[50vh] scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                      {displayContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
