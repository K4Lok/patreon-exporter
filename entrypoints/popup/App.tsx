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
  const [buttonText, setButtonText] = useState<string>('Export to PDF');
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

    // Listen for button status updates from content script
    const messageListener = (message: any) => {
      if (message.cmd === 'updatePopupButton') {
        setButtonText(message.text);
        setIsExporting(message.isExporting);
        if (message.isExporting) {
          setStatus('');
          setError('');
        }
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    // Cleanup listener on unmount
    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setError('');
    setButtonText('Preparing export...');

    try {
      // Get current tab
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Send message to content script with status updates
      if (settings.includeComments) {
        setStatus('Expanding comments...');
      } else {
        setStatus('Processing content...');
      }

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

        // Handle download based on user preference
        if (settings.showDownloadDialog) {
          setStatus('Downloading...');
          // Send download command to background script with dialog
          const downloadResponse = await browser.runtime.sendMessage({
            cmd: 'download',
            blobUrl: response.data.blobUrl,
            filename: response.data.filename,
            showDialog: true
          });

          if (downloadResponse && downloadResponse.success) {
            const stats = response.data.stats;
            setButtonText(`Success! ${stats.pages}p, ${stats.comments}c`);
            setTimeout(() => window.close(), 3000);
          } else {
            throw new Error(downloadResponse?.error || 'Download failed');
          }
        } else {
          setStatus('Downloading...');
          // Direct download without dialog
          const downloadResponse = await browser.runtime.sendMessage({
            cmd: 'download',
            blobUrl: response.data.blobUrl,
            filename: response.data.filename,
            showDialog: false
          });

          if (downloadResponse && downloadResponse.success) {
            const stats = response.data.stats;
            setButtonText(`Success! ${stats.pages}p, ${stats.comments}c`);
            setTimeout(() => window.close(), 3000);
          } else {
            throw new Error(downloadResponse?.error || 'Download failed');
          }
        }
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
      setButtonText('Export to PDF');
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
          <label htmlFor="imageQuality">
            Image Quality:
            <span className="tooltip-icon" title="Higher quality produces better images but larger file sizes. Medium quality is recommended for most use cases.">?</span>
          </label>
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
            <span className="tooltip-icon" title="Includes all comments and replies in the PDF. This may significantly increase processing time for posts with many comments.">?</span>
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
            <span className="tooltip-icon" title="Shows a save dialog where you can choose the download location and filename">?</span>
          </label>
        </div>
      </div>

      <button
        className="export-button"
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? buttonText : 'Export to PDF'}
      </button>

      {error && <div className="error">{error}</div>}

      <div className="footer">
        <small>Export Patreon posts as high-quality PDFs with intelligent pagination</small>
      </div>
    </div>
  );
}

export default App;
