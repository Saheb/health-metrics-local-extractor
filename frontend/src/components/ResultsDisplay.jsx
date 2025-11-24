import React from 'react';

const ResultsDisplay = ({ data, onSave }) => {
    if (!data) return null;

    const handleManualSave = (item) => {
        onSave(item);
        alert("Saved!");
    };

    return (
        <div className="results-container">
            <h2>Extracted Health Parameters</h2>
            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Test Name</th>
                            <th>Value</th>
                            <th>Unit</th>
                            <th>Reference Range</th>
                            <th>Date</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item, index) => (
                            <tr key={index}>
                                <td>{item.test_name || "-"}</td>
                                <td className="value-cell">{typeof item.value === 'object' ? JSON.stringify(item.value) : (item.value || "-")}</td>
                                <td>{item.unit || "-"}</td>
                                <td>{typeof item.reference_range === 'object' ? JSON.stringify(item.reference_range) : (item.reference_range || "-")}</td>
                                <td>{item.report_date || "-"}</td>
                                <td>
                                    <button onClick={() => handleManualSave(item)} className="save-btn">Save</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ResultsDisplay;
