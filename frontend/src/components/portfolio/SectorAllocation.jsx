import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const SectorAllocation = ({ holdings }) => {
    // Mock sector data - in production, fetch from API
    const sectors = [
        { name: 'IT', value: 0, color: '#4CAF50' },
        { name: 'Finance', value: 0, color: '#FFC107' },
        { name: 'Pharma', value: 0, color: '#2196F3' },
        { name: 'Energy', value: 0, color: '#FF5722' },
        { name: 'FMCG', value: 0, color: '#9C27B0' },
        { name: 'Others', value: 0, color: '#9E9E9E' }
    ];

    // Distribute holdings across sectors (simplified mock)
    const totalValue = holdings.reduce((sum, item) => sum + item.current_value, 0);
    if (totalValue > 0) {
        holdings.forEach((item, index) => {
            const sectorIndex = index % sectors.length;
            const percentage = (item.current_value / totalValue) * 100;
            sectors[sectorIndex].value += percentage;
        });
    }

    return (
        <div style={{
            background: '#141b2b',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid #2a3a5c',
            marginTop: '20px'
        }}>
            <h3 style={{ marginBottom: '15px', color: '#e0e6ed' }}>📊 Sector Allocation</h3>
            
            <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={sectors}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, value }) => `${name} ${value.toFixed(1)}%`}
                            labelLine={false}
                        >
                            {sectors.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default SectorAllocation;