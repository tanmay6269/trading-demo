import React from 'react';
import Watchlist from '../dashboard/Watchlist';
import WatchlistNews from '../dashboard/WatchlistNews';

const WatchlistPage = ({ onSelectStock }) => {
    return (
        <div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '20px', fontSize: '20px', fontWeight: '800' }}>My Watchlist</h3>
            <Watchlist onSelectStock={onSelectStock} />
            <WatchlistNews onSelectStock={onSelectStock} />
        </div>
    );
};

export default WatchlistPage;