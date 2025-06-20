import React from 'react';
import { motion } from 'framer-motion';

const BackgroundPattern: React.FC = () => {
  // Globe parameters
  const centerX = 25;
  const centerY = 75;
  const radius = 35;

  // Generate nodes organically distributed within circular boundary
  const generateNodesInCircle = () => {
    const nodes = [];
    let id = 1;

    // Center node
    nodes.push({ id: id++, x: centerX, y: centerY });

    // Generate nodes in concentric layers with organic distribution
    for (let layer = 1; layer <= 6; layer++) {
      const layerRadius = (radius * layer) / 6;
      const nodesInLayer = Math.floor(6 + layer * 3); // Increasing density outward
      
      for (let i = 0; i < nodesInLayer; i++) {
        // Add some randomness for organic feel
        const angle = (i / nodesInLayer) * 2 * Math.PI + (Math.random() - 0.5) * 0.3;
        const nodeRadius = layerRadius * (0.7 + Math.random() * 0.6); // Vary distance from center
        
        const x = centerX + Math.cos(angle) * nodeRadius;
        const y = centerY + Math.sin(angle) * nodeRadius;
        
        // Ensure node is within circle boundary
        const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        if (distanceFromCenter <= radius - 2) {
          nodes.push({ id: id++, x, y });
        }
      }
    }

    return nodes;
  };

  const nodes = generateNodesInCircle();

  // Generate connections based on proximity (dense network)
  const generateConnections = () => {
    const connections = [];
    const maxDistance = 8; // Maximum distance for connections

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
          className="opacity-20"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.2 }}
          transition={{ duration: 3, ease: "easeOut" }}
        />

        {/* Connection Lines - Dense network */}
        <g className="opacity-12">
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
                strokeWidth="0.8"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.3 }}
                transition={{ 
                  duration: 5, 
                  delay: index * 0.01,
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
              r="1"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1.2, 1], 
                opacity: [0, 0.8, 0.6] 
              }}
              transition={{ 
                duration: 3, 
                delay: index * 0.02,
                repeat: Infinity,
                repeatDelay: 20,
                ease: "easeOut" 
              }}
            />
          ))}
        </g>

        {/* Planetary atmosphere glow */}
        <motion.circle
          cx={`${centerX}%`}
          cy={`${centerY}%`}
          r={`${radius + 5}%`}
          fill="none"
          stroke="white"
          strokeWidth="2"
          className="opacity-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ 
            scale: [0.8, 1.1, 0.8], 
            opacity: [0, 0.1, 0] 
          }}
          transition={{ 
            duration: 8, 
            delay: 3,
            repeat: Infinity,
            ease: "easeInOut" 
          }}
        />

        {/* Pulsing Network Hubs - Major nodes */}
        <g className="opacity-10">
          {nodes.filter((_, index) => index % 12 === 0).map((node, index) => (
            <motion.circle
              key={`hub-${node.id}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="20"
              fill="none"
              stroke="white"
              strokeWidth="1"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [1, 2.5, 1], 
                opacity: [0, 0.15, 0] 
              }}
              transition={{ 
                duration: 10, 
                delay: 6 + index * 3,
                repeat: Infinity,
                ease: "easeInOut" 
              }}
            />
          ))}
        </g>

        {/* Data Flow Animation - Organic pathways */}
        <g className="opacity-20">
          {connections.slice(0, 15).map((connection, index) => {
            const fromNode = getNode(connection.from);
            const toNode = getNode(connection.to);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <motion.circle
                key={`flow-${index}`}
                r="0.8"
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
                  duration: 8, 
                  delay: 10 + index * 1.2,
                  repeat: Infinity,
                  repeatDelay: 18,
                  ease: "easeInOut" 
                }}
              />
            );
          })}
        </g>

        {/* Continental network clusters (denser areas) */}
        <g className="opacity-8">
          {[
            { x: centerX - 8, y: centerY - 10 },
            { x: centerX + 12, y: centerY + 8 },
            { x: centerX - 15, y: centerY + 12 },
          ].map((cluster, index) => (
            <motion.circle
              key={`cluster-${index}`}
              cx={`${cluster.x}%`}
              cy={`${cluster.y}%`}
              r="12"
              fill="white"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1, 0.8], 
                opacity: [0, 0.05, 0.03] 
              }}
              transition={{ 
                duration: 6, 
                delay: 8 + index * 2,
                repeat: Infinity,
                repeatDelay: 25,
                ease: "easeInOut" 
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default BackgroundPattern; 