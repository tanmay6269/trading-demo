import React from 'react';

const BullMarketIcon = ({ size = 42, style = {} }) => {
    return (
        <div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0d192b 0%, #1e2c45 100%)',
            border: '1.5px solid rgba(0, 208, 156, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: '0 4px 16px rgba(0, 208, 156, 0.25)',
            overflow: 'hidden',
            flexShrink: 0,
            ...style
        }}>
            <svg 
                width={size * 0.85} 
                height={size * 0.85} 
                viewBox="0 0 100 100" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Glow Filter */}
                <defs>
                    <linearGradient id="lineGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00d09c" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="bullGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#00d09c" floodOpacity="0.8"/>
                    </filter>
                </defs>

                {/* Charging Bull Silhouette / Horns & Head */}
                <g transform="translate(14, 18) scale(0.72)">
                    {/* Left Horn */}
                    <path d="M22 28 C 14 18, 12 6, 26 10 C 22 16, 24 22, 28 26 Z" fill="url(#bullGrad)" />
                    {/* Right Horn */}
                    <path d="M78 28 C 86 18, 88 6, 74 10 C 78 16, 76 22, 72 26 Z" fill="url(#bullGrad)" />
                    {/* Bull Crown & Snout */}
                    <path d="M25 32 L75 32 L68 52 L50 68 L32 52 Z" fill="url(#bullGrad)" />
                    {/* Nostrils & Muscular Forehead Accent */}
                    <circle cx="42" cy="58" r="2.5" fill="#0d192b" />
                    <circle cx="58" cy="58" r="2.5" fill="#0d192b" />
                    <path d="M38 38 L50 48 L62 38" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.3" />
                </g>

                {/* Green Stock Market Breakout Trend Line Crossing Over the Bull */}
                <path 
                    d="M 8 78 L 32 58 L 48 66 L 90 20" 
                    stroke="url(#lineGrad)" 
                    strokeWidth="5.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    filter="url(#neonGlow)"
                />

                {/* Upward Stock Market Arrow Head */}
                <path 
                    d="M 70 20 L 91 20 L 91 41" 
                    stroke="#00d09c" 
                    strokeWidth="5.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    filter="url(#neonGlow)"
                />

                {/* Live Bull Market Pulse Glow Dot */}
                <circle cx="91" cy="20" r="4" fill="#ffffff" filter="url(#neonGlow)" />
            </svg>
        </div>
    );
};

export default BullMarketIcon;
