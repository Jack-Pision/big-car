export function classifyQuery(query: string): string {
  // Basic classification logic
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("how to") || 
      lowerQuery.includes("steps to") || 
      lowerQuery.includes("guide to") ||
      lowerQuery.includes("tutorial for") ||
      lowerQuery.includes("explain how")) {
    return "tutorial";
  }
  
  if (lowerQuery.includes("compare") || 
      lowerQuery.includes("difference between") || 
      lowerQuery.includes("vs") ||
      lowerQuery.includes("versus")) {
    return "comparison";
  }

  // Informational Summary classification (new)
  // Matches queries like "what is [topic]", "tell me about [topic]", "[topic] overview"
  if (lowerQuery.startsWith("what is ") || 
      lowerQuery.startsWith("what are ") || 
      lowerQuery.startsWith("tell me about ") || 
      lowerQuery.startsWith("explain ") && !lowerQuery.includes("how") || // Avoid conflict with tutorial
      lowerQuery.endsWith(" overview") ||
      lowerQuery.endsWith(" summary")) {
    // Further check to avoid overly simple questions becoming summaries
    const words = lowerQuery.split(" ");
    if (words.length > 2) { // Requires more than just "what is x" for a summary
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