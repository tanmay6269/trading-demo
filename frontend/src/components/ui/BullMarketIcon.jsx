import React from 'react';

const BullMarketIcon = ({ size = 84, style = {} }) => {
    return (
        <div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2.5px solid #00d09c',
            boxShadow: '0 0 22px rgba(0, 208, 156, 0.5), 0 6px 18px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0f1d',
            flexShrink: 0,
            transition: 'transform 0.2s ease, boxShadow 0.2s ease',
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
