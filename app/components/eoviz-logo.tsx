import React from 'react';
import Link from 'next/link';

export default function EoVizLogoColor() {
  return (
    <Link href="https://eoviz.com" className="flex items-center space-x-2 text-decoration-none">
      <div style={{ 
        backgroundColor: '#2563eb', 
        color: 'white', 
        padding: '6px 10px', 
        borderRadius: '6px',
        fontWeight: '600',
        fontSize: '16px'
      }}>
        eoViz
      </div>
      <span style={{ 
        fontSize: '14px', 
        color: '#64748b',
        fontWeight: '500'
      }}>
        Workshop
      </span>
    </Link>
  );
}