import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Copy, Edit3, Send, Loader, ToggleLeft, ToggleRight, Pen } from 'lucide-react';
import toast from 'react-hot-toast';
import { TipTapArtifactEditor } from './TipTapArtifactEditor';
import { LocalArtifactV2Service as ArtifactV2Service } from '../lib/local-storage-service';
import { marked } from 'marked';

interface ArtifactViewerProps {
  artifactId: string;
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

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ 
  artifactId,
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
  const [shouldFocus, setShouldFocus] = useState(false);

  // Only update editable content when content prop changes
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

  const handleSave = async () => {
    setLastSavedContent(editableContent);
    setShowSave(false);
    if (onContentUpdate) {
      onContentUpdate(editableContent);
    }
    toast.success('Changes saved!');
    await ArtifactV2Service.update(artifactId, { content_markdown: editableContent });
    setIsEditing(false);
  };

  // Focus the editor when prompt is dismissed
  const handlePromptClick = () => {
    setShouldFocus(true);
  };

  return (
    <div className="h-full bg-[#161618] flex flex-col relative" style={{ fontSize: '16px', lineHeight: 1.6 }}>
      {/* Header Bar */}
      <div className="flex items-center justify-end px-6 pt-4 pb-2 bg-[#161618] rounded-t-lg gap-3" style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
        {/* Edit button */}
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="header-btn"
            title="Edit"
            style={{ width: 36, height: 36 }}
          >
            <Edit3 className="w-5 h-5" />
          </button>
        )}
        {/* Save button (only if there are unsaved changes) */}
        {isEditing && showSave && (
          <button
            onClick={handleSave}
            className="header-btn"
            title="Save changes"
            style={{ width: 36, height: 36 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        {/* Copy content */}
        <button
          onClick={handleCopy}
          className="header-btn"
          title="Copy content"
          style={{ width: 36, height: 36 }}
        >
          <Copy className="w-5 h-5" />
        </button>
        {/* Download markdown */}
        <button
          onClick={handleDownload}
          className="header-btn"
          title="Download as Markdown"
          style={{ width: 36, height: 36 }}
        >
          <Download className="w-5 h-5" />
        </button>
        {/* Close button */}
        <button
          onClick={onClose}
          className="header-btn"
          title="Close"
          style={{ width: 36, height: 36 }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {/* Content Area */}
      <div className="w-full max-w-[800px] flex-1 overflow-y-auto px-6 pt-4 pb-8 hide-scrollbar relative" style={{ padding: '24px 24px 16px 24px', margin: '0 auto' }}>
        {isEditing ? (
          <TipTapArtifactEditor
            content={editableContent}
            onContentUpdate={(newContent) => {
              setEditableContent(newContent);
            }}
            isStreaming={isStreaming}
            rawMode={true}
            shouldFocus={shouldFocus}
            onDidFocus={() => setShouldFocus(false)}
          />
        ) : (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: marked.parse(content) }}
          />
        )}
      </div>
      <style jsx global>{`
        .header-btn {
          width: 36px;
          height: 36px;
          border-radius: 9999px;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .header-btn:hover {
          background: rgba(55, 65, 81, 0.6); /* gray-700/60 */
        }
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
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .animate-fadeOut {
          animation: fadeOut 0.4s forwards;
        }
      `}</style>
    </div>
  );
};