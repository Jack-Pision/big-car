import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Define network nodes (dots) with specific positions - expanded for better coverage
  const nodes = [
    // Top edge nodes
    { id: 1, x: 15, y: 8 },
    { id: 2, x: 35, y: 5 },
    { id: 3, x: 55, y: 8 },
    { id: 4, x: 75, y: 6 },
    { id: 5, x: 90, y: 10 },
    
    // Left edge nodes
    { id: 6, x: 5, y: 25 },
    { id: 7, x: 8, y: 45 },
    { id: 8, x: 5, y: 65 },
    { id: 9, x: 8, y: 85 },
    
    // Main network nodes
    { id: 10, x: 25, y: 20 },
    { id: 11, x: 45, y: 18 },
    { id: 12, x: 65, y: 22 },
    { id: 13, x: 85, y: 25 },
    
    { id: 14, x: 20, y: 35 },
    { id: 15, x: 40, y: 32 },
    { id: 16, x: 60, y: 38 },
    { id: 17, x: 80, y: 35 },
    
    { id: 18, x: 15, y: 50 },
    { id: 19, x: 35, y: 48 },
    { id: 20, x: 55, y: 52 },
    { id: 21, x: 75, y: 48 },
    { id: 22, x: 92, y: 50 },
    
    { id: 23, x: 25, y: 65 },
    { id: 24, x: 45, y: 62 },
    { id: 25, x: 65, y: 68 },
    { id: 26, x: 85, y: 65 },
    
    // Bottom edge nodes
    { id: 27, x: 15, y: 85 },
    { id: 28, x: 35, y: 88 },
    { id: 29, x: 55, y: 85 },
    { id: 30, x: 75, y: 88 },
    { id: 31, x: 90, y: 85 },
    
    // Right edge nodes
    { id: 32, x: 95, y: 30 },
    { id: 33, x: 95, y: 70 },
    
    // Additional bottom nodes
    { id: 34, x: 20, y: 95 },
    { id: 35, x: 50, y: 95 },
    { id: 36, x: 80, y: 95 },
  ];

  // Define connections between nodes (from nodeId to nodeId) - expanded network
  const connections = [
    // Top edge connections
    { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 },
    
    // Left edge connections
    { from: 6, to: 7 }, { from: 7, to: 8 }, { from: 8, to: 9 },
    
    // Connect edges to main network
    { from: 1, to: 10 }, { from: 2, to: 11 }, { from: 3, to: 12 }, { from: 4, to: 13 }, { from: 5, to: 13 },
    { from: 6, to: 14 }, { from: 7, to: 18 }, { from: 8, to: 23 }, { from: 9, to: 27 },
    
    // Main network horizontal connections
    { from: 10, to: 11 }, { from: 11, to: 12 }, { from: 12, to: 13 },
    { from: 14, to: 15 }, { from: 15, to: 16 }, { from: 16, to: 17 },
    { from: 18, to: 19 }, { from: 19, to: 20 }, { from: 20, to: 21 }, { from: 21, to: 22 },
    { from: 23, to: 24 }, { from: 24, to: 25 }, { from: 25, to: 26 },
    { from: 27, to: 28 }, { from: 28, to: 29 }, { from: 29, to: 30 }, { from: 30, to: 31 },
    
    // Vertical connections
    { from: 10, to: 14 }, { from: 14, to: 18 }, { from: 18, to: 23 }, { from: 23, to: 27 },
    { from: 11, to: 15 }, { from: 15, to: 19 }, { from: 19, to: 24 }, { from: 24, to: 28 },
    { from: 12, to: 16 }, { from: 16, to: 20 }, { from: 20, to: 25 }, { from: 25, to: 29 },
    { from: 13, to: 17 }, { from: 17, to: 21 }, { from: 21, to: 26 }, { from: 26, to: 30 },
    
    // Diagonal connections for more density
    { from: 10, to: 15 }, { from: 11, to: 16 }, { from: 12, to: 17 },
    { from: 14, to: 19 }, { from: 15, to: 20 }, { from: 16, to: 21 },
    { from: 18, to: 24 }, { from: 19, to: 25 }, { from: 20, to: 26 },
    { from: 23, to: 28 }, { from: 24, to: 29 }, { from: 25, to: 30 },
    
    // Cross connections
    { from: 1, to: 11 }, { from: 2, to: 12 }, { from: 3, to: 13 },
    { from: 6, to: 18 }, { from: 7, to: 23 }, { from: 8, to: 27 },
    { from: 10, to: 19 }, { from: 11, to: 20 }, { from: 12, to: 21 },
    { from: 14, to: 24 }, { from: 15, to: 25 }, { from: 16, to: 26 },
    
    // Right edge connections
    { from: 13, to: 32 }, { from: 17, to: 32 }, { from: 22, to: 32 },
    { from: 22, to: 33 }, { from: 26, to: 33 }, { from: 31, to: 33 },
    
    // Bottom edge connections
    { from: 27, to: 34 }, { from: 28, to: 35 }, { from: 29, to: 35 }, { from: 30, to: 36 }, { from: 31, to: 36 },
    { from: 34, to: 35 }, { from: 35, to: 36 },
  ];

  // Helper function to get node by id
  const getNode = (id: number) => nodes.find(node => node.id === id);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Connection Lines - Increased opacity */}
        <g className="opacity-50">
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
                animate={{ pathLength: 1, opacity: 0.8 }}
                transition={{ 
                  duration: 2, 
                  delay: index * 0.05,
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
                scale: [0, 1.3, 1], 
                opacity: [0, 1, 0.9] 
              }}
              transition={{ 
                duration: 1.5, 
                delay: index * 0.08,
                repeat: Infinity,
                repeatDelay: 10,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Pulsing Network Hubs (key nodes) - Increased opacity */}
        <g className="opacity-30">
          {[15, 20, 16, 19, 24, 25].map((nodeId, index) => {
            const node = getNode(nodeId);
            if (!node) return null;
            
            return (
              <motion.circle
                key={`hub-${nodeId}`}
                cx={`${node.x}%`}
                cy={`${node.y}%`}
                r="12"
                fill="none"
                stroke="white"
                strokeWidth="1"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: [1, 2.5, 1], 
                  opacity: [0, 0.4, 0] 
                }}
                transition={{ 
                  duration: 4, 
                  delay: 2 + index * 1.2,
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
              />
            );
          })}
        </g>

        {/* Data Flow Animation - Increased opacity */}
        <g className="opacity-60">
          {connections.slice(0, 12).map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.circle
                key={`flow-${index}`}
                r="1.5"
                fill="white"
                initial={{ 
                  cx: `${fromNode.x}%`, 
                  cy: `${fromNode.y}%`,
                  opacity: 0 
                }}
                animate={{ 
                  cx: `${toNode.x}%`, 
                  cy: `${toNode.y}%`,
                  opacity: [0, 1, 0] 
                }}
                transition={{ 
                  duration: 3, 
                  delay: 4 + index * 0.3,
                  repeat: Infinity,
                  repeatDelay: 8,
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