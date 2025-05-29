/**
 * Utilities for managing and enhancing conversation context for better follow-up handling
 */

import { WebSource } from './source-utils/index';

// Define the types for our conversation context
export interface Message {
  role: 'user' | 'assistant' | 'deep-research';
  content: string;
  id?: string;
  parentId?: string;
  timestamp?: number;
  imageUrls?: string[];
  webSources?: WebSource[];
  researchId?: string;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  entities?: string[];
  topics?: string[];
  intentType?: string;
  isFollowUp?: boolean;
  referencedMessageIds?: string[];
  isResearchResponse?: boolean;
  summaryPoints?: string[];
}

export interface ConversationContext {
  messages: Message[];
  entities: Map<string, EntityInfo>;
  topics: Map<string, TopicInfo>;
  threads: Map<string, ThreadInfo>;
  recentContext: string;
}

interface EntityInfo {
  name: string;
  mentions: number;
  firstMentionedIn: string; // message ID
  lastMentionedIn: string; // message ID
  associatedTopics: string[];
}

interface TopicInfo {
  name: string;
  mentions: number;
  firstMentionedIn: string; // message ID
  lastMentionedIn: string; // message ID
  associatedEntities: string[];
}

interface ThreadInfo {
  id: string;
  rootMessageId: string;
  messageIds: string[];
  topic?: string;
}

/**
 * Build enhanced context from message history
 */
export function buildConversationContext(messages: Message[]): ConversationContext {
  const context: ConversationContext = {
    messages: [],
    entities: new Map<string, EntityInfo>(),
    topics: new Map<string, TopicInfo>(),
    threads: new Map<string, ThreadInfo>(),
    recentContext: '',
  };

  // Process messages to extract context
  messages.forEach((message, index) => {
    // Clone the message to avoid mutating the original
    const enhancedMessage = { ...message };
    
    // Ensure each message has an ID
    if (!enhancedMessage.id) {
      enhancedMessage.id = `msg_${index}`;
    }
    
    // Generate metadata if not present
    if (!enhancedMessage.metadata) {
      enhancedMessage.metadata = analyzeMessageContent(enhancedMessage, messages.slice(0, index));
    }
    
    // Update entities and topics based on metadata
    updateEntitiesAndTopics(context, enhancedMessage);
    
    // Track message threads
    trackMessageThreads(context, enhancedMessage, index > 0 ? messages[index - 1] : null);
    
    // Add enhanced message to context
    context.messages.push(enhancedMessage);
  });
  
  // Generate recent context summary (last 3-5 exchanges)
  context.recentContext = generateRecentContextSummary(context.messages.slice(-6));
  
  return context;
}

/**
 * Analyze message content to extract metadata
 */
function analyzeMessageContent(message: Message, previousMessages: Message[]): MessageMetadata {
  const metadata: MessageMetadata = {
    entities: [],
    topics: [],
    isFollowUp: previousMessages.length > 0,
    referencedMessageIds: [],
  };
  
  // Simple check if this is a research response
  metadata.isResearchResponse = message.role === 'assistant' && 
    (message.content.includes('research') || !!message.webSources?.length);
  
  // Simple heuristic to detect if this is a follow-up to the previous message
  if (previousMessages.length > 0 && message.role === 'user') {
    const previousUserMessages = previousMessages.filter(m => m.role === 'user');
    const previousAssistantMessages = previousMessages.filter(m => m.role === 'assistant');
    
    if (previousUserMessages.length > 0 && previousAssistantMessages.length > 0) {
      // Check for pronouns or references that suggest a follow-up
      const followUpIndicators = [
        'what about', 'and', 'also', 'additionally', 'furthermore',
        'how about', 'what if', 'why', 'could you', 'can you', 
        'tell me more', 'explain', 'elaborate', 'continue', 'more info',
        'it', 'they', 'them', 'those', 'these', 'that', 'this'
      ];
      
      metadata.isFollowUp = followUpIndicators.some(indicator => 
        message.content.toLowerCase().includes(indicator)
      );
      
      // If it's a follow-up, reference the previous messages
      if (metadata.isFollowUp) {
        metadata.referencedMessageIds = [
          previousUserMessages[previousUserMessages.length - 1].id,
          previousAssistantMessages[previousAssistantMessages.length - 1].id
        ].filter(id => id !== undefined) as string[];
      }
    }
  }
  
  return metadata;
}

/**
 * Update entity and topic tracking based on message metadata
 */
function updateEntitiesAndTopics(context: ConversationContext, message: Message): void {
  // For a real implementation, this would use NLP to extract entities and topics
  // For now, we'll use a simple approach based on the message content
  
  if (message.metadata?.entities) {
    message.metadata.entities.forEach(entity => {
      if (!context.entities.has(entity)) {
        context.entities.set(entity, {
          name: entity,
          mentions: 1,
          firstMentionedIn: message.id!,
          lastMentionedIn: message.id!,
          associatedTopics: message.metadata?.topics || []
        });
      } else {
        const entityInfo = context.entities.get(entity)!;
        entityInfo.mentions += 1;
        entityInfo.lastMentionedIn = message.id!;
        entityInfo.associatedTopics = Array.from(new Set([
          ...entityInfo.associatedTopics,
          ...(message.metadata?.topics || [])
        ]));
      }
    });
  }
  
  if (message.metadata?.topics) {
    message.metadata.topics.forEach(topic => {
      if (!context.topics.has(topic)) {
        context.topics.set(topic, {
          name: topic,
          mentions: 1,
          firstMentionedIn: message.id!,
          lastMentionedIn: message.id!,
          associatedEntities: message.metadata?.entities || []
        });
      } else {
        const topicInfo = context.topics.get(topic)!;
        topicInfo.mentions += 1;
        topicInfo.lastMentionedIn = message.id!;
        topicInfo.associatedEntities = Array.from(new Set([
          ...topicInfo.associatedEntities,
          ...(message.metadata?.entities || [])
        ]));
      }
    });
  }
}

/**
 * Track message threads (conversations about the same topic)
 */
function trackMessageThreads(context: ConversationContext, message: Message, previousMessage: Message | null): void {
  // If no previous message, start a new thread
  if (!previousMessage) {
    const threadId = `thread_${message.id}`;
    context.threads.set(threadId, {
      id: threadId,
      rootMessageId: message.id!,
      messageIds: [message.id!],
      topic: message.metadata?.topics?.[0]
    });
    return;
  }
  
  // Check if this message references or is part of an existing thread
  let belongsToThread = false;
  
  if (message.parentId) {
    // If the message has an explicit parent, find that thread
    Array.from(context.threads.entries()).some(([id, thread]) => {
      if (thread.messageIds.includes(message.parentId!)) {
        thread.messageIds.push(message.id!);
        belongsToThread = true;
        return true; // break the loop
      }
      return false;
    });
  } else if (message.metadata?.referencedMessageIds?.length) {
    // If the message references other messages, find the thread with the most references
    const threadReferenceCounts = new Map<string, number>();
    
    Array.from(context.threads.entries()).forEach(([id, thread]) => {
      const referenceCount = message.metadata!.referencedMessageIds!.filter(
        refId => thread.messageIds.includes(refId)
      ).length;
      
      if (referenceCount > 0) {
        threadReferenceCounts.set(id, referenceCount);
      }
    });
    
    if (threadReferenceCounts.size > 0) {
      const entries = Array.from(threadReferenceCounts.entries());
      entries.sort((a, b) => b[1] - a[1]);
      const mostReferencedThreadId = entries[0][0];
      
      const thread = context.threads.get(mostReferencedThreadId);
      if (thread) {
        thread.messageIds.push(message.id!);
        belongsToThread = true;
      }
    }
  } else if (previousMessage) {
    // Default to continuing the most recent thread
    Array.from(context.threads.entries()).some(([id, thread]) => {
      if (thread.messageIds.includes(previousMessage.id!)) {
        thread.messageIds.push(message.id!);
        belongsToThread = true;
        return true; // break the loop
      }
      return false;
    });
  }
  
  // If doesn't belong to any thread, create a new one
  if (!belongsToThread) {
    const threadId = `thread_${message.id}`;
    context.threads.set(threadId, {
      id: threadId,
      rootMessageId: message.id!,
      messageIds: [message.id!],
      topic: message.metadata?.topics?.[0]
    });
  }
}

/**
 * Generate a summary of recent context to pass to the AI
 */
function generateRecentContextSummary(recentMessages: Message[]): string {
  if (recentMessages.length === 0) return '';
  
  const contextParts: string[] = [];
  
  // Group messages into exchanges (user -> assistant)
  for (let i = 0; i < recentMessages.length - 1; i += 2) {
    const userMsg = recentMessages[i];
    const assistantMsg = recentMessages[i + 1];
    
    if (userMsg && userMsg.role === 'user') {
      const userPart = `User asked: "${userMsg.content}"`;
      contextParts.push(userPart);
      
      if (assistantMsg && assistantMsg.role === 'assistant') {
        // Summarize assistant response
        const assistantContent = assistantMsg.content;
        const summary = assistantContent.length > 300 
          ? assistantContent.substring(0, 300) + '...' 
          : assistantContent;
          
        const assistantPart = `You responded: "${summary}"`;
        contextParts.push(assistantPart);
      }
    }
  }
  
  // Handle lone message at the end (if odd number)
  if (recentMessages.length % 2 !== 0) {
    const lastMsg = recentMessages[recentMessages.length - 1];
    if (lastMsg.role === 'user') {
      contextParts.push(`User is now asking: "${lastMsg.content}"`);
    }
  }
  
  return contextParts.join('\n');
}

/**
 * Format messages for API call with enhanced context
 */
export function formatMessagesForApi(
  messages: Message[],
  context: ConversationContext,
  includeContextSummary: boolean = true
): any[] {
  // Start with the system message from the context
  const formattedMessages: any[] = [];
  
  // Add context summary if requested
  if (includeContextSummary && context.recentContext) {
    formattedMessages.push({
      role: "system",
      content: `Conversation context:\n${context.recentContext}`
    });
  }
  
  // Add user messages and corresponding assistant messages
  const userMessages = messages.filter(msg => msg.role === 'user');
  
  userMessages.forEach((userMsg, index) => {
    // Add user message
    formattedMessages.push({
      role: "user",
      content: userMsg.content,
      ...(userMsg.imageUrls?.length ? { imageUrls: userMsg.imageUrls } : {})
    });
    
    // Find corresponding assistant message (if any)
    const assistantMsgs = messages.filter(msg => 
      msg.role === 'assistant' && 
      messages.indexOf(msg) > messages.indexOf(userMsg) &&
      (index === userMessages.length - 1 || 
       messages.indexOf(msg) < messages.indexOf(userMessages[index + 1]))
    );
    
    if (assistantMsgs.length > 0) {
      formattedMessages.push({
        role: "assistant",
        content: assistantMsgs[0].content
      });
    }
  });
  
  return formattedMessages;
}

/**
 * Enhance system prompt based on conversation context
 */
export function enhanceSystemPrompt(
  basePrompt: string, 
  context: ConversationContext, 
  currentQuery: string
): string {
  let enhancedPrompt = basePrompt;
  
  // Check if this is likely a follow-up question
  const isFollowUp = context.messages.length > 0;
  
  // If it's a follow-up, enhance the prompt
  if (isFollowUp) {
    // Extract important entities and topics from the conversation
    const topEntities = Array.from(context.entities.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5)
      .map(e => e.name);
      
    const topTopics = Array.from(context.topics.values())
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 3)
      .map(t => t.name);
    
    // Add context about the conversation to the prompt
    const contextAddition = `
This is a follow-up question in an ongoing conversation. When answering:

1. Maintain continuity with the conversation. Build upon what's already been discussed.
2. Avoid repeating information you've already shared unless the user explicitly asks for clarification.
3. If referring to information from previous exchanges, briefly remind the user what was discussed.
4. Be concise and direct in your answer, focusing on new information or insights.
5. If the question seems ambiguous, interpret it in the context of the most recent exchange.

Important topics from the conversation: ${topTopics.join(', ')}
Key entities mentioned: ${topEntities.join(', ')}
`;

    enhancedPrompt = `${basePrompt}\n\n${contextAddition}`;
  }
  
  return enhancedPrompt;
} 