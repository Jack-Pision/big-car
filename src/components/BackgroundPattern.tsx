import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Define network nodes arranged in larger circular globe pattern (bottom-left corner filling)
  const nodes = [
    // Center node
    { id: 1, x: 25, y: 75 },
    
    // Ring 1 - Inner (6 nodes)
    { id: 2, x: 25, y: 68 }, // top
    { id: 3, x: 31, y: 72 }, // top-right
    { id: 4, x: 31, y: 78 }, // bottom-right
    { id: 5, x: 25, y: 82 }, // bottom
    { id: 6, x: 19, y: 78 }, // bottom-left
    { id: 7, x: 19, y: 72 }, // top-left
    
    // Ring 2 - Middle-Inner (8 nodes)
    { id: 8, x: 25, y: 60 }, // top
    { id: 9, x: 32, y: 64 }, // top-right
    { id: 10, x: 36, y: 75 }, // right
    { id: 11, x: 32, y: 86 }, // bottom-right
    { id: 12, x: 25, y: 90 }, // bottom
    { id: 13, x: 18, y: 86 }, // bottom-left
    { id: 14, x: 14, y: 75 }, // left
    { id: 15, x: 18, y: 64 }, // top-left
    
    // Ring 3 - Middle (12 nodes)
    { id: 16, x: 25, y: 52 }, // top
    { id: 17, x: 30, y: 54 }, // top-right-1
    { id: 18, x: 35, y: 58 }, // top-right-2
    { id: 19, x: 39, y: 65 }, // right-1
    { id: 20, x: 42, y: 75 }, // right
    { id: 21, x: 39, y: 85 }, // right-2
    { id: 22, x: 35, y: 92 }, // bottom-right-2
    { id: 23, x: 30, y: 96 }, // bottom-right-1
    { id: 24, x: 25, y: 98 }, // bottom
    { id: 25, x: 20, y: 96 }, // bottom-left-1
    { id: 26, x: 15, y: 92 }, // bottom-left-2
    { id: 27, x: 11, y: 85 }, // left-2
    { id: 28, x: 8, y: 75 }, // left
    { id: 29, x: 11, y: 65 }, // left-1
    { id: 30, x: 15, y: 58 }, // top-left-2
    { id: 31, x: 20, y: 54 }, // top-left-1
    
    // Ring 4 - Outer (16 nodes)
    { id: 32, x: 25, y: 44 }, // top
    { id: 33, x: 29, y: 45 }, // top-right-1
    { id: 34, x: 33, y: 48 }, // top-right-2
    { id: 35, x: 37, y: 52 }, // top-right-3
    { id: 36, x: 41, y: 58 }, // right-1
    { id: 37, x: 44, y: 65 }, // right-2
    { id: 38, x: 46, y: 75 }, // right
    { id: 39, x: 44, y: 85 }, // right-3
    { id: 40, x: 41, y: 92 }, // right-4
    { id: 41, x: 37, y: 98 }, // bottom-right-3
    { id: 42, x: 33, y: 102 }, // bottom-right-2
    { id: 43, x: 29, y: 105 }, // bottom-right-1
    { id: 44, x: 25, y: 106 }, // bottom
    { id: 45, x: 21, y: 105 }, // bottom-left-1
    { id: 46, x: 17, y: 102 }, // bottom-left-2
    { id: 47, x: 13, y: 98 }, // bottom-left-3
    { id: 48, x: 9, y: 92 }, // left-4
    { id: 49, x: 6, y: 85 }, // left-3
    { id: 50, x: 4, y: 75 }, // left
    { id: 51, x: 6, y: 65 }, // left-2
    { id: 52, x: 9, y: 58 }, // left-1
    { id: 53, x: 13, y: 52 }, // top-left-3
    { id: 54, x: 17, y: 48 }, // top-left-2
    { id: 55, x: 21, y: 45 }, // top-left-1
    
    // Ring 5 - Edge (12 nodes for corner coverage)
    { id: 56, x: 25, y: 35 }, // top
    { id: 57, x: 35, y: 40 }, // top-right
    { id: 58, x: 42, y: 50 }, // right-1
    { id: 59, x: 48, y: 65 }, // right-2
    { id: 60, x: 50, y: 75 }, // right
    { id: 61, x: 48, y: 85 }, // right-3
    { id: 62, x: 42, y: 100 }, // right-4
    { id: 63, x: 25, y: 110 }, // bottom
    { id: 64, x: 8, y: 100 }, // left-4
    { id: 65, x: 2, y: 85 }, // left-3
    { id: 66, x: 0, y: 75 }, // left
    { id: 67, x: 2, y: 65 }, // left-2
    { id: 68, x: 8, y: 50 }, // left-1
    { id: 69, x: 15, y: 40 }, // top-left
  ];

  // Define connections - comprehensive circular network
  const connections = [
    // Center to Ring 1
    { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 }, 
    { from: 1, to: 5 }, { from: 1, to: 6 }, { from: 1, to: 7 },
    
    // Ring 1 circular connections
    { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }, 
    { from: 5, to: 6 }, { from: 6, to: 7 }, { from: 7, to: 2 },
    
    // Ring 1 to Ring 2
    { from: 2, to: 8 }, { from: 3, to: 9 }, { from: 4, to: 10 }, 
    { from: 5, to: 11 }, { from: 6, to: 13 }, { from: 7, to: 15 },
    
    // Ring 2 circular connections
    { from: 8, to: 9 }, { from: 9, to: 10 }, { from: 10, to: 11 }, 
    { from: 11, to: 12 }, { from: 12, to: 13 }, { from: 13, to: 14 }, 
    { from: 14, to: 15 }, { from: 15, to: 8 },
    
    // Ring 2 to Ring 3 (selective connections)
    { from: 8, to: 16 }, { from: 9, to: 18 }, { from: 10, to: 20 }, 
    { from: 11, to: 22 }, { from: 12, to: 24 }, { from: 13, to: 26 }, 
    { from: 14, to: 28 }, { from: 15, to: 30 },
    
    // Ring 3 circular connections (partial for cleaner look)
    { from: 16, to: 17 }, { from: 17, to: 18 }, { from: 18, to: 19 }, 
    { from: 19, to: 20 }, { from: 20, to: 21 }, { from: 21, to: 22 }, 
    { from: 22, to: 23 }, { from: 23, to: 24 }, { from: 24, to: 25 }, 
    { from: 25, to: 26 }, { from: 26, to: 27 }, { from: 27, to: 28 }, 
    { from: 28, to: 29 }, { from: 29, to: 30 }, { from: 30, to: 31 }, 
    { from: 31, to: 16 },
    
    // Ring 3 to Ring 4 (selective)
    { from: 16, to: 32 }, { from: 18, to: 35 }, { from: 20, to: 38 }, 
    { from: 22, to: 41 }, { from: 24, to: 44 }, { from: 26, to: 47 }, 
    { from: 28, to: 50 }, { from: 30, to: 53 },
    
    // Ring 4 partial connections (every other node for cleaner look)
    { from: 32, to: 34 }, { from: 34, to: 36 }, { from: 36, to: 38 }, 
    { from: 38, to: 40 }, { from: 40, to: 42 }, { from: 42, to: 44 }, 
    { from: 44, to: 46 }, { from: 46, to: 48 }, { from: 48, to: 50 }, 
    { from: 50, to: 52 }, { from: 52, to: 54 }, { from: 54, to: 32 },
    
    // Ring 4 to Ring 5 (edge connections)
    { from: 32, to: 56 }, { from: 36, to: 58 }, { from: 38, to: 60 }, 
    { from: 40, to: 62 }, { from: 44, to: 63 }, { from: 48, to: 64 }, 
    { from: 50, to: 66 }, { from: 52, to: 68 },
    
    // Ring 5 connections (outer edge)
    { from: 56, to: 57 }, { from: 57, to: 58 }, { from: 58, to: 59 }, 
    { from: 59, to: 60 }, { from: 60, to: 61 }, { from: 61, to: 62 }, 
    { from: 62, to: 63 }, { from: 63, to: 64 }, { from: 64, to: 65 }, 
    { from: 65, to: 66 }, { from: 66, to: 67 }, { from: 67, to: 68 }, 
    { from: 68, to: 69 }, { from: 69, to: 56 },
  ];

  // Helper function to get node by id
  const getNode = (id: number) => nodes.find(node => node.id === id);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Connection Lines - More subtle for denser network */}
        <g className="opacity-15">
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
                animate={{ pathLength: 1, opacity: 0.4 }}
                transition={{ 
                  duration: 4, 
                  delay: index * 0.03,
                  ease: "easeInOut"
                }}
              />
            );
          })}
        </g>

        {/* Network Nodes - Smaller for denser appearance */}
        <g>
          {nodes.map((node, index) => (
            <motion.circle
              key={`node-${node.id}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="1.2"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.1, 1], 
                opacity: [0, 0.7, 0.5] 
              }}
              transition={{ 
                duration: 2.5, 
                delay: index * 0.04,
                repeat: Infinity,
                repeatDelay: 18,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Pulsing Network Hubs - Key intersection points */}
        <g className="opacity-12">
          {[1, 16, 32, 44, 60, 66].map((nodeId, index) => {
            const node = getNode(nodeId);
            if (!node) return null;
            
            return (
              <motion.circle
                key={`hub-${nodeId}`}
                cx={`${node.x}%`}
                cy={`${node.y}%`}
                r="25"
                fill="none"
                stroke="white"
                strokeWidth="1"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: [1, 1.8, 1], 
                  opacity: [0, 0.2, 0] 
                }}
                transition={{ 
                  duration: 8, 
                  delay: 5 + index * 2.5,
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
              />
            );
          })}
        </g>

        {/* Data Flow Animation - Along main pathways */}
        <g className="opacity-25">
          {connections.slice(0, 12).map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.circle
                key={`flow-${index}`}
                r="1"
                fill="white"
                initial={{ 
                  cx: `${fromNode.x}%`, 
                  cy: `${fromNode.y}%`,
                  opacity: 0 
                }}
                animate={{ 
                  cx: `${toNode.x}%`, 
                  cy: `${toNode.y}%`,
                  opacity: [0, 0.5, 0] 
                }}
                transition={{ 
                  duration: 6, 
                  delay: 8 + index * 0.8,
                  repeat: Infinity,
                  repeatDelay: 15,
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