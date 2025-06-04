export function classifyQuery(query: string): string {
  // Basic classification logic
  const lowerQuery = query.toLowerCase();
  
  // Check for tutorial-like queries
  // Add exclusions for casual mentions of "how to" in conversation
  if ((lowerQuery.includes("how to") || 
      lowerQuery.includes("steps to") || 
      lowerQuery.includes("guide to") ||
      lowerQuery.includes("tutorial for") ||
      lowerQuery.includes("explain how")) && 
      // Exclude conversation-like phrases that might include "how to"
      !lowerQuery.startsWith("do you know how to") &&
      !lowerQuery.includes("can you tell me how to") &&
      !lowerQuery.includes("wondering how to") &&
      // More specific criteria for tutorial classification
      (lowerQuery.length > 15)) {  // Ensure it's a substantive query
    return "tutorial";
  }
  
  // Check for comparison-like queries
  // Add exclusions for casual mentions of comparisons in conversation
  if ((lowerQuery.includes("compare") || 
      lowerQuery.includes("difference between") || 
      (lowerQuery.includes("vs") && lowerQuery.includes(" and ")) ||
      lowerQuery.includes("versus")) &&
      // Exclude casual questions
      !lowerQuery.startsWith("can you compare") &&
      !lowerQuery.startsWith("do you know the difference between") &&
      !lowerQuery.includes("what do you think about") &&
      // More specific criteria
      (lowerQuery.length > 20)) {  // Ensure it's a substantive comparison query
    return "comparison";
  }

  // Informational Summary classification (new)
  // Matches queries like "what is [topic]", "tell me about [topic]", "[topic] overview"
  if ((lowerQuery.startsWith("what is ") || 
      lowerQuery.startsWith("what are ") || 
      lowerQuery.startsWith("tell me about ") || 
      (lowerQuery.startsWith("explain ") && !lowerQuery.includes("how")) || // Avoid conflict with tutorial
      lowerQuery.endsWith(" overview") ||
      lowerQuery.endsWith(" summary")) &&
      // Additional checks to ensure it's a request for structured information
      !lowerQuery.includes("?") && // Questions with question marks are often conversational
      lowerQuery.length > 25) {    // Longer queries are more likely to be information requests
    // Further check to avoid overly simple questions becoming summaries
    const words = lowerQuery.split(" ");
    if (words.length > 3) { // Requires more words for a summary (increased from 2)
        return "informational_summary";
    }
  }
  
  // Add more classifications here for other types like 'deepDive', 'educational', etc.
  // For now, we'll keep it simple.
  
  return "conversation"; // Default to conversation type
}

// Optional: AI-based classification (can be implemented later)
// export async function aiClassifyQuery(query: string): Promise<string> {
//   const response = await fetch("/api/classify-query", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ query }),
//   });
  
//   const { type } = await response.json();
//   return type; // "tutorial", "comparison", etc.
// } 