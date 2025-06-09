import React, { useState, useEffect } from 'react';
import styles from './Search.module.css';
import { dedupedSerperRequest } from '@/utils/api-request-cache';

// Define step types
type StepStatus = 'pending' | 'active' | 'completed' | 'error';

// Export the SearchStep interface for external use
export interface SearchStep {
  id: string;
  title: string;
  status: StepStatus;
  content: string;
  result?: string;
}

// Define search props interface
export interface SearchProps {
  query: string;
  onComplete?: (result: string) => void;
}

const Search: React.FC<SearchProps> = ({ query, onComplete }) => {
  // State for steps
  const [steps, setSteps] = useState<SearchStep[]>([
    {
      id: 'understand',
      title: 'Query Intelligence & Strategy Planning',
      status: 'pending',
      content: 'Analyzing your query to develop a comprehensive search strategy...'
    },
    {
      id: 'research',
      title: 'Multi-Source Web Discovery & Retrieval',
      status: 'pending',
      content: 'Retrieving relevant information from multiple web sources...'
    },
    {
      id: 'validate',
      title: 'Fact-Checking & Source Validation',
      status: 'pending',
      content: 'Validating the accuracy and reliability of the retrieved information...'
    },
    {
      id: 'analyze',
      title: 'Deep Reasoning & Analysis',
      status: 'pending',
      content: 'Analyzing the validated information to generate insights...'
    }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<string>('');
  
  // Execute search on mount
  useEffect(() => {
    if (query) {
      executeSearch(query);
    }
  }, [query]);
  
  // Update a step's status
  const updateStepStatus = (id: string, status: StepStatus, result?: string) => {
    setSteps(prevSteps => prevSteps.map(step => 
      step.id === id 
        ? { ...step, status, result: result || step.result }
        : step
    ));
  };

  // Execute Nvidia API call for a step
  const executeNvidiaStep = async (
    stepId: string, 
    systemPrompt: string, 
    userPrompt: string
  ): Promise<string> => {
    try {
      updateStepStatus(stepId, 'active');
      
      const response = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          stream: true // Enable streaming
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || 
          `API call failed with status: ${response.status}`
        );
      }
      
      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available');
      }
      
      let result = '';
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  result += content;
                  // Update the step content in real-time
                  updateStepStatus(stepId, 'active', result);
                }
              } catch (e) {
                console.error('Error parsing streaming response:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      if (!result) {
        throw new Error('No content received from the API');
      }
      
      updateStepStatus(stepId, 'completed', result);
      return result;
    } catch (err) {
      console.error(`Error in ${stepId} step:`, err);
      updateStepStatus(stepId, 'error');
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error in ${stepId}: ${errorMessage}`);
      throw err;
    }
  };

  // Execute Serper API call for the research step
  const executeSerperStep = async (query: string): Promise<any> => {
    try {
      updateStepStatus('research', 'active');
      
      // Use the deduped Serper request utility with required limit parameter
      const serperData = await dedupedSerperRequest(query, 10);
      
      if (!serperData || !serperData.sources || serperData.sources.length === 0) {
        throw new Error('No search results found');
      }
      
      // Format the results for display
      const formattedResults = serperData.sources.map((source: any, index: number) => 
        `Source ${index + 1}: ${source.title}\nURL: ${source.url}\n`
      ).join('\n');
      
      updateStepStatus('research', 'completed', formattedResults);
      return serperData;
    } catch (err) {
      console.error('Error in research step:', err);
      updateStepStatus('research', 'error');
      setError(`Error in research: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };
  
  // Main search execution flow
  const executeSearch = async (query: string) => {
    try {
      setError(null);
      
      // Step 1: Query Intelligence & Strategy Planning
      const strategyPrompt = `You are an AI Search Strategy Planner. Your goal is to analyze the user's query and develop a comprehensive search strategy.
Think step-by-step to:
1. Understand the core information need
2. Identify key concepts and potential subtopics
3. Develop an effective search strategy with key terms
4. Anticipate potential challenges or ambiguities

Format your response as a clear, structured strategy plan.`;
      
      const strategyResult = await executeNvidiaStep(
        'understand',
        strategyPrompt,
        `Analyze the following query and develop a comprehensive search strategy: "${query}"`
      );
      
      // Step 2: Multi-Source Web Discovery & Retrieval
      const serperResults = await executeSerperStep(query);
      
      // Step 3: Fact-Checking & Source Validation
      const validationPrompt = `You are an AI Fact-Checker and Source Validator. Your goal is to critically evaluate the search results and validate their reliability.
Think step-by-step to:
1. Analyze each source for credibility and relevance
2. Identify any contradictions or inconsistencies between sources
3. Assess the quality of information and potential biases
4. Extract the most reliable facts and information

Format your response as a clear assessment of the information quality.`;
      
      // Send both the query and web results to be validated
      const sourcesText = serperResults.sources.map((s: any) => 
        `- ${s.title}: ${s.url}`
      ).join('\n');
      
      const validationResult = await executeNvidiaStep(
        'validate',
        validationPrompt,
        `Validate the following search results for the query: "${query}"\n\nSearch Results:\n${sourcesText}`
      );
      
      // Step 4: Deep Reasoning & Analysis
      const analysisPrompt = `You are an AI Deep Reasoning Agent. Your goal is to analyze the validated information and generate insights.
Think step-by-step to:
1. Synthesize the validated information
2. Identify patterns, trends, and connections
3. Draw logical conclusions
4. Generate insights that address the original query

Format your response as a well-structured analysis.`;
      
      const analysisResult = await executeNvidiaStep(
        'analyze',
        analysisPrompt,
        `Analyze the following validated information for the query: "${query}"\n\nStrategy Plan:\n${strategyResult}\n\nValidated Information:\n${validationResult}`
      );
      
      // Step 5: Final Output (to be displayed in main chat)
      const finalOutputPrompt = `You are an AI Answer Generator. Your goal is to create a comprehensive, well-structured final answer.
Think step-by-step to:
1. Integrate all insights from the previous steps
2. Organize the information in a logical flow
3. Present a balanced, nuanced perspective
4. Provide clear, actionable conclusions

Format your response as a definitive answer to the user's query.`;
      
      const finalResponse = await fetch('/api/nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: finalOutputPrompt
            },
            {
              role: 'user',
              content: `Generate a final, comprehensive answer for the query: "${query}"\n\nStrategy Plan:\n${strategyResult}\n\nWeb Research:\n${sourcesText}\n\nValidation:\n${validationResult}\n\nAnalysis:\n${analysisResult}`
            }
          ],
          stream: true
        })
      });
      
      if (!finalResponse.ok) {
        const errorData = await finalResponse.json().catch(() => ({}));
        throw new Error(
          errorData.error || 
          `Final output API call failed with status: ${finalResponse.status}`
        );
      }
      
      // Handle streaming response for final output
      const reader = finalResponse.body?.getReader();
      if (!reader) {
        throw new Error('No response body available for final output');
      }
      
      let finalOutput = '';
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  finalOutput += content;
                  setFinalResult(finalOutput); // Update in real-time
                }
              } catch (e) {
                console.error('Error parsing final output streaming response:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      if (!finalOutput) {
        throw new Error('No content received for final output');
      }
      
      // Notify parent component that search is complete with final result
      if (onComplete) {
        onComplete(finalOutput);
      }
      
    } catch (err) {
      console.error('Error in search execution:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error in search: ${errorMessage}`);
    }
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
          <span className="text-lg font-normal text-neutral-200">{query}</span>
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
      <div className={`px-6 py-4 overflow-y-auto ${styles['hide-scrollbar']}`} style={{ height: 'calc(300px - 64px)' }}>
        {/* Steps */}
        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.id} className="mb-6">
              <h3 className="text-lg font-medium text-white mb-3">{step.title}</h3>
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