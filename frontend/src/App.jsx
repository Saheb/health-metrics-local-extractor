import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import ResultsDisplay from './components/ResultsDisplay';
import SavedMetrics from './components/SavedMetrics';
import TrendView from './components/TrendView';
import './App.css'; // We'll put styles in index.css mostly, but keep this import

function App() {
  const [view, setView] = useState('extract'); // 'extract', 'database', 'trend'
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoSave, setAutoSave] = useState(true);

  const saveItem = async (item) => {
    try {
      await fetch('http://localhost:8000/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item),
      });
      // We don't alert on auto-save to avoid spamming
    } catch (e) {
      console.error("Auto-save failed", e);
    }
  };

  const handleUpload = async (file) => {
    setIsLoading(true);
    setError(null);
    setData([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        let braceCount = 0;
        let startIndex = -1;

        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] === '{') {
            if (braceCount === 0) startIndex = i;
            braceCount++;
          } else if (buffer[i] === '}') {
            braceCount--;
            if (braceCount === 0 && startIndex !== -1) {
              const jsonStr = buffer.substring(startIndex, i + 1);
              try {
                const cleanJsonStr = jsonStr.replace(/\\_/g, '_');
                const item = JSON.parse(cleanJsonStr);
                setData(prev => [...prev, item]);

                // Auto-save trigger
                if (autoSave) {
                  saveItem(item);
                }

                buffer = buffer.substring(i + 1);
                i = -1;
                startIndex = -1;
              } catch (e) {
                console.log("Parsing error for chunk:", jsonStr, e);
                buffer = buffer.substring(i + 1);
                i = -1;
                startIndex = -1;
              }
            }
          }
        }

      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to extract data");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Health Metrics Extractor</h1>
        <p>Private, Offline, Secure.</p>

        <div className="nav-buttons" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
          <button
            onClick={() => setView('extract')}
            className={`nav-btn ${view === 'extract' ? 'active' : ''}`}
          >
            📄 Extract New
          </button>
          <button
            onClick={() => setView('database')}
            className={`nav-btn ${view === 'database' ? 'active' : ''}`}
          >
            💾 View Database
          </button>
          <button
            onClick={() => setView('trend')}
            className={`nav-btn ${view === 'trend' ? 'active' : ''}`}
          >
            📈 View Trend
          </button>
        </div>
      </header>

      <main>
        {view === 'extract' ? (
          <>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="autoSave"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              <label htmlFor="autoSave" style={{ cursor: 'pointer', fontWeight: '500' }}>Auto-save extracted values to database</label>
            </div>

            <FileUpload onUpload={handleUpload} isLoading={isLoading} />
            {error && <div className="error-message">{error}</div>}
            {data.length > 0 && <ResultsDisplay data={data} onSave={saveItem} />}
          </>
        ) : view === 'database' ? (
          <SavedMetrics />
        ) : (
          <TrendView />
        )}
      </main>
    </div>
  );
}

export default App;
