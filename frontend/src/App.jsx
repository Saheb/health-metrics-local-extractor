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
      let buffer = '';
      let extractedCount = 0;
      let reportDate = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);
              // Add source file info
              const dataWithSource = { ...json, sourceFile: file.name };

              // Capture report date if found and not already set
              if (!reportDate && json.report_date) {
                reportDate = json.report_date;
              }

              // Auto-save to DB
              saveToDatabase(dataWithSource);
              extractedCount++;
            } catch (e) {
              console.log("Partial JSON or non-JSON line:", line);
            }
          }
        }
      }

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
