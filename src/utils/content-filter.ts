/**
 * Content filtering utilities to remove AI reasoning patterns
 * This centralizes all filtering logic in one place for consistency
 */

/**
 * Applies aggressive filtering to remove AI thinking patterns from content
 * @param content The raw content from the AI
 * @returns Filtered content with reasoning patterns removed
 */
export function filterAIThinking(content: string): string {
  if (!content) return '';
  
  // Apply comprehensive filtering
  return content
    // Remove explicit think tags
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    
    // Remove reasoning patterns - first pass (obvious markers)
    .replace(/(?:Let me|I'll|I need to|First,|Step \d+:|To answer this|My reasoning|I think|Let's analyze|Let's break this down|To approach this|I should consider)[^.]*\./g, '')
    
    // Remove reasoning patterns - second pass (sequential reasoning)
    .replace(/(?:First|Second|Third|Next|Finally|Then)[^a-zA-Z]*(?:I'll|I will|I need to|we need to)[^.]*\./g, '')
    
    // Remove reasoning patterns - third pass (analytical phrases)
    .replace(/(?:Looking at|Analyzing|Considering|Examining|Based on|According to)[^.]*\./g, '')
    
    // Remove casual thinking phrases
    .replace(/(?:Let's see|I would approach this by|In order to|The way to|We can|I can)[^.]*\./g, '')
    .replace(/(?:So,|Now,|Well,|Hmm,|Alright,)[^.]*(?:let me|I'll|I will|I need to|we need to)[^.]*\./g, '')
    
    // Remove planning statements
    .replace(/(?:I'm going to|I will|Let me)[^.]*(?:explain|answer|address|respond|tackle)[^.]*\./g, '')
    
    // Additional casual reasoning patterns
    .replace(/(?:To understand|To figure out|To determine|To solve|To address|To tackle)[^.]*\./g, '')
    .replace(/(?:If we|If I|When we|When I)[^.]*(?:look at|consider|analyze|examine|think about)[^.]*\./g, '')
    .replace(/(?:One way|The best way|A good way|An effective way)[^.]*(?:to approach|to solve|to answer|to address)[^.]*\./g, '')
    .replace(/(?:For this|In this case|Given this|With this)[^.]*(?:I'll|I will|I need to|we need to)[^.]*\./g, '')
    .replace(/(?:It's important|It's helpful|It's worth|It would be)[^.]*(?:to note|to understand|to consider|to recognize)[^.]*\./g, '')
    
    // Clean up any artifacts and trim
    .replace(/\s{2,}/g, ' ')
    .trim();
} 