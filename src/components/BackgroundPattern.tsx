import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Define network nodes (dots) with specific positions
  const nodes = [
    { id: 1, x: 15, y: 20 },
    { id: 2, x: 35, y: 15 },
    { id: 3, x: 55, y: 25 },
    { id: 4, x: 75, y: 18 },
    { id: 5, x: 85, y: 35 },
    { id: 6, x: 25, y: 40 },
    { id: 7, x: 45, y: 35 },
    { id: 8, x: 65, y: 45 },
    { id: 9, x: 80, y: 55 },
    { id: 10, x: 10, y: 60 },
    { id: 11, x: 30, y: 65 },
    { id: 12, x: 50, y: 60 },
    { id: 13, x: 70, y: 70 },
    { id: 14, x: 90, y: 75 },
    { id: 15, x: 20, y: 85 },
    { id: 16, x: 40, y: 80 },
    { id: 17, x: 60, y: 85 },
    { id: 18, x: 80, y: 90 },
  ];

  // Define connections between nodes (from nodeId to nodeId)
  const connections = [
    // Top cluster
    { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 },
    { from: 1, to: 6 }, { from: 2, to: 7 }, { from: 3, to: 7 }, { from: 3, to: 8 },
    { from: 4, to: 8 }, { from: 5, to: 8 }, { from: 5, to: 9 },
    
    // Middle connections
    { from: 6, to: 7 }, { from: 7, to: 8 }, { from: 8, to: 9 },
    { from: 6, to: 10 }, { from: 6, to: 11 }, { from: 7, to: 11 }, { from: 7, to: 12 },
    { from: 8, to: 12 }, { from: 8, to: 13 }, { from: 9, to: 13 }, { from: 9, to: 14 },
    
    // Bottom cluster
    { from: 10, to: 11 }, { from: 11, to: 12 }, { from: 12, to: 13 }, { from: 13, to: 14 },
    { from: 10, to: 15 }, { from: 11, to: 15 }, { from: 11, to: 16 }, { from: 12, to: 16 },
    { from: 12, to: 17 }, { from: 13, to: 17 }, { from: 13, to: 18 }, { from: 14, to: 18 },
    
    // Bottom connections
    { from: 15, to: 16 }, { from: 16, to: 17 }, { from: 17, to: 18 },
    
    // Cross connections for more density
    { from: 1, to: 7 }, { from: 2, to: 8 }, { from: 3, to: 9 },
    { from: 6, to: 12 }, { from: 7, to: 13 }, { from: 8, to: 14 },
    { from: 10, to: 16 }, { from: 11, to: 17 }, { from: 12, to: 18 },
  ];

  // Helper function to get node by id
  const getNode = (id: number) => nodes.find(node => node.id === id);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Connection Lines */}
        <g className="opacity-30">
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
                animate={{ pathLength: 1, opacity: 0.6 }}
                transition={{ 
                  duration: 2, 
                  delay: index * 0.1,
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
              r="3"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.3, 1], 
                opacity: [0, 1, 0.8] 
              }}
              transition={{ 
                duration: 1.5, 
                delay: index * 0.15,
                repeat: Infinity,
                repeatDelay: 8,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Pulsing Network Hubs (key nodes) */}
        <g className="opacity-20">
          {[7, 12, 8, 11].map((nodeId, index) => {
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
                  opacity: [0, 0.3, 0] 
                }}
                transition={{ 
                  duration: 4, 
                  delay: 2 + index * 1.5,
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
              />
            );
          })}
        </g>

        {/* Data Flow Animation */}
        <g className="opacity-40">
          {connections.slice(0, 8).map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.circle
                key={`flow-${index}`}
                r="2"
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
                  delay: 3 + index * 0.5,
                  repeat: Infinity,
                  repeatDelay: 6,
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