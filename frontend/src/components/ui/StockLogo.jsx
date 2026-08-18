import React, { useState, useEffect } from 'react';

const StockLogo = ({ symbol, name, size = 40, style = {} }) => {
    const [logoState, setLogoState] = useState('webp'); // 'webp' -> 'png' -> 'fallback'
    
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '').replace('.BO', '');

    useEffect(() => {
        setLogoState('webp');
    }, [symbol]);

    const getInitial = () => {
        if (name && name.trim()) return name.trim().charAt(0).toUpperCase();
        if (cleanSymbol) return cleanSymbol.charAt(0).toUpperCase();
        return '?';
    };

    const getRandomGradient = (str) => {
        const gradients = [
            'linear-gradient(135deg, #00d09c 0%, #0284c7 100%)',
            'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
            'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
            'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)'
        ];
        let hash = 0;
        for (let i = 0; i < (str || '').length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % gradients.length;
        return gradients[index];
    };

    if (logoState === 'fallback' || !cleanSymbol) {
        return (
            <div
                className="stock-logo-fallback"
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    borderRadius: '10px',
                    background: getRandomGradient(cleanSymbol),
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '800',
                    fontSize: `${Math.max(12, Math.round(size * 0.42))}px`,
                    flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                    userSelect: 'none',
                    ...style
                }}
            >
                {getInitial()}
            </div>
        );
    }

    const currentUrl = logoState === 'webp' 
        ? `https://assets-netstorage.groww.in/stock-assets/logos2/${cleanSymbol}.webp`
        : `https://assets-netstorage.groww.in/stock-assets/logos/${cleanSymbol}.png`;

    const handleError = () => {
        if (logoState === 'webp') {
            setLogoState('png');
        } else {
            setLogoState('fallback');
        }
    };

    return (
        <div
            style={{
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '10px',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${Math.max(2, Math.round(size * 0.08))}px`,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                flexShrink: 0,
                overflow: 'hidden',
                ...style
            }}
        >
            <img
                src={currentUrl}
                alt={name || symbol}
                onError={handleError}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    borderRadius: '6px'
                }}
            />
        </div>
    );
};

export default StockLogo;
