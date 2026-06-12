import { useCallback, useState, useEffect } from 'react';
import JSZip from 'jszip';
import FileUpload from '../components/FileUpload';
import JsonViewer from '../components/JsonViewer';
import { useUpload } from '../context/UploadContext';

export default function UploadPage() {
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  const {
    state,
    filesQueue,
    currentIndex,
    results,
    error,
    handleFilesSelected,
    handleNewUpload,
    cancelQueue,
    retryFile
  } = useUpload();

  // Reset selected index when a new batch starts
  useEffect(() => {
    if (state === 'idle') {
      setSelectedResultIndex(0);
    }
  }, [state]);


  const handleDownloadSingle = useCallback((res) => {
    if (!res.data) return;
    const jsonString = JSON.stringify(res.data, null, 2);
    const downloadName = res.filename.replace(/\.pdf$/i, '') + '_extracted.json';

    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(jsonString);
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = downloadName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleDownloadAll = useCallback(async () => {
    if (!results.length) return;
    const zip = new JSZip();
    
    let hasData = false;
    results.forEach(res => {
      if (res.data) {
        hasData = true;
        const jsonString = JSON.stringify(res.data, null, 2);
        const name = res.filename.replace(/\.pdf$/i, '') + '_extracted.json';
        zip.file(name, jsonString);
      }
    });

    if (!hasData) {
      alert('No successful extractions to download.');
      return;
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extractions.zip';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [results]);

  return (
    <>
      <div className="page-header fade-in-up">
        <h1>
          <span className="gradient-text">AI-Powered</span> Batch Extractor
        </h1>
        <p>Upload multiple insurance policies and get them processed sequentially</p>
      </div>

      {state === 'idle' && (
        <FileUpload onFilesSelected={handleFilesSelected} disabled={false} />
      )}

      {state === 'processing' && (
        <div className="processing-container glass-card fade-in-up" style={{ marginBottom: '2rem', position: 'relative' }}>
          <div className="processing-spinner"></div>
          <h3 className="processing-title">Extracting Insurance Data...</h3>
          <p className="processing-subtitle">
            Processing file {currentIndex + 1} of {filesQueue.length}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>
            📄 {filesQueue[currentIndex]?.name}
          </p>
          <button 
            className="btn btn-danger fade-in-up" 
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={cancelQueue}
          >
            ⏹️ Stop
          </button>
        </div>
      )}



          {/* Master-Detail Split View for results */}
          {results.length > 0 && (
            <div className="split-view-container fade-in-up">
              <div className="sidebar-list">
                <h3>Extracted Files</h3>
                {results.map((res, i) => (
                  <div 
                    key={i} 
                    className={`sidebar-item ${i === selectedResultIndex ? 'active' : ''}`}
                    onClick={() => setSelectedResultIndex(i)}
                  >
                    <div className="sidebar-item-content" style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span className="sidebar-item-name" title={res.filename}>
                          📄 {res.filename}
                        </span>
                        {res.error && (
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', marginLeft: '0.5rem' }}
                            onClick={(e) => { e.stopPropagation(); retryFile(i); }}
                            disabled={res.retrying}
                          >
                            {res.retrying ? '...' : 'Retry'}
                          </button>
                        )}
                        {!res.error && res.data && (
                          <button 
                            className="btn" 
                            style={{ padding: '0.4rem 0.6rem', fontSize: '1rem', marginLeft: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                            onClick={(e) => { e.stopPropagation(); handleDownloadSingle(res); }}
                            title="Download JSON"
                          >
                            ⬇️
                          </button>
                        )}
                      </div>
                      <span className={`sidebar-item-status ${res.error ? 'error' : ''}`}>
                        {res.retrying ? 'Retrying...' : (res.error ? 'Extraction failed' : 'Extracted successfully')}
                      </span>
                    </div>
                  </div>
                ))}
                {state === 'processing' && filesQueue.length > results.length && (
                  <div className="sidebar-item" style={{ opacity: 0.6, cursor: 'default' }}>
                    <div className="sidebar-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="processing-spinner" style={{ width: '12px', height: '12px', borderWidth: '2px', margin: 0 }}></div>
                      <span className="sidebar-item-name">Processing {filesQueue[results.length]?.name}...</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="split-view-main">
                {results[selectedResultIndex]?.data ? (
                  <div className="glass-card" style={{ padding: '2rem' }}>
                    <JsonViewer
                      data={results[selectedResultIndex].data}
                      filename={results[selectedResultIndex].filename}
                      hideActions={true}
                      fileIndex={selectedResultIndex + 1}
                      totalFiles={results.filter(r => r.data).length}
                    />
                  </div>
                ) : (
                  <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>
                      {results[selectedResultIndex]?.error ? '❌' : (state === 'processing' ? '⏳' : '📄')}
                    </div>
                    <h3>{results[selectedResultIndex]?.error ? 'Extraction Failed' : 'No Data Available'}</h3>
                    <p>{results[selectedResultIndex]?.error || 'Select a successfully extracted file from the sidebar to view its details.'}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {state === 'complete' && (
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }} className="fade-in-up">
              <button className="btn btn-primary" onClick={handleDownloadAll}>
                📦 Download All (ZIP)
              </button>
              <button className="btn" onClick={handleNewUpload} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                🔄 Upload More
              </button>
            </div>
          )}
    </>
  );
}
