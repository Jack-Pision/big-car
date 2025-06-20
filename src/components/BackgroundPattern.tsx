import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Globe parameters
  const centerX = 25;
  const centerY = 75;
  const radius = 35;

  // Generate nodes densely distributed within circular boundary
  const generateNodesInCircle = () => {
    const nodes = [];
    let id = 1;
    const gridSize = 2.5; // Smaller grid for denser packing

    // Generate nodes in a grid pattern, keep only those inside circle
    for (let x = centerX - radius; x <= centerX + radius; x += gridSize) {
      for (let y = centerY - radius; y <= centerY + radius; y += gridSize) {
        const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        
        // Only include nodes inside the circle
        if (distanceFromCenter <= radius - 1) {
          // Add slight randomness for organic feel
          const randomX = x + (Math.random() - 0.5) * 1.5;
          const randomY = y + (Math.random() - 0.5) * 1.5;
          
          // Double check it's still in circle after randomness
          const finalDistance = Math.sqrt(Math.pow(randomX - centerX, 2) + Math.pow(randomY - centerY, 2));
          if (finalDistance <= radius - 1) {
            nodes.push({ id: id++, x: randomX, y: randomY });
          }
        }
      }
    }

    return nodes;
  };

  const nodes = generateNodesInCircle();

  // Generate connections based on proximity (dense network)
  const generateConnections = () => {
    const connections = [];
    const maxDistance = 6; // Connection distance

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        
        const distance = Math.sqrt(
          Math.pow(node1.x - node2.x, 2) + Math.pow(node1.y - node2.y, 2)
        );
        
        // Connect nodes that are close enough
        if (distance <= maxDistance) {
          connections.push({ from: node1.id, to: node2.id });
        }
      }
    }

    return connections;
  };

  const connections = generateConnections();

  // Helper function to get node by id
  const getNode = (id: number) => nodes.find(node => node.id === id);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Planet circular boundary */}
        <motion.circle
          cx={`${centerX}%`}
          cy={`${centerY}%`}
          r={`${radius}%`}
          fill="none"
          stroke="white"
          strokeWidth="1"
          className="opacity-25"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.25 }}
          transition={{ duration: 2, ease: "easeOut" }}
        />

        {/* Connection Lines - Dense network */}
        <g className="opacity-10">
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
                strokeWidth="0.6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.25 }}
                transition={{ 
                  duration: 4, 
                  delay: index * 0.005,
                  ease: "easeInOut"
                }}
              />
            );
          })}
        </g>

        {/* Network Nodes - Dense distribution */}
        <g>
          {nodes.map((node, index) => (
            <motion.circle
              key={`node-${node.id}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="0.8"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.1, 1], 
                opacity: [0, 0.7, 0.5] 
              }}
              transition={{ 
                duration: 2.5, 
                delay: index * 0.01,
                repeat: Infinity,
                repeatDelay: 25,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Pulsing Network Hubs - Key nodes only */}
        <g className="opacity-8">
          {nodes.filter((_, index) => index % 20 === 0).map((node, index) => (
            <motion.circle
              key={`hub-${node.id}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="15"
              fill="none"
              stroke="white"
              strokeWidth="1"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [1, 2, 1], 
                opacity: [0, 0.12, 0] 
              }}
              transition={{ 
                duration: 12, 
                delay: 5 + index * 4,
                repeat: Infinity,
                ease: "easeInOut" 
              }}
            />
          ))}
        </g>

        {/* Data Flow Animation - Clean pathways */}
        <g className="opacity-15">
          {connections.slice(0, 20).map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.circle
                key={`flow-${index}`}
                r="0.6"
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
                  repeatDelay: 20,
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