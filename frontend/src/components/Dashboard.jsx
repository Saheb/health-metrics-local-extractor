import React, { useEffect, useState } from 'react';

// Category definitions for health metrics
const METRIC_CATEGORIES = {
    'Lipid Panel': {
        icon: '❤️',
        tests: ['Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides', 'VLDL Cholesterol', 'Non-HDL Cholesterol', 'LDL/HDL Ratio']
    },
    'Blood Sugar': {
        icon: '🍬',
        tests: ['Fasting Glucose', 'Post-Prandial Glucose', 'HbA1c', 'Glucose']
    },
    'Blood Count': {
        icon: '🩸',
        tests: ['Hemoglobin', 'RBC Count', 'WBC Count', 'Platelet Count', 'Hematocrit', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'RDW-SD', 'ESR']
    },
    'Liver Function': {
        icon: '🫁',
        tests: ['SGPT/ALT', 'SGOT/AST', 'Alkaline Phosphatase', 'Total Bilirubin', 'Direct Bilirubin', 'GGT']
    },
    'Kidney Function': {
        icon: '🫘',
        tests: ['Creatinine', 'BUN', 'Uric Acid', 'eGFR']
    },
    'Proteins': {
        icon: '🧬',
        tests: ['Total Protein', 'Albumin', 'Globulin', 'A/G Ratio']
    },
    'Thyroid': {
        icon: '🦋',
        tests: ['TSH', 'T3', 'T4', 'Free T3', 'Free T4']
    },
    'Vitamins': {
        icon: '💊',
        tests: ['Vitamin D', 'Vitamin B12', 'Folate', 'Iron', 'Ferritin']
    },
    'Electrolytes': {
        icon: '⚡',
        tests: ['Sodium', 'Potassium', 'Chloride', 'Calcium', 'Magnesium', 'Phosphorus']
    },
    'Cardiac': {
        icon: '💓',
        tests: ['Systolic Blood Pressure', 'Diastolic Blood Pressure', 'Heart Rate', 'P/QRS Ratio', 'T-wave Duration', 'Prothrombin Time']
    },
    'Other': {
        icon: '📋',
        tests: [] // Catch-all for unmatched metrics
    }
};

const Dashboard = ({ onNavigateToTrends }) => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedCategories, setExpandedCategories] = useState(new Set());

    useEffect(() => {
        fetch('http://localhost:8000/alerts')
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch alerts');
                return res.json();
            })
            .then(data => {
                setAlerts(data);
                // Expand all categories with alerts by default
                const categories = new Set();
                data.forEach(alert => {
                    const category = getCategoryForTest(alert.test_name);
                    categories.add(category);
                });
                setExpandedCategories(categories);
                setLoading(false);
            })
            .catch(err => {
                console.error('Error fetching alerts:', err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    const getCategoryForTest = (testName) => {
        for (const [category, config] of Object.entries(METRIC_CATEGORIES)) {
            if (category === 'Other') continue;
            if (config.tests.some(t => testName.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(testName.toLowerCase()))) {
                return category;
            }
        }
        return 'Other';
    };

    const groupAlertsByCategory = (alerts) => {
        const groups = {};
        alerts.forEach(alert => {
            const category = getCategoryForTest(alert.test_name);
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(alert);
        });

        // Sort groups by severity (highest deviation first within each group)
        Object.keys(groups).forEach(category => {
            groups[category].sort((a, b) => b.deviation - a.deviation);
        });

        return groups;
    };

    const toggleCategory = (category) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Unknown date';
        try {
            const cleanDate = dateStr.replace(/\//g, ' ');
            const date = new Date(cleanDate);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    // Check if a reading is stale (older than threshold)
    const getReadingAge = (dateStr) => {
        if (!dateStr) return { isStale: false, isVeryStale: false, ageText: 'Unknown' };
        try {
            const cleanDate = dateStr.replace(/\//g, ' ');
            const date = new Date(cleanDate);
            if (isNaN(date.getTime())) return { isStale: false, isVeryStale: false, ageText: 'Unknown' };

            const now = new Date();
            const diffMs = now - date;
            const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365);

            if (diffYears >= 2) {
                return { isStale: true, isVeryStale: true, ageText: `${Math.floor(diffYears)}+ years old` };
            } else if (diffYears >= 1) {
                return { isStale: true, isVeryStale: false, ageText: 'Over 1 year old' };
            }
            return { isStale: false, isVeryStale: false, ageText: '' };
        } catch {
            return { isStale: false, isVeryStale: false, ageText: 'Unknown' };
        }
    };

    if (loading) {
        return (
            <div className="dashboard-container">
                <div className="dashboard-loading">
                    <div className="spinner"></div>
                    <p>Analyzing your health metrics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-container">
                <div className="dashboard-error">
                    <span className="error-icon">⚠️</span>
                    <p>Failed to load alerts: {error}</p>
                </div>
            </div>
        );
    }

    const groupedAlerts = groupAlertsByCategory(alerts);
    const categoryOrder = Object.keys(METRIC_CATEGORIES).filter(cat => groupedAlerts[cat]);

    return (
        <div className="dashboard-container">
            <h2 className="dashboard-title">
                <span className="title-icon">🩺</span>
                Health Dashboard
            </h2>
            <p className="dashboard-subtitle">
                Metrics that may require your attention based on reference ranges
            </p>

            {alerts.length === 0 ? (
                <div className="all-clear-card">
                    <div className="all-clear-icon">✨</div>
                    <h3>All Clear!</h3>
                    <p>All your latest health metrics are within normal ranges.</p>
                </div>
            ) : (
                <>
                    <div className="alert-summary">
                        <span className="alert-count">{alerts.length}</span>
                        <span className="alert-label">
                            {alerts.length === 1 ? 'metric requires attention' : 'metrics require attention'}
                        </span>
                        <span className="category-count">
                            in {categoryOrder.length} {categoryOrder.length === 1 ? 'category' : 'categories'}
                        </span>
                    </div>

                    <div className="category-groups">
                        {categoryOrder.map(category => (
                            <div key={category} className="category-group">
                                <button
                                    className={`category-header ${expandedCategories.has(category) ? 'expanded' : ''}`}
                                    onClick={() => toggleCategory(category)}
                                >
                                    <span className="category-icon">{METRIC_CATEGORIES[category]?.icon || '📋'}</span>
                                    <span className="category-name">{category}</span>
                                    <span className="category-badge">{groupedAlerts[category].length}</span>
                                    <span className="category-chevron">{expandedCategories.has(category) ? '▼' : '▶'}</span>
                                </button>

                                {expandedCategories.has(category) && (
                                    <div className="alerts-grid">
                                        {groupedAlerts[category].map((alert, index) => (
                                            <div
                                                key={index}
                                                className={`alert-card ${alert.status}`}
                                                onClick={() => onNavigateToTrends && onNavigateToTrends(alert.test_name)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        onNavigateToTrends && onNavigateToTrends(alert.test_name);
                                                    }
                                                }}
                                            >
                                                <div className="alert-header">
                                                    <span className={`status-badge ${alert.status}`}>
                                                        {alert.status === 'high' ? '↑ HIGH' : '↓ LOW'}
                                                    </span>
                                                    <span className="deviation-badge">
                                                        {alert.deviation > 0 ? `${alert.deviation}%` : '—'}
                                                        {alert.status === 'high' ? ' above' : ' below'} normal
                                                    </span>
                                                </div>

                                                <h3 className="alert-test-name">{alert.test_name}</h3>

                                                <div className="alert-value-row">
                                                    <div className="current-value">
                                                        <span className="value-label">Current</span>
                                                        <span className="value-number">
                                                            {alert.value} <span className="value-unit">{alert.unit}</span>
                                                        </span>
                                                    </div>
                                                    <div className="reference-range">
                                                        <span className="value-label">Normal Range</span>
                                                        <span className="range-value">{alert.reference_range}</span>
                                                    </div>
                                                </div>

                                                <div className="alert-footer">
                                                    {(() => {
                                                        const { isStale, isVeryStale, ageText } = getReadingAge(alert.report_date);
                                                        return (
                                                            <>
                                                                <span className={`report-date ${isStale ? 'stale' : ''}`}>
                                                                    📅 {formatDate(alert.report_date)}
                                                                    {isStale && (
                                                                        <span className={`stale-badge ${isVeryStale ? 'very-stale' : ''}`}>
                                                                            ⏰ {ageText}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className="view-trend">View Trend →</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                {(() => {
                                                    const { isVeryStale } = getReadingAge(alert.report_date);
                                                    return isVeryStale ? (
                                                        <div className="retest-suggestion">
                                                            💡 Consider retesting - this reading is outdated
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default Dashboard;
