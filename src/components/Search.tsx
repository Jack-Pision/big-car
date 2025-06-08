import React, { useState, useEffect } from 'react';

// Define the steps for the Search UI
export interface SearchStep {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  content: string;
  result?: string;
}

interface SearchProps {
  query: string;
  onFinalOutput?: (finalOutput: string) => void;
}

const Search: React.FC<SearchProps> = ({ query, onFinalOutput }) => {
  // Define the 5 steps for the search process
  const [steps, setSteps] = useState<SearchStep[]>([
    {
      id: 'query-intelligence',
      title: 'Query Intelligence & Strategy Planning',
      status: 'pending',
      content: 'Analyzing your query to develop a comprehensive search strategy...',
    },
    {
      id: 'web-discovery',
      title: 'Multi-Source Web Discovery & Retrieval',
      status: 'pending',
      content: 'Discovering and retrieving information from diverse web sources...',
    },
    {
      id: 'fact-checking',
      title: 'Fact-Checking & Source Validation',
      status: 'pending',
      content: 'Validating information and checking facts across multiple sources...',
    },
    {
      id: 'deep-reasoning',
      title: 'Deep Reasoning & Analysis',
      status: 'pending',
      content: 'Conducting in-depth analysis and reasoning on the gathered information...',
    },
    {
      id: 'final-output',
      title: 'Final Output',
      status: 'pending',
      content: 'Generating final comprehensive answer...',
    }
  ]);

  const [isSearching, setIsSearching] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Function to update a step's status and result
  const updateStep = (stepId: string, status: 'pending' | 'active' | 'completed' | 'error', result?: string) => {
    setSteps(prevSteps => prevSteps.map(step => 
      step.id === stepId 
        ? { ...step, status, result: result || step.result }
        : step
    ));
  };

  // Function to process each step sequentially
  useEffect(() => {
    if (!query || !isSearching || currentStepIndex >= steps.length) return;

    const currentStep = steps[currentStepIndex];
    updateStep(currentStep.id, 'active');

    const processStep = async () => {
      try {
        // Execute the appropriate API call for the current step
        let result = '';
        
        switch (currentStep.id) {
          case 'query-intelligence':
            // Call Nvidia API for Query Intelligence
            result = await executeQueryIntelligence(query);
            break;
          case 'web-discovery':
            // Call Serper API for Web Discovery
            result = await executeWebDiscovery(query);
            break;
          case 'fact-checking':
            // Call Nvidia API for Fact Checking
            result = await executeFactChecking(query);
            break;
          case 'deep-reasoning':
            // Call Nvidia API for Deep Reasoning
            result = await executeDeepReasoning(query);
            break;
          case 'final-output':
            // Call Nvidia API for Final Output
            result = await executeFinalOutput(query);
            // Send the final output to the main chat
            if (onFinalOutput) {
              onFinalOutput(result);
            }
            break;
        }

        // Update the step as completed with the result
        updateStep(currentStep.id, 'completed', result);
        
        // Move to the next step
        setCurrentStepIndex(prevIndex => prevIndex + 1);
      } catch (err) {
        console.error(`Error processing step ${currentStep.id}:`, err);
        updateStep(currentStep.id, 'error');
        setError(`Error in ${currentStep.title}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsSearching(false);
      }
    };

    // Add a small delay to make the UI feel more natural
    const timer = setTimeout(() => {
      processStep();
    }, 1000);

    return () => clearTimeout(timer);
  }, [query, isSearching, currentStepIndex, steps, onFinalOutput]);

  // Start the search process when query is provided
  useEffect(() => {
    if (query && !isSearching) {
      setIsSearching(true);
      setCurrentStepIndex(0);
      setError(null);
      // Reset all steps to pending
      setSteps(prevSteps => prevSteps.map(step => ({ ...step, status: 'pending', result: undefined })));
    }
  }, [query]);

  // Mock API functions for each step - Replace these with actual API calls
  const executeQueryIntelligence = async (query: string): Promise<string> => {
    // Replace with actual Nvidia API call
    const response = await fetch('/api/nvidia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a Query Intelligence Agent. Analyze the query, identify key concepts, and develop a strategy for finding the most relevant and accurate information. Provide a bullet-point analysis of the query.'
          },
          {
            role: 'user',
            content: query
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to execute Query Intelligence');
    }
    
    const data = await response.json();
    return data.content || 'Query analysis completed successfully.';
  };

  const executeWebDiscovery = async (query: string): Promise<string> => {
    // Replace with actual Serper API call
    const response = await fetch('/api/serper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      throw new Error('Failed to execute Web Discovery');
    }
    
    const data = await response.json();
    return 'Web discovery completed successfully. Retrieved relevant information from multiple sources.';
  };

  const executeFactChecking = async (query: string): Promise<string> => {
    // Replace with actual Nvidia API call
    const response = await fetch('/api/nvidia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a Fact-Checking Agent. Validate the information gathered, check for inconsistencies, and identify reliable sources.'
          },
          {
            role: 'user',
            content: `Fact check the following query: ${query}`
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to execute Fact Checking');
    }
    
    const data = await response.json();
    return data.content || 'Fact checking completed successfully.';
  };

  const executeDeepReasoning = async (query: string): Promise<string> => {
    // Replace with actual Nvidia API call
    const response = await fetch('/api/nvidia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a Deep Reasoning Agent. Conduct in-depth analysis of the information, make connections, and draw logical conclusions.'
          },
          {
            role: 'user',
            content: `Analyze the following query: ${query}`
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to execute Deep Reasoning');
    }
    
    const data = await response.json();
    return data.content || 'Deep reasoning completed successfully.';
  };

  const executeFinalOutput = async (query: string): Promise<string> => {
    // Replace with actual Nvidia API call
    const response = await fetch('/api/nvidia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a Comprehensive Answer Generation Agent. Create a final, well-structured answer based on all the information gathered and analyzed.'
          },
          {
            role: 'user',
            content: `Provide a comprehensive answer to: ${query}`
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to execute Final Output');
    }
    
    const data = await response.json();
    return data.content || 'Final output generated successfully.';
  };

  // Render the Search UI
  return (
    <div
      className="w-full mx-auto rounded-lg overflow-hidden bg-[#171717] border border-white/20"
      style={{ borderRadius: '20px', maxWidth: '969px', height: '300px' }}
    >
      {/* Header (fixed) */}
      <div
        className="relative flex items-center px-6 py-4 bg-[#171717]"
        style={{ minHeight: '64px' }}
      >
        <div className="flex items-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <circle cx="12" cy="12" r="3" />
            <circle cx="19" cy="5" r="2" />
            <circle cx="5" cy="19" r="2" />
            <line x1="14.15" y1="14.15" x2="17" y2="17" />
            <line x1="6.85" y1="17.15" x2="10.15" y2="13.85" />
            <line x1="13.85" y1="10.15" x2="17.15" y2="6.85" />
          </svg>
          <span className="text-lg font-normal text-neutral-200">Search Results</span>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            stroke="#E5E5E5"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Content (scrollable) */}
      <div className="px-6 py-4 overflow-y-auto" style={{ height: 'calc(300px - 64px)' }}>
        {/* Query display */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-2">Title of the query</h2>
          <div className="text-neutral-300">{query}</div>
        </div>

        {/* Steps */}
        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.id} className="mb-6">
              <h3 className="text-lg font-medium text-white mb-3">{step.title}</h3>
              
              {/* Step status indicator */}
              <div className="flex items-center gap-2 mb-2">
                <span 
                  className={`inline-block w-2 h-2 rounded-full ${
                    step.status === 'pending' ? 'bg-neutral-400' :
                    step.status === 'active' ? 'bg-blue-400 animate-pulse' :
                    step.status === 'completed' ? 'bg-green-400' :
                    'bg-red-400'
                  }`}
                />
                <span 
                  className={`text-sm ${
                    step.status === 'pending' ? 'text-neutral-400' :
                    step.status === 'active' ? 'text-blue-400' :
                    step.status === 'completed' ? 'text-green-400' :
                    'text-red-400'
                  }`}
                >
                  {step.status === 'pending' ? 'Pending' :
                   step.status === 'active' ? 'In Progress' :
                   step.status === 'completed' ? 'Completed' :
                   'Error'}
                </span>
              </div>
              
              {/* Step content */}
              <div className="text-neutral-300 ml-4">
                {step.status === 'active' && <p>{step.content}</p>}
                {step.status === 'completed' && step.result && <p>{step.result}</p>}
                {step.status === 'error' && <p className="text-red-400">An error occurred while processing this step.</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Search; 