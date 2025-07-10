import { useState, useEffect } from 'react';
import './App.css';

interface ExportSettings {
  pageSize: 'letter';
  imageQuality: 'high' | 'medium' | 'low';
  includeComments: boolean;
  showDownloadDialog: boolean;
}

function App() {
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPatreonPage, setIsPatreonPage] = useState(false);
  const [settings, setSettings] = useState<ExportSettings>({
    pageSize: 'letter',
    imageQuality: 'high',
    includeComments: true,
    showDownloadDialog: false
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
    browser.storage.sync.get(['pageSize', 'imageQuality', 'includeComments', 'showDownloadDialog']).then(result => {
      setSettings({
        pageSize: result.pageSize || 'letter',
        imageQuality: result.imageQuality || 'high',
        includeComments: result.includeComments !== undefined ? result.includeComments : true,
        showDownloadDialog: result.showDownloadDialog !== undefined ? result.showDownloadDialog : false
      });
    });
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setError('');
    setStatus('Preparing export...');
    setIsSuccess(false);

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
          setIsSuccess(true);
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
      setIsSuccess(false);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSettingChange = async (key: keyof ExportSettings, value: string) => {
    // Convert string values to appropriate types
    let actualValue: any = value;
    if (key === 'includeComments' || key === 'showDownloadDialog') {
      actualValue = value === 'true';
    }

    const newSettings = { ...settings, [key]: actualValue };
    setSettings(newSettings);

    // Save to storage
    await browser.storage.sync.set({ [key]: actualValue });
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

        <div className="setting-group">
          <label htmlFor="includeComments">
            <input
              type="checkbox"
              id="includeComments"
              checked={settings.includeComments}
              onChange={(e) => handleSettingChange('includeComments', e.target.checked.toString())}
              disabled={isExporting}
            />
            Include Comments
          </label>
        </div>

        <div className="setting-group">
          <label htmlFor="showDownloadDialog">
            <input
              type="checkbox"
              id="showDownloadDialog"
              checked={settings.showDownloadDialog}
              onChange={(e) => handleSettingChange('showDownloadDialog', e.target.checked.toString())}
              disabled={isExporting}
            />
            Show Download Dialog
          </label>
        </div>
      </div>

      <button 
        className="export-button"
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? 'Exporting...' : 'Export to PDF'}
      </button>

      {status && <div className={isSuccess ? "success" : "status"}>{status}</div>}
      {error && <div className="error">{error}</div>}

      <div className="footer">
        <small>Export Patreon posts with page splitting for better text selection</small>
      </div>
    </div>
  );
}

export default App;
