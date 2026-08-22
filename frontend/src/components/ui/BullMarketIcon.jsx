import React from 'react';

const BullMarketIcon = ({ size = 36, style = {} }) => {
    return (
        <div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid #6C5CE7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#14161d',
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
