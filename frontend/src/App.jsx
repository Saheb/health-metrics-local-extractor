import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import SavedMetrics from './components/SavedMetrics';
import TrendView from './components/TrendView';
import FileProgress from './components/FileProgress';
import FileHistory from './components/FileHistory';
import './App.css';

const VIEW_MODES = {
  UPLOAD: 'upload',
  DATABASE: 'database',
  TRENDS: 'trends',
  HISTORY: 'history'
};

function App() {
  const [view, setView] = useState(VIEW_MODES.UPLOAD);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [fileStatuses, setFileStatuses] = useState([]);

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
      const response = await fetch('http://localhost:8000/extract', {
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

      // Process extracted objects
      for (const json of extractedObjects) {
        // VALIDATION: Skip entries without valid values (prevents hallucinated data)
        // Value must exist and be a non-empty number or numeric string
        const value = json.value;
        if (value === null || value === undefined || value === '' || value === 'null') {
          console.log(`Skipping entry without value: ${json.test_name}`);
          continue;
        }

        // Check if value is numeric (allows strings like "4.2" or numbers like 4.2)
        const numericValue = parseFloat(value);
        if (isNaN(numericValue)) {
          // Allow some non-numeric values like "Negative", "Positive", "Normal", etc.
          const allowedNonNumeric = ['negative', 'positive', 'normal', 'nil', 'absent', 'present', 'trace', 'male', 'female'];
          if (!allowedNonNumeric.includes(String(value).toLowerCase())) {
            console.log(`Skipping entry with non-numeric value: ${json.test_name} = ${value}`);
            continue;
          }
        }

        // Add source file info
        const dataWithSource = { ...json, sourceFile: file.name };

        // Capture report date if found and not already set
        if (!reportDate && json.report_date) {
          reportDate = json.report_date;
        }

        // Auto-save to DB
        saveToDatabase(dataWithSource);
        extractedCount++;
      }

      console.log(`Extracted ${extractedCount} data points from ${file.name}`);

      // Record file processing result
      await fetch('http://localhost:8000/record_file_processing', {
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
      await fetch('http://localhost:8000/record_file_processing', {
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
      const response = await fetch('http://localhost:8000/save', {
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
        <div className="nav-buttons" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
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
            onClick={() => setView(VIEW_MODES.TRENDS)}
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
        </div>
      </header>

      <main className="app-main">
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
          <TrendView />
        )}

        {view === VIEW_MODES.HISTORY && (
          <FileHistory />
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
