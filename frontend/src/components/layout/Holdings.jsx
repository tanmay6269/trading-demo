import React from 'react';
import HoldingsTable from '../portfolio/HoldingsTable';
import PerformanceMetrics from '../portfolio/PerformanceMetrics';

const Holdings = ({ portfolio, balance }) => {
    return (
        <div>
            <PerformanceMetrics holdings={portfolio} balance={balance} />
            <HoldingsTable holdings={portfolio} />
        </div>
    );
};

export default Holdings;