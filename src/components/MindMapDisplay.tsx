import React, { useMemo, useCallback, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion } from 'framer-motion';

// Custom Node Component
const CustomNode = ({ data, selected }: any) => {
  const { label, description, category, color } = data;
  
  const getNodeStyle = () => {
    const baseStyle = {
      padding: '8px 12px',
      borderRadius: '20px',
      border: '2px solid',
      fontSize: '12px',
      fontWeight: '500',
      color: '#ffffff',
      textAlign: 'center' as const,
      minWidth: '80px',
      maxWidth: '150px',
      wordWrap: 'break-word' as const,
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    };

    switch (category) {
      case 'center':
        return {
          ...baseStyle,
          backgroundColor: color || '#EC4899',
          borderColor: selected ? '#F9A8D4' : (color || '#EC4899'),
          fontSize: '14px',
          fontWeight: '600',
          minWidth: '120px',
          padding: '12px 16px',
          transform: selected ? 'scale(1.05)' : 'scale(1)',
        };
      case 'primary':
        return {
          ...baseStyle,
          backgroundColor: color || '#3B82F6',
          borderColor: selected ? '#93C5FD' : (color || '#3B82F6'),
          fontSize: '13px',
          minWidth: '100px',
          transform: selected ? 'scale(1.03)' : 'scale(1)',
        };
      case 'secondary':
        return {
          ...baseStyle,
          backgroundColor: color || '#10B981',
          borderColor: selected ? '#6EE7B7' : (color || '#10B981'),
          fontSize: '12px',
          minWidth: '90px',
          transform: selected ? 'scale(1.02)' : 'scale(1)',
        };
      default:
        return {
          ...baseStyle,
          backgroundColor: color || '#6B7280',
          borderColor: selected ? '#9CA3AF' : (color || '#6B7280'),
        };
    }
  };

  return (
    <motion.div
      style={getNodeStyle()}
      whileHover={{ scale: 1.02 }}
      title={description}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#555', border: '2px solid #fff' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555', border: '2px solid #fff' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#555', border: '2px solid #fff' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#555', border: '2px solid #fff' }} />
      
      <div>{label}</div>
      {description && (
        <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>
          {description.length > 30 ? `${description.substring(0, 30)}...` : description}
        </div>
      )}
    </motion.div>
  );
};

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

export interface MindMapData {
  title: string;
  description?: string;
  center_node: {
    id: string;
    label: string;
    description?: string;
  };
  branches: Array<{
    id: string;
    label: string;
    description?: string;
    color?: string;
    children?: Array<{
      id: string;
      label: string;
      description?: string;
    }>;
  }>;
}

interface MindMapDisplayProps {
  data: MindMapData;
}

const MindMapDisplay: React.FC<MindMapDisplayProps> = ({ data }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Generate nodes and edges from the mind map data
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Center node
    nodes.push({
      id: data.center_node.id,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: data.center_node.label,
        description: data.center_node.description,
        category: 'center',
        color: '#EC4899',
      },
    });

    // Calculate positions for branches in a circle around center
    const centerX = 0;
    const centerY = 0;
    const radius = 250;
    const angleStep = (2 * Math.PI) / data.branches.length;

    data.branches.forEach((branch, branchIndex) => {
      const angle = branchIndex * angleStep;
      const branchX = centerX + Math.cos(angle) * radius;
      const branchY = centerY + Math.sin(angle) * radius;

      // Branch node
      nodes.push({
        id: branch.id,
        type: 'custom',
        position: { x: branchX, y: branchY },
        data: {
          label: branch.label,
          description: branch.description,
          category: 'primary',
          color: branch.color || '#3B82F6',
        },
      });

      // Edge from center to branch
      edges.push({
        id: `${data.center_node.id}-${branch.id}`,
        source: data.center_node.id,
        target: branch.id,
        type: 'smoothstep',
        style: {
          stroke: branch.color || '#3B82F6',
          strokeWidth: 2,
          opacity: 0.8,
        },
        animated: true,
      });

      // Children nodes
      if (branch.children && branch.children.length > 0) {
        const childRadius = 120;
        const childAngleStep = (Math.PI * 0.8) / Math.max(branch.children.length - 1, 1);
        const baseChildAngle = angle - (Math.PI * 0.4);

        branch.children.forEach((child, childIndex) => {
          const childAngle = baseChildAngle + childIndex * childAngleStep;
          const childX = branchX + Math.cos(childAngle) * childRadius;
          const childY = branchY + Math.sin(childAngle) * childRadius;

          // Child node
          nodes.push({
            id: child.id,
            type: 'custom',
            position: { x: childX, y: childY },
            data: {
              label: child.label,
              description: child.description,
              category: 'secondary',
              color: '#10B981',
            },
          });

          // Edge from branch to child
          edges.push({
            id: `${branch.id}-${child.id}`,
            source: branch.id,
            target: child.id,
            type: 'smoothstep',
            style: {
              stroke: '#10B981',
              strokeWidth: 1.5,
              opacity: 0.7,
            },
          });
        });
      }
    });

    return { nodes, edges };
  }, [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(selectedNode === node.id ? null : node.id);
  }, [selectedNode]);

  return (
    <div className="w-full h-[600px] bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">{data.title}</h3>
        {data.description && (
          <p className="text-sm text-gray-300 mt-1">{data.description}</p>
        )}
      </div>

      {/* Mind Map */}
      <div className="h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          className="bg-gray-900"
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={20} 
            size={1} 
            color="#374151"
          />
          
          <Controls 
            className="bg-gray-800 border border-gray-600"
          />
          
          <MiniMap 
            className="bg-gray-800 border border-gray-600"
            nodeColor={(node) => {
              switch (node.data?.category) {
                case 'center': return '#EC4899';
                case 'primary': return node.data?.color || '#3B82F6';
                case 'secondary': return '#10B981';
                default: return '#6B7280';
              }
            }}
            nodeStrokeWidth={2}
            pannable={true}
            zoomable={true}
          />
        </ReactFlow>
      </div>

      {/* Node Info Panel */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 bg-gray-800 border border-gray-600 rounded-lg p-4 max-w-xs">
          {(() => {
            const node = nodes.find(n => n.id === selectedNode);
            if (!node) return null;
            
            return (
              <div>
                <h4 className="text-white font-medium mb-2">{node.data.label}</h4>
                {node.data.description && (
                  <p className="text-gray-300 text-sm">{node.data.description}</p>
                )}
                <div className="mt-2 text-xs text-gray-400">
                  Category: {node.data.category}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default MindMapDisplay; 