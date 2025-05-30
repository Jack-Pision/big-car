export const SCHEMAS = {
  // Basic conversation schema
  conversation: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Simple conversational response"
      }
    },
    required: ["content"]
  },
  
  // Tutorial/guide schema
  tutorial: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title of the tutorial"
      },
      introduction: {
        type: "string",
        description: "Brief introduction to the topic"
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: {
              type: "string",
              description: "Step number or title"
            },
            instruction: {
              type: "string",
              description: "Detailed instruction for this step"
            },
            code: {
              type: "string",
              description: "Optional code example"
            }
          },
          required: ["step", "instruction"]
        }
      },
      conclusion: {
        type: "string",
        description: "Summary or closing thoughts"
      }
    },
    required: ["title", "introduction", "steps"]
  },
  
  // Add more schemas for comparison, deep dive, etc.
  // For now, a simple comparison schema
  comparison: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title of the comparison"
      },
      item1_name: {
        type: "string",
        description: "Name of the first item"
      },
      item1_pros: {
        type: "array",
        items: { type: "string" },
        description: "Pros of the first item"
      },
      item1_cons: {
        type: "array",
        items: { type: "string" },
        description: "Cons of the first item"
      },
      item2_name: {
        type: "string",
        description: "Name of the second item"
      },
      item2_pros: {
        type: "array",
        items: { type: "string" },
        description: "Pros of the second item"
      },
      item2_cons: {
        type: "array",
        items: { type: "string" },
        description: "Cons of the second item"
      },
      summary: {
        type: "string",
        description: "Overall summary of the comparison"
      }
    },
    required: ["title", "item1_name", "item2_name", "summary"]
  }
}; 