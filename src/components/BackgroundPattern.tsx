import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Define network nodes arranged in circular globe pattern (bottom-left positioning)
  const nodes = [
    // Center node
    { id: 1, x: 25, y: 75 },
    
    // Inner ring (6 nodes)
    { id: 2, x: 25, y: 65 }, // top
    { id: 3, x: 33, y: 70 }, // top-right
    { id: 4, x: 33, y: 80 }, // bottom-right
    { id: 5, x: 25, y: 85 }, // bottom
    { id: 6, x: 17, y: 80 }, // bottom-left
    { id: 7, x: 17, y: 70 }, // top-left
    
    // Middle ring (8 nodes)
    { id: 8, x: 25, y: 55 }, // top
    { id: 9, x: 35, y: 60 }, // top-right
    { id: 10, x: 40, y: 75 }, // right
    { id: 11, x: 35, y: 90 }, // bottom-right
    { id: 12, x: 25, y: 95 }, // bottom
    { id: 13, x: 15, y: 90 }, // bottom-left
    { id: 14, x: 10, y: 75 }, // left
    { id: 15, x: 15, y: 60 }, // top-left
    
    // Outer ring (10 nodes)
    { id: 16, x: 25, y: 45 }, // top
    { id: 17, x: 32, y: 48 }, // top-right-1
    { id: 18, x: 38, y: 55 }, // top-right-2
    { id: 19, x: 42, y: 65 }, // right-1
    { id: 20, x: 45, y: 75 }, // right
    { id: 21, x: 42, y: 85 }, // right-2
    { id: 22, x: 38, y: 95 }, // bottom-right
    { id: 23, x: 25, y: 100 }, // bottom
    { id: 24, x: 12, y: 95 }, // bottom-left
    { id: 25, x: 5, y: 75 }, // left
  ];

  // Define connections - circular network pattern
  const connections = [
    // Center to inner ring
    { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 }, 
    { from: 1, to: 5 }, { from: 1, to: 6 }, { from: 1, to: 7 },
    
    // Inner ring connections
    { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }, 
    { from: 5, to: 6 }, { from: 6, to: 7 }, { from: 7, to: 2 },
    
    // Inner ring to middle ring
    { from: 2, to: 8 }, { from: 3, to: 9 }, { from: 4, to: 10 }, 
    { from: 5, to: 11 }, { from: 6, to: 13 }, { from: 7, to: 15 },
    
    // Middle ring connections
    { from: 8, to: 9 }, { from: 9, to: 10 }, { from: 10, to: 11 }, 
    { from: 11, to: 12 }, { from: 12, to: 13 }, { from: 13, to: 14 }, 
    { from: 14, to: 15 }, { from: 15, to: 8 },
    
    // Middle ring to outer ring
    { from: 8, to: 16 }, { from: 9, to: 17 }, { from: 10, to: 19 }, 
    { from: 11, to: 21 }, { from: 12, to: 23 }, { from: 13, to: 24 }, 
    { from: 14, to: 25 }, { from: 15, to: 18 },
    
    // Outer ring connections
    { from: 16, to: 17 }, { from: 17, to: 18 }, { from: 18, to: 19 }, 
    { from: 19, to: 20 }, { from: 20, to: 21 }, { from: 21, to: 22 }, 
    { from: 22, to: 23 }, { from: 23, to: 24 }, { from: 24, to: 25 },
    
    // Additional cross connections for network density
    { from: 2, to: 9 }, { from: 3, to: 10 }, { from: 4, to: 11 }, 
    { from: 5, to: 12 }, { from: 6, to: 14 }, { from: 7, to: 8 },
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
          {[1, 8, 16, 20].map((nodeId, index) => {
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