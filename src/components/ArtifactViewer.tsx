import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Copy, Edit3, Send, Loader, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';

interface ArtifactViewerProps {
  content: string;
  onClose: () => void;
  isStreaming?: boolean;
  title?: string; // Optional title for downloads
  onContentUpdate?: (newContent: string) => void; // Callback for content updates
}

interface Selection {
  text: string;
  startOffset: number;
  endOffset: number;
  x: number;
  y: number;
}

interface EditModalProps {
  isOpen: boolean;
  selectedText: string;
  onClose: () => void;
  onSubmit: (instruction: string) => void;
  isProcessing: boolean;
}

const EditModal: React.FC<EditModalProps> = ({ 
  isOpen, 
  selectedText, 
  onClose, 
  onSubmit,
  isProcessing 
}) => {
  const [instruction, setInstruction] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (instruction.trim() && !isProcessing) {
      onSubmit(instruction.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#1C1C1E] border border-gray-600 rounded-lg max-w-md w-full p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Edit Selected Text</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
            disabled={isProcessing}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-2">Selected text:</label>
          <div className="bg-gray-800 rounded p-3 text-sm text-gray-200 max-h-32 overflow-y-auto border border-gray-600">
            "{selectedText.length > 150 ? selectedText.substring(0, 150) + '...' : selectedText}"
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-gray-300 mb-2">
              How would you like to edit this text?
            </label>
            <textarea
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Make this more concise, Fix grammar, Change tone to formal..."
              className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
              disabled={isProcessing}
            />
            <p className="text-xs text-gray-400 mt-1">
              Press Cmd/Ctrl + Enter to submit, Escape to cancel
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!instruction.trim() || isProcessing}
              className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Edit Text
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const TipTapArtifactEditor = dynamic(() => import('./TipTapArtifactEditor').then(m => m.TipTapArtifactEditor), { ssr: false });

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ 
  content, 
  onClose, 
  isStreaming = false,
  title = "Document",
  onContentUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState(content);
  const [lastSavedContent, setLastSavedContent] = useState(content);
  const [showSave, setShowSave] = useState(false);

  // Update content when prop changes (e.g., loading a new artifact)
  useEffect(() => {
    setEditableContent(content);
    setLastSavedContent(content);
    setShowSave(false);
  }, [content]);

  // Show save button if there are unsaved changes
  useEffect(() => {
    setShowSave(editableContent !== lastSavedContent);
  }, [editableContent, lastSavedContent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableContent);
    toast.success('Content copied to clipboard!');
  };

  const handleDownload = () => {
    const blob = new Blob([editableContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = () => {
    setLastSavedContent(editableContent);
    setShowSave(false);
    if (onContentUpdate) {
      onContentUpdate(editableContent);
    }
    toast.success('Changes saved!');
  };

  return (
    <div className="h-full bg-[#161618] flex flex-col relative">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 bg-[#161618] rounded-t-lg border-b border-gray-700">
        <div className="text-lg font-semibold text-white truncate max-w-[60%]">{title}</div>
        <div className="flex items-center gap-2 z-50">
          {/* Save button (only if there are unsaved changes) */}
          {showSave && (
            <button
              onClick={handleSave}
              className="p-2 bg-white text-gray-900 rounded-full shadow hover:bg-gray-100 transition-colors"
              title="Save changes"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
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
      </div>
      {/* Content Area - Only TipTap Editor */}
      <div className="w-full max-w-full flex-1 overflow-y-auto px-6 pt-4 pb-8 hide-scrollbar">
        <TipTapArtifactEditor
          content={editableContent}
          onContentUpdate={(newContent) => {
            setEditableContent(newContent);
          }}
          isStreaming={isStreaming}
          rawMode={true}
        />
      </div>
      <style jsx global>{`
        .hide-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        /* Extra padding inside the editor content area for polish */
        .tiptap-editor-container .ProseMirror {
          padding-left: 0.5rem;
          padding-right: 0.5rem;
        }
      `}</style>
    </div>
  );
};
