'use client'

import { useState, useRef, useEffect } from "react";
import Sidebar from '../../components/Sidebar';
import HamburgerMenu from '../../components/HamburgerMenu';
import { v4 as uuidv4 } from 'uuid';
import SearchPopup from '../../components/SearchPopup';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

const NVIDIA_API_URL = "/api/nvidia";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function cleanMarkdown(md: string): string {
  let cleaned = md;
  // Convert lines of dashes to '---' for <hr>
  cleaned = cleaned.replace(/^-{3,}$/gm, '---');
  cleaned = cleaned.replace(/_{3,}/gm, '---');
  // Ensure headings have a space after # (e.g., '###Heading' -> '### Heading')
  cleaned = cleaned.replace(/^(#{1,6})([^ #])/gm, '$1 $2');
  // Fix numbered lists: 1.**Ask, 2.Thing, 3.*Bold* etc. → 1. **Ask, 2. Thing, 3. *Bold*
  cleaned = cleaned.replace(/(\d+)\.([A-Za-z*\[])/g, '$1. $2');
  // Normalize all list markers (+, *, -) to '-'
  cleaned = cleaned.replace(/^(\s*)[+*\-]([^ \-\*\+])/gm, '$1- $2');
  // Ensure a space after every list marker
  cleaned = cleaned.replace(/^(\s*)-([^ ])/gm, '$1- $2');
  // Fix common AI mistakes: **word* or *word** → **word**
  cleaned = cleaned.replace(/\*\*([^\*\n]+)\*/g, '**$1**');
  cleaned = cleaned.replace(/\*([^\*\n]+)\*\*/g, '**$1**');
  // Remove stray asterisks not part of markdown (e.g., at line start/end)
  cleaned = cleaned.replace(/(^|\s)\*+(\s|$)/g, ' ');
  // Remove multiple consecutive asterisks (e.g., ****word**** → **word**)
  cleaned = cleaned.replace(/\*{3,}/g, '**');
  // Remove malformed headers (e.g., ### at end of line)
  cleaned = cleaned.replace(/#+\s*$/gm, '');
  // Insert blank lines after headings
  cleaned = cleaned.replace(/(#{1,6} .+)(?!\n\n)/g, '$1\n');
  // Insert blank lines after bolded section titles (e.g., '**Title:**', '**Title.**')
  cleaned = cleaned.replace(/(\*\*[^
]+?[:\.]+\*\*)(?!\n\n)/g, '$1\n');
  // Insert blank lines between consecutive bolded phrases (e.g., '**A**B' -> '**A**\n\nB')
  cleaned = cleaned.replace(/(\*\*[^
]+?\*\*)([A-Za-z])/g, '$1\n\n$2');
  // Insert blank lines between list items and following content if missing
  cleaned = cleaned.replace(/(\n- [^\n]+)(?!\n\n|\n- )/g, '$1\n');
  cleaned = cleaned.replace(/(\n\d+\. [^\n]+)(?!\n\n|\n\d+\. )/g, '$1\n');
  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  // Remove leading/trailing blank lines
  cleaned = cleaned.replace(/^\s+|\s+$/g, '');
  // Remove any remaining unmatched asterisks at line start/end
  cleaned = cleaned.replace(/(^|\n)\*+(?=\s|$)/g, '');
  cleaned = cleaned.replace(/\*+(?=\n|$)/g, '');
  // Aggressive post-processing:
  // 1. Remove lines that are just stray asterisks or malformed markdown
  cleaned = cleaned.split('\n').filter(line => !/^\s*\*+\s*$/.test(line)).join('\n');
  // 2. If a line starts with ** and has no closing **, remove or close it
  cleaned = cleaned.replace(/(^|\n)\*\*([^\n*]+)(?=\n|$)/g, (m, p1, p2) => {
    return p1 + (p2.trim().endsWith('**') ? p2 : p2 + '**');
  });
  // 3. Remove unpaired bold/italic markers at end of lines
  cleaned = cleaned.replace(/\*+(?=\s|$)/g, '');
  // 4. Normalize spaces around formatting markers
  cleaned = cleaned.replace(/\s*\*\*\s*/g, '**');
  cleaned = cleaned.replace(/\s*\*\s*/g, '*');
  // 5. Remove any remaining unmatched asterisks
  cleaned = cleaned.replace(/(^|\s)\*+(?=\s|$)/g, '');
  return cleaned;
}

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => <h1 className="markdown-body-heading markdown-body-h1" {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => <h2 className="markdown-body-heading markdown-body-h2" {...props} />,
  h3: (props: React.ComponentProps<'h3'>) => <h3 className="markdown-body-heading markdown-body-h3" {...props} />,
  hr: (props: React.ComponentProps<'hr'>) => <hr className="markdown-body-hr my-4 border-t-2 border-gray-200" {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul className="markdown-body-ul ml-6 mb-2 list-disc" {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol className="markdown-body-ol ml-6 mb-2 list-decimal" {...props} />,
  li: (props: React.ComponentProps<'li'>) => <li className="markdown-body-li mb-1" {...props} />,
};

export default function StreamingChat() {
  // (Copy all state, logic, and JSX from main chat page here, updating Sidebar import path)
  // ...
} 