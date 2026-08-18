import React, { useState, useEffect } from 'react';

const MarketSummary = () => {
    const [indices, setIndices] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchIndices();
        const interval = setInterval(fetchIndices, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchIndices = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/index-data');
            const data = await response.json();
            setIndices(data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching indices:', error);
            setLoading(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '10px', color: '#8a9bb5' }}>Loading market data...</div>;
    }

    return (
        <div style={{
            display: 'flex',
            gap: '40px',
            padding: '15px 20px',
            background: '#141b2b',
            borderRadius: '10px',
            border: '1px solid #2a3a5c',
            marginBottom: '20px',
            flexWrap: 'wrap'
        }}>
            {Object.entries(indices).map(([name, data]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div>
                        <div style={{ fontSize: '12px', color: '#8a9bb5' }}>{name}</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                            {data.value ? data.value.toFixed(2) : 'N/A'}
                        </div>
                    </div>
                    <div style={{
                        color: data.change && data.change >= 0 ? '#4CAF50' : '#dc3545',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}>
                        {data.change && data.change >= 0 ? '+' : ''}{data.change ? data.change.toFixed(2) : '0'}
                        <br />
                        <span style={{ fontSize: '12px' }}>
                            ({data.change_percent ? data.change_percent.toFixed(2) : '0'}%)
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default MarketSummary;