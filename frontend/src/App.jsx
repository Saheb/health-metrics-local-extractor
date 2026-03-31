import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import SavedMetrics from './components/SavedMetrics';
import TrendView from './components/TrendView';
import FileProgress from './components/FileProgress';
import FileHistory from './components/FileHistory';
import Dashboard from './components/Dashboard';
import FitbitIntegration from './components/FitbitIntegration';
import './App.css';

const VIEW_MODES = {
  DASHBOARD: 'dashboard',
  UPLOAD: 'upload',
  DATABASE: 'database',
  TRENDS: 'trends',
  HISTORY: 'history',
  INTEGRATIONS: 'integrations'
};

function App() {
  const [view, setView] = useState(VIEW_MODES.DASHBOARD);
  const [selectedTestForTrend, setSelectedTestForTrend] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [fileStatuses, setFileStatuses] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [activeModel, setActiveModel] = useState('');
  const [isModelLoading, setIsModelLoading] = useState(false);

  useEffect(() => {
    // Fetch available models on load
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        setAvailableModels(data.available_models || []);
        setActiveModel(data.active_model || '');
      })
      .catch(err => console.error("Failed to fetch models:", err));
  }, []);

  const handleModelChange = async (e) => {
    const newModel = e.target.value;
    setIsModelLoading(true);

    try {
      const response = await fetch('/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: newModel })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveModel(data.active_model);
      } else {
        console.error("Failed to switch model");
      }
    } catch (err) {
      console.error("Error switching model:", err);
    } finally {
      setIsModelLoading(false);
    }
  };

  const handleUpload = async (fileList) => {
    setIsLoading(true);
    setError(null);

    // Initialize file statuses
    const initialStatuses = fileList.map(file => ({
      name: file.name,
      status: 'pending',
      message: 'Waiting...'
    }));
    setFileStatuses(initialStatuses);

    // Process files sequentially
    for (const file of fileList) {
      await processFile(file);
    }

    setIsLoading(false);
    setView(VIEW_MODES.HISTORY);
  };

  const processFile = async (file) => {
    // Update status to processing
    setFileStatuses(prev => prev.map(f =>
      f.name === file.name ? { ...f, status: 'processing', message: 'Processing...' } : f
    ));

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullOutput = '';
      let extractedCount = 0;
      let reportDate = null;

      // Collect all streamed output first
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullOutput += chunk;
      }

      // Clean up the output:
      // 1. Remove escaped underscores (LLM sometimes outputs \_ instead of _)
      // 2. Remove any comment lines
      let cleanedOutput = fullOutput.replace(/\\_/g, '_');

      // Remove comment lines (lines starting with #)
      cleanedOutput = cleanedOutput.split('\n')
        .filter(line => !line.trim().startsWith('#'))
        .join('\n');

      // Try to extract JSON objects from the output
      // The LLM might output:
      // 1. JSON Lines (one object per line) - ideal
      // 2. Pretty-printed JSON objects (multiline) - common
      // 3. A JSON array [obj1, obj2, ...] - possible

      const extractedObjects = [];

      // First, try to parse as JSON array
      try {
        const trimmed = cleanedOutput.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) {
            extractedObjects.push(...arr);
          }
        }
      } catch (e) {
        // Not a valid JSON array, continue
      }

      // If no objects found, try extracting individual JSON objects using regex
      if (extractedObjects.length === 0) {
        // Match JSON objects: { ... }
        // This regex handles nested braces properly
        const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
        const matches = cleanedOutput.match(jsonRegex);

        if (matches) {
          for (const match of matches) {
            try {
              const obj = JSON.parse(match);
              // Validate it has expected fields
              if (obj.test_name || obj.value !== undefined) {
                extractedObjects.push(obj);
              }
            } catch (e) {
              console.log("Could not parse JSON object:", match.substring(0, 100));
            }
          }
        }
      }

      // First pass: Find the report date if it exists anywhere in the extracted objects
      let foundDate = null;
      for (const obj of extractedObjects) {
        if (obj.report_date && obj.report_date !== 'null' && obj.report_date !== '') {
          foundDate = obj.report_date;
          break;
        }
      }

      if (foundDate) {
        reportDate = foundDate;
      }

      // Process extracted objects
      for (const json of extractedObjects) {
        // VALIDATION: Skip entries without valid values (prevents hallucinated data)
        const value = json.value;
        if (value === null || value === undefined || value === '' || value === 'null') {
          console.log(`Skipping entry without value: ${json.test_name}`);
          continue;
        }

        // Check if value is numeric
        const numericValue = parseFloat(value);
        if (isNaN(numericValue)) {
          const allowedNonNumeric = ['negative', 'positive', 'normal', 'nil', 'absent', 'present', 'trace', 'male', 'female'];
          if (!allowedNonNumeric.includes(String(value).toLowerCase())) {
            console.log(`Skipping entry with non-numeric value: ${json.test_name} = ${value}`);
            continue;
          }
        }

        // Inject the globally found reportDate if this specific object doesn't have it
        if (!json.report_date && reportDate) {
          json.report_date = reportDate;
        }

        // Add source file info
        const dataWithSource = { ...json, sourceFile: file.name };

        // Auto-save to DB
        saveToDatabase(dataWithSource);
        extractedCount++;
      }

      console.log(`Extracted ${extractedCount} data points from ${file.name}`);

      // Record file processing result
      await fetch('/api/record_file_processing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          status: 'Success',
          data_points_extracted: extractedCount,
          report_date: reportDate
        }),
      });

      // Update status to complete
      setFileStatuses(prev => prev.map(f =>
        f.name === file.name ? { ...f, status: 'complete', message: 'Completed' } : f
      ));

    } catch (err) {
      console.error("Error processing file:", file.name, err);

      // Record failure
      await fetch('/api/record_file_processing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          status: 'Failed',
          data_points_extracted: 0
        }),
      });

      setFileStatuses(prev => prev.map(f =>
        f.name === file.name ? { ...f, status: 'error', message: 'Failed' } : f
      ));
      // Don't set global error to avoid blocking other files
    }
  };

  const saveToDatabase = async (data) => {
    try {
      setAutoSaveStatus('Saving...');
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        setAutoSaveStatus('Saved');
        setTimeout(() => setAutoSaveStatus(''), 2000);
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
      setAutoSaveStatus('Save Failed');
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Health Metrics Extractor</h1>

        {availableModels.length > 0 && (
          <div style={{ marginTop: '0.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', color: '#64748b' }}>AI Model:</label>
            <select
              value={activeModel}
              onChange={handleModelChange}
              disabled={isModelLoading || isLoading}
              style={{
                padding: '0.3rem 0.5rem',
                borderRadius: '0.3rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                color: '#334155',
                background: '#f8fafc',
                cursor: (isModelLoading || isLoading) ? 'not-allowed' : 'pointer',
                maxWidth: '250px',
                textOverflow: 'ellipsis'
              }}
            >
              {availableModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            {isModelLoading && <span style={{ fontSize: '0.8rem', color: '#2563eb' }}>Loading...</span>}
          </div>
        )}

        <div className="nav-buttons" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`nav-btn ${view === VIEW_MODES.DASHBOARD ? 'active' : ''}`}
            onClick={() => setView(VIEW_MODES.DASHBOARD)}
          >
            ⚠️ Dashboard
          </button>
          <button
            type="button"
            className={`nav-btn ${view === VIEW_MODES.UPLOAD ? 'active' : ''}`}
            onClick={() => setView(VIEW_MODES.UPLOAD)}
          >
            📄 Upload
          </button>
          <button
            type="button"
            className={`nav-btn ${view === VIEW_MODES.DATABASE ? 'active' : ''}`}
            onClick={() => setView(VIEW_MODES.DATABASE)}
          >
            💾 View Database
          </button>
          <button
            type="button"
            className={`nav-btn ${view === VIEW_MODES.TRENDS ? 'active' : ''}`}
            onClick={() => { setSelectedTestForTrend(null); setView(VIEW_MODES.TRENDS); }}
          >
            📈 View Trends
          </button>
          <button
            type="button"
            className={`nav-btn ${view === VIEW_MODES.HISTORY ? 'active' : ''}`}
            onClick={() => setView(VIEW_MODES.HISTORY)}
          >
            🕒 File History
          </button>
          <button
            type="button"
            className={`nav-btn ${view === VIEW_MODES.INTEGRATIONS ? 'active' : ''}`}
            onClick={() => setView(VIEW_MODES.INTEGRATIONS)}
          >
            🔌 Integrations
          </button>
        </div>
      </header>

      <main className="app-main">
        {view === VIEW_MODES.DASHBOARD && (
          <Dashboard
            onNavigateToTrends={(testName) => {
              setSelectedTestForTrend(testName);
              setView(VIEW_MODES.TRENDS);
            }}
          />
        )}

        {view === VIEW_MODES.UPLOAD && (
          <div className="upload-view">
            <FileUpload onUpload={handleUpload} isLoading={isLoading} />
            <FileProgress files={fileStatuses} />
            {error && <div className="error-message">{error}</div>}
          </div>
        )}

        {view === VIEW_MODES.DATABASE && (
          <SavedMetrics />
        )}

        {view === VIEW_MODES.TRENDS && (
          <TrendView initialSelectedTest={selectedTestForTrend} />
        )}

        {view === VIEW_MODES.HISTORY && (
          <FileHistory />
        )}

        {view === VIEW_MODES.INTEGRATIONS && (
          <FitbitIntegration />
        )}
      </main>

      {autoSaveStatus && (
        <div className="toast-notification">
          {autoSaveStatus}
        </div>
      )}
    </div>
  );
}

export default App;
