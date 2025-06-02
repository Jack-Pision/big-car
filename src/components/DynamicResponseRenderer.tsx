import { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { safe } from '../utils/SafeAccess';
import { EnhancedMathRenderer } from './EnhancedMathRenderer';

interface ResponseRendererProps {
  data: any;
  type: string;
}

// Helper function to unescape string literals in content
const unescapeString = (str: string): string => {
  if (typeof str !== 'string') return '';
  
  // Replace common escape sequences with their actual characters
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
};

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => (
    <h1
      className="ai-title text-[2.5rem] font-medium leading-tight mb-2 mt-4"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2
      className="ai-section-title text-[1.7rem] font-medium leading-snug mb-1 mt-3"
      {...props}
    />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p
      className="ai-body-text text-[1.08rem] font-normal leading-relaxed mb-2"
      {...props}
    />
  ),
  // Add other markdown component overrides if needed
};

// Enhanced KaTeX options - keeping for backwards compatibility
const katexOptions = {
  strict: false,
  trust: true,
  macros: {
    "\\implies": "\\Rightarrow",
    "\\cancel": "\\not",
    "\\mathbf": "\\boldsymbol"
  }
};

// Determine if the content has math expressions - enhanced detection
const containsMath = (content: string): boolean => {
  return /\$(.*?)\$|\$\$(.*?)\$\$|\\\((.*?)\\\)|\\\[(.*?)\\\]|\\\begin\{(.*?)\}|\\\end\{(.*?)\}|\\frac|\\sqrt|\\sum|\\int|\\lim|\\prod|\\alpha|\\beta|\\gamma|\\delta|\\epsilon|\\zeta|\\eta|\\theta|\\iota|\\kappa|\\lambda|\\mu|\\nu|\\xi|\\pi|\\rho|\\sigma|\\tau|\\upsilon|\\phi|\\chi|\\psi|\\omega|\\Gamma|\\Delta|\\Theta|\\Lambda|\\Xi|\\Pi|\\Sigma|\\Upsilon|\\Phi|\\Psi|\\Omega/.test(content);
};

function BasicRenderer({ data }: { data: any }): ReactNode {
  // Always treat data as a string for display
  let contentToRender = '';
  if (typeof data === 'string') {
    contentToRender = data;
  } else if (data !== null && data !== undefined) {
    contentToRender = String(data);
  } else {
    contentToRender = 'No content provided';
  }
  
  // Unescape content first
  contentToRender = unescapeString(contentToRender);
  
  // Check if the content has math expressions - use an improved detection regex
  const hasMath = containsMath(contentToRender);
  
  // If it has math, use EnhancedMathRenderer, otherwise use regular markdown
  if (hasMath) {
    return <EnhancedMathRenderer content={contentToRender} />;
  } else {
    // Use the existing renderer for non-math content
    return (
      <ReactMarkdown 
        components={markdownComponents} 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
      >
        {contentToRender}
      </ReactMarkdown>
    );
  }
}

function TutorialRenderer({ data }: { data: any }): ReactNode {
  const safeData = safe(data);
  return (
    <div className="tutorial-response">
      <h2 className="text-2xl font-bold mb-3 text-cyan-400">{safeData.get('title')}</h2>
      {safeData.has('introduction') && (
        <p className="mb-4 text-gray-300">{safeData.get('introduction')}</p>
      )}
      <div className="steps-container space-y-4">
        {safeData.get<any[]>('steps', [])?.map((step: any, index: number) => {
          const safeStep = safe(step);
          return (
            <div key={index} className="step p-3 rounded-md bg-gray-800 border border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100 mb-1">
                {safeStep.get('step')}
              </h3>
              <p className="text-gray-300">{safeStep.get('instruction')}</p>
              {safeStep.has('code') && (
                <pre className="bg-gray-900 p-2 rounded mt-2 text-sm text-gray-200 overflow-x-auto">
                  <code>{safeStep.get('code')}</code>
                </pre>
              )}
            </div>
          );
        })}
      </div>
      {safeData.has('conclusion') && (
        <p className="mt-4 text-gray-300">{safeData.get('conclusion')}</p>
      )}
    </div>
  );
}

function ComparisonRenderer({ data }: { data: any }): ReactNode {
  const safeData = safe(data);
  return (
    <div className="comparison-response">
      <h2 className="text-2xl font-bold mb-3 text-cyan-400">{safeData.get('title')}</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="item-details p-3 rounded-md bg-gray-800 border border-gray-700">
          <h3 className="text-xl font-semibold text-gray-100 mb-2">
            {safeData.get('item1_name')}
          </h3>
          {safeData.has('item1_pros') && safeData.get<string[]>('item1_pros', []).length > 0 && (
            <div className="mb-2">
              <h4 className="text-md font-semibold text-green-400">Pros:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {safeData.get<string[]>('item1_pros', []).map((pro: string, i: number) => (
                  <li key={i}>{pro}</li>
                ))}
              </ul>
            </div>
          )}
          {safeData.has('item1_cons') && safeData.get<string[]>('item1_cons', []).length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-red-400">Cons:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {safeData.get<string[]>('item1_cons', []).map((con: string, i: number) => (
                  <li key={i}>{con}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="item-details p-3 rounded-md bg-gray-800 border border-gray-700">
          <h3 className="text-xl font-semibold text-gray-100 mb-2">
            {safeData.get('item2_name')}
          </h3>
          {safeData.has('item2_pros') && safeData.get<string[]>('item2_pros', []).length > 0 && (
            <div className="mb-2">
              <h4 className="text-md font-semibold text-green-400">Pros:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {safeData.get<string[]>('item2_pros', []).map((pro: string, i: number) => (
                  <li key={i}>{pro}</li>
                ))}
              </ul>
            </div>
          )}
          {safeData.has('item2_cons') && safeData.get<string[]>('item2_cons', []).length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-red-400">Cons:</h4>
              <ul className="list-disc list-inside text-gray-300">
                {safeData.get<string[]>('item2_cons', []).map((con: string, i: number) => (
                  <li key={i}>{con}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {safeData.has('summary') && (
        <p className="mt-4 text-gray-300">
          <strong>Summary:</strong> {safeData.get('summary')}
        </p>
      )}
    </div>
  );
}


export default function DynamicResponseRenderer({ data, type }: ResponseRendererProps): ReactNode {
  switch (type) {
    case 'tutorial':
      return <TutorialRenderer data={data} />;
    case 'comparison':
      return <ComparisonRenderer data={data} />;
    case 'conversation':
    default:
      return <BasicRenderer data={data} />;
  }
} 