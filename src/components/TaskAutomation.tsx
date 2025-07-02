import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, Clock, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import LangChainTaskService, { Task, TaskPlan } from '@/lib/langchain-task-service';

interface TaskAutomationProps {
  isVisible: boolean;
  userQuery: string;
  onTaskComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

interface ExecutionEvent {
  type: 'progress' | 'task_start' | 'task_complete' | 'step_start' | 'step_complete' | 'error';
  data: any;
  timestamp: Date;
}

const TaskAutomation: React.FC<TaskAutomationProps> = ({
  isVisible,
  userQuery,
  onTaskComplete,
  onError
}) => {
  const [taskService] = useState(() => new LangChainTaskService());
  const [taskPlan, setTaskPlan] = useState<TaskPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([]);
  const [currentProgress, setCurrentProgress] = useState<any>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Create task plan when user query changes
  useEffect(() => {
    if (userQuery && userQuery.trim() && isVisible) {
      createTaskPlan(userQuery);
    }
  }, [userQuery, isVisible]);

  const createTaskPlan = async (query: string) => {
    setIsPlanning(true);
    setTaskPlan(null);
    setExecutionEvents([]);
    
    try {
      const plan = await taskService.createTaskPlan(query);
      setTaskPlan(plan);
      
      // Add initial event
      setExecutionEvents([{
        type: 'progress',
        data: { message: 'Task plan created successfully', plan },
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Error creating task plan:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to create task plan');
    } finally {
      setIsPlanning(false);
    }
  };

  const executeTaskPlan = async () => {
    if (!taskPlan || isExecuting) return;
    
    setIsExecuting(true);
    setIsPaused(false);
    
    try {
      const generator = taskService.executeTaskPlanStreaming(taskPlan);
      
      for await (const event of generator) {
        if (isPaused) {
          await new Promise(resolve => {
            const checkPause = () => {
              if (!isPaused) resolve(undefined);
              else setTimeout(checkPause, 100);
            };
            checkPause();
          });
        }
        
        const eventWithTimestamp: ExecutionEvent = {
          ...event,
          timestamp: new Date()
        };
        
        setExecutionEvents(prev => [...prev, eventWithTimestamp]);
        
        if (event.type === 'progress') {
          setCurrentProgress(event.data);
        }
        
        if (event.type === 'error') {
          onError?.(event.data.error);
        }
      }
      
      onTaskComplete?.(taskPlan);
    } catch (error) {
      console.error('Error executing task plan:', error);
      onError?.(error instanceof Error ? error.message : 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'executing':
      case 'running':
        return <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full h-full bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
      <div className="border-b border-neutral-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Task Automation</h3>
              <p className="text-sm text-gray-400">AI-powered task planning and execution</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {taskPlan && !isExecuting && (
              <button
                onClick={executeTaskPlan}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <Play className="w-4 h-4" />
                Execute
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 h-full overflow-y-auto">
        {isPlanning && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400">Creating task plan...</p>
            </div>
          </div>
        )}

        {taskPlan && (
          <div className="space-y-4">
            <div className="bg-neutral-800 rounded-lg p-4">
              <h4 className="text-white font-medium mb-3">Task Plan</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Complexity</span>
                  <span className={`capitalize ${
                    taskPlan.complexity === 'simple' ? 'text-green-400' :
                    taskPlan.complexity === 'moderate' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {taskPlan.complexity}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Tasks</span>
                  <span className="text-white">{taskPlan.tasks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Estimated Time</span>
                  <span className="text-white">{taskPlan.totalEstimatedTime}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {taskPlan.tasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-neutral-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(task.status)}
                      <div>
                        <h5 className="text-white font-medium">{task.title}</h5>
                        <p className="text-gray-400 text-sm">{task.description}</p>
                      </div>
                    </div>
                  </div>

                  {task.steps.length > 0 && (
                    <div className="space-y-2 ml-7">
                      {task.steps.map((step) => (
                        <div key={step.id} className="flex items-center gap-3 text-sm">
                          {getStatusIcon(step.status)}
                          <span className="text-gray-300">{step.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskAutomation; 