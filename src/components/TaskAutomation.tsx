'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, Clock, CheckCircle, AlertCircle, Zap, Shield } from 'lucide-react';
import { LangChainTaskService, Task, TaskPlan, TaskProgress, GoogleAuthCredentials } from '../lib/langchain-task-service';
import { getGoogleOAuthService, DEFAULT_SCOPES } from '../lib/google-oauth-service';
import GoogleOAuthModal from './GoogleOAuthModal';
import { GoogleWorkspaceTools } from '@/lib/google-workspace-tools';

type AutomationType = 
  | 'web_search' 
  | 'email' 
  | 'calendar' 
  | 'document' 
  | 'social_media' 
  | 'data_analysis' 
  | 'api_call'
  | 'create_document'
  | 'search_files'
  | 'create_calendar_event';

interface Task {
  id: string;
  title: string;
  description: string;
  automationType: AutomationType;
  googleServiceRequired?: 'gmail' | 'calendar' | 'drive' | 'docs' | 'sheets' | 'none';
}

interface TaskAutomationProps {
  isVisible: boolean;
  userQuery: string;
  onTaskComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

const TaskAutomation: React.FC<TaskAutomationProps> = ({
  isVisible,
  userQuery,
  onTaskComplete,
  onError
}) => {
  const [taskService] = useState(() => new LangChainTaskService());
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [taskPlan, setTaskPlan] = useState<TaskPlan | null>(null);
  const [taskProgress, setTaskProgress] = useState<Record<string, TaskProgress>>({});
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [authCheckResult, setAuthCheckResult] = useState<{
    required: boolean;
    services: string[];
    reason: string;
  } | null>(null);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  
  console.log('[TaskAutomation] Component initialized with props:', { isVisible, userQuery });

  // Single useEffect to handle initialization and task planning
  useEffect(() => {
    console.log('[TaskAutomation] useEffect triggered with:', { userQuery, isVisible });
    
    const initializeAndPlan = async () => {
      if (!userQuery || !userQuery.trim() || !isVisible) {
        console.log('[TaskAutomation] Early return:', { userQuery, isVisible });
        return;
      }

      try {
        // Initialize OAuth service if not already initialized
        let oauthService: any;
        try {
          oauthService = getGoogleOAuthService();
        } catch (e) {
          // Not initialized, so initialize with config
          oauthService = getGoogleOAuthService({
            clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            redirectUri: `${window.location.origin}/auth/google/callback`,
            scopes: DEFAULT_SCOPES
          });
          console.log('[TaskAutomation] OAuth service initialized with config');
        }
        console.log('[TaskAutomation] OAuth service ready');
        
        // Start task planning
        console.log('[TaskAutomation] Starting task planning process...');
        await checkAuthAndCreatePlan(userQuery);
      } catch (error) {
        console.error('[TaskAutomation] Initialization failed:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize task automation');
        onError?.(error instanceof Error ? error.message : 'Failed to initialize task automation');
      }
    };

    initializeAndPlan();
  }, [userQuery, isVisible]); // Only re-run when these values change

  useEffect(() => {
    // Check Google authentication status
    const checkAuthStatus = async () => {
      const authenticated = getGoogleOAuthService().isAuthenticated();
      setIsGoogleAuthenticated(authenticated);

      if (authenticated) {
        try {
          const tools = await taskService.getWorkspaceTools();
          setAvailableTools(tools.map(tool => tool.name));
        } catch (error) {
          console.error('Failed to fetch workspace tools:', error);
        }
      }
    };

    checkAuthStatus();
  }, []);

  const checkAuthAndCreatePlan = async (query: string) => {
    console.log('[TaskAutomation] checkAuthAndCreatePlan called with:', query);
    setIsCheckingAuth(true);
    setTaskPlan(null);
    setTaskProgress({});
    setAuthCheckResult(null);
    setErrorMessage(null);
    
    try {
      console.log('[TaskAutomation] Checking Google Auth requirements...');
      // Check if Google authentication is required
      const authResult = await taskService.checkRequiresGoogleAuth(query);
      console.log('[TaskAutomation] Auth check result:', authResult);
      setAuthCheckResult(authResult);
      
      if (authResult.required) {
        // Check if already authenticated
        const oauthService = getGoogleOAuthService();
        if (!oauthService.isAuthenticated()) {
          setShowOAuthModal(true);
          return;
        } else {
          // Set credentials in task service
          const credentials = oauthService.getCredentials();
          if (credentials) {
            taskService.setGoogleCredentials(credentials);
          }
        }
      }
      
      // Create task plan
      await createTaskPlan(query);
    } catch (error) {
      console.error('[TaskAutomation] Error checking auth requirements:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check authentication requirements');
      onError?.(error instanceof Error ? error.message : 'Failed to check authentication requirements');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const createTaskPlan = async (query: string) => {
    console.log('[TaskAutomation] createTaskPlan called with:', query);
    setIsPlanning(true);
    
    try {
      const plan = await taskService.planTasks(query);
      console.log('[TaskAutomation] Task plan created successfully:', plan);
      setTaskPlan(plan);
      if (!plan || !plan.tasks || plan.tasks.length === 0) {
        setErrorMessage('No tasks were generated for this query.');
      }
    } catch (error) {
      console.error('[TaskAutomation] Error creating task plan:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create task plan');
      onError?.(error instanceof Error ? error.message : 'Failed to create task plan');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleOAuthSuccess = async (credentials: GoogleAuthCredentials) => {
    setShowOAuthModal(false);
    
    // Set credentials in task service
    taskService.setGoogleCredentials(credentials);
    
    // Now create the task plan
    if (userQuery) {
      await createTaskPlan(userQuery);
    }
  };

  const handleOAuthError = (error: string) => {
    setShowOAuthModal(false);
    onError?.(error);
  };

  const executeTaskPlan = async () => {
    if (!taskPlan || isExecuting) return;
    
    setIsExecuting(true);
    setIsPaused(false);
    setTaskProgress({});
    
    try {
      for (const task of taskPlan.tasks) {
        if (isPaused) {
          await new Promise(resolve => {
            const checkPause = () => {
              if (!isPaused) resolve(undefined);
              else setTimeout(checkPause, 100);
            };
            checkPause();
          });
        }
        
        setCurrentTaskId(task.id);
        
        await taskService.executeTask(task, (progress) => {
          setTaskProgress(prev => ({
            ...prev,
            [task.id]: progress
          }));
        });
      }
      
      onTaskComplete?.(taskPlan);
    } catch (error) {
      console.error('Error executing task plan:', error);
      onError?.(error instanceof Error ? error.message : 'Execution failed');
    } finally {
      setIsExecuting(false);
      setCurrentTaskId(null);
    }
  };

  const pauseExecution = () => {
    setIsPaused(true);
  };

  const resumeExecution = () => {
    setIsPaused(false);
  };

  const stopExecution = () => {
    setIsExecuting(false);
    setIsPaused(false);
    setCurrentTaskId(null);
  };

  const resetExecution = () => {
    setTaskProgress({});
    setCurrentTaskId(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'in_progress':
        return <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getProgressPercentage = (taskId: string): number => {
    return taskProgress[taskId]?.progress || 0;
  };

  const handleGoogleAuth = () => {
    const requiredScopes = [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar'
    ];
    oauthService.requestAdditionalScopes(requiredScopes);
  };

  const createTask = (taskType: string) => {
    const newTask: Task = {
      id: `task_${Date.now()}`,
      title: `${taskType.replace('_', ' ').toUpperCase()} Task`,
      description: `Perform ${taskType} operation`,
      automationType: taskType as AutomationType,
      googleServiceRequired: taskType.split('_')[0] as any
    };

    setTasks(prevTasks => [...prevTasks, newTask]);
    executeTask(newTask);
  };

  const executeTask = async (task: Task) => {
    try {
      const progress = await taskService.executeTask(task, (updatedProgress) => {
        setTaskProgress(prev => ({
          ...prev,
          [task.id]: updatedProgress
        }));
      });

      setTaskProgress(prev => ({
        ...prev,
        [task.id]: progress
      }));
    } catch (error) {
      console.error('Task execution failed:', error);
      setTaskProgress(prev => ({
        ...prev,
        [task.id]: {
          taskId: task.id,
          progress: 0,
          status: 'failed',
          logs: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
    }
  };

  const renderTaskProgress = (taskId: string) => {
    const progress = taskProgress[taskId];
    if (!progress) return null;

    return (
      <div className="mt-2 p-2 bg-gray-100 rounded">
        <div className="flex justify-between">
          <span>Status: {progress.status}</span>
          <span>Progress: {progress.progress}%</span>
        </div>
        {progress.logs && (
          <div className="mt-1 text-sm text-gray-600">
            {progress.logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        )}
        {progress.result && (
          <div className="mt-1 text-sm text-green-600">
            Result: {JSON.stringify(progress.result, null, 2)}
          </div>
        )}
        {progress.error && (
          <div className="mt-1 text-sm text-red-600">
            Error: {progress.error}
          </div>
        )}
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <>
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
              {authCheckResult?.required && (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <Shield className="w-3 h-3" />
                  <span>Google Auth Required</span>
                </div>
              )}
              
              {taskPlan && !isExecuting && (
                <button
                  onClick={executeTaskPlan}
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Execute
                </button>
              )}
              
              {isExecuting && (
                <div className="flex items-center gap-2">
                  {isPaused ? (
                    <button
                      onClick={resumeExecution}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={pauseExecution}
                      className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <Pause className="w-4 h-4" />
                      Pause
                    </button>
                  )}
                  
                  <button
                    onClick={stopExecution}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>
                </div>
              )}
              
              {taskProgress && Object.keys(taskProgress).length > 0 && !isExecuting && (
                <button
                  onClick={resetExecution}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 h-full overflow-y-auto">
          {(isCheckingAuth || isPlanning) && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-400">
                  {isCheckingAuth ? 'Checking authentication requirements...' : 'Creating task plan...'}
                </p>
              </div>
            </div>
          )}

          {authCheckResult && !taskPlan && !isCheckingAuth && !isPlanning && (
            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="w-5 h-5 text-blue-400" />
                <h4 className="text-white font-medium">Authentication Required</h4>
              </div>
              <p className="text-gray-300 text-sm mb-3">{authCheckResult.reason}</p>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-gray-400">Required services:</span>
                <div className="flex gap-2">
                  {authCheckResult.services.map(service => (
                    <span key={service} className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded">
                      {service}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setShowOAuthModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Authenticate with Google
              </button>
            </div>
          )}

          {taskPlan && (
            <div className="space-y-4">
              <div className="bg-neutral-800 rounded-lg p-4">
                <h4 className="text-white font-medium mb-3">Task Plan</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Tasks</span>
                    <span className="text-white">{taskPlan.tasks.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estimated Time</span>
                    <span className="text-white">{taskPlan.totalEstimatedTime} minutes</span>
                  </div>
                  {taskPlan.requiresGoogleAuth && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Google Services</span>
                      <div className="flex gap-1">
                        {taskPlan.googleServices.map(service => (
                          <span key={service} className="px-1 py-0.5 bg-blue-600/20 text-blue-400 text-xs rounded">
                            {service}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {taskPlan.tasks.map((task, index) => {
                  const progress = taskProgress[task.id];
                  const isCurrentTask = currentTaskId === task.id;
                  const progressPercentage = getProgressPercentage(task.id);
                  
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`bg-neutral-800 rounded-lg p-4 ${isCurrentTask ? 'ring-2 ring-cyan-500' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(progress?.status || task.status)}
                          <div className="flex-1">
                            <h5 className="text-white font-medium">{task.title}</h5>
                            <p className="text-gray-400 text-sm">{task.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">Type: {task.automationType}</span>
                              {task.googleServiceRequired && task.googleServiceRequired !== 'none' && (
                                <span className="text-xs text-blue-400">• Requires {task.googleServiceRequired}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">{task.estimatedDuration}m</div>
                          <div className="text-xs text-gray-500 capitalize">{task.priority} priority</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {progress && (
                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">Progress</span>
                            <span className="text-gray-400">{progressPercentage}%</span>
                          </div>
                          <div className="w-full bg-neutral-700 rounded-full h-2">
                            <div 
                              className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progressPercentage}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Task logs */}
                      {progress?.logs && progress.logs.length > 0 && (
                        <div className="bg-neutral-900 rounded p-3 mt-3">
                          <h6 className="text-xs text-gray-400 mb-2">Execution Log</h6>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {progress.logs.map((log, logIndex) => (
                              <div key={logIndex} className="text-xs text-gray-300 font-mono">
                                {log}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Task result */}
                      {progress?.result && (
                        <div className="bg-green-900/20 border border-green-600/30 rounded p-3 mt-3">
                          <h6 className="text-xs text-green-400 mb-2">Result</h6>
                          <div className="text-xs text-gray-300 space-y-2">
                            {/* Format different result types */}
                            {progress.result.analysis && (
                              <div className="whitespace-pre-wrap">{progress.result.analysis}</div>
                            )}
                            {progress.result.strategy && (
                              <div className="whitespace-pre-wrap">{progress.result.strategy}</div>
                            )}
                            {progress.result.recommendations && (
                              <div className="whitespace-pre-wrap">{progress.result.recommendations}</div>
                            )}
                            {progress.result.organic && (
                              <div>
                                <div className="font-medium text-blue-400 mb-1">Search Results ({progress.result.organic.length} found):</div>
                                {progress.result.organic.slice(0, 3).map((result: any, idx: number) => (
                                  <div key={idx} className="mb-2 p-2 bg-neutral-800 rounded">
                                    <div className="text-blue-300 font-medium">{result.title}</div>
                                    <div className="text-gray-400 text-xs mt-1">{result.snippet}</div>
                                    <a href={result.link} target="_blank" rel="noopener noreferrer" 
                                       className="text-blue-500 text-xs hover:underline">
                                      {result.link}
                                    </a>
                                  </div>
                                ))}
                                {progress.result.organic.length > 3 && (
                                  <div className="text-gray-500 text-xs">
                                    ... and {progress.result.organic.length - 3} more results
                                  </div>
                                )}
                              </div>
                            )}
                            {progress.result.message && !progress.result.analysis && !progress.result.strategy && !progress.result.recommendations && !progress.result.organic && (
                              <div>{progress.result.message}</div>
                            )}
                            {progress.result.status && (
                              <div className="text-green-400">Status: {progress.result.status}</div>
                            )}
                            {progress.result.data && (
                              <div>
                                <div className="font-medium text-blue-400 mb-1">API Response:</div>
                                <pre className="text-xs bg-neutral-800 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(progress.result.data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {progress.result.platforms && (
                              <div>
                                <div className="font-medium text-purple-400 mb-1">Target Platforms:</div>
                                <div className="flex gap-1">
                                  {progress.result.platforms.map((platform: string) => (
                                    <span key={platform} className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded">
                                      {platform}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Task error */}
                      {progress?.error && (
                        <div className="bg-red-900/20 border border-red-600/30 rounded p-3 mt-3">
                          <h6 className="text-xs text-red-400 mb-2">Error</h6>
                          <div className="text-xs text-gray-300">{progress.error}</div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {errorMessage && (
          <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 m-4">
            <span className="text-red-400 font-bold">Error:</span> <span className="text-red-200">{errorMessage}</span>
          </div>
        )}
        {!isPlanning && !isCheckingAuth && !taskPlan && !errorMessage && (
          <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 m-4">
            <span className="text-yellow-400 font-bold">No task plan generated.</span>
          </div>
        )}
      </div>

      {/* Google OAuth Modal */}
      <GoogleOAuthModal
        isOpen={showOAuthModal}
        onClose={() => setShowOAuthModal(false)}
        onSuccess={handleOAuthSuccess}
        onError={handleOAuthError}
        requiredServices={authCheckResult?.services || []}
        taskDescription={userQuery}
      />
    </>
  );
};

export default TaskAutomation; 