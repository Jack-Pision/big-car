import React from 'react';

const BackgroundPattern: React.FC = () => {
  // Generate globe nodes in concentric circles - larger globe (radius 200px)
  const generateGlobeNodes = () => {
    const nodes = [];
    const centerX = 25; // 25% from left
    const centerY = 75; // 75% from top (bottom area)
    const baseRadius = 12; // Increased base radius for larger globe
    
    // Center node
    nodes.push({ id: 0, x: centerX, y: centerY });
    
    // Inner ring - 6 nodes
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60) * Math.PI / 180;
      const x = centerX + Math.cos(angle) * baseRadius * 0.4;
      const y = centerY + Math.sin(angle) * baseRadius * 0.4;
      nodes.push({ id: i + 1, x, y });
    }
    
    // Middle ring - 8 nodes
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45) * Math.PI / 180;
      const x = centerX + Math.cos(angle) * baseRadius * 0.7;
      const y = centerY + Math.sin(angle) * baseRadius * 0.7;
      nodes.push({ id: i + 7, x, y });
    }
    
    // Outer ring - 8 nodes (reduced from 10)
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45 + 22.5) * Math.PI / 180; // Offset by 22.5 degrees
      const x = centerX + Math.cos(angle) * baseRadius;
      const y = centerY + Math.sin(angle) * baseRadius;
      nodes.push({ id: i + 15, x, y });
    }
    
    return nodes;
  };

  const nodes = generateGlobeNodes();

  // Generate connections for globe structure - fewer connections
  const connections = [
    // Center to inner ring
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
    
    // Inner ring connections (selective)
    [1, 2], [3, 4], [5, 6],
    
    // Inner to middle ring
    [1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 12], [1, 13], [4, 14],
    
    // Middle ring connections (selective)
    [7, 8], [9, 10], [11, 12], [13, 14],
    
    // Middle to outer ring
    [7, 15], [8, 16], [9, 17], [10, 18], [11, 19], [12, 20], [13, 21], [14, 22],
    
    // Outer ring connections (selective for clean look)
    [15, 16], [17, 18], [19, 20], [21, 22],
    
    // Some cross connections for network feel
    [2, 9], [4, 11], [6, 13], [8, 19], [10, 21]
  ];

  // Hub nodes (key network points) - reduced count
  const hubNodes = [0, 3, 7, 15];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Gradient for data flow particles */}
          <linearGradient id="dataFlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.8" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Connection lines */}
        {connections.map(([start, end], index) => {
          const startNode = nodes[start];
          const endNode = nodes[end];
          
          return (
            <g key={`connection-${index}`}>
              {/* Base line */}
              <line
                x1={startNode.x}
                y1={startNode.y}
                x2={endNode.x}
                y2={endNode.y}
                stroke="white"
                strokeWidth="0.08"
                opacity="0.15"
              />
              
              {/* Animated line */}
              <line
                x1={startNode.x}
                y1={startNode.y}
                x2={endNode.x}
                y2={endNode.y}
                stroke="white"
                strokeWidth="0.12"
                opacity="0"
                pathLength="1"
              >
                <animate
                  attributeName="opacity"
                  values="0;0.6;0"
                  dur="4s"
                  begin={`${index * 0.3}s`}
                  repeatCount="indefinite"
                />
              </line>
            </g>
          );
        })}

        {/* Data flow particles - reduced count */}
        {Array.from({ length: 5 }, (_, i) => {
          const connectionIndex = Math.floor(i * connections.length / 5);
          const [start, end] = connections[connectionIndex];
          const startNode = nodes[start];
          const endNode = nodes[end];
          
          return (
            <circle
              key={`particle-${i}`}
              r="0.15"
              fill="url(#dataFlow)"
              opacity="0.7"
            >
              <animateMotion
                dur="3s"
                begin={`${i * 0.6}s`}
                repeatCount="indefinite"
                path={`M ${startNode.x} ${startNode.y} L ${endNode.x} ${endNode.y}`}
              />
            </circle>
          );
        })}

        {/* Network nodes */}
        {nodes.map((node, index) => (
          <circle
            key={`node-${index}`}
            cx={node.x}
            cy={node.y}
            r="0.8"
            fill="white"
            opacity="0.5"
          >
            <animate
              attributeName="opacity"
              values="0.5;0.8;0.5"
              dur="3s"
              begin={`${index * 0.2}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Hub indicators - reduced count */}
        {hubNodes.map((nodeIndex, i) => {
          const node = nodes[nodeIndex];
          return (
            <circle
              key={`hub-${i}`}
              cx={node.x}
              cy={node.y}
              r="1.5"
              fill="none"
              stroke="white"
              strokeWidth="0.08"
              opacity="0"
            >
              <animate
                attributeName="opacity"
                values="0;0.4;0"
                dur="2s"
                begin={`${i * 1}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="r"
                values="1.5;2.5;1.5"
                dur="2s"
                begin={`${i * 1}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </svg>
    </div>
  );
};

export default BackgroundPattern; 