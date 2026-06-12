import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import HistoryPage from './pages/HistoryPage';
import { UploadProvider, useUpload } from './context/UploadContext';
import './index.css';

function Navigation() {
  const location = useLocation();
  const { state, currentIndex, filesQueue, handleNewUpload } = useUpload();

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand" onClick={handleNewUpload}>
        <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' }} />
        <div className="navbar-title">
          Insuraa<span>Extractor</span>
        </div>
      </NavLink>

      {state === 'processing' && (
        <NavLink to="/" className="fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-glass)', padding: '0.4rem 1rem', borderRadius: '20px', border: '1px solid var(--border-accent)', textDecoration: 'none' }}>
          <div className="processing-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', margin: 0, borderColor: 'var(--border-subtle)', borderTopColor: 'var(--accent-blue)', borderRightColor: 'var(--accent-cyan)' }}></div>
          <span style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', fontWeight: '500' }}>
            Processing {currentIndex + 1} of {filesQueue.length}...
          </span>
        </NavLink>
      )}

      <div className="navbar-links">
        <NavLink
          to="/"
          end
          className={({ isActive }) => isActive ? 'active' : ''}
          onClick={handleNewUpload}
        >
          📄 Upload
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => isActive ? 'active' : ''}
        >
          📋 History
        </NavLink>
      </div>
    </nav>
  );
}

function App() {
  return (
    <UploadProvider>
      <BrowserRouter>
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </UploadProvider>
  );
}

export default App;
