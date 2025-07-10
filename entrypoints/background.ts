export default defineBackground(() => {
  console.log('Patreon Exporter background service worker loaded');

  // Listen for messages from content script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.cmd === 'download' && message.blobUrl && message.filename) {
      // Handle the download asynchronously
      (async () => {
        try {
          console.log('Download request received:', {
            filename: message.filename,
            showDialog: message.showDialog,
            hasShowDialog: 'showDialog' in message
          });

          // Download the PDF with user preference for save dialog
          const downloadId = await browser.downloads.download({
            url: message.blobUrl,
            filename: message.filename,
            saveAs: Boolean(message.showDialog)  // Ensure boolean conversion
          });

          console.log('Download started with saveAs:', Boolean(message.showDialog), 'downloadId:', downloadId);

          // TOFIX: Clean up blob URL after download starts URL is not support in service worker
          // setTimeout(() => {
          //   URL.revokeObjectURL(message.blobUrl);
          // }, 1000);

          // Send success response
          sendResponse({ success: true, downloadId });
        } catch (error) {
          console.error('Download failed:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })();
      
      // Return true to indicate we will send response asynchronously
      return true;
    }
    
    // For other messages, return false to indicate no async response
    return false;
  });
});
