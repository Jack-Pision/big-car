import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Define network nodes with reduced count (25 nodes) for cleaner appearance
  const nodes = [
    // Top row - full width coverage
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 25, y: 2 },
    { id: 3, x: 50, y: 0 },
    { id: 4, x: 75, y: 2 },
    { id: 5, x: 100, y: 3 },
    
    // Second row
    { id: 6, x: 8, y: 25 },
    { id: 7, x: 30, y: 27 },
    { id: 8, x: 50, y: 25 },
    { id: 9, x: 70, y: 27 },
    { id: 10, x: 92, y: 28 },
    
    // Middle row
    { id: 11, x: 0, y: 50 },
    { id: 12, x: 20, y: 52 },
    { id: 13, x: 40, y: 50 },
    { id: 14, x: 60, y: 52 },
    { id: 15, x: 80, y: 50 },
    { id: 16, x: 100, y: 53 },
    
    // Fourth row
    { id: 17, x: 12, y: 75 },
    { id: 18, x: 32, y: 77 },
    { id: 19, x: 52, y: 75 },
    { id: 20, x: 72, y: 77 },
    { id: 21, x: 88, y: 78 },
    
    // Bottom row - full width coverage
    { id: 22, x: 5, y: 95 },
    { id: 23, x: 35, y: 100 },
    { id: 24, x: 65, y: 97 },
    { id: 25, x: 95, y: 100 },
  ];

  // Define connections - reduced and simplified
  const connections = [
    // Horizontal connections - main structure
    { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 },
    { from: 6, to: 7 }, { from: 7, to: 8 }, { from: 8, to: 9 }, { from: 9, to: 10 },
    { from: 11, to: 12 }, { from: 12, to: 13 }, { from: 13, to: 14 }, { from: 14, to: 15 }, { from: 15, to: 16 },
    { from: 17, to: 18 }, { from: 18, to: 19 }, { from: 19, to: 20 }, { from: 20, to: 21 },
    { from: 22, to: 23 }, { from: 23, to: 24 }, { from: 24, to: 25 },
    
    // Vertical connections - main columns
    { from: 1, to: 6 }, { from: 6, to: 11 }, { from: 11, to: 17 }, { from: 17, to: 22 },
    { from: 2, to: 7 }, { from: 7, to: 12 }, { from: 12, to: 18 }, { from: 18, to: 23 },
    { from: 3, to: 8 }, { from: 8, to: 13 }, { from: 13, to: 19 }, { from: 19, to: 24 },
    { from: 4, to: 9 }, { from: 9, to: 14 }, { from: 14, to: 20 }, { from: 20, to: 25 },
    { from: 5, to: 10 }, { from: 10, to: 15 }, { from: 15, to: 21 },
    
    // Key diagonal connections - minimal for triangulation
    { from: 1, to: 7 }, { from: 2, to: 8 }, { from: 3, to: 9 }, { from: 4, to: 10 },
    { from: 6, to: 12 }, { from: 7, to: 13 }, { from: 8, to: 14 }, { from: 9, to: 15 },
    { from: 11, to: 18 }, { from: 12, to: 19 }, { from: 13, to: 20 }, { from: 14, to: 21 },
    
    // Edge connections for coverage
    { from: 5, to: 16 }, { from: 16, to: 21 }, { from: 21, to: 25 },
    { from: 1, to: 11 }, { from: 11, to: 22 },
  ];

  // Helper function to get node by id
  const getNode = (id: number) => nodes.find(node => node.id === id);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Connection Lines - Much more subtle */}
        <g className="opacity-20">
          {connections.map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.line
                key={`connection-${index}`}
                x1={`${fromNode.x}%`}
                y1={`${fromNode.y}%`}
                x2={`${toNode.x}%`}
                y2={`${toNode.y}%`}
                stroke="white"
                strokeWidth="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.5 }}
                transition={{ 
                  duration: 3, 
                  delay: index * 0.05,
                  ease: "easeInOut"
                }}
              />
            );
          })}
        </g>

        {/* Network Nodes - Smaller and more subtle */}
        <g>
          {nodes.map((node, index) => (
            <motion.circle
              key={`node-${node.id}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="1.5"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.1, 1], 
                opacity: [0, 0.8, 0.6] 
              }}
              transition={{ 
                duration: 2, 
                delay: index * 0.08,
                repeat: Infinity,
                repeatDelay: 15,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Pulsing Network Hubs - Fewer and more subtle */}
        <g className="opacity-15">
          {[8, 13, 14, 19].map((nodeId, index) => {
            const node = getNode(nodeId);
            if (!node) return null;
            
            return (
              <motion.circle
                key={`hub-${nodeId}`}
                cx={`${node.x}%`}
                cy={`${node.y}%`}
                r="20"
                fill="none"
                stroke="white"
                strokeWidth="1"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: [1, 2, 1], 
                  opacity: [0, 0.25, 0] 
                }}
                transition={{ 
                  duration: 6, 
                  delay: 4 + index * 2,
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
              />
            );
          })}
        </g>

        {/* Data Flow Animation - Fewer particles */}
        <g className="opacity-30">
          {connections.slice(0, 8).map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.circle
                key={`flow-${index}`}
                r="1.2"
                fill="white"
                initial={{ 
                  cx: `${fromNode.x}%`, 
                  cy: `${fromNode.y}%`,
                  opacity: 0 
                }}
                animate={{ 
                  cx: `${toNode.x}%`, 
                  cy: `${toNode.y}%`,
                  opacity: [0, 0.6, 0] 
                }}
                transition={{ 
                  duration: 5, 
                  delay: 6 + index * 0.6,
                  repeat: Infinity,
                  repeatDelay: 12,
                  ease: "easeInOut" 
                }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default BackgroundPattern; 