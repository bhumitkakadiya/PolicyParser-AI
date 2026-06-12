import { createContext, useContext, useState, useCallback, useRef } from 'react';

const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const [state, setState] = useState('idle'); // idle | processing | complete
  const [filesQueue, setFilesQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  // We use a ref to track if we should stop processing
  const isProcessing = useRef(false);

  const processQueue = useCallback(async (queue) => {
    setState('processing');
    isProcessing.current = true;
    let currentResults = [];
    
    // Generate a unique batch ID for history grouping (implementation plan)
    const batchId = Date.now().toString();
    
    for (let i = 0; i < queue.length; i++) {
      if (!isProcessing.current) break; // Allow cancelling

      setCurrentIndex(i);
      const file = queue[i];
      try {
        const formData = new FormData();
        formData.append('pdf', file);
        formData.append('batchId', batchId); // For the upcoming history grouping feature

        const response = await fetch('/api/extract', {
          method: 'POST',
          body: formData,
        });

        const json = await response.json();
        
        if (!response.ok) {
          throw new Error(json.error || 'Extraction failed');
        }
        
        currentResults.push({ filename: file.name, data: json.data });
        setResults([...currentResults]); // Update UI progressively
      } catch (err) {
        currentResults.push({ filename: file.name, error: err.message });
        setResults([...currentResults]);
      }

      // Add a 4-second gap between files to avoid Gemini rate limits (free tier: 15 RPM)
      if (i < queue.length - 1 && isProcessing.current) {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    }
    
    if (isProcessing.current) {
      setState('complete');
      isProcessing.current = false;
    }
  }, []);

  const handleFilesSelected = useCallback((files) => {
    setFilesQueue(files);
    setCurrentIndex(0);
    setResults([]);
    setError('');
    processQueue(files);
  }, [processQueue]);

  const handleNewUpload = useCallback(() => {
    isProcessing.current = false;
    setState('idle');
    setResults([]);
    setFilesQueue([]);
    setError('');
  }, []);

  const cancelQueue = useCallback(() => {
    isProcessing.current = false;
    setState('complete');
  }, []);

  const retryFile = useCallback(async (index) => {
    const file = filesQueue[index];
    if (!file) return;

    // Update UI to show retrying
    setResults(prev => {
      const newResults = [...prev];
      newResults[index] = { filename: file.name, retrying: true };
      return newResults;
    });

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      // Let's use a new batchId or just single extraction since it's a retry
      // Actually, if we want it to join the batch, we should track batchId globally, but single retry is fine

      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      const json = await response.json();
      
      if (!response.ok) {
        throw new Error(json.error || 'Extraction failed');
      }
      
      setResults(prev => {
        const newResults = [...prev];
        newResults[index] = { filename: file.name, data: json.data };
        return newResults;
      });
    } catch (err) {
      setResults(prev => {
        const newResults = [...prev];
        newResults[index] = { filename: file.name, error: err.message };
        return newResults;
      });
    }
  }, [filesQueue]);

  const value = {
    state,
    filesQueue,
    currentIndex,
    results,
    error,
    handleFilesSelected,
    handleNewUpload,
    cancelQueue,
    retryFile
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  return useContext(UploadContext);
}
