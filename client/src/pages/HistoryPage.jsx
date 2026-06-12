import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import JsonViewer from '../components/JsonViewer';

export default function HistoryPage() {
  const [extractions, setExtractions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedBatches, setExpandedBatches] = useState({});
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setSelected(null);
  }, [location.key]);

  useEffect(() => {
    const fetchExtractions = async () => {
      try {
        const res = await fetch('/api/extractions');
        const data = await res.json();
        
        // Group by batchId
        const grouped = data.reduce((acc, curr) => {
          if (curr.batchId) {
            if (!acc[curr.batchId]) {
              acc[curr.batchId] = { isBatch: true, batchId: curr.batchId, items: [], createdAt: curr.createdAt };
            }
            acc[curr.batchId].items.push(curr);
          } else {
            acc[curr._id] = { isBatch: false, item: curr, createdAt: curr.createdAt };
          }
          return acc;
        }, {});
        
        const groupedArray = Object.values(grouped).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setExtractions(groupedArray);
      } catch {
        setExtractions([]);
      } finally {
        setLoading(false);
      }
    };
    fetchExtractions();
  }, []);

  const handleView = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/extractions/${id}`);
      const data = await res.json();
      setSelected(data);
    } catch (err) {
      alert('Failed to load extraction: ' + err.message);
    }
  }, []);

  const handleDelete = useCallback(async (id, e, isBatch = false, batchId = null) => {
    e.stopPropagation();
    if (!confirm(isBatch ? 'Delete ALL extractions in this batch?' : 'Delete this extraction?')) return;

    try {
      if (isBatch) {
        // Find all IDs in this batch and delete them sequentially
        const batchGroup = extractions.find(ex => ex.isBatch && ex.batchId === batchId);
        if (batchGroup) {
          for (const item of batchGroup.items) {
            await fetch(`/api/extractions/${item._id}`, { method: 'DELETE' });
            if (selected?._id === item._id) setSelected(null);
          }
          setExtractions(prev => prev.filter(ex => ex.batchId !== batchId));
        }
      } else {
        await fetch(`/api/extractions/${id}`, { method: 'DELETE' });
        
        // Update state: remove from items if it's in a batch, or remove the top-level item
        setExtractions((prev) => {
          return prev.map(group => {
            if (group.isBatch) {
              return { ...group, items: group.items.filter(i => i._id !== id) };
            }
            return group;
          }).filter(group => {
            if (group.isBatch && group.items.length === 0) return false;
            if (!group.isBatch && group.item._id === id) return false;
            return true;
          });
        });
        
        if (selected?._id === id) setSelected(null);
      }
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }, [selected, extractions]);

  const toggleBatch = (batchId, e) => {
    e.stopPropagation();
    setExpandedBatches(prev => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const handleDownload = useCallback(() => {
    if (!selected) return;
    const jsonString = JSON.stringify(selected.extractedData, null, 2);
    const downloadName = selected.filename
      ? selected.filename.replace(/\.pdf$/i, '') + '_extracted.json'
      : 'extracted_data.json';

    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(jsonString);
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = downloadName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [selected]);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (selected) {
    return (
      <>
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            className="btn"
            onClick={() => setSelected(null)}
            id="back-to-history-btn"
          >
            ← Back to History
          </button>
        </div>
        <JsonViewer
          data={selected.extractedData}
          filename={selected.filename}
          onDownload={handleDownload}
          onNewUpload={() => navigate('/')}
        />
      </>
    );
  }

  const renderSingleCard = (ex, index, isChild = false) => (
    <div
      key={ex._id}
      className="history-card"
      onClick={() => handleView(ex._id)}
      style={{ 
        animationDelay: `${index * 0.05}s`, 
        marginLeft: isChild ? '2rem' : '0',
        marginTop: isChild ? '0.5rem' : '1rem',
        borderLeft: isChild ? '4px solid var(--accent-blue)' : ''
      }}
      role="button"
      tabIndex={0}
      id={`history-card-${ex._id}`}
    >
      <div className="history-card-info">
        <div className="history-card-icon">📄</div>
        <div className="history-card-details">
          <h3>{ex.filename}</h3>
          <div className="history-card-meta">
            <span>📅 {formatDate(ex.createdAt)}</span>
            <span className={`status-badge ${ex.status}`}>
              {ex.status === 'success' ? '✅ Success' : '❌ Error'}
            </span>
          </div>
        </div>
      </div>
      <div className="history-card-actions">
        <button
          className="btn"
          onClick={(e) => { e.stopPropagation(); handleView(ex._id); }}
        >
          👁️ View
        </button>
        <button
          className="btn btn-danger"
          onClick={(e) => handleDelete(ex._id, e)}
          id={`delete-${ex._id}`}
        >
          🗑️
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-header fade-in-up">
        <h1>
          <span className="gradient-text">Extraction</span> History
        </h1>
        <p>View and manage your past PDF extractions</p>
      </div>

      {loading ? (
        <div className="processing-container">
          <div className="processing-spinner"></div>
          <p className="processing-subtitle">Loading history...</p>
        </div>
      ) : extractions.length === 0 ? (
        <div className="empty-state glass-card fade-in-up">
          <div className="empty-state-icon">📂</div>
          <h3>No Extractions Yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Upload your first insurance PDF to get started
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/')}
            id="go-upload-btn"
          >
            📄 Upload PDF
          </button>
        </div>
      ) : (
        <div className="history-grid fade-in-up">
          {extractions.map((group, index) => {
            if (!group.isBatch) {
              return renderSingleCard(group.item, index);
            }
            
            const isExpanded = expandedBatches[group.batchId];
            const successCount = group.items.filter(i => i.status === 'success').length;
            
            return (
              <div key={`batch-${group.batchId}`} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  className="history-card"
                  onClick={(e) => toggleBatch(group.batchId, e)}
                  style={{ animationDelay: `${index * 0.05}s`, background: 'var(--bg-glass-hover)', marginTop: '1rem' }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="history-card-info">
                    <div className="history-card-icon" style={{ fontSize: '1.8rem' }}>📦</div>
                    <div className="history-card-details">
                      <h3>Batch Upload ({group.items.length} files)</h3>
                      <div className="history-card-meta">
                        <span>📅 {formatDate(group.createdAt)}</span>
                        <span className={`status-badge success`}>
                          {successCount} Successful
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="history-card-actions">
                    <button className="btn" onClick={(e) => toggleBatch(group.batchId, e)}>
                      {isExpanded ? '🔼 Collapse' : '🔽 Expand'}
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={(e) => handleDelete(null, e, true, group.batchId)}
                    >
                      🗑️ Delete All
                    </button>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="fade-in-up">
                    {group.items.map((item, childIndex) => renderSingleCard(item, childIndex, true))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
