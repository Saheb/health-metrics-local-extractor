import React, { useEffect, useState } from 'react';

const SavedMetrics = () => {
    const [metrics, setMetrics] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState('All');
    const [availableYears, setAvailableYears] = useState([]);

    useEffect(() => {
        fetch('http://localhost:8000/metrics')
            .then(res => res.json())
            .then(data => {
                setMetrics(data);

                // Extract unique years
                const years = new Set();
                data.forEach(item => {
                    if (item.report_date) {
                        const year = item.report_date.substring(0, 4); // Assuming YYYY-MM-DD
                        if (!isNaN(year)) {
                            years.add(year);
                        }
                    }
                });
                setAvailableYears(Array.from(years).sort().reverse());

                setIsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setIsLoading(false);
            });
    }, []);

    const filteredMetrics = selectedYear === 'All'
        ? metrics
        : metrics.filter(item => item.report_date && item.report_date.startsWith(selectedYear));

    if (isLoading) return <div>Loading saved metrics...</div>;

    return (
        <div className="results-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2>Saved Health Database</h2>
                <div>
                    <label style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>Filter by Year:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #ccc' }}
                    >
                        <option value="All">All Years</option>
                        {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Test Name</th>
                            <th>Value</th>
                            <th>Unit</th>
                            <th>Reference Range</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMetrics.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center' }}>No saved data found for this selection.</td></tr>
                        ) : (
                            filteredMetrics.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.report_date || "-"}</td>
                                    <td>{item.test_name || "-"}</td>
                                    <td className="value-cell">{item.value || "-"}</td>
                                    <td>{item.unit || "-"}</td>
                                    <td>{item.reference_range || "-"}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SavedMetrics;
