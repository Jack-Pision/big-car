export const SCHEMAS = {
  // Basic conversation schema
  conversation: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Simple conversational response, can include markdown for basic formatting."
      },
      // Optional field for a quick, highlighted takeaway if applicable
      key_takeaway: {
        type: "string",
        description: "A short, highlighted takeaway message, if relevant."
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
        description: "Brief introduction to the topic, can include markdown."
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step_title: { // Renamed for clarity from 'step'
              type: "string",
              description: "Title or heading for this step"
            },
            instruction: {
              type: "string",
              description: "Detailed instruction for this step, can include markdown (lists, bold, italics)."
            },
            code_example: { // Renamed for clarity
              type: "string",
              description: "Optional code example relevant to the step, provide as a string."
            },
            image_url: { // Added for potential visual aids
                type: "string",
                description: "Optional URL to an image illustrating this step."
            }
          },
          required: ["step_title", "instruction"]
        }
      },
      conclusion: {
        type: "string",
        description: "Summary or closing thoughts, can include markdown."
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
      introduction: { // Added for context
        type: "string",
        description: "Brief introduction to what is being compared, can include markdown."
      },
      item1_name: {
        type: "string",
        description: "Name of the first item"
      },
      item1_description: { // Added for more detail
        type: "string",
        description: "Brief description of the first item, can include markdown."
      },
      item1_pros: {
        type: "array",
        items: { type: "string" }, // Each string can be a markdown formatted point
        description: "Pros of the first item"
      },
      item1_cons: {
        type: "array",
        items: { type: "string" }, // Each string can be a markdown formatted point
        description: "Cons of the first item"
      },
      item2_name: {
        type: "string",
        description: "Name of the second item"
      },
      item2_description: { // Added for more detail
        type: "string",
        description: "Brief description of the second item, can include markdown."
      },
      item2_pros: {
        type: "array",
        items: { type: "string" }, // Each string can be a markdown formatted point
        description: "Pros of the second item"
      },
      item2_cons: {
        type: "array",
        items: { type: "string" }, // Each string can be a markdown formatted point
        description: "Cons of the second item"
      },
      summary: {
        type: "string",
        description: "Overall summary of the comparison, can include markdown."
      }
    },
    required: ["title", "item1_name", "item1_description", "item2_name", "item2_description", "summary"]
  },
  informational_summary: {
    type: "object",
    properties: {
      main_title: {
        type: "string",
        description: "The primary title for the summary (e.g., \"Nvidia Overview\")."
      },
      introduction: {
        type: "string",
        description: "A brief introductory paragraph. Can use Markdown for simple formatting."
      },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section_title: {
              type: "string",
              description: "Title for this section (e.g., \"Key Business Areas\"). Use Markdown H2 style for emphasis if possible e.g. ## Title."
            },
            content_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item_type: {
                    type: "string",
                    enum: ["paragraph", "bullet_list", "key_value_list"],
                    description: "Type of content item."
                  },
                  text_content: {
                    type: "string",
                    description: "Text for a paragraph. Can use Markdown (bold, italics). Not used if item_type is bullet_list or key_value_list."
                  },
                  list_items: {
                    type: "array",
                    items: { type: "string" }, // Each string can be a markdown formatted bullet point
                    description: "Array of strings for a bullet list. Used only if item_type is 'bullet_list'."
                  },
                  key_value_pairs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: { type: "string" },
                        value: { type: "string" } // Value can include markdown
                      },
                      required: ["key", "value"]
                    },
                    description: "Array of key-value objects. Used only if item_type is 'key_value_list'."
                  },
                  indent_level: {
                    type: "integer",
                    description: "Optional indentation level (e.g., 0 for normal, 1 for indented). Default is 0."
                  }
                },
                required: ["item_type"]
              }
            }
          },
          required: ["section_title", "content_items"]
        }
      },
      conclusion: {
        type: "string",
        description: "A concluding paragraph, if applicable. Can use Markdown."
      }
    },
    required: ["main_title", "sections"]
  },

  mind_map: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The central topic or title of the mind map"
      },
      description: {
        type: "string",
        description: "Brief description of the mind map topic"
      },
      center_node: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          description: { type: "string" }
        },
        required: ["id", "label"]
      },
      branches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            description: { type: "string" },
            color: { type: "string", description: "Hex color for the branch (e.g., #3B82F6)" },
            children: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  description: { type: "string" }
                },
                required: ["id", "label"]
              }
            }
          },
          required: ["id", "label"]
        }
      }
    },
    required: ["title", "center_node", "branches"]
  }
}; 