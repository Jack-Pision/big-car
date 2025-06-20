import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Define network nodes with better proportions and consistent spacing
  const nodes = [
    // Top row - more balanced horizontal spread
    { id: 1, x: 12, y: 12 },
    { id: 2, x: 28, y: 8 },
    { id: 3, x: 45, y: 10 },
    { id: 4, x: 62, y: 8 },
    { id: 5, x: 78, y: 12 },
    { id: 6, x: 88, y: 18 },
    
    // Second row
    { id: 7, x: 8, y: 25 },
    { id: 8, x: 22, y: 22 },
    { id: 9, x: 38, y: 25 },
    { id: 10, x: 55, y: 23 },
    { id: 11, x: 72, y: 25 },
    { id: 12, x: 85, y: 28 },
    
    // Third row
    { id: 13, x: 15, y: 38 },
    { id: 14, x: 32, y: 35 },
    { id: 15, x: 48, y: 38 },
    { id: 16, x: 65, y: 35 },
    { id: 17, x: 80, y: 38 },
    { id: 18, x: 92, y: 42 },
    
    // Fourth row
    { id: 19, x: 5, y: 52 },
    { id: 20, x: 25, y: 48 },
    { id: 21, x: 42, y: 52 },
    { id: 22, x: 58, y: 48 },
    { id: 23, x: 75, y: 52 },
    { id: 24, x: 88, y: 55 },
    
    // Fifth row
    { id: 25, x: 12, y: 65 },
    { id: 26, x: 35, y: 62 },
    { id: 27, x: 52, y: 65 },
    { id: 28, x: 68, y: 62 },
    { id: 29, x: 82, y: 65 },
    
    // Sixth row
    { id: 30, x: 8, y: 78 },
    { id: 31, x: 28, y: 75 },
    { id: 32, x: 45, y: 78 },
    { id: 33, x: 62, y: 75 },
    { id: 34, x: 78, y: 78 },
    { id: 35, x: 90, y: 82 },
    
    // Bottom row
    { id: 36, x: 15, y: 88 },
    { id: 37, x: 38, y: 92 },
    { id: 38, x: 58, y: 88 },
    { id: 39, x: 75, y: 92 },
  ];

  // Define connections with better triangulation and consistent gaps
  const connections = [
    // Horizontal connections - consistent spacing
    { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }, { from: 5, to: 6 },
    { from: 7, to: 8 }, { from: 8, to: 9 }, { from: 9, to: 10 }, { from: 10, to: 11 }, { from: 11, to: 12 },
    { from: 13, to: 14 }, { from: 14, to: 15 }, { from: 15, to: 16 }, { from: 16, to: 17 }, { from: 17, to: 18 },
    { from: 19, to: 20 }, { from: 20, to: 21 }, { from: 21, to: 22 }, { from: 22, to: 23 }, { from: 23, to: 24 },
    { from: 25, to: 26 }, { from: 26, to: 27 }, { from: 27, to: 28 }, { from: 28, to: 29 },
    { from: 30, to: 31 }, { from: 31, to: 32 }, { from: 32, to: 33 }, { from: 33, to: 34 }, { from: 34, to: 35 },
    { from: 36, to: 37 }, { from: 37, to: 38 }, { from: 38, to: 39 },
    
    // Vertical connections - creating columns
    { from: 1, to: 8 }, { from: 8, to: 13 }, { from: 13, to: 20 }, { from: 20, to: 25 }, { from: 25, to: 31 }, { from: 31, to: 36 },
    { from: 2, to: 9 }, { from: 9, to: 14 }, { from: 14, to: 21 }, { from: 21, to: 26 }, { from: 26, to: 32 }, { from: 32, to: 37 },
    { from: 3, to: 10 }, { from: 10, to: 15 }, { from: 15, to: 22 }, { from: 22, to: 27 }, { from: 27, to: 33 }, { from: 33, to: 38 },
    { from: 4, to: 11 }, { from: 11, to: 16 }, { from: 16, to: 23 }, { from: 23, to: 28 }, { from: 28, to: 34 }, { from: 34, to: 39 },
    { from: 5, to: 12 }, { from: 12, to: 17 }, { from: 17, to: 24 }, { from: 24, to: 29 }, { from: 29, to: 35 },
    
    // Diagonal connections for triangulation - shorter, more balanced
    { from: 1, to: 9 }, { from: 2, to: 8 }, { from: 2, to: 10 }, { from: 3, to: 9 }, { from: 3, to: 11 }, { from: 4, to: 10 }, { from: 4, to: 12 }, { from: 5, to: 11 },
    { from: 7, to: 14 }, { from: 8, to: 15 }, { from: 9, to: 16 }, { from: 10, to: 17 }, { from: 11, to: 18 },
    { from: 13, to: 21 }, { from: 14, to: 22 }, { from: 15, to: 23 }, { from: 16, to: 24 },
    { from: 19, to: 26 }, { from: 20, to: 27 }, { from: 21, to: 28 }, { from: 22, to: 29 },
    { from: 25, to: 32 }, { from: 26, to: 33 }, { from: 27, to: 34 }, { from: 28, to: 35 },
    { from: 30, to: 37 }, { from: 31, to: 38 }, { from: 32, to: 39 },
    
    // Cross diagonals for better triangulation
    { from: 8, to: 14 }, { from: 9, to: 15 }, { from: 10, to: 16 }, { from: 11, to: 17 },
    { from: 14, to: 20 }, { from: 15, to: 21 }, { from: 16, to: 22 }, { from: 17, to: 23 },
    { from: 20, to: 26 }, { from: 21, to: 27 }, { from: 22, to: 28 }, { from: 23, to: 29 },
    { from: 26, to: 31 }, { from: 27, to: 32 }, { from: 28, to: 33 }, { from: 29, to: 34 },
    
    // Edge connections for coverage
    { from: 7, to: 19 }, { from: 19, to: 30 },
    { from: 6, to: 12 }, { from: 12, to: 18 }, { from: 18, to: 24 }, { from: 24, to: 35 },
  ];

  // Helper function to get node by id
  const getNode = (id: number) => nodes.find(node => node.id === id);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Connection Lines - Well balanced opacity */}
        <g className="opacity-40">
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
                animate={{ pathLength: 1, opacity: 0.7 }}
                transition={{ 
                  duration: 2.5, 
                  delay: index * 0.03,
                  ease: "easeInOut"
                }}
              />
            );
          })}
        </g>

        {/* Network Nodes */}
        <g>
          {nodes.map((node, index) => (
            <motion.circle
              key={`node-${node.id}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="2.5"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.2, 1], 
                opacity: [0, 1, 0.85] 
              }}
              transition={{ 
                duration: 1.8, 
                delay: index * 0.06,
                repeat: Infinity,
                repeatDelay: 12,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Pulsing Network Hubs - Key intersection nodes */}
        <g className="opacity-25">
          {[15, 21, 27, 14, 22, 26, 32].map((nodeId, index) => {
            const node = getNode(nodeId);
            if (!node) return null;
            
            return (
              <motion.circle
                key={`hub-${nodeId}`}
                cx={`${node.x}%`}
                cy={`${node.y}%`}
                r="15"
                fill="none"
                stroke="white"
                strokeWidth="1"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: [1, 2.2, 1], 
                  opacity: [0, 0.35, 0] 
                }}
                transition={{ 
                  duration: 5, 
                  delay: 3 + index * 1.8,
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
              />
            );
          })}
        </g>

        {/* Data Flow Animation - Along main pathways */}
        <g className="opacity-50">
          {connections.slice(0, 15).map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.circle
                key={`flow-${index}`}
                r="1.8"
                fill="white"
                initial={{ 
                  cx: `${fromNode.x}%`, 
                  cy: `${fromNode.y}%`,
                  opacity: 0 
                }}
                animate={{ 
                  cx: `${toNode.x}%`, 
                  cy: `${toNode.y}%`,
                  opacity: [0, 0.8, 0] 
                }}
                transition={{ 
                  duration: 4, 
                  delay: 5 + index * 0.4,
                  repeat: Infinity,
                  repeatDelay: 10,
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