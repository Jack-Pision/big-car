declare module 'react-mathjax' {
  import { ReactNode } from 'react';
  
  interface ProviderProps {
    options?: any;
    children: ReactNode;
    onLoad?: () => void;
  }
  
  interface NodeProps {
    formula: string;
    inline?: boolean;
  }
  
  interface TextProps {
    text: string;
  }
  
  const Provider: React.FC<ProviderProps>;
  const Node: React.FC<NodeProps>;
  const Text: React.FC<TextProps>;
  
  export default {
    Provider,
    Node,
    Text
  };
} 