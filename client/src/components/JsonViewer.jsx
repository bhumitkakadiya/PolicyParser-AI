import { useState } from 'react';

// Section metadata: icon, color class, display title
const SECTION_META = {
  policy_holder:   { icon: '👤', color: 'blue', title: 'Policy Holder' },
  policy:          { icon: '📋', color: 'cyan', title: 'Policy Details' },
  vehicle:         { icon: '🚗', color: 'green', title: 'Vehicle Information' },
  health_coverage: { icon: '🏥', color: 'pink', title: 'Health Coverage' },
  life_coverage:   { icon: '❤️', color: 'red', title: 'Life Coverage' },
  insured_persons: { icon: '👨‍👩‍👧‍👦', color: 'purple', title: 'Insured Persons' },
  financier:       { icon: '🏦', color: 'purple', title: 'Financier' },
  coverage:        { icon: '🛡️', color: 'blue', title: 'Coverage' },
  premium:         { icon: '💰', color: 'orange', title: 'Premium Breakdown' },
  deductibles:     { icon: '📊', color: 'red', title: 'Deductibles' },
  ncb:             { icon: '⭐', color: 'green', title: 'No Claim Bonus' },
  nominee:         { icon: '👥', color: 'pink', title: 'Nominee' },
  agent:           { icon: '🧑‍💼', color: 'cyan', title: 'Agent Details' },
  payment:         { icon: '💳', color: 'green', title: 'Payment' },
  insurer:         { icon: '🏢', color: 'purple', title: 'Insurer' },
};

function formatKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ValueDisplay({ value }) {
  if (value === null || value === undefined) {
    return <span className="json-field-value null">null</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span className="json-field-value boolean">
        {value ? '✅ Yes' : '❌ No'}
      </span>
    );
  }
  if (typeof value === 'number') {
    return (
      <span className="json-field-value number">
        {value.toLocaleString('en-IN')}
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="json-field-value null">None</span>;
    }
    return (
      <div className="addon-list">
        {value.map((item, i) => (
          <span key={i} className="addon-tag">{item}</span>
        ))}
      </div>
    );
  }
  if (typeof value === 'string') {
    return (
      <span className="json-field-value string">
        {value || <span className="null">—</span>}
      </span>
    );
  }
  return <span className="json-field-value">{String(value)}</span>;
}

function JsonSection({ sectionKey, data }) {
  const [isOpen, setIsOpen] = useState(true);
  const meta = SECTION_META[sectionKey] || {
    icon: '📄',
    color: 'blue',
    title: formatKey(sectionKey),
  };

  if (!data || typeof data !== 'object') return null;

  // Filter out empty fields (null, undefined, "", [])
  const validEntries = Object.entries(data).filter(([key, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    // If it's an array of objects (like insured_persons), we could deeply check,
    // but just checking length > 0 is fine for now based on the AI output.
    return true;
  });

  if (validEntries.length === 0) return null;

  return (
    <div className="json-section fade-in-up" id={`section-${sectionKey}`}>
      <div
        className="json-section-header"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
      >
        <div className="json-section-header-left">
          <div className={`section-icon ${meta.color}`}>{meta.icon}</div>
          <span className="json-section-title">{meta.title}</span>
        </div>
        <span className={`json-section-toggle ${isOpen ? 'open' : ''}`}>
          ▼
        </span>
      </div>

      <div className={`json-section-body ${isOpen ? '' : 'collapsed'}`}>
        {validEntries.map(([key, value]) => (
          <div className="json-field" key={key}>
            <span className="json-field-key">{formatKey(key)}</span>
            <ValueDisplay value={value} />
          </div>
        ))}
      </div>
    </div>
  );
}


export default function JsonViewer({ data, filename, onDownload, onNewUpload, hideActions = false, fileIndex, totalFiles }) {
  if (!data) return null;

  return (
    <div className="json-viewer" id="json-viewer">
      <div className="json-viewer-header">
        <div>
          <h2>
            📊 Extraction Results {totalFiles > 1 ? <span style={{fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 'normal'}}> (File {fileIndex} of {totalFiles})</span> : ''}
          </h2>
          {filename && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Source: {filename}
            </p>
          )}
        </div>
        {!hideActions && (
          <div className="json-viewer-actions">
            <button className="btn btn-primary" onClick={onDownload} id="download-json-btn">
              ⬇️ Download TXT
            </button>
            <button className="btn btn-new" onClick={onNewUpload} id="new-upload-btn">
              📄 New Upload
            </button>
          </div>
        )}
      </div>

      {Object.entries(data).map(([key, value], index) => (
        <div key={key} style={{ animationDelay: `${index * 0.05}s` }}>
          <JsonSection sectionKey={key} data={value} />
        </div>
      ))}
    </div>
  );
}
