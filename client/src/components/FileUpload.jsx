import { useRef, useState, useCallback } from 'react';

export default function FileUpload({ onFilesSelected, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback((fileList) => {
    const validFiles = Array.from(fileList).filter(file => file.type === 'application/pdf');
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      onFilesSelected(validFiles);
    } else {
      alert('Please select valid PDF files.');
    }
  }, [onFilesSelected]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileClick = useCallback((e) => {
    e.stopPropagation();
    if (!disabled) fileInputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback((e) => {
    handleFiles(e.target.files);
  }, [handleFiles]);

  return (
    <div className="fade-in-up">
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        id="upload-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleInputChange}
          style={{ display: 'none' }}
          disabled={disabled}
          id="pdf-file-input"
        />

        <div className="upload-zone-content">
          <div className="upload-icon">📑</div>
          <h3 className="upload-title">
            {dragOver ? 'Drop your PDFs here!' : 'Upload Insurance PDFs'}
          </h3>
          <p className="upload-subtitle">
            Drag & drop your insurance policy PDFs, or click below to select files
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button className="upload-btn" type="button" onClick={handleFileClick} disabled={disabled} id="browse-btn">
              📄 Select Files
            </button>
          </div>
          <p className="upload-formats">Supported: PDF files up to 50 MB</p>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="selected-file fade-in-up" id="selected-file-info">
          <span className="file-icon">✅</span>
          <span>{selectedFiles.length} file(s) selected</span>
        </div>
      )}
    </div>
  );
}
