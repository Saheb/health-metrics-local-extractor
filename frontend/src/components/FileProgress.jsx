import React from 'react';

const FileProgress = ({ files }) => {
    if (!files || files.length === 0) return null;

    return (
        <div className="file-progress-container">
            <h3>File Processing Status</h3>
            <ul className="file-status-list">
                {files.map((file, index) => (
                    <li key={index} className={`file-status-item ${file.status}`}>
                        <span className="file-name">{file.name}</span>
                        <span className="file-status">
                            {file.status === 'pending' && <span className="status-icon pending">⏳</span>}
                            {file.status === 'processing' && <span className="status-icon processing">🔄</span>}
                            {file.status === 'complete' && <span className="status-icon complete">✅</span>}
                            {file.status === 'error' && <span className="status-icon error">❌</span>}
                            <span className="status-text">
                                {file.status === 'pending' && 'Pending'}
                                {file.status === 'processing' && 'Processing...'}
                                {file.status === 'complete' && 'Complete'}
                                {file.status === 'error' && 'Error'}
                            </span>
                        </span>
                        {file.error && <div className="file-error-msg">{file.error}</div>}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default FileProgress;
