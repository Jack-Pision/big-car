import React from 'react';
import { EnhancedMathRenderer } from './EnhancedMathRenderer';

export const MathTestPreview: React.FC = () => {
  const latex = `$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`;
  return (
    <div style={{ background: '#181818', color: '#fff', padding: 24, borderRadius: 8 }}>
      <h2>MathJax Visual Test</h2>
      <p>This should render a beautiful quadratic formula:</p>
      <EnhancedMathRenderer content={latex} />
    </div>
  );
}; 