import { z } from "zod";

// Task automation schemas
const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    description: z.string(),
    action: z.string(),
    parameters: z.record(z.any()).optional(),
    status: z.enum(['pending', 'running', 'completed', 'failed']).default('pending'),
    result: z.any().optional()
  })),
  status: z.enum(['created', 'planning', 'executing', 'completed', 'failed']).default('created'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  estimatedTime: z.string().optional(),
  dependencies: z.array(z.string()).optional()
});

const TaskPlanSchema = z.object({
  tasks: z.array(TaskSchema),
  executionOrder: z.array(z.string()),
  totalEstimatedTime: z.string(),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  requiredResources: z.array(z.string()).optional()
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskPlan = z.infer<typeof TaskPlanSchema>;
export type TaskStep = Task['steps'][0];

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

class LangChainTaskService {

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
      const step = task.steps.find(s => s.id === stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found in task ${task.id}`);
      }

      const prompt = TASK_EXECUTION_PROMPT
        .replace('{taskTitle}', task.title)
        .replace('{stepDescription}', step.description)
        .replace('{parameters}', JSON.stringify(step.parameters || {}))
        .replace('{context}', JSON.stringify(context || {}));

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
        actions: [step.action],
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
    const currentTask = taskPlan.tasks.find(t => t.status === 'executing');
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
    type: 'progress' | 'task_start' | 'task_complete' | 'step_start' | 'step_complete' | 'error';
    data: any;
  }> {
    try {
      for (const taskId of taskPlan.executionOrder) {
        const task = taskPlan.tasks.find(t => t.id === taskId);
        if (!task) continue;

        yield { type: 'task_start', data: { taskId, title: task.title } };

        // Update task status
        task.status = 'executing';

        for (const step of task.steps) {
          yield { type: 'step_start', data: { taskId, stepId: step.id, description: step.description } };

          try {
            // Execute step
            step.status = 'running';
            const result = await this.executeTaskStep(task, step.id);
            step.result = result;
            step.status = 'completed';

            yield { type: 'step_complete', data: { taskId, stepId: step.id, result } };
          } catch (error) {
            step.status = 'failed';
            yield { type: 'error', data: { taskId, stepId: step.id, error: error instanceof Error ? error.message : 'Unknown error' } };
          }
        }

        // Check if all steps completed
        const allStepsCompleted = task.steps.every(s => s.status === 'completed');
        task.status = allStepsCompleted ? 'completed' : 'failed';

        yield { type: 'task_complete', data: { taskId, status: task.status } };

        // Progress update
        const progress = await this.getTaskProgress(taskPlan);
        yield { type: 'progress', data: progress };
      }
    } catch (error) {
      yield { type: 'error', data: { error: error instanceof Error ? error.message : 'Unknown error' } };
    }
  }
}

export default LangChainTaskService; 