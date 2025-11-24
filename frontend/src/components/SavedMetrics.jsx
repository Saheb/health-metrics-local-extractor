import React, { useEffect, useState } from 'react';

const SavedMetrics = () => {
    const [metrics, setMetrics] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8000/metrics')
            .then(res => res.json())
            .then(data => {
                setMetrics(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setIsLoading(false);
            });
    }, []);

    if (isLoading) return <div>Loading saved metrics...</div>;

    return (
        <div className="results-container">
            <h2>Saved Health Database</h2>
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
                        {metrics.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center' }}>No saved data yet.</td></tr>
                        ) : (
                            metrics.map((item) => (
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
