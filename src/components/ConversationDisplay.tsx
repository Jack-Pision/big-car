import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

export interface ConversationData {
  content: string;
  key_takeaway?: string;
}

interface ConversationDisplayProps {
  data: ConversationData | string | any; // Accept any type to handle unexpected formats
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

const ConversationDisplay: React.FC<ConversationDisplayProps> = ({ data }) => {
  // Extract content from various possible data formats
  let content = '';
  let keyTakeaway = '';

  // Case 1: String content
  if (typeof data === 'string') {
    content = data;
  } 
  // Case 2: Properly structured object
  else if (data && typeof data === 'object') {
    // Try to extract content field
    if (data.content !== undefined) {
      if (typeof data.content === 'string') {
        content = data.content;
        
        // Handle nested JSON in content (happens with some AI responses)
        if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
          try {
            const parsedContent = JSON.parse(content);
            if (parsedContent && typeof parsedContent === 'object') {
              // If the nested content has a content field, use that
              if (parsedContent.content && typeof parsedContent.content === 'string') {
                content = parsedContent.content;
              }
              // If it has other text fields, try to extract those
              else {
                const textFields = Object.entries(parsedContent)
                  .filter(([_, v]) => typeof v === 'string' && v.length > 0);
                
                if (textFields.length > 0) {
                  // Pick the longest text field as the main content
                  const mainField = textFields.reduce((prev, curr) => 
                    (curr[1] as string).length > (prev[1] as string).length ? curr : prev
                  );
                  content = mainField[1] as string;
                }
              }
            }
          } catch (e) {
            // If parsing fails, keep original content
            console.warn("Failed to parse nested JSON in conversation content", e);
          }
        }
      } 
      // Handle non-string content field (convert to string)
      else if (data.content !== null) {
        try {
          content = JSON.stringify(data.content, null, 2);
          content = "```json\n" + content + "\n```";
        } catch (e) {
          content = "Error: Could not format content";
        }
      }
    }
    // Case 3: No content field but has text fields we can use
    else {
      const textFields = Object.entries(data)
        .filter(([k, v]) => typeof v === 'string' && v.length > 0 && k !== 'key_takeaway')
        .map(([k, v]) => ({ key: k, value: v as string }));
      
      if (textFields.length > 0) {
        // Find the most likely content field - longest text
        const mainField = textFields.reduce((prev, curr) => 
          curr.value.length > prev.value.length ? curr : prev
        );
        content = mainField.value;
      }
      // Case 4: No text fields at all - stringify the object
      else if (Object.keys(data).length > 0) {
        try {
          content = "```json\n" + JSON.stringify(data, null, 2) + "\n```";
        } catch (e) {
          content = "Error: Could not format data";
        }
      }
    }
    
    // Extract key takeaway if available
    if (data.key_takeaway && typeof data.key_takeaway === 'string') {
      keyTakeaway = data.key_takeaway;
    }
  }
  // Case 5: Null or undefined data
  else {
    content = "No content provided";
  }

  // Ensure we have something to display
  if (!content.trim()) {
    content = "Error: Could not extract content from response";
  }

  // Unescape string literals in content and key takeaway
  content = unescapeString(content);
  if (keyTakeaway) {
    keyTakeaway = unescapeString(keyTakeaway);
  }

  return (
    <div className="prose dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content}
      </ReactMarkdown>
      {keyTakeaway && (
        <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
          <p className="text-sm italic text-gray-600 dark:text-gray-400">
            <strong>Key takeaway:</strong> 
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} className="inline">
                {` ${keyTakeaway}`}
            </ReactMarkdown>
          </p>
        </div>
      )}
    </div>
  );
};

export default ConversationDisplay; 