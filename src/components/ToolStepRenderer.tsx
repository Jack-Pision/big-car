import React, { useState, useEffect } from 'react';

interface ToolStepRendererProps {
  content: string;
}

interface StepData {
  title: string;
  status: 'active' | 'pending' | 'done' | 'error' | 'info' | 'warning';
  description: string;
  url?: string;
  timestamp?: string;
  details?: any;
}

interface ToolData {
  cubeMode?: boolean;
  service?: string;
  action?: string;
  status?: string;
  steps?: StepData[];
  details?: any;
}

const ToolStepRenderer: React.FC<ToolStepRendererProps> = ({ content }) => {
  const [steps, setSteps] = useState<StepData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    parseToolMessages(content);
  }, [content]);

  const parseToolMessages = (text: string) => {
    try {
      setIsLoading(true);
      
      // Extract all tool messages
      const toolMessages: ToolData[] = [];
      
      // Check for TOOL_THINKING
      const thinkingMatch = text.match(/TOOL_THINKING:\s*({[\s\S]*?})(?=\n|$)/);
      if (thinkingMatch && thinkingMatch[1]) {
        try {
          const thinkingData = JSON.parse(thinkingMatch[1]);
          toolMessages.push(thinkingData);
        } catch (e) {
          console.error('Failed to parse TOOL_THINKING data:', e);
        }
      }
      
      // Check for TOOL_PLANNING
      const planningMatch = text.match(/TOOL_PLANNING:\s*({[\s\S]*?})(?=\n|$)/);
      if (planningMatch && planningMatch[1]) {
        try {
          const planningData = JSON.parse(planningMatch[1]);
          toolMessages.push(planningData);
        } catch (e) {
          console.error('Failed to parse TOOL_PLANNING data:', e);
        }
      }
      
      // Check for TOOL_PROCESS
      const processMatch = text.match(/TOOL_PROCESS:\s*({[\s\S]*?})(?=\n|$)/);
      if (processMatch && processMatch[1]) {
        try {
          const processData = JSON.parse(processMatch[1]);
          toolMessages.push(processData);
        } catch (e) {
          console.error('Failed to parse TOOL_PROCESS data:', e);
        }
      }
      
      // Check for TOOL_COMPLETE
      const completeMatch = text.match(/TOOL_COMPLETE:\s*({[\s\S]*?})(?=\n|$)/);
      if (completeMatch && completeMatch[1]) {
        try {
          const completeData = JSON.parse(completeMatch[1]);
          toolMessages.push(completeData);
        } catch (e) {
          console.error('Failed to parse TOOL_COMPLETE data:', e);
        }
      }
      
      // If we found any tool messages, extract the steps
      if (toolMessages.length > 0) {
        // Get the latest tool message with steps
        const latestToolMessage = toolMessages.reduce((latest, current) => {
          // Prefer messages with steps
          if (current.steps && (!latest.steps || current.steps.length > latest.steps.length)) {
            return current;
          }
          return latest;
        }, toolMessages[toolMessages.length - 1]);
        
        if (latestToolMessage.steps) {
          setSteps(latestToolMessage.steps);
        } else {
          // If no steps found, create a default step
          setSteps([
            {
              title: latestToolMessage.action || 'Processing',
              status: 'active',
              description: 'Working on your request...'
            }
          ]);
        }
      } else {
        // If no tool messages found, set an error
        setError('No tool execution data found in the response');
      }
    } catch (e) {
      console.error('Error parsing tool messages:', e);
      setError('Failed to parse tool execution data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center my-6">
        <div className="bg-gray-800/80 backdrop-blur-lg border border-gray-600/50 rounded-2xl px-6 py-4 shadow-2xl max-w-sm w-full">
          <div className="text-center space-y-2">
            <h3 className="text-white text-lg font-medium">Loading...</h3>
            <div className="flex items-center justify-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center my-6">
        <div className="bg-red-900/20 backdrop-blur-lg border border-red-500/30 rounded-2xl px-6 py-4 shadow-2xl max-w-md w-full">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center space-x-2">
              <span className="text-2xl">❌</span>
              <h3 className="text-white text-lg font-medium">Error</h3>
            </div>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full my-6">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        let statusIcon = null;
        let statusColor = "";
        let statusBg = "";
        let statusAnimation = "";
        
        // Enhanced status handling with more states
        if (step.status === 'active') {
          statusIcon = <span className="animate-spin text-cyan-400 text-xl">⏳</span>;
          statusColor = "border-cyan-600/40";
          statusBg = "bg-cyan-900/20";
          statusAnimation = "animate-pulse";
        } else if (step.status === 'pending') {
          statusIcon = <span className="text-gray-400 text-xl">•</span>;
          statusColor = "border-gray-600/40";
          statusBg = "bg-gray-800/80";
        } else if (step.status === 'done') {
          statusIcon = <span className="text-green-400 text-xl">✅</span>;
          statusColor = "border-green-600/40";
          statusBg = "bg-green-900/10";
        } else if (step.status === 'error') {
          statusIcon = <span className="text-red-400 text-xl">❌</span>;
          statusColor = "border-red-600/40";
          statusBg = "bg-red-900/20";
        } else if (step.status === 'info') {
          statusIcon = <span className="text-blue-400 text-xl">ℹ️</span>;
          statusColor = "border-blue-600/40";
          statusBg = "bg-blue-900/10";
        } else if (step.status === 'warning') {
          statusIcon = <span className="text-yellow-400 text-xl">⚠️</span>;
          statusColor = "border-yellow-600/40";
          statusBg = "bg-yellow-900/10";
        } else {
          statusIcon = <span className="text-gray-400 text-xl">•</span>;
          statusColor = "border-gray-600/40";
          statusBg = "bg-gray-800/80";
        }
        
        return (
          <div key={idx} className="relative flex flex-col items-center w-full">
            {/* Connector line with improved styling */}
            {idx > 0 && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-1 h-6 bg-cyan-700/30 rounded-full z-0" />
            )}
            <div className="w-full z-10">
              <div className={`backdrop-blur-lg border ${statusColor} rounded-2xl px-6 py-4 shadow-xl flex flex-col gap-2 mb-2 ${statusBg}`}>
                <div className="flex items-center gap-2">
                  <div className={`${statusAnimation}`}>{statusIcon}</div>
                  <span className="font-semibold text-white text-base">{step.title || 'Step'}</span>
                  {step.timestamp && <span className="ml-auto text-xs text-gray-400">{step.timestamp}</span>}
                </div>
                
                {/* Description with status-specific styling */}
                {step.description && (
                  <div className={`text-sm ${
                    step.status === 'error' ? 'text-red-300' : 
                    step.status === 'info' ? 'text-blue-300' : 
                    step.status === 'warning' ? 'text-yellow-300' : 
                    'text-gray-300'
                  }`}>
                    {step.description}
                  </div>
                )}
                
                {/* URL with improved styling */}
                {step.url && (
                  <div className="flex flex-col mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-cyan-400">🔗</span>
                      <span className="text-gray-300 text-sm">View in Notion:</span>
                    </div>
                    <a 
                      href={step.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-cyan-300 hover:text-cyan-100 underline text-sm break-all flex items-center gap-1"
                    >
                      <span>{step.url}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                  </div>
                )}
                
                {/* Details with improved styling */}
                {step.details && (
                  <div className="mt-2 bg-gray-900/20 border border-gray-600/30 rounded p-2">
                    <p className="text-gray-300 text-xs">{JSON.stringify(step.details)}</p>
                  </div>
                )}
              </div>
            </div>
            {/* Connector dot with status-specific color */}
            {!isLast && (
              <div className={`w-3 h-3 rounded-full mt-0.5 mb-0.5 z-0 ${
                step.status === 'error' ? 'bg-red-400/60' :
                step.status === 'done' ? 'bg-green-400/60' :
                step.status === 'info' ? 'bg-blue-400/60' :
                step.status === 'warning' ? 'bg-yellow-400/60' :
                'bg-cyan-400/60'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ToolStepRenderer; 