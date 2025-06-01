export default defineBackground(() => {
  console.log('Patreon Exporter background service worker loaded');

  // Listen for messages from content script
  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.cmd === 'download' && message.blobUrl && message.filename) {
      try {
        // Download the PDF
        const downloadId = await browser.downloads.download({
          url: message.blobUrl,
          filename: message.filename,
          saveAs: true
        });

        console.log('Download started:', downloadId);

        // TOFIX: Clean up blob URL after download starts URL is not support in service worker
        // setTimeout(() => {
        //   URL.revokeObjectURL(message.blobUrl);
        // }, 1000);

        return { success: true, downloadId };
      } catch (error) {
        console.error('Download failed:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
});
