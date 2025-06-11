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
  
  // Apply a multi-stage filtering process for more thorough reasoning removal
  let filteredContent = content;
  
  // STAGE 1: Remove explicit think tags
  filteredContent = filteredContent.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // STAGE 2: Handle the specific pattern seen in your example
  // Where reasoning transitions to a proper response starting with a name/title
  const reasoningToResponsePattern = /^(.*?)(?=\s*(?:[A-Z][a-z]+ [A-Z][a-z]+|\w+ [A-Z][a-z]+)(?:\s*\([0-9]{4}.*?\)|:|\s+was\s+a|\s+is\s+a))/;
  const reasoningMatch = filteredContent.match(reasoningToResponsePattern);
  
  // Check if the matched part contains reasoning indicators
  if (reasoningMatch && reasoningMatch[1] && 
      /(?:should|need to|let me|check|note|important|key|straightforward|readability)/i.test(reasoningMatch[1])) {
    filteredContent = filteredContent.replace(reasoningMatch[1], '');
  }
  
  // STAGE 2.5: Specifically target the exact pattern from the screenshot
  // This looks for "so, his ideology was based on..." style openings followed by meta-commentary
  const specificPatternFromScreenshot = /^so,[^.]*?(?:I should note|It's important|Let me check|Keep the response)[^.]*\./i;
  if (specificPatternFromScreenshot.test(filteredContent)) {
    filteredContent = filteredContent.replace(specificPatternFromScreenshot, '');
  }
  
  // STAGE 3: Remove beginning-of-response reasoning and meta-commentary
  // This catches reasoning at the start of a response (which was missed before)
  const beginningReasoningPattern = /^((?:(?:Let me|I'll|I need to|First|So,|Well,|I think|I should|It's important)[^.]*\.(?:\s+|$))+)/i;
  const beginningReasoning = filteredContent.match(beginningReasoningPattern);
  if (beginningReasoning && beginningReasoning[1]) {
    filteredContent = filteredContent.replace(beginningReasoningPattern, '');
  }
  
  // STAGE 4: Remove meta-commentary about response structure and formatting
  const metaCommentaryPatterns = [
    // Meta-commentary about presentation
    /(?:let me|I'll|I should|I will|I need to)(?:[^.]*?)(?:present|structure|format|keep|make|ensure|write|create)(?:[^.]*?)(?:response|answer|information|clear|concise|straightforward|readability|markdown)[^.]*\./ig,
    
    // Commentary about checking/verification
    /(?:let me check|let's check|I should check|I need to check|let me see|let's see|checking)[^.]*\./ig,
    
    // Notes about what to include/exclude
    /(?:It's important to|I should|Let me|I need to|I'll)(?:[^.]*?)(?:note|mention|include|add|point out|highlight|remember|consider)[^.]*\./ig,
    
    // Thinking about what's important or key
    /(?:Yes,|Okay,|Alright,|Indeed,|Right,)[^.]*(?:that's|that is)(?:[^.]*?)(?:key|important|crucial|essential|critical|necessary|relevant)[^.]*\./ig
  ];
  
  metaCommentaryPatterns.forEach(pattern => {
    filteredContent = filteredContent.replace(pattern, '');
  });
  
  // STAGE 5: Remove single-sentence reasoning patterns as before
  const singleSentencePatterns = [
    // Reasoning patterns - first pass (obvious markers)
    /(?:Let me|I'll|I need to|First,|Step \d+:|To answer this|My reasoning|I think|Let's analyze|Let's break this down|To approach this|I should consider)[^.]*\./g,
    
    // Reasoning patterns - second pass (sequential reasoning)
    /(?:First|Second|Third|Next|Finally|Then)[^a-zA-Z]*(?:I'll|I will|I need to|we need to)[^.]*\./g,
    
    // Reasoning patterns - third pass (analytical phrases)
    /(?:Looking at|Analyzing|Considering|Examining|Based on|According to)[^.]*\./g,
    
    // Casual thinking phrases
    /(?:Let's see|I would approach this by|In order to|The way to|We can|I can)[^.]*\./g,
    /(?:So,|Now,|Well,|Hmm,|Alright,)[^.]*(?:let me|I'll|I will|I need to|we need to)[^.]*\./g,
    
    // Planning statements
    /(?:I'm going to|I will|Let me)[^.]*(?:explain|answer|address|respond|tackle)[^.]*\./g,
    
    // Additional casual reasoning patterns
    /(?:To understand|To figure out|To determine|To solve|To address|To tackle)[^.]*\./g,
    /(?:If we|If I|When we|When I)[^.]*(?:look at|consider|analyze|examine|think about)[^.]*\./g,
    /(?:One way|The best way|A good way|An effective way)[^.]*(?:to approach|to solve|to answer|to address)[^.]*\./g,
    /(?:For this|In this case|Given this|With this)[^.]*(?:I'll|I will|I need to|we need to)[^.]*\./g,
    /(?:It's important|It's helpful|It's worth|It would be)[^.]*(?:to note|to understand|to consider|to recognize)[^.]*\./g
  ];
  
  singleSentencePatterns.forEach(pattern => {
    filteredContent = filteredContent.replace(pattern, '');
  });
  
  // STAGE 6: Remove multi-sentence reasoning blocks
  // This catches longer thinking segments spanning multiple sentences
  const multiSentencePatterns = [
    // Multiple sentences with reasoning indicators
    /((?:(?:Let me|I'll|I need to|First|So,|Well,|I think|I should)[^.]*\.){2,})/g,
    
    // Sequences of analytical steps
    /((?:(?:First,|Second,|Third,|Next,|Then,|Finally,)[^.]*\.){2,})/g
  ];
  
  multiSentencePatterns.forEach(pattern => {
    filteredContent = filteredContent.replace(pattern, '');
  });
  
  // STAGE 7: Clean up any artifacts and formatting
  filteredContent = filteredContent
    // Fix multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Fix sentences that might now start without capitalization
    .replace(/\.\s+([a-z])/g, '. $1'.toUpperCase())
    // Trim extra whitespace
    .trim();
    
  // Handle empty results (in case we filtered everything)
  if (!filteredContent.trim()) {
    return content; // Return original rather than nothing
  }
  
  return filteredContent;
} 