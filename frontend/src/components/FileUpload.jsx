import React, { useState } from 'react';

const FileUpload = ({ onUpload, isLoading }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (items) {
      const files = [];
      const queue = [];

      // Initial queue population
      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
          queue.push(item);
        }
      }

      // BFS traversal
      while (queue.length > 0) {
        const entry = queue.shift();
        if (entry.isFile) {
          if (entry.name.toLowerCase().endsWith('.pdf')) {
            const file = await new Promise((resolve) => {
              entry.file((f) => resolve(f));
            });
            files.push(file);
          }
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const entries = await new Promise((resolve) => {
            reader.readEntries((results) => resolve(results));
          });
          for (const child of entries) {
            queue.push(child);
          }
        }
      }

      if (files.length > 0) {
        onUpload(files);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Fallback for browsers not supporting webkitGetAsEntry (non-recursive)
      onUpload(Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf')));
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files));
    }
  };

  return (
    <div className="upload-container">
      <form
        className={`upload-form ${dragActive ? "drag-active" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="file"
          id="file-upload"
          accept=".pdf"
          multiple
          onChange={handleChange}
          disabled={isLoading}
          style={{ display: 'none' }}
        />
        <input
          type="file"
          id="folder-upload"
          webkitdirectory=""
          directory=""
          mozdirectory=""
          multiple
          onChange={handleChange}
          disabled={isLoading}
          style={{ display: 'none' }}
        />
        <div className="upload-label-content">
          {isLoading ? (
            <div className="spinner"></div>
          ) : (
            <>
              <div className="upload-icon">📄</div>
              <p>Drag & Drop your PDF reports or Folders here</p>
              <div className="upload-actions">
                <label htmlFor="file-upload" className="upload-btn">
                  Browse Files
                </label>
                <span className="separator">or</span>
                <label htmlFor="folder-upload" className="upload-btn secondary">
                  Browse Folder
                </label>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
};

export default FileUpload;
