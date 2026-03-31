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
    "RBC Count": "Red Blood Cells carry oxygen. Abnormal levels can indicate anemia, dehydration, or other blood disorders.",
    "Sleep": "The total duration of your sleep. Adequate sleep is vital for physical and mental health.",
    "Active Zone Minutes": "Time spent in heart-pumping activities. Helps improve cardiovascular fitness."
};

const FITNESS_LIFESTYLE_TESTS = [
    "Weight", "BMI", "Body Fat", "Sleep", "Active Zone Minutes", 
    "Muscle Mass", "Hydration", "BMR", "Skeletal Muscle Mass",
    "Fat Free Mass", "Body Water"
].map(t => t.toLowerCase());

const COLORS = ['#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

const TrendView = ({ initialSelectedTest }) => {
    const [metrics, setMetrics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTest, setSelectedTest] = useState('');
    const [selectedCheckboxes, setSelectedCheckboxes] = useState([]);
    const [availableTests, setAvailableTests] = useState([]);
    const [testCounts, setTestCounts] = useState({});

    useEffect(() => {
        fetch('/api/metrics')
            .then(res => res.json())
            .then(data => {
                setMetrics(data);

                const counts = {};
                data.forEach(item => {
                    if (item.test_name && item.value && item.report_date) {
                        counts[item.test_name] = (counts[item.test_name] || 0) + 1;
                    }
                });

                setTestCounts(counts);

                const tests = Object.keys(counts)
                    .filter(test => counts[test] >= 2)
                    .sort((a, b) => counts[b] - counts[a]);

                setAvailableTests(tests);

                const bloods = tests.filter(t => !FITNESS_LIFESTYLE_TESTS.includes(t.toLowerCase()));

                if (initialSelectedTest && bloods.includes(initialSelectedTest)) {
                    setSelectedTest(initialSelectedTest);
                } else if (bloods.length > 0) {
                    setSelectedTest(bloods[0]);
                } else {
                    setSelectedTest('');
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [initialSelectedTest]);

    const toggleCheckbox = (testName) => {
        setSelectedCheckboxes(prev => 
            prev.includes(testName) ? prev.filter(t => t !== testName) : [...prev, testName]
        );
    };

    const parseReferenceRange = (rangeStr) => {
        if (!rangeStr) return { min: null, max: null };
        const clean = rangeStr.trim().toLowerCase();
        const rangeMatch = clean.match(/([\d.]+)\s*-\s*([\d.]+)/);
        if (rangeMatch) return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
        if (clean.includes('<')) {
            const match = clean.match(/[\d.]+/);
            if (match) return { min: 0, max: parseFloat(match[0]) };
        }
        if (clean.includes('>')) {
            const match = clean.match(/[\d.]+/);
            if (match) return { min: parseFloat(match[0]), max: null };
        }
        return { min: null, max: null };
    };

    if (loading) return <div>Loading trends...</div>;

    const fitnessTests = availableTests.filter(t => FITNESS_LIFESTYLE_TESTS.includes(t.toLowerCase()));
    const bloodTests = availableTests.filter(t => !FITNESS_LIFESTYLE_TESTS.includes(t.toLowerCase()));

    const activeTests = [selectedTest, ...selectedCheckboxes].filter(Boolean);
    const combinedDataMap = {};

    activeTests.forEach(testName => {
        let testMetrics = metrics
            .filter(item => item.test_name === testName)
            .filter(item => item.report_date && item.value);

        if (FITNESS_LIFESTYLE_TESTS.includes(testName.toLowerCase())) {
            const aggregated = {};
            testMetrics.forEach(item => {
                let val = parseFloat(item.value);
                if (isNaN(val)) {
                    const match = item.value.toString().match(/(\d+(\.\d+)?)/);
                    if (match) val = parseFloat(match[0]);
                }
                if (isNaN(val)) return;

                let cleanDate = item.report_date.replace(/\//g, ' ');
                let dateObj = new Date(cleanDate);
                if (isNaN(dateObj.getTime())) dateObj = new Date(item.report_date);
                if (isNaN(dateObj.getTime())) return;
                
                const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                const dayKey = item.report_date;
                
                if (!aggregated[monthKey]) {
                    aggregated[monthKey] = {
                        sum: 0,
                        uniqueDays: new Set(),
                        unit: item.unit,
                        refRange: item.reference_range,
                        dateObj: new Date(dateObj.getFullYear(), dateObj.getMonth(), 1)
                    };
                }
                aggregated[monthKey].sum += val;
                aggregated[monthKey].uniqueDays.add(dayKey);
            });

            testMetrics = Object.values(aggregated).map(agg => {
                return {
                    test_name: testName,
                    report_date: agg.dateObj.toISOString(),
                    value: (agg.sum / agg.uniqueDays.size).toFixed(2),
                    total_sum: Math.round(agg.sum),
                    unit: agg.unit,
                    reference_range: agg.refRange,
                    isAveraged: true
                };
            });
        }

        testMetrics.forEach(item => {
            let val = parseFloat(item.value);
            if (isNaN(val)) {
                const match = item.value.toString().match(/(\d+(\.\d+)?)/);
                if (match) val = parseFloat(match[0]);
            }
            if (isNaN(val)) return;

            let cleanDate = item.report_date.replace(/\//g, ' ');
            let dateObj = new Date(cleanDate);
            if (isNaN(dateObj.getTime())) dateObj = new Date(item.report_date);
            const isValidDate = !isNaN(dateObj.getTime());
            
            const rawDate = isValidDate ? dateObj.toISOString() : item.report_date;
            let displayDate = item.report_date;
            if (isValidDate) {
                if (item.isAveraged) {
                    displayDate = dateObj.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                } else {
                    displayDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                }
            }

            let displayOriginalValue = item.isAveraged ? `${item.value} (Daily Avg)` : item.value;
            let displayUnit = item.unit;

            if (testName === 'Sleep') {
                const totalMins = Math.round(val * 60);
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                const timeStr = `${h}h ${m}m`;
                displayOriginalValue = item.isAveraged ? `${timeStr} (Daily Avg)` : timeStr;
                displayUnit = '';
            } else if (testName === 'Active Zone Minutes' && item.isAveraged && item.total_sum !== undefined) {
                displayOriginalValue = `${item.value} (Daily Avg) / ${item.total_sum} (Monthly Total)`;
            }

            if (!combinedDataMap[rawDate]) {
                combinedDataMap[rawDate] = {
                    date: displayDate,
                    rawDate: rawDate
                };
            }

            combinedDataMap[rawDate][testName] = val;
            combinedDataMap[rawDate][`${testName}_original`] = displayOriginalValue;
            combinedDataMap[rawDate][`${testName}_unit`] = displayUnit;

            if (testName === selectedTest) {
                const { min, max } = parseReferenceRange(item.reference_range);
                combinedDataMap[rawDate].refMin = min;
                combinedDataMap[rawDate].refMax = max;
                combinedDataMap[rawDate].refRange = item.reference_range;
                combinedDataMap[rawDate].originalPrimaryValue = displayOriginalValue;
                combinedDataMap[rawDate].primaryUnit = displayUnit;
            }
        });
    });

    let chartData = Object.values(combinedDataMap).sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate));
    
    // Filter chart timeline to start max 12 months before the earliest primary biomarker data point
    if (selectedTest) {
        let earliestBiomarkerDate = null;
        for (const item of chartData) {
            if (item[selectedTest] !== undefined) {
                earliestBiomarkerDate = new Date(item.rawDate);
                break; // Because the array is strictly sorted chronologically
            }
        }
        
        if (earliestBiomarkerDate) {
            const minAllowedDate = new Date(earliestBiomarkerDate);
            minAllowedDate.setFullYear(minAllowedDate.getFullYear() - 1);
            
            chartData = chartData.filter(item => {
                return new Date(item.rawDate) >= minAllowedDate;
            });
        }
    }

    const showOverlays = selectedCheckboxes.length > 0;

    return (
        <div className="results-container">
            <h2>Health Trends</h2>

            <div style={{ marginBottom: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: '200px' }}>
                    <label style={{ fontWeight: 'bold', marginRight: '1rem', display: 'block', marginBottom: '0.5rem' }}>Primary Biomarker:</label>
                    <select
                        value={selectedTest}
                        onChange={(e) => setSelectedTest(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid #ccc', width: '100%' }}
                    >
                        {bloodTests.map(test => (
                            <option key={test} value={test}>{test} ({testCounts[test] || 0})</option>
                        ))}
                    </select>
                </div>

                {fitnessTests.length > 0 && (
                    <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: '2rem', flex: 1 }}>
                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem', color: '#4b5563' }}>Overlay Lifestyle Metrics:</label>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            {fitnessTests.map((test, index) => {
                                const isChecked = selectedCheckboxes.includes(test);
                                const color = COLORS[index % COLORS.length];
                                return (
                                    <label key={test} style={{ 
                                        display: 'flex', alignItems: 'center', gap: '0.4rem', 
                                        fontSize: '0.9rem', cursor: 'pointer', 
                                        color: isChecked ? color : '#6b7280',
                                        background: isChecked ? `${color}15` : 'transparent',
                                        padding: '0.3rem 0.6rem',
                                        borderRadius: '0.3rem',
                                        border: `1px solid ${isChecked ? color : '#e5e7eb'}`,
                                        transition: 'all 0.2s'
                                    }}>
                                        <input 
                                            type="checkbox" 
                                            checked={isChecked} 
                                            onChange={() => toggleCheckbox(test)} 
                                            style={{ accentColor: color, cursor: 'pointer' }}
                                        />
                                        {test}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {chartData.length > 0 ? (
                <div style={{ width: '100%', height: 450, background: 'white', padding: '1rem 1rem 1rem 0', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{fontSize: 12}} />
                            <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{fontSize: 12}} stroke="#2563eb" />
                            {showOverlays && <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} tick={{fontSize: 12}} stroke="#9ca3af" />}
                            
                            <Tooltip content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div style={{ background: 'white', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                                            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>{label}</p>
                                            
                                            {payload.map((entry, idx) => {
                                                if (entry.dataKey === 'refMin' || entry.dataKey === 'refMax') return null;
                                                const testName = entry.dataKey;
                                                const originalVal = data[`${testName}_original`];
                                                const unit = data[`${testName}_unit`] || '';
                                                if (originalVal === undefined) return null; // Node might exist through connectNulls but we hover over a strict empty gap

                                                return (
                                                    <p key={idx} style={{ color: entry.color, margin: '0.3rem 0', fontWeight: '500' }}>
                                                        {testName}: <span style={{color: '#1e293b'}}>{originalVal} {unit}</span>
                                                    </p>
                                                );
                                            })}

                                            {data.refRange && (
                                                <p style={{ color: '#64748b', fontSize: '0.85em', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0' }}>
                                                    {selectedTest} Normal: {data.refRange}
                                                </p>
                                            )}
                                        </div>
                                    );
                                }
                                return null;
                            }} />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            
                            {/* Primary Marker Line */}
                            {selectedTest && (
                                <Line yAxisId="left" type="monotone" dataKey={selectedTest} stroke="#2563eb" strokeWidth={3} activeDot={{ r: 8 }} name={selectedTest} connectNulls={true} />
                            )}

                            {/* Secondary Checkbox Lines */}
                            {selectedCheckboxes.map((test, index) => (
                                <Line key={test} yAxisId={showOverlays ? "right" : "left"} type="monotone" dataKey={test} stroke={COLORS[index % COLORS.length]} strokeWidth={2} strokeDasharray="5 5" name={test} connectNulls={true} dot={{r: 3}} activeDot={{r: 6}} />
                            ))}

                            {/* Reference Lines attached to primary axis exclusively */}
                            <Line yAxisId="left" type="step" dataKey="refMin" stroke="#10b981" strokeDasharray="3 3" dot={false} name="Min Normal" connectNulls={true} />
                            <Line yAxisId="left" type="step" dataKey="refMax" stroke="#ef4444" strokeDasharray="3 3" dot={false} name="Max Normal" connectNulls={true} />
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
            {chartData.length > 0 && !showOverlays && (
                <div style={{ marginTop: '2rem' }}>
                    <h3>Historical Data</h3>
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
                                {chartData.filter(d => d.originalPrimaryValue !== undefined).map((point, index) => (
                                    <tr key={index} style={{ borderBottom: '1px solid #e5e7eb', background: index % 2 === 0 ? 'white' : '#f9fafb' }}>
                                        <td style={{ padding: '0.75rem 1rem', color: '#111827' }}>{point.date}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#111827', fontWeight: '500' }}>{point.originalPrimaryValue}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{point.primaryUnit}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{point.refRange || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {showOverlays && (
                <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', color: '#64748b', fontSize: '0.9rem', textAlign: 'center' }}>
                    Raw historical data table is hidden while multiple datasets are overlaid. Disable checkboxes to view strictly {selectedTest} logs.
                </div>
            )}
        </div>
    );
};

export default TrendView;
