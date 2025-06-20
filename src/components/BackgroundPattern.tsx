import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Globe parameters - positioned as planet Earth in center-bottom
  const centerX = 50; // Center horizontally
  const centerY = 85; // Bottom area (85% down from top)
  const radius = 25; // Smaller radius to fit better in bottom area

  // Generate strategic nodes positioned strictly within circle boundary
  const generateNodesInCircle = () => {
    const nodes = [];
    let id = 1;

    // Center node
    nodes.push({ id: id++, x: centerX, y: centerY });

    // Ring 1: Inner ring (6 nodes)
    const innerRadius = radius * 0.3;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * 2 * Math.PI;
      const x = centerX + Math.cos(angle) * innerRadius;
      const y = centerY + Math.sin(angle) * innerRadius;
      nodes.push({ id: id++, x, y });
    }

    // Ring 2: Middle ring (10 nodes)
    const middleRadius = radius * 0.6;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * 2 * Math.PI + Math.PI / 10; // Offset for better distribution
      const x = centerX + Math.cos(angle) * middleRadius;
      const y = centerY + Math.sin(angle) * middleRadius;
      nodes.push({ id: id++, x, y });
    }

    // Ring 3: Outer ring (16 nodes) - ensuring they stay well within boundary
    const outerRadius = radius * 0.85; // 85% of radius to ensure inside circle
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * 2 * Math.PI;
      const x = centerX + Math.cos(angle) * outerRadius;
      const y = centerY + Math.sin(angle) * outerRadius;
      nodes.push({ id: id++, x, y });
    }

    // Verify all nodes are within boundary
    return nodes.filter(node => {
      const distance = Math.sqrt(Math.pow(node.x - centerX, 2) + Math.pow(node.y - centerY, 2));
      return distance <= radius - 1; // 1% safety margin
    });
  };

  const nodes = generateNodesInCircle();

  // Generate strategic connections for full coverage with longer lines
  const generateConnections = () => {
    const connections = [];

    // Connect center to inner ring
    for (let i = 1; i <= 6; i++) {
      connections.push({ from: 1, to: i + 1 });
    }

    // Connect inner ring to middle ring
    for (let i = 0; i < 6; i++) {
      const innerNodeId = i + 2;
      const middleNode1 = 7 + (i * 2) % 10;
      const middleNode2 = 7 + ((i * 2) + 1) % 10;
      connections.push({ from: innerNodeId, to: middleNode1 });
      connections.push({ from: innerNodeId, to: middleNode2 });
    }

    // Connect middle ring to outer ring
    for (let i = 0; i < 10; i++) {
      const middleNodeId = i + 7;
      const outerNode1 = 17 + Math.floor((i * 1.6)) % 16;
      const outerNode2 = 17 + Math.floor((i * 1.6) + 1) % 16;
      connections.push({ from: middleNodeId, to: outerNode1 });
      connections.push({ from: middleNodeId, to: outerNode2 });
    }

    // Connect some outer ring nodes to each other for mesh
    for (let i = 0; i < 16; i++) {
      const currentNode = 17 + i;
      const nextNode = 17 + ((i + 1) % 16);
      const skipNode = 17 + ((i + 3) % 16);
      connections.push({ from: currentNode, to: nextNode });
      if (i % 2 === 0) { // Every other node gets a longer connection
        connections.push({ from: currentNode, to: skipNode });
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
        {/* Connection Lines - subtle network connections */}
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
                strokeWidth="0.6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.4 }}
                transition={{ 
                  duration: 2.5, 
                  delay: 0.5 + index * 0.02,
                  ease: "easeInOut"
                }}
              />
            );
          })}
        </g>

        {/* Network Nodes - bigger and more visible like planet cities */}
        <g>
          {nodes.map((node, index) => (
            <motion.circle
              key={`node-${node.id}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="2" // Bigger nodes
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.2, 1], 
                opacity: [0, 1, 0.8] // More visible
              }}
              transition={{ 
                duration: 1.8, 
                delay: 0.3 + index * 0.08,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Pulsing Network Hubs - key cities on planet */}
        <g className="opacity-15">
          {[nodes[0], nodes[3], nodes[9], nodes[15]].filter(Boolean).map((node, index) => (
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
                scale: [1, 1.8, 1], 
                opacity: [0, 0.2, 0] 
              }}
              transition={{ 
                duration: 6, 
                delay: 2 + index * 2,
                repeat: Infinity,
                ease: "easeInOut" 
              }}
            />
          ))}
        </g>

        {/* Data Flow Animation - planet communication signals */}
        <g className="opacity-25">
          {connections.slice(0, 6).map((connection, index) => {
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
                  opacity: [0, 0.7, 0] 
                }}
                transition={{ 
                  duration: 4, 
                  delay: 3 + index * 1.5,
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