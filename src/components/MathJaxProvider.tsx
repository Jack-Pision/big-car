import React, { ReactNode } from 'react';
import MathJax from 'react-mathjax';

// Default MathJax configuration
const DEFAULT_MATHJAX_OPTIONS = {
  tex2jax: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    processEnvironments: true,
  },
  showMathMenu: false,
  showProcessingMessages: false,
  messageStyle: 'none',
  extensions: ['tex2jax.js'],
  TeX: {
    extensions: [
      'AMSmath.js',
      'AMSsymbols.js',
      'noErrors.js',
      'noUndefined.js',
    ],
  }
};

interface MathJaxProviderProps {
  children: ReactNode;
  options?: any;
}

export const MathJaxProvider: React.FC<MathJaxProviderProps> = ({ 
  children,
  options = DEFAULT_MATHJAX_OPTIONS
}) => {
  return (
    <MathJax.Provider options={options}>
      {children}
    </MathJax.Provider>
  );
}; 