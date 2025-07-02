import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { cursor } from '@milkdown/plugin-cursor';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Send, Loader, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface MilkdownArtifactEditorProps {
  content: string;
  onContentUpdate?: (newContent: string) => void;
  isStreaming?: boolean;
  rawMode?: boolean;
  shouldFocus?: boolean;
  onDidFocus?: () => void;
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
      setInstruction('');
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

const MilkdownEditor: React.FC<MilkdownArtifactEditorProps> = ({
  content,
  onContentUpdate,
  isStreaming = false,
  rawMode = false,
  shouldFocus = false,
  onDidFocus
}) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editPosition, setEditPosition] = useState({ x: 0, y: 0 });

  const { get } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.set(editorViewOptionsCtx, {
          attributes: {
            class: 'milkdown-editor prose prose-invert max-w-none focus:outline-none',
            style: 'font-size: 16px; line-height: 1.6; color: var(--text-primary); min-height: 200px; padding: 1rem;'
          }
        });
        
        // Set up content change listener
        ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
          if (onContentUpdate && !isStreaming && markdown !== prevMarkdown) {
            onContentUpdate(markdown);
          }
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(cursor)
      .use(listener);
  }, []);

  // Update editor content when prop changes
  useEffect(() => {
    if (get && !isEditing) {
      const editor = get();
      if (editor) {
        try {
          editor.action((ctx) => {
            ctx.set(defaultValueCtx, content);
          });
        } catch (error) {
          console.warn('Failed to update editor content:', error);
        }
      }
    }
  }, [content, get, isEditing]);

  // Handle focus
  useEffect(() => {
    if (shouldFocus && get) {
      const editor = get();
      if (editor) {
        try {
          setTimeout(() => {
            const editorElement = document.querySelector('.milkdown-editor');
            if (editorElement) {
              (editorElement as HTMLElement).focus();
            }
            if (onDidFocus) onDidFocus();
          }, 100);
        } catch (error) {
          console.warn('Failed to focus editor:', error);
        }
      }
    }
  }, [shouldFocus, get, onDidFocus]);

  // Handle selection changes for AI editing
  const handleSelectionChange = useCallback(() => {
    if (isStreaming || isEditing) return;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const selectedText = selection.toString().trim();
      if (selectedText.length > 2) {
        setSelectedText(selectedText);
        
        // Get selection position for floating button
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const editorElement = document.querySelector('.milkdown-editor');
        if (editorElement) {
          const editorRect = editorElement.getBoundingClientRect();
          setEditPosition({
            x: rect.left + rect.width / 2 - editorRect.left,
            y: rect.bottom - editorRect.top + 8
          });
        }
      } else {
        setSelectedText('');
      }
    } else {
      setSelectedText('');
    }
  }, [isStreaming, isEditing]);

  // Add selection change listener
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Handle edit button click
  const handleEditClick = useCallback(() => {
    if (selectedText && !isEditing) {
      setShowEditModal(true);
    }
  }, [selectedText, isEditing]);

  // Perform AI-powered in-place edit
  const performInPlaceEdit = async (instruction: string) => {
    if (!selectedText || !get) return;

    setIsEditing(true);
    
    try {
      const editPrompt = `You are an AI text editor. Your task is to edit the provided text according to the user's instruction. 

IMPORTANT RULES:
- Return ONLY the edited text, nothing else
- Do not add explanations, comments, or metadata
- Preserve the original formatting and structure as much as possible
- Do not change the meaning unless specifically asked to do so

User Instruction: ${instruction}

Text to edit:
"""
${selectedText}
"""

Edited text:`;

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: editPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          mode: 'chat',
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const editedText = data.choices?.[0]?.message?.content?.trim();
      
      if (!editedText) {
        throw new Error('No edited text received from API');
      }

      // Replace selected text using DOM manipulation and then update Milkdown
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(editedText));
        selection.removeAllRanges();
        
        // Get the updated content and notify Milkdown
        const editor = get();
        if (editor) {
          setTimeout(() => {
            try {
              const editorElement = document.querySelector('.milkdown-editor');
              if (editorElement && onContentUpdate) {
                const updatedMarkdown = (editorElement as HTMLElement).innerText || content.replace(selectedText, editedText);
                onContentUpdate(updatedMarkdown);
              }
            } catch (error) {
              console.warn('Failed to get updated content:', error);
              // Fallback to simple text replacement
              if (onContentUpdate) {
                onContentUpdate(content.replace(selectedText, editedText));
              }
            }
          }, 100);
        }
      }

      setSelectedText('');
      setShowEditModal(false);

      toast.success('Text edited successfully!');

    } catch (error) {
      console.error('Error editing text:', error);
      toast.error('Failed to edit text. Please try again.');
    } finally {
      setIsEditing(false);
    }
  };

  if (!get) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden relative">
      {/* Floating Edit Button */}
      <AnimatePresence>
        {selectedText && !showEditModal && !isEditing && !isStreaming && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            onClick={handleEditClick}
            onMouseDown={e => e.preventDefault()}
            className="absolute z-40 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded-lg shadow-lg transition-colors flex items-center gap-2 text-sm font-medium"
            style={{
              left: `${editPosition.x}px`,
              top: `${editPosition.y}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <Edit3 className="w-4 h-4" />
            Edit with AI
          </motion.button>
        )}
      </AnimatePresence>

      {/* Milkdown Editor */}
      <div className="milkdown-editor-container">
        <Milkdown />
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && (
          <EditModal
            isOpen={showEditModal}
            selectedText={selectedText}
            onClose={() => {
              setShowEditModal(false);
              setSelectedText('');
            }}
            onSubmit={performInPlaceEdit}
            isProcessing={isEditing}
          />
        )}
      </AnimatePresence>

      {/* Custom Styles */}
      <style jsx global>{`
        .milkdown-editor-container .milkdown {
          outline: none;
          color: var(--text-primary);
          line-height: 1.6;
          font-size: 16px;
          min-height: 200px;
        }
        
        .milkdown h1 {
          font-size: 2rem;
          font-weight: bold;
          margin: 2rem 0 1.5rem 0;
          border-bottom: 1px solid rgba(34, 211, 238, 0.3);
          padding-bottom: 0.75rem;
          color: var(--text-primary);
        }
        
        .milkdown h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 1.5rem 0 1rem 0;
          color: var(--text-primary);
        }
        
        .milkdown h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 1.25rem 0 0.75rem 0;
          color: var(--text-primary);
        }
        
        .milkdown p {
          margin: 0 0 1rem 0;
          color: var(--text-primary);
          line-height: 1.7;
        }
        
        .milkdown ul,
        .milkdown ol {
          margin: 0 0 1rem 1rem;
          padding: 0;
        }
        
        .milkdown li {
          margin: 0.5rem 0;
          color: var(--text-primary);
        }
        
        .milkdown strong {
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .milkdown code {
          background: var(--code-bg);
          color: var(--code-text);
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-family: monospace;
          font-size: 0.875rem;
        }
        
        .milkdown pre {
          background: var(--code-bg);
          color: var(--code-text);
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }
        
        .milkdown blockquote {
          border-left: 4px solid rgb(34, 211, 238);
          padding-left: 1rem;
          margin: 1rem 0;
          font-style: italic;
          color: var(--text-primary);
        }
        
        .milkdown table {
          border-collapse: collapse;
          margin: 1rem 0;
          width: 100%;
        }
        
        .milkdown th,
        .milkdown td {
          border: 1px solid #4a5568;
          padding: 0.5rem 1rem;
          text-align: left;
          color: var(--text-primary);
        }
        
        .milkdown th {
          background: rgba(255, 255, 255, 0.05);
          font-weight: 600;
        }
        
        .milkdown img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        
        .milkdown a {
          color: rgb(34, 211, 238);
          text-decoration: underline;
        }
        
        .milkdown a:hover {
          color: rgb(56, 189, 248);
        }
        
        .milkdown ::selection {
          background: rgba(34, 211, 238, 0.3);
        }
        
        .milkdown hr {
          border: none;
          border-top: 1.5px solid #444;
          margin: 1.5rem 0;
          height: 0;
        }
      `}</style>
    </div>
  );
};

export const MilkdownArtifactEditor: React.FC<MilkdownArtifactEditorProps> = (props) => {
  return (
    <MilkdownProvider>
      <MilkdownEditor {...props} />
    </MilkdownProvider>
  );
}; 