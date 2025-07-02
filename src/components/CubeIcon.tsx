import React from 'react';

interface CubeIconProps {
  size?: number;
  className?: string;
  isActive?: boolean;
}

const CubeIcon: React.FC<CubeIconProps> = ({ size = 24, className = '', isActive = false }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="cubeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isActive ? "#06b6d4" : "#6b7280"} />
          <stop offset="100%" stopColor={isActive ? "#0891b2" : "#4b5563"} />
        </linearGradient>
      </defs>
      
      {/* Front face */}
      <path
        d="M12 2L20 7V17L12 22L4 17V7L12 2Z"
        fill="url(#cubeGradient)"
        stroke={isActive ? "#06b6d4" : "#6b7280"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      
      {/* Top face */}
      <path
        d="M12 2L20 7L12 12L4 7L12 2Z"
        fill={isActive ? "#22d3ee" : "#9ca3af"}
        stroke={isActive ? "#06b6d4" : "#6b7280"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      
      {/* Right face */}
      <path
        d="M12 12L20 7V17L12 22V12Z"
        fill={isActive ? "#0891b2" : "#6b7280"}
        stroke={isActive ? "#06b6d4" : "#6b7280"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      
      {/* Internal lines for 3D effect */}
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="12"
        stroke={isActive ? "#06b6d4" : "#6b7280"}
        strokeWidth="1.5"
      />
      <line
        x1="4"
        y1="7"
        x2="12"
        y2="12"
        stroke={isActive ? "#06b6d4" : "#6b7280"}
        strokeWidth="1.5"
      />
      <line
        x1="20"
        y1="7"
        x2="12"
        y2="12"
        stroke={isActive ? "#06b6d4" : "#6b7280"}
        strokeWidth="1.5"
      />
      
      {isActive && (
        <circle
          cx="12"
          cy="12"
          r="2"
          fill="#06b6d4"
          className="animate-pulse"
        />
      )}
    </svg>
  );
};

export default CubeIcon; 