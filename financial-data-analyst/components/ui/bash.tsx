"use client";

import React from 'react';

interface BashProps {
  children: string;
  className?: string;
}

export const Bash: React.FC<BashProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-black text-white font-mono text-sm p-4 rounded-md overflow-x-auto ${className}`}>
      <pre className="whitespace-pre-wrap">{children}</pre>
    </div>
  );
};