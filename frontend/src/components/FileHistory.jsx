import React, { useEffect, useState } from 'react';

const FileHistory = () => {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = () => {
        fetch('http://localhost:8000/history')
            .then(res => res.json())
            .then(data => {
                setHistory(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setIsLoading(false);
            });
    };

    if (isLoading) return <div>Loading file history...</div>;

    return (
        <div className="results-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2>File Processing History</h2>
                <button
                    onClick={fetchHistory}
                    className="upload-btn"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                >
                    Refresh
                </button>
            </div>
            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Filename</th>
                            <th>Upload Date</th>
                            <th>Report Date</th>
                            <th>Status</th>
                            <th>Data Points Extracted</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length === 0 ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center' }}>No files processed yet.</td></tr>
                        ) : (
                            history.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.filename}</td>
                                    <td>{new Date(item.upload_date).toLocaleString()}</td>
                                    <td>{item.report_date || '-'}</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.85rem',
                                            fontWeight: '500',
                                            backgroundColor: item.status === 'Success' ? '#dcfce7' : '#fee2e2',
                                            color: item.status === 'Success' ? '#166534' : '#991b1b'
                                        }}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{item.data_points_extracted}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FileHistory;
