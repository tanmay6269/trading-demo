import React from 'react';
import Watchlist from '../dashboard/Watchlist';

const WatchlistPage = ({ onSelectStock }) => {
    return (
        <div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '20px', fontWeight: '800' }}>My Watchlist</h3>
            <Watchlist onSelectStock={onSelectStock} />
        </div>
    );
};

export default WatchlistPage;