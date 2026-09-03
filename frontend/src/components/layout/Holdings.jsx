import React from 'react';
import HoldingsTable from '../portfolio/HoldingsTable';
import PerformanceMetrics from '../portfolio/PerformanceMetrics';
import PortfolioChart from '../portfolio/PortfolioChart';

const Holdings = ({ portfolio, balance }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <PerformanceMetrics holdings={portfolio} balance={balance} />
            <PortfolioChart portfolio={portfolio} balance={balance} />
            <HoldingsTable holdings={portfolio} />
        </div>
    );
};

export default Holdings;