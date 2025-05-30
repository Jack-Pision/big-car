export function classifyQuery(query: string): string {
  // Basic classification logic
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("how to") || 
      lowerQuery.includes("steps") || 
      lowerQuery.includes("guide") ||
      lowerQuery.includes("tutorial") ||
      lowerQuery.includes("explain how")) {
    return "tutorial";
  }
  
  if (lowerQuery.includes("compare") || 
      lowerQuery.includes("difference between") || 
      lowerQuery.includes("vs") ||
      lowerQuery.includes("versus")) {
    return "comparison";
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