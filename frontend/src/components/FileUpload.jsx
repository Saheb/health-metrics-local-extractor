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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
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
          onChange={handleChange}
          disabled={isLoading}
        />
        <label htmlFor="file-upload" className="upload-label">
          {isLoading ? (
            <div className="spinner"></div>
          ) : (
            <>
              <div className="upload-icon">📄</div>
              <p>Drag & Drop your PDF report here</p>
              <span className="upload-btn">Or browse file</span>
            </>
          )}
        </label>
      </form>
    </div>
  );
};

export default FileUpload;
