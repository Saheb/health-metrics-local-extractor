import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const TEST_DEFINITIONS = {
    "Hemoglobin": "A protein in red blood cells that carries oxygen throughout your body. Low levels may indicate anemia, while high levels can occur due to dehydration or lung disease.",
    "Total Cholesterol": "The sum of all cholesterol in your blood. High levels can increase the risk of heart disease and stroke.",
    "HDL Cholesterol": "Often called 'good' cholesterol. It helps remove other forms of cholesterol from your bloodstream. Higher levels are generally better.",
    "LDL Cholesterol": "Often called 'bad' cholesterol. It can build up in your arteries and cause blockages. Lower levels are generally better.",
    "Triglycerides": "A type of fat (lipid) found in your blood. High levels can increase the risk of heart disease.",
    "Fasting Glucose": "Measures blood sugar after an overnight fast. It is a key test for diagnosing diabetes or prediabetes.",
    "HbA1c": "Shows your average blood sugar level over the past 2-3 months. It is the primary test for managing diabetes.",
    "ESR": "Erythrocyte Sedimentation Rate. A test that measures inflammation in the body. High levels can indicate infection, autoimmune disorders, or other inflammatory conditions.",
    "TSH": "Thyroid Stimulating Hormone. It controls your thyroid gland. High levels often mean an underactive thyroid (hypothyroidism), while low levels mean an overactive thyroid (hyperthyroidism).",
    "Vitamin D": "Essential for healthy bones and immune function. Low levels are very common and can lead to bone pain and muscle weakness.",
    "Vitamin B12": "Important for nerve function and red blood cell production. Low levels can cause anemia and nervous system damage.",
    "SGPT/ALT": "An enzyme found mostly in the liver. High levels can indicate liver damage or inflammation.",
    "SGOT/AST": "An enzyme found in the liver and muscles. High levels can indicate liver damage, muscle injury, or heart issues.",
    "Creatinine": "A waste product filtered by your kidneys. High levels usually indicate that your kidneys are not working properly.",
    "Uric Acid": "A waste product in the blood. High levels can lead to gout (a type of arthritis) or kidney stones.",
    "Platelet Count": "Tiny blood cells that help your blood clot. Low levels can cause bleeding risks, while high levels can lead to clotting issues.",
    "WBC Count": "White Blood Cells fight infection. High levels often indicate an infection or inflammation, while low levels can mean a weakened immune system.",
    "RBC Count": "Red Blood Cells carry oxygen. Abnormal levels can indicate anemia, dehydration, or other blood disorders."
};

const TrendView = () => {
    const [metrics, setMetrics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTest, setSelectedTest] = useState('');
    const [availableTests, setAvailableTests] = useState([]);
    const [testCounts, setTestCounts] = useState({});

    useEffect(() => {
        fetch('http://localhost:8000/metrics')
            .then(res => res.json())
            .then(data => {
                setMetrics(data);

                // Count occurrences of each test
                const counts = {};
                data.forEach(item => {
                    if (item.test_name && item.value && item.report_date) {
                        counts[item.test_name] = (counts[item.test_name] || 0) + 1;
                    }
                });

                setTestCounts(counts);

                // Filter tests with >= 2 data points, sort by count (descending)
                const tests = Object.keys(counts)
                    .filter(test => counts[test] >= 2)
                    .sort((a, b) => counts[b] - counts[a]);

                setAvailableTests(tests);
                if (tests.length > 0) {
                    setSelectedTest(tests[0]);
                } else {
                    setSelectedTest(''); // Reset if no tests match
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    // Helper to parse reference range
    const parseReferenceRange = (rangeStr) => {
        if (!rangeStr) return { min: null, max: null };

        // Clean string
        const clean = rangeStr.trim().toLowerCase();

        // Handle "min-max" (e.g. "13.5-17.5")
        const rangeMatch = clean.match(/([\d.]+)\s*-\s*([\d.]+)/);
        if (rangeMatch) {
            return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
        }

        // Handle "< max" (e.g. "< 200")
        if (clean.includes('<')) {
            const match = clean.match(/[\d.]+/);
            if (match) return { min: 0, max: parseFloat(match[0]) };
        }

        // Handle "> min" (e.g. "> 50")
        if (clean.includes('>')) {
            const match = clean.match(/[\d.]+/);
            if (match) return { min: parseFloat(match[0]), max: null };
        }

        return { min: null, max: null };
    };

    // Prepare data for chart
    const chartData = metrics
        .filter(item => item.test_name === selectedTest)
        .filter(item => item.report_date && item.value)
        .map(item => {
            let val = parseFloat(item.value);
            if (isNaN(val)) {
                const match = item.value.toString().match(/(\d+(\.\d+)?)/);
                if (match) val = parseFloat(match[0]);
            }

            const { min, max } = parseReferenceRange(item.reference_range);

            // Format date (DD MMM YYYY)
            // Handle "01/Jun/2022" by replacing / with space -> "01 Jun 2022" which is more parseable
            let cleanDate = item.report_date.replace(/\//g, ' ');
            let dateObj = new Date(cleanDate);

            if (isNaN(dateObj.getTime())) {
                // Fallback: try original
                dateObj = new Date(item.report_date);
            }

            const isValidDate = !isNaN(dateObj.getTime());
            const displayDate = isValidDate
                ? dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : item.report_date;

            return {
                date: displayDate,
                rawDate: isValidDate ? dateObj.toISOString() : item.report_date, // Use ISO for sorting if valid
                value: val,
                originalValue: item.value,
                unit: item.unit,
                refMin: min,
                refMax: max,
                refRange: item.reference_range
            };
        })
        .sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate));

    if (loading) return <div>Loading trends...</div>;

    return (
        <div className="results-container">
            <h2>Health Trends</h2>

            <div style={{ marginBottom: '2rem' }}>
                <label style={{ fontWeight: 'bold', marginRight: '1rem' }}>Select Test:</label>
                <select
                    value={selectedTest}
                    onChange={(e) => setSelectedTest(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #ccc' }}
                >
                    {availableTests.map(test => (
                        <option key={test} value={test}>{test} ({testCounts[test]})</option>
                    ))}
                </select>
            </div>

            {chartData.length > 0 ? (
                <div style={{ width: '100%', height: 400, background: 'white', padding: '1rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis domain={['auto', 'auto']} />
                            <Tooltip content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div style={{ background: 'white', padding: '1rem', border: '1px solid #ccc', borderRadius: '0.5rem' }}>
                                            <p style={{ fontWeight: 'bold' }}>{label}</p>
                                            <p>{`Value: ${data.originalValue} ${data.unit || ''}`}</p>
                                            {data.refRange && <p style={{ color: '#666', fontSize: '0.9em' }}>{`Normal: ${data.refRange}`}</p>}
                                        </div>
                                    );
                                }
                                return null;
                            }} />
                            <Legend />
                            <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} activeDot={{ r: 8 }} name={selectedTest} />
                            {/* Reference Lines */}
                            <Line type="step" dataKey="refMin" stroke="#10b981" strokeDasharray="5 5" dot={false} name="Min Normal" connectNulls />
                            <Line type="step" dataKey="refMax" stroke="#ef4444" strokeDasharray="5 5" dot={false} name="Max Normal" connectNulls />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <p>No tests found with 2 or more data points (required for trend analysis).</p>
            )}

            {/* Definition Section */}
            {selectedTest && TEST_DEFINITIONS[selectedTest] && (
                <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f0f9ff', borderRadius: '1rem', borderLeft: '5px solid #2563eb' }}>
                    <h3 style={{ marginTop: 0, color: '#1e40af' }}>What is {selectedTest}?</h3>
                    <p style={{ margin: 0, lineHeight: '1.6', color: '#1e3a8a' }}>{TEST_DEFINITIONS[selectedTest]}</p>
                </div>
            )}

            {/* Data Points Table */}
            {chartData.length > 0 && (
                <div style={{ marginTop: '2rem' }}>
                    <h3>Data Points</h3>
                    <div style={{ overflowX: 'auto', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Value</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Unit</th>
                                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Reference Range</th>
                                </tr>
                            </thead>
                            <tbody>
                                {chartData.map((point, index) => (
                                    <tr key={index} style={{ borderBottom: index < chartData.length - 1 ? '1px solid #e5e7eb' : 'none', background: index % 2 === 0 ? 'white' : '#f9fafb' }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#111827' }}>{point.date}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#111827', fontWeight: '500' }}>{point.originalValue}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{point.unit}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{point.refRange || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrendView;
