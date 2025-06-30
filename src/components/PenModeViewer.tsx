import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';

interface PenModeViewerProps {
  content: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClear: () => void;
  widthPct?: number;
  onDragStart?: (e: React.MouseEvent) => void;
  isDragging?: boolean;
}

const PenModeViewer: React.FC<PenModeViewerProps> = ({
  content,
  isExpanded,
  onToggleExpand,
  onClear,
  widthPct = 45,
  onDragStart,
  isDragging = false
}) => {
  const [showRaw, setShowRaw] = useState(false);

  if (isExpanded) {
    // Expanded state - right panel like ArtifactViewer
    return (
      <div 
        className="fixed top-0 right-0 bottom-0 z-[10000] bg-[#161618] border-l border-gray-700 flex flex-col" 
        style={{ 
          width: `${widthPct}%`,
          left: `${100 - widthPct}%`
        }}
      >
        {/* Drag Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-gray-600/30 hover:bg-gray-500/50 cursor-col-resize transition-colors"
          onMouseDown={onDragStart}
          style={{ zIndex: 10001 }}
        />
        {/* Header aligned with main header */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-gray-600/50 bg-[#161618]">
          <div className="flex items-center gap-2">
            <span className="text-lg">✍️</span>
            <h3 className="text-white font-medium">Writing Mode</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-700/60 hover:text-gray-200 transition-colors text-sm"
              title="Clear"
            >
              Clear
            </button>
            <button
              onClick={onToggleExpand}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-700/60 hover:text-gray-200 transition-colors"
              title="Collapse"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
            <button
              onClick={() => setShowRaw((prev) => !prev)}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-700/60 hover:text-gray-200 transition-colors text-sm"
              title={showRaw ? 'Render Markdown' : 'View Raw'}
            >
              {showRaw ? 'Render' : 'Raw'}
            </button>
          </div>
        </header>
        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-6 lg:px-6 xl:px-8">
          <div className="max-w-3xl mx-auto w-full">
            {content ? (
              showRaw ? (
                <pre className="whitespace-pre-wrap text-base leading-relaxed text-gray-200">{content}</pre>
              ) : (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeRaw, rehypeKatex]} 
                  className="prose dark:prose-invert max-w-none pen-mode-markdown text-base leading-relaxed"
                >
                  {content}
                </ReactMarkdown>
              )
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400 italic">
                Your AI responses will appear here when pen mode is active...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Collapsed state - small bar in message flow
  return (
    <div className="w-full max-w-3xl mx-auto mb-4">
      <div className="bg-black border border-gray-600 rounded-lg p-4" style={{ height: '180px' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">✍️</span>
            <span className="text-gray-400 text-sm">Writing Mode</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              className="text-gray-400 hover:text-white transition-colors text-xs px-2 py-1 rounded hover:bg-gray-700"
            >
              Clear
            </button>
            <button
              onClick={onToggleExpand}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700"
              title="Expand"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div className="text-white text-xs leading-relaxed overflow-y-auto" style={{ height: '130px' }}>
          {content ? (
            <div className="whitespace-pre-wrap break-words">
              {content.length > 300 ? `${content.substring(0, 300)}...` : content}
            </div>
          ) : (
            <span className="text-gray-500 italic">
              Your AI responses will appear here...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PenModeViewer; 