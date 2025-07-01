import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Send, Loader, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { marked } from 'marked';

interface TipTapArtifactEditorProps {
  content: string;
  onContentUpdate?: (newContent: string) => void;
  isStreaming?: boolean;
  rawMode?: boolean; // When true, skip markdown-to-HTML conversion for artifact mode
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

// Enhanced markdown to HTML conversion using marked library
const markdownToHTML = (markdown: string): string => {
  if (!markdown) return '';
  
  try {
    // Configure marked for better compatibility with TipTap
    marked.setOptions({
      breaks: true, // Enable line breaks
      gfm: true, // GitHub Flavored Markdown
    });
    
    // Use marked to convert markdown to HTML (synchronous)
    const html = marked.parse(markdown) as string;
    
    // Post-process for TipTap-specific needs
    // Handle task lists (marked might not handle these perfectly)
    const processedHtml = html.replace(/<li>\s*\[([x\s])\]\s*(.*?)<\/li>/gi, (match: string, checked: string, text: string) => {
      const isChecked = checked.toLowerCase() === 'x';
      return `<li data-type="taskItem" data-checked="${isChecked}">${text.trim()}</li>`;
    });
    
    // Ensure proper table structure for TipTap
    const finalHtml = processedHtml.replace(/<table>/g, '<table>').replace(/<\/table>/g, '</table>');
    
    return finalHtml;
  } catch (error) {
    console.error('Markdown parsing error:', error);
    // Fallback: return as plain text wrapped in paragraph
    return `<p>${markdown.replace(/\n/g, '<br>')}</p>`;
  }
};

// Enhanced HTML to markdown conversion
const HTMLToMarkdown = (html: string): string => {
  if (!html) return '';
  
  let markdown = html;
  
  // Handle tables
  markdown = markdown.replace(/<table[^>]*>([\s\S]*?)<\/table>/gim, (match, tableContent) => {
    let tableMarkdown = '\n';
    
    // Extract headers
    const headerMatch = tableContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    if (headerMatch) {
      const headerRows = headerMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      if (headerRows) {
        headerRows.forEach((row: string) => {
          const cells = row.match(/<th[^>]*>([\s\S]*?)<\/th>/gi);
          if (cells) {
            const cellContents = cells.map((cell: string) => cell.replace(/<[^>]*>/g, '').trim());
            tableMarkdown += '| ' + cellContents.join(' | ') + ' |\n';
            tableMarkdown += '| ' + cellContents.map(() => '---').join(' | ') + ' |\n';
          }
        });
      }
    }
    
    // Extract body rows
    const bodyMatch = tableContent.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : tableContent;
    const bodyRows = bodyContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (bodyRows) {
      bodyRows.forEach((row: string) => {
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (cells) {
          const cellContents = cells.map((cell: string) => cell.replace(/<[^>]*>/g, '').trim());
          tableMarkdown += '| ' + cellContents.join(' | ') + ' |\n';
        }
      });
    }
    
    return tableMarkdown + '\n';
  });
  
  // Handle task lists
  markdown = markdown.replace(/<li[^>]*data-type="taskItem"[^>]*data-checked="(true|false)"[^>]*>(.*?)<\/li>/gim, (match, checked, text) => {
    const isChecked = checked === 'true';
    return `- [${isChecked ? 'x' : ' '}] ${text.replace(/<[^>]*>/g, '').trim()}`;
  });
  
  // Handle headings
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gim, '# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gim, '## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gim, '### $1\n\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gim, '#### $1\n\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gim, '##### $1\n\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gim, '###### $1\n\n');
  
  // Handle emphasis
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gim, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gim, '*$1*');
  
  // Handle code
  markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gim, '```\n$1\n```');
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gim, '`$1`');
  
  // Handle images and links
  markdown = markdown.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gim, '![$1]($2)');
  markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gim, '[$2]($1)');
  
  // Handle lists
  markdown = markdown.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gim, (match, listContent) => {
    const items = listContent.match(/<li[^>]*>(.*?)<\/li>/gim);
    if (items) {
      return items.map((item: string) => {
        const content = item.replace(/<li[^>]*>(.*?)<\/li>/gim, '$1').replace(/<[^>]*>/g, '').trim();
        return `- ${content}`;
      }).join('\n') + '\n\n';
    }
    return '';
  });
  
  markdown = markdown.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gim, (match, listContent) => {
    const items = listContent.match(/<li[^>]*>(.*?)<\/li>/gim);
    if (items) {
      return items.map((item: string, index: number) => {
        const content = item.replace(/<li[^>]*>(.*?)<\/li>/gim, '$1').replace(/<[^>]*>/g, '').trim();
        return `${index + 1}. ${content}`;
      }).join('\n') + '\n\n';
    }
    return '';
  });
  
  // Handle paragraphs
  markdown = markdown.replace(/<\/p>\s*<p[^>]*>/gim, '\n\n');
  markdown = markdown.replace(/<p[^>]*>/gim, '');
  markdown = markdown.replace(/<\/p>/gim, '\n\n');
  
  // Handle line breaks
  markdown = markdown.replace(/<br[^>]*>/gim, '\n');
  
  // Clean up multiple newlines
  markdown = markdown.replace(/\n{3,}/gim, '\n\n');
  
  // Remove any remaining HTML tags
  markdown = markdown.replace(/<[^>]*>/g, '');
  
  return markdown.trim();
};

export const TipTapArtifactEditor: React.FC<{ content: string }> = ({ content }) => {
  let htmlContent = '';
  try {
    marked.setOptions({ breaks: true, gfm: true });
    htmlContent = marked.parse(content) as string;
    if (!htmlContent || typeof htmlContent !== 'string') throw new Error('Invalid HTML');
  } catch (e: any) {
    console.error('Markdown conversion failed:', e);
    // Instead of <pre>, show a user-facing error outside TipTap
    return <div style={{ color: 'red', padding: 16 }}>Failed to render artifact content.</div>;
  }

  console.log('Artifact content:', content);
  console.log('HTML for TipTap:', htmlContent);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { HTMLAttributes: { class: 'tiptap-bullet-list' } },
        orderedList: { HTMLAttributes: { class: 'tiptap-ordered-list' } },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ HTMLAttributes: { class: 'tiptap-image' } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'tiptap-link' } }),
      Highlight.configure({ multicolor: true }),
      Color,
      TextStyle,
      CharacterCount,
      Placeholder.configure({ placeholder: 'Content will appear here...' }),
    ],
    content: htmlContent,
    editable: false,
    immediatelyRender: false,
  });

  if (!editor) return <div>Loading editor...</div>;
  return <EditorContent editor={editor} />;
}; 