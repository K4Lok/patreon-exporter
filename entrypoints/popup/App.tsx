import { useState, useEffect } from 'react';
import './App.css';

interface ExportSettings {
  pageSize: 'a4' | 'letter';
  imageQuality: 'high' | 'medium' | 'low';
}

function App() {
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isPatreonPage, setIsPatreonPage] = useState(false);
  const [settings, setSettings] = useState<ExportSettings>({
    pageSize: 'a4',
    imageQuality: 'high'
  });

  useEffect(() => {
    // Check if we're on a Patreon page
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      const currentTab = tabs[0];
      if (currentTab?.url?.includes('patreon.com')) {
        setIsPatreonPage(true);
      }
    });

    // Load saved settings
    browser.storage.sync.get(['pageSize', 'imageQuality']).then(result => {
      if (result.pageSize || result.imageQuality) {
        setSettings({
          pageSize: result.pageSize || 'a4',
          imageQuality: result.imageQuality || 'high'
        });
      }
    });
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setError('');
    setStatus('Preparing export...');

    try {
      // Get current tab
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Send message to content script
      setStatus('Extracting post content...');
      const response = await browser.tabs.sendMessage(tab.id, { 
        cmd: 'export',
        settings 
      });

      console.log('Content script response:', response);

      if (!response) {
        throw new Error('No response from content script. Please refresh the page and try again.');
      }

      if (response.success && response.data) {
        setStatus('Generating PDF...');
        
        // Send download command to background script
        const downloadResponse = await browser.runtime.sendMessage({
          cmd: 'download',
          blobUrl: response.data.blobUrl,
          filename: response.data.filename
        });

        if (downloadResponse && downloadResponse.success) {
          setStatus('PDF exported successfully!');
          setTimeout(() => window.close(), 2000);
        } else {
          throw new Error(downloadResponse?.error || 'Download failed');
        }
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
      setStatus('');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSettingChange = async (key: keyof ExportSettings, value: string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Save to storage
    await browser.storage.sync.set({ [key]: value });
  };

  if (!isPatreonPage) {
    return (
      <div className="container">
        <h1>Patreon Exporter</h1>
        <div className="info-message">
          <p>📋 Navigate to a Patreon post to export it as PDF</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Patreon Exporter</h1>
      
      <div className="settings">
        <div className="setting-group">
          <label htmlFor="pageSize">Page Size:</label>
          <select 
            id="pageSize"
            value={settings.pageSize}
            onChange={(e) => handleSettingChange('pageSize', e.target.value)}
            disabled={isExporting}
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </div>

        <div className="setting-group">
          <label htmlFor="imageQuality">Image Quality:</label>
          <select 
            id="imageQuality"
            value={settings.imageQuality}
            onChange={(e) => handleSettingChange('imageQuality', e.target.value)}
            disabled={isExporting}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <button 
        className="export-button"
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? 'Exporting...' : 'Export to PDF'}
      </button>

      {status && <div className="status">{status}</div>}
      {error && <div className="error">{error}</div>}

      <div className="footer">
        <small>Export Patreon posts for personal archival use only</small>
      </div>
    </div>
  );
}

export default App;
