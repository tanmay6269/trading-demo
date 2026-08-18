import React from 'react';
import Watchlist from '../dashboard/Watchlist';

const WatchlistPage = ({ onSelectStock }) => {
    return (
        <div>
            <h3 style={{ color: '#e0e6ed', marginBottom: '20px' }}>⭐ My Watchlist</h3>
            <Watchlist onSelectStock={onSelectStock} />
        </div>
    );
};

export default WatchlistPage;