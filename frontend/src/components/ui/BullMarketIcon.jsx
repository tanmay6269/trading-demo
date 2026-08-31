import React from 'react';

const BullMarketIcon = ({ size = 36, style = {} }) => {
    return (
        <div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-surface)',
            flexShrink: 0,
            ...style
        }}>
            <img 
                src="/bull_logo.jpg" 
                alt="BullX Logo" 
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }} 
            />
        </div>
    );
};

export default BullMarketIcon;
