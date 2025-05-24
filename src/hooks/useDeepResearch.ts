import { useState, useEffect } from 'react';
import { ThinkingStep } from '@/components/DeepResearchView';

// Default thinking steps that will be used for every query
const DEFAULT_THINKING_STEPS: ThinkingStep[] = [
  {
    id: 'clarify',
    title: 'Clarifying the request',
    content: '',
    status: 'pending'
  },
  {
    id: 'search',
    title: 'Searching for information',
    content: '',
    status: 'pending'
  },
  {
    id: 'analyze',
    title: 'Analyzing search results',
    content: '',
    status: 'pending'
  },
  {
    id: 'refine',
    title: 'Refining the response',
    content: '',
    status: 'pending'
  },
  {
    id: 'finalize',
    title: 'Finalizing details',
    content: '',
    status: 'pending'
  },
  {
    id: 'confirm',
    title: 'Confirming completeness',
    content: '',
    status: 'pending'
  }
];

const STEP_TIMINGS = {
  clarify: { min: 2000, max: 4000 },
  search: { min: 3000, max: 5000 },
  analyze: { min: 4000, max: 7000 },
  refine: { min: 3000, max: 5000 },
  finalize: { min: 2000, max: 4000 },
  confirm: { min: 1500, max: 3000 }
};

const THINKING_CONTENT = {
  clarify: [
    "The question is about \"{query}\", which I need to understand clearly.",
    "I'm trying to determine what \"{query}\" is asking for specifically.",
    "Let me break down what \"{query}\" means and what information would be most helpful."
  ],
  search: [
    "Searching for the most relevant and reliable information about \"{query}\".",
    "Looking for authoritative sources that can provide accurate data on \"{query}\".",
    "Gathering different perspectives and approaches related to \"{query}\"."
  ],
  analyze: [
    "Evaluating the quality and relevance of the information I've found.",
    "Comparing different sources and identifying consensus views on \"{query}\".",
    "Prioritizing the most important and accurate information for my response."
  ],
  refine: [
    "Organizing the information into a clear structure for my response.",
    "Deciding how to present technical details at an appropriate level.",
    "Ensuring my explanation addresses all aspects of \"{query}\"."
  ],
  finalize: [
    "Adding important details and examples to strengthen my explanation.",
    "Checking that my response is comprehensive and addresses the core question.",
    "Making sure my answer is both accurate and useful for the specific query."
  ],
  confirm: [
    "Verifying that all parts of \"{query}\" have been addressed.",
    "Ensuring the response is complete and covers all relevant angles.",
    "Checking for any gaps or areas that need further explanation."
  ]
};

// Function to get a random thinking content with the query injected
const getRandomThinkingContent = (stepId: string, query: string): string => {
  const contents = THINKING_CONTENT[stepId as keyof typeof THINKING_CONTENT] || [];
  const randomIndex = Math.floor(Math.random() * contents.length);
  return contents[randomIndex]?.replace(/\{query\}/g, query) || '';
};

// Random time between min and max
const getRandomTime = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const useDeepResearch = (isActive: boolean, query: string = '') => {
  const [steps, setSteps] = useState<ThinkingStep[]>([...DEFAULT_THINKING_STEPS]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [detailedThinking, setDetailedThinking] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);

  // Reset steps when a new query starts
  useEffect(() => {
    if (query && isActive && !isInProgress) {
      setSteps([...DEFAULT_THINKING_STEPS]);
      setActiveStepId(null);
      setDetailedThinking('');
      setIsComplete(false);
      setIsInProgress(true);
      
      // Start the thinking process after a short delay
      setTimeout(() => {
        setActiveStepId('clarify');
        setDetailedThinking(getRandomThinkingContent('clarify', query));
        processNextStep('clarify', 0);
      }, 500);
    }
    
    // When DeepResearch is turned off, reset everything
    if (!isActive) {
      setIsInProgress(false);
      setIsComplete(false);
    }
  }, [query, isActive]);

  // Process steps in sequence
  const processNextStep = (currentStepId: string, stepIndex: number) => {
    if (!isActive || stepIndex >= steps.length) {
      setIsComplete(true);
      setIsInProgress(false);
      return;
    }

    // Mark current step as active
    setSteps(prev => prev.map(step => 
      step.id === currentStepId 
        ? { ...step, status: 'active', content: getRandomThinkingContent(step.id, query) } 
        : step
    ));
    
    // After some time, mark the current step as completed and move to the next
    const timing = STEP_TIMINGS[currentStepId as keyof typeof STEP_TIMINGS] || { min: 2000, max: 4000 };
    const stepTime = getRandomTime(timing.min, timing.max);
    
    setTimeout(() => {
      // Complete the current step
      setSteps(prev => prev.map(step => 
        step.id === currentStepId ? { ...step, status: 'completed' } : step
      ));
      
      // Move to the next step
      if (stepIndex + 1 < steps.length) {
        const nextStep = steps[stepIndex + 1];
        setActiveStepId(nextStep.id);
        setDetailedThinking(getRandomThinkingContent(nextStep.id, query));
        processNextStep(nextStep.id, stepIndex + 1);
      } else {
        setIsComplete(true);
        setIsInProgress(false);
      }
    }, stepTime);
  };

  return {
    steps,
    activeStepId,
    detailedThinking,
    isComplete,
    isInProgress
  };
}; 