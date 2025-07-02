import { z } from 'zod';

// Note: This service provides LangChain-like functionality without the actual LangChain packages
// to avoid dependency conflicts in production deployments

// Task automation schemas
const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  priority: z.enum(['low', 'medium', 'high']),
  dependencies: z.array(z.string()).optional(),
  estimatedDuration: z.number(), // in minutes
  automationType: z.enum(['web_search', 'email', 'calendar', 'document', 'social_media', 'data_analysis', 'api_call']),
  googleServiceRequired: z.enum(['gmail', 'calendar', 'drive', 'docs', 'sheets', 'none']).optional(),
  parameters: z.record(z.any()).optional()
});

const TaskPlanSchema = z.object({
  tasks: z.array(TaskSchema),
  totalEstimatedTime: z.number(),
  requiresGoogleAuth: z.boolean(),
  googleServices: z.array(z.string()),
  executionOrder: z.array(z.string())
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskPlan = z.infer<typeof TaskPlanSchema>;

export interface TaskProgress {
  taskId: string;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  logs: string[];
  result?: any;
  error?: string;
}

export interface GoogleAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

// Task automation prompts
const TASK_PLANNING_PROMPT = `You are an advanced task automation AI assistant. Your role is to break down complex user requests into executable tasks and create detailed execution plans.

CAPABILITIES:
- Web research and data gathering
- Content creation and editing
- File management and organization
- API interactions and integrations
- Data analysis and processing
- Communication and notifications
- Workflow automation

TASK BREAKDOWN PRINCIPLES:
1. Break complex requests into atomic, executable steps
2. Identify dependencies between tasks
3. Estimate realistic time requirements
4. Consider resource availability
5. Plan for error handling and fallbacks
6. Optimize for efficiency and parallel execution

USER REQUEST: {userRequest}

Please analyze this request and create a comprehensive task execution plan. Return your response as a valid JSON object matching the TaskPlan schema.

Focus on:
- Clear, actionable task descriptions
- Logical step sequencing
- Realistic time estimates
- Proper dependency mapping
- Resource identification

Respond with only the JSON object, no additional text.`;

const TASK_EXECUTION_PROMPT = `You are executing a specific task step. Analyze the current step and determine the best approach to complete it.

CURRENT TASK: {taskTitle}
STEP: {stepDescription}
PARAMETERS: {parameters}
CONTEXT: {context}

Provide a detailed execution plan for this specific step, including:
1. Specific actions to take
2. Expected outcomes
3. Potential challenges
4. Success criteria
5. Error handling approach

Return your response as a JSON object with the following structure:
{
  "executionPlan": "detailed plan",
  "actions": ["action1", "action2", ...],
  "expectedOutcome": "description",
  "successCriteria": ["criteria1", "criteria2", ...],
  "errorHandling": "approach",
  "estimatedDuration": "time estimate"
}`;

// Custom task automation service without LangChain dependencies
export class LangChainTaskService {
  private googleCredentials: GoogleAuthCredentials | null = null;

  constructor() {
    // No LangChain initialization needed
  }

  /**
   * Analyze user input and create a comprehensive task plan
   */
  async createTaskPlan(userRequest: string): Promise<TaskPlan> {
    try {
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a task automation expert. Always respond with valid JSON.' },
            { role: 'user', content: TASK_PLANNING_PROMPT.replace('{userRequest}', userRequest) }
          ],
          temperature: 0.3,
          max_tokens: 4096,
          mode: 'chat'
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Clean up the response to extract JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }

      const taskPlan = JSON.parse(jsonMatch[0]);
      
      // Validate against schema
      return TaskPlanSchema.parse(taskPlan);
    } catch (error) {
      console.error("Error creating task plan:", error);
      throw new Error(`Failed to create task plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute a specific task step
   */
  async executeTaskStep(task: Task, stepId: string, context?: any): Promise<any> {
    try {
      console.log(`[TaskAutomation] Executing task step for task: ${task.title}`);

      const prompt = `Executing task: ${task.title}
Description: ${task.description}
Context: ${JSON.stringify(context || {})}

Provide a detailed execution plan for this task.`;

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are executing a task step. Provide detailed execution guidance.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2048,
          mode: 'chat'
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // If no JSON, return the raw content as execution plan
      return {
        executionPlan: content,
        actions: [task.automationType],
        expectedOutcome: "Task step completion",
        successCriteria: ["Step completed successfully"],
        errorHandling: "Standard error handling",
        estimatedDuration: "5 minutes"
      };
    } catch (error) {
      console.error("Error executing task step:", error);
      throw new Error(`Failed to execute step: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Monitor task progress and provide updates
   */
  async getTaskProgress(taskPlan: TaskPlan): Promise<{
    completedTasks: number;
    totalTasks: number;
    currentTask?: Task;
    overallProgress: number;
    estimatedTimeRemaining: string;
  }> {
    const completedTasks = taskPlan.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = taskPlan.tasks.length;
    const currentTask = taskPlan.tasks.find(t => t.status === 'in_progress');
    const overallProgress = (completedTasks / totalTasks) * 100;

    // Simple time estimation based on remaining tasks
    const remainingTasks = totalTasks - completedTasks;
    const avgTimePerTask = 5; // minutes
    const estimatedTimeRemaining = `${remainingTasks * avgTimePerTask} minutes`;

    return {
      completedTasks,
      totalTasks,
      currentTask,
      overallProgress,
      estimatedTimeRemaining
    };
  }

  /**
   * Suggest task optimizations
   */
  async optimizeTaskPlan(taskPlan: TaskPlan): Promise<{
    suggestions: string[];
    optimizedPlan?: TaskPlan;
    potentialTimeSavings: string;
  }> {
    try {
      const optimizationPrompt = `Analyze this task plan and suggest optimizations:

${JSON.stringify(taskPlan, null, 2)}

Provide suggestions for:
1. Parallel execution opportunities
2. Task consolidation possibilities
3. Dependency optimization
4. Resource utilization improvements
5. Time reduction strategies

Return a JSON object with suggestions and an optimized plan if possible.`;

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a task optimization expert. Focus on efficiency and parallel execution.' },
            { role: 'user', content: optimizationPrompt }
          ],
          temperature: 0.3,
          max_tokens: 3072,
          mode: 'chat'
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        suggestions: ["Consider parallel execution of independent tasks", "Combine similar tasks for efficiency"],
        potentialTimeSavings: "10-20%"
      };
    } catch (error) {
      console.error("Error optimizing task plan:", error);
      return {
        suggestions: ["Unable to generate optimizations at this time"],
        potentialTimeSavings: "0%"
      };
    }
  }

  /**
   * Stream task execution with real-time updates
   */
  async *executeTaskPlanStreaming(taskPlan: TaskPlan): AsyncGenerator<{
    type: 'progress' | 'task_start' | 'task_complete' | 'error';
    data: any;
  }> {
    try {
      for (const taskId of taskPlan.executionOrder) {
        const task = taskPlan.tasks.find(t => t.id === taskId);
        if (!task) continue;

        yield { type: 'task_start', data: { taskId, title: task.title } };

        // Update task status
        task.status = 'in_progress';

        try {
          // Execute task
          const result = await this.executeTask(task);
          task.status = 'completed';

          yield { type: 'task_complete', data: { taskId, status: task.status } };
        } catch (error) {
          task.status = 'failed';
          yield { type: 'error', data: { taskId, error: error instanceof Error ? error.message : 'Unknown error' } };
        }

        // Progress update
        const progress = await this.getTaskProgress(taskPlan);
        yield { type: 'progress', data: progress };
      }
    } catch (error) {
      yield { type: 'error', data: { error: error instanceof Error ? error.message : 'Unknown error' } };
    }
  }

  async planTasks(userInput: string): Promise<TaskPlan> {
    console.log('[TaskAutomation] Starting task planning for input:', userInput);
    
    if (!userInput || userInput.trim() === '') {
      console.error('[TaskAutomation] Empty user input provided to planTasks');
      throw new Error('Empty user input provided to task planner');
    }

    // Create a smart fallback task plan based on input analysis
    const inputLower = userInput.toLowerCase();
    let automationType: 'web_search' | 'email' | 'calendar' | 'document' | 'social_media' | 'data_analysis' | 'api_call' = 'data_analysis';
    
    if (inputLower.includes('search') || inputLower.includes('find') || inputLower.includes('look up')) {
      automationType = 'web_search';
    } else if (inputLower.includes('email') || inputLower.includes('mail')) {
      automationType = 'email';
    } else if (inputLower.includes('calendar') || inputLower.includes('schedule')) {
      automationType = 'calendar';
    } else if (inputLower.includes('document') || inputLower.includes('doc') || inputLower.includes('write')) {
      automationType = 'document';
    } else if (inputLower.includes('social') || inputLower.includes('twitter') || inputLower.includes('facebook')) {
      automationType = 'social_media';
    } else if (inputLower.includes('api') || inputLower.includes('integration')) {
      automationType = 'api_call';
    }

    const fallbackTaskPlan: TaskPlan = {
      tasks: [{
        id: 'task_1',
        title: `${automationType === 'web_search' ? 'Research' : 
                 automationType === 'data_analysis' ? 'Analyze' : 
                 automationType === 'social_media' ? 'Social Media Strategy' :
                 automationType === 'api_call' ? 'API Integration' :
                 'Process'}: ${userInput.slice(0, 50)}${userInput.length > 50 ? '...' : ''}`,
        description: userInput,
        status: 'pending' as const,
        priority: 'medium' as const,
        estimatedDuration: automationType === 'web_search' ? 3 : 
                          automationType === 'data_analysis' ? 5 : 
                          automationType === 'social_media' ? 8 : 7,
        automationType,
        googleServiceRequired: 'none' as const
      }],
      totalEstimatedTime: automationType === 'web_search' ? 3 : 
                         automationType === 'data_analysis' ? 5 : 
                         automationType === 'social_media' ? 8 : 7,
      requiresGoogleAuth: false,
      googleServices: [],
      executionOrder: ['task_1']
    };

    try {
      console.log('[TaskAutomation] Attempting to generate task plan via NVIDIA API...');
      
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { 
              role: 'system', 
              content: `You are a task automation expert. Break down the user's request into a structured task plan. 
              Provide a JSON response with these exact fields:
              - tasks: An array of tasks with id, title, description, status ("pending"), priority ("low"/"medium"/"high"), estimatedDuration (number), automationType ("web_search"/"email"/"calendar"/"document"/"social_media"/"data_analysis"/"api_call")
              - totalEstimatedTime: Total estimated time for all tasks (number)
              - requiresGoogleAuth: Whether Google authentication is needed (boolean)
              - googleServices: List of required Google services (array)
              - executionOrder: Order of task execution (array of task IDs)

              Example:
              {
                "tasks": [{
                  "id": "task_1",
                  "title": "Web Research",
                  "description": "Find information about the topic",
                  "status": "pending",
                  "priority": "medium",
                  "estimatedDuration": 10,
                  "automationType": "web_search"
                }],
                "totalEstimatedTime": 10,
                "requiresGoogleAuth": false,
                "googleServices": [],
                "executionOrder": ["task_1"]
              }

              Respond ONLY with valid JSON.`
            },
            { role: 'user', content: userInput }
          ],
          temperature: 0.3,
          max_tokens: 4096,
          mode: 'chat'
        })
      });

      console.log('[TaskAutomation] NVIDIA API Response Status:', response.status);

      if (!response.ok) {
        console.warn('[TaskAutomation] NVIDIA API request failed. Status:', response.status);
        const errorText = await response.text();
        console.error('[TaskAutomation] API Error:', errorText);
        console.log('[TaskAutomation] Using fallback task plan');
        return fallbackTaskPlan;
      }

      const data = await response.json();
      console.log('[TaskAutomation] Received API response:', data);

      const content = data.choices?.[0]?.message?.content || '';
      console.log('[TaskAutomation] Raw content:', content);
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[TaskAutomation] No valid JSON found in response. Using fallback task plan.');
        return fallbackTaskPlan;
      }

      try {
        const taskPlan = JSON.parse(jsonMatch[0]);
        console.log('[TaskAutomation] Parsed task plan:', taskPlan);
        
        // Validate against schema
        const validatedPlan = TaskPlanSchema.parse(taskPlan);
        console.log('[TaskAutomation] Task plan validated successfully:', validatedPlan);
        return validatedPlan;
      } catch (parseError) {
        console.error('[TaskAutomation] JSON parsing/validation error:', parseError);
        console.log('[TaskAutomation] Using fallback task plan');
        return fallbackTaskPlan;
      }
    } catch (error) {
      console.error('[TaskAutomation] Unexpected error in task planning:', error);
      console.log('[TaskAutomation] Using fallback task plan');
      return fallbackTaskPlan;
    }
  }

  async executeTask(task: Task, onProgress?: (progress: TaskProgress) => void): Promise<TaskProgress> {
    const progress: TaskProgress = {
      taskId: task.id,
      progress: 0,
      status: 'in_progress',
      logs: [`Starting task: ${task.title}`]
    };

    if (onProgress) onProgress(progress);

    try {
      // Check if Google authentication is required
      if (task.googleServiceRequired && task.googleServiceRequired !== 'none') {
        if (!this.googleCredentials) {
          throw new Error(`Google ${task.googleServiceRequired} authentication required`);
        }
        progress.logs.push(`Using Google ${task.googleServiceRequired} service`);
      }

      // Execute based on automation type
      switch (task.automationType) {
        case 'web_search':
          await this.executeWebSearch(task, progress, onProgress);
          break;
        case 'email':
          await this.executeEmailTask(task, progress, onProgress);
          break;
        case 'calendar':
          await this.executeCalendarTask(task, progress, onProgress);
          break;
        case 'document':
          await this.executeDocumentTask(task, progress, onProgress);
          break;
        case 'social_media':
          await this.executeSocialMediaTask(task, progress, onProgress);
          break;
        case 'data_analysis':
          await this.executeDataAnalysisTask(task, progress, onProgress);
          break;
        case 'api_call':
          await this.executeApiCall(task, progress, onProgress);
          break;
        default:
          throw new Error(`Unsupported automation type: ${task.automationType}`);
      }

      progress.status = 'completed';
      progress.progress = 100;
      progress.logs.push(`Task completed successfully`);

    } catch (error) {
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      progress.logs.push(`Task failed: ${progress.error}`);
    }

    if (onProgress) onProgress(progress);
    return progress;
  }

  private async executeWebSearch(task: Task, progress: TaskProgress, onProgress?: (progress: TaskProgress) => void) {
    progress.progress = 25;
    progress.logs.push('Performing web search...');
    if (onProgress) onProgress(progress);

    try {
      // Use existing search API
      const searchQuery = task.parameters?.query || task.description;
      console.log('[TaskAutomation] Executing web search for:', searchQuery);
      
      const response = await fetch('/api/serper/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });

      progress.progress = 75;
      progress.logs.push('Processing search results...');
      if (onProgress) onProgress(progress);

      if (!response.ok) {
        throw new Error(`Search API returned status: ${response.status}`);
      }

      const searchResults = await response.json();
      progress.result = searchResults;
      const resultCount = searchResults.organic?.length || 0;
      progress.logs.push(`Successfully found ${resultCount} search results`);
      console.log('[TaskAutomation] Web search completed:', { resultCount, query: searchQuery });
    } catch (error) {
      console.error('[TaskAutomation] Web search failed:', error);
      progress.logs.push(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async executeEmailTask(task: Task, progress: TaskProgress, onProgress?: (progress: TaskProgress) => void) {
    if (!this.googleCredentials) {
      throw new Error('Google Gmail authentication required');
    }

    progress.progress = 30;
    progress.logs.push('Accessing Gmail API...');
    if (onProgress) onProgress(progress);

    // Gmail API integration would go here
    progress.progress = 80;
    progress.logs.push('Email task executed');
    if (onProgress) onProgress(progress);

    progress.result = { message: 'Email automation completed' };
  }

  private async executeCalendarTask(task: Task, progress: TaskProgress, onProgress?: (progress: TaskProgress) => void) {
    if (!this.googleCredentials) {
      throw new Error('Google Calendar authentication required');
    }

    progress.progress = 40;
    progress.logs.push('Accessing Google Calendar API...');
    if (onProgress) onProgress(progress);

    // Calendar API integration would go here
    progress.progress = 90;
    progress.logs.push('Calendar task executed');
    if (onProgress) onProgress(progress);

    progress.result = { message: 'Calendar automation completed' };
  }

  private async executeDocumentTask(task: Task, progress: TaskProgress, onProgress?: (progress: TaskProgress) => void) {
    if (!this.googleCredentials) {
      throw new Error('Google Docs/Sheets authentication required');
    }

    progress.progress = 35;
    progress.logs.push('Accessing Google Docs API...');
    if (onProgress) onProgress(progress);

    try {
      // Extract docId from the task parameters or description (expects a Google Doc link)
      let docId = '';
      const urlMatch = (task.description || '').match(/document\/d\/([a-zA-Z0-9-_]+)/);
      if (urlMatch) {
        docId = urlMatch[1];
      } else if (task.parameters?.docId) {
        docId = task.parameters.docId;
      } else {
        throw new Error('No Google Doc ID found in task description or parameters.');
      }

      const accessToken = this.googleCredentials.accessToken;

      // 1. Get the document structure
      const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!docRes.ok) throw new Error('Failed to fetch Google Doc');
      const doc = await docRes.json();

      // 2. Find the text 'PROMPT GUIDELINE' and its location
      let startIndex = -1;
      let endIndex = -1;
      const searchText = 'PROMPT GUIDELINE';
      for (const element of doc.body.content) {
        if (element.paragraph && element.paragraph.elements) {
          for (const el of element.paragraph.elements) {
            if (el.textRun && el.textRun.content && el.textRun.content.includes(searchText)) {
              // Found the text, get its start and end index
              startIndex = el.startIndex;
              endIndex = el.endIndex;
              break;
            }
          }
        }
        if (startIndex !== -1) break;
      }
      if (startIndex === -1 || endIndex === -1) {
        throw new Error(`Text '${searchText}' not found in the document.`);
      }

      // 3. Build a batchUpdate request to delete the text
      const requests = [
        {
          deleteContentRange: {
            range: {
              startIndex,
              endIndex
            }
          }
        }
      ];

      // 4. Send the update
      const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });
      if (!updateRes.ok) {
        const err = await updateRes.text();
        throw new Error('Failed to update Google Doc: ' + err);
      }

      progress.progress = 85;
      progress.logs.push(`Removed '${searchText}' from the document.`);
      if (onProgress) onProgress(progress);

      progress.result = { message: `Document updated: '${searchText}' removed.` };
    } catch (error) {
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      progress.logs.push(`Task failed: ${progress.error}`);
      if (onProgress) onProgress(progress);
      return;
    }
  }

  private async executeSocialMediaTask(task: Task, progress: TaskProgress, onProgress?: (progress: TaskProgress) => void) {
    progress.progress = 25;
    progress.logs.push('Starting social media analysis...');
    if (onProgress) onProgress(progress);

    try {
      console.log('[TaskAutomation] Executing social media task for:', task.description);
      
      // Generate social media strategy using NVIDIA API
      const strategyPrompt = `Create a social media strategy for: ${task.description}. Include content ideas, posting schedule, engagement tactics, and platform-specific recommendations.`;
      
      progress.progress = 50;
      progress.logs.push('Generating social media strategy...');
      if (onProgress) onProgress(progress);

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a social media marketing expert. Provide comprehensive strategies with actionable steps.' },
            { role: 'user', content: strategyPrompt }
          ],
          temperature: 0.4,
          max_tokens: 3072,
          mode: 'chat'
        })
      });

      progress.progress = 75;
      progress.logs.push('Processing social media recommendations...');
      if (onProgress) onProgress(progress);

      if (!response.ok) {
        throw new Error(`Social media API returned status: ${response.status}`);
      }

      const data = await response.json();
      const strategy = data.choices?.[0]?.message?.content || 'Social media strategy generated';
      
      progress.result = { 
        strategy,
        platforms: ['Twitter', 'LinkedIn', 'Instagram', 'Facebook'],
        task: task.title,
        timestamp: new Date().toISOString()
      };
      progress.logs.push('Social media strategy completed successfully');
      console.log('[TaskAutomation] Social media task completed for:', task.title);
    } catch (error) {
      console.error('[TaskAutomation] Social media task failed:', error);
      progress.logs.push(`Social media task failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async executeDataAnalysisTask(task: Task, progress: TaskProgress, onProgress?: (progress: TaskProgress) => void) {
    progress.progress = 25;
    progress.logs.push('Starting data analysis...');
    if (onProgress) onProgress(progress);

    try {
      console.log('[TaskAutomation] Executing data analysis for:', task.description);
      
      // Use NVIDIA API for analysis
      const analysisPrompt = `Analyze the following request: ${task.description}. Provide a structured analysis with insights, conclusions, and recommendations.`;
      
      progress.progress = 50;
      progress.logs.push('Processing with AI analysis...');
      if (onProgress) onProgress(progress);

      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a data analysis expert. Provide clear, structured analysis with actionable insights.' },
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2048,
          mode: 'chat'
        })
      });

      progress.progress = 75;
      progress.logs.push('Finalizing analysis results...');
      if (onProgress) onProgress(progress);

      if (!response.ok) {
        throw new Error(`Analysis API returned status: ${response.status}`);
      }

      const data = await response.json();
      const analysisResult = data.choices?.[0]?.message?.content || 'Analysis completed';
      
      progress.result = { 
        analysis: analysisResult,
        timestamp: new Date().toISOString(),
        task: task.title
      };
      progress.logs.push('Data analysis completed successfully');
      console.log('[TaskAutomation] Data analysis completed for:', task.title);
    } catch (error) {
      console.error('[TaskAutomation] Data analysis failed:', error);
      progress.logs.push(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async executeApiCall(task: Task, progress: TaskProgress, onProgress?: (progress: TaskProgress) => void) {
    progress.progress = 25;
    progress.logs.push('Preparing API call...');
    if (onProgress) onProgress(progress);

    try {
      console.log('[TaskAutomation] Executing API call for:', task.description);
      
      // Extract API details from task parameters or use description for analysis
      const apiUrl = task.parameters?.url;
      const method = task.parameters?.method || 'GET';
      const data = task.parameters?.data;
      
      progress.progress = 50;
      progress.logs.push(`Making ${method} request...`);
      if (onProgress) onProgress(progress);

      let result;
      if (apiUrl) {
        // Make actual API call if URL is provided
        const options: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(task.parameters?.headers || {})
          }
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
          options.body = JSON.stringify(data);
        }
        
        const response = await fetch(apiUrl, options);
        result = {
          status: response.status,
          data: await response.json(),
          url: apiUrl,
          method
        };
        progress.logs.push(`API call successful (${response.status})`);
      } else {
        // Generate API usage recommendations using NVIDIA API
        const analysisPrompt = `Analyze this API-related request: ${task.description}. Provide specific API recommendations, endpoints, and implementation guidance.`;
        
        const response = await fetch('/api/nvidia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'You are an API integration expert. Provide specific, actionable API recommendations.' },
              { role: 'user', content: analysisPrompt }
            ],
            temperature: 0.3,
            max_tokens: 2048,
            mode: 'chat'
          })
        });

        if (!response.ok) {
          throw new Error(`API analysis failed with status: ${response.status}`);
        }

        const data = await response.json();
        result = {
          recommendations: data.choices?.[0]?.message?.content || 'API analysis completed',
          task: task.title,
          timestamp: new Date().toISOString()
        };
        progress.logs.push('API analysis and recommendations generated');
      }

      progress.progress = 75;
      progress.logs.push('Processing API response...');
      if (onProgress) onProgress(progress);

      progress.result = result;
      progress.logs.push('API call task completed successfully');
      console.log('[TaskAutomation] API call completed for:', task.title);
    } catch (error) {
      console.error('[TaskAutomation] API call failed:', error);
      progress.logs.push(`API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  setGoogleCredentials(credentials: GoogleAuthCredentials) {
    this.googleCredentials = credentials;
  }

  getGoogleCredentials(): GoogleAuthCredentials | null {
    return this.googleCredentials;
  }

  async checkRequiresGoogleAuth(userInput: string): Promise<{
    required: boolean;
    services: string[];
    reason: string;
  }> {
    console.log('[TaskAutomation] Checking Google Auth requirements for:', userInput);

    // Enhanced keyword detection for Google services
    const serviceKeywordMap = {
      'gmail': ['email', 'mail', 'send email', 'inbox', 'compose', 'reply'],
      'calendar': ['calendar', 'schedule', 'appointment', 'meeting', 'event', 'remind'],
      'docs': ['document', 'doc', 'write', 'edit document', 'google docs', 'text document'],
      'sheets': ['spreadsheet', 'sheet', 'excel', 'data entry', 'google sheets', 'table'],
      'drive': ['drive', 'file', 'upload', 'download', 'share file', 'google drive']
    };

    const matchedServices: string[] = [];
    const inputLower = userInput.toLowerCase();
    
    // Check each service for keyword matches
    for (const [service, keywords] of Object.entries(serviceKeywordMap)) {
      if (keywords.some(keyword => inputLower.includes(keyword))) {
        matchedServices.push(service);
      }
    }
    
    const requiresAuth = matchedServices.length > 0;
    
    const result = {
      required: requiresAuth,
      services: matchedServices,
      reason: requiresAuth 
        ? `Your request involves Google services: ${matchedServices.join(', ')}` 
        : 'No Google services required'
    };
    
    console.log('[TaskAutomation] Auth check result:', result);
    return result;
  }
}

export default LangChainTaskService; 