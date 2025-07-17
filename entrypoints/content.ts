import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ExportSettings {
  pageSize?: 'letter';
  imageQuality?: 'high' | 'medium' | 'low';
  includeComments?: boolean;
  showDownloadDialog?: boolean;
}

export default defineContentScript({
  matches: ['https://www.patreon.com/*'],
  async main() {

    // Add a "To PDF" button to the page
    addToPdfButton();

    // Monitor for page changes and update button accordingly
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('Page changed, updating button...');
        // Remove existing button and add new one
        const existingButton = document.querySelector('#patreon-exporter-button');
        if (existingButton) {
          existingButton.remove();
        }
        addToPdfButton();
      }
    }, 1000);

    // Listen for messages from popup
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.cmd === 'export') {

        // Handle async export - create a dummy button for status (popup export)
        const dummyButton = document.createElement('button') as HTMLButtonElement;

        // For popup exports, we only generate the PDF and return the blob URL
        // The popup will handle the download with the correct settings
        // For popup exports, we only generate the PDF and return the blob URL
        // The popup will handle the download with the correct settings
        exportPostWithStatus(message.settings, dummyButton)
          .then((result: { blobUrl: string; filename: string }) => {
            sendResponse({ success: true, data: result });
          })
          .catch((error: Error) => {
            console.error('Export failed:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            });
          });

        // Return true to indicate we'll send response asynchronously
        return true;
      }

      // Send immediate response for unknown commands
      sendResponse({ success: false, error: 'Unknown command' });
      return false;
    });

    // Global state for button synchronization
    let currentExportStatus = {
      isExporting: false,
      statusText: 'To PDF',
      statusColor: '#ff424d'
    };

    // Helper functions for button status updates
    function updateButtonStatus(button: HTMLButtonElement, text: string, color: string) {
      console.log('Updating button status:', text, color);
      button.textContent = text;
      button.style.backgroundColor = color;
      button.style.cursor = button.disabled ? 'not-allowed' : 'pointer';
    }

    // Centralized function to update all buttons (popup and floating)
    function updateAllButtonsStatus(text: string, color: string, isExporting: boolean = false) {
      console.log('Updating all buttons status:', text, color, 'isExporting:', isExporting);

      // Update global state
      currentExportStatus = {
        isExporting,
        statusText: text,
        statusColor: color
      };

      // Update floating button if it exists
      const floatingButton = document.querySelector('#patreon-exporter-button') as HTMLButtonElement;
      if (floatingButton) {
        floatingButton.textContent = text;
        floatingButton.style.backgroundColor = color;
        floatingButton.disabled = isExporting;
        floatingButton.style.cursor = isExporting ? 'not-allowed' : 'pointer';
        floatingButton.style.opacity = isExporting ? '0.7' : '1';
      }

      // Send message to popup to update its button
      try {
        browser.runtime.sendMessage({
          cmd: 'updatePopupButton',
          text: text,
          color: color,
          isExporting: isExporting
        }).catch(() => {
          // Popup might not be open, ignore error
        });
      } catch (error) {
        // Ignore errors if popup is not open
      }
    }

    function resetButton(button: HTMLButtonElement) {
      button.disabled = false;
      button.textContent = 'To PDF';
      button.style.backgroundColor = '#ff424d';
    }

    async function downloadFileDirectly(blobUrl: string, filename: string, showDialog: boolean = false) {
      try {
        // Method 1: Try using Chrome downloads API through background script
        if (typeof browser !== 'undefined' && browser.runtime) {
          try {
            await browser.runtime.sendMessage({
              cmd: 'download',
              blobUrl: blobUrl,
              filename: filename,
              showDialog: showDialog
            });
            console.log('Download initiated via background script');
            return;
          } catch (error) {
            console.log('Background download failed, trying direct method:', error);
          }
        }

        // Method 2: Direct download with forced click
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';

        // Add to DOM
        document.body.appendChild(link);

        // Force click with multiple attempts
        link.click();

        // Try programmatic click if first doesn't work
        setTimeout(() => {
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          link.dispatchEvent(clickEvent);
        }, 100);

        // Clean up
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, 1000);

        console.log('Download initiated via direct link');
      } catch (error) {
        console.error('Download failed:', error);
        // Fallback: show the blob URL for manual download
        window.open(blobUrl, '_blank');
      }
    }

    async function loadAllCommentsWithCount(statusButton: HTMLButtonElement): Promise<number> {
      console.log('Loading all comments with count...');
      console.log('Status button:', statusButton.id);

      // Find the comments container first to limit our scope
      const commentsContainer = document.querySelector('div[data-tag="content-card-comment-thread-container"]');
      if (!commentsContainer) {
        console.log('No comments container found, skipping comment expansion');
        return 0;
      }

      console.log('Found comments container, expanding comments within it...');

      // Function to count current comments
      const getCurrentCommentCount = () => {
        return commentsContainer.querySelectorAll('div[data-tag="comment-row"]').length;
      };

      // Show initial comment count
      let currentCount = getCurrentCommentCount();
      updateAllButtonsStatus(`Expanding comments... (${currentCount})`, '#f59e0b', true);
      console.log('Initial comment count:', currentCount);

      // Only look for buttons within the comments container
      const loadMoreButtons = commentsContainer.querySelectorAll('button[data-tag="loadMoreCommentsCta"]');

      console.log('Found', loadMoreButtons.length, 'load more buttons');

      for (const button of loadMoreButtons) {
        if (button instanceof HTMLElement && button.offsetParent !== null) { // Check if visible
          console.log('Clicking load more comments...');
          button.click();

          // Wait for new comments to load and update count in real-time
          await new Promise(resolve => setTimeout(resolve, 800)); // Initial wait for loading

          // Check for new comments every 200ms for up to 3 seconds
          const maxChecks = 15; // 3 seconds / 200ms
          for (let i = 0; i < maxChecks; i++) {
            const newCount = getCurrentCommentCount();
            if (newCount > currentCount) {
              currentCount = newCount;
              updateAllButtonsStatus(`Expanding comments... (${currentCount})`, '#f59e0b', true);
              console.log('Updated comment count:', currentCount);
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      // Click "Load replies" buttons within comments container only
      const allButtons = commentsContainer.querySelectorAll('button');
      let replyClickCount = 0;

      for (const button of allButtons) {
        const buttonText = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

        if ((buttonText.includes('load') && buttonText.includes('replies')) ||
            (ariaLabel.includes('replies')) ||
            buttonText.includes('collapse replies')) {
          if (button instanceof HTMLElement && button.offsetParent !== null) {
            console.log(`Clicking replies button: ${buttonText || ariaLabel}`);
            button.click();
            replyClickCount++;

            // Wait for replies to load and update count
            await new Promise(resolve => setTimeout(resolve, 600));

            // Check for new comments after reply expansion
            const newCount = getCurrentCommentCount();
            if (newCount > currentCount) {
              currentCount = newCount;
              updateAllButtonsStatus(`Expanding comments... (${currentCount})`, '#f59e0b', true);
              console.log('Updated comment count after replies:', currentCount);
            }
          }
        }
      }

      console.log('Finished loading all comments');

      // Final wait and count update
      await new Promise(resolve => setTimeout(resolve, 1000));
      const finalCount = getCurrentCommentCount();
      if (finalCount > currentCount) {
        currentCount = finalCount;
        updateAllButtonsStatus(`Expanding comments... (${currentCount})`, '#f59e0b', true);
      }

      console.log(`Final comment count: ${currentCount}`);

      // Show final comment count
      if (currentCount > 0) {
        updateAllButtonsStatus(`Found ${currentCount} comments`, '#f59e0b', true);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Show this status for a moment
      }

      return currentCount;
    }

    async function calculatePDFStats(pdfBlob: Blob, commentCount: number): Promise<{ pages: number; comments: number }> {
      try {
        // Add timeout protection for blob size calculation
        const stats = await Promise.race([
          new Promise<{ pages: number; comments: number }>((resolve) => {
            // For now, we'll estimate pages based on blob size
            // A more accurate method would require parsing the PDF, but this gives a reasonable estimate
            const sizeInKB = pdfBlob.size / 1024;
            const estimatedPages = Math.max(1, Math.ceil(sizeInKB / 50)); // Rough estimate: 50KB per page

            console.log(`PDF Stats - Size: ${sizeInKB.toFixed(1)}KB, Estimated Pages: ${estimatedPages}, Comments: ${commentCount}`);

            resolve({
              pages: estimatedPages,
              comments: commentCount
            });
          }),
          new Promise<{ pages: number; comments: number }>((_, reject) => {
            setTimeout(() => reject(new Error('PDF stats calculation timeout')), 15000); // 15 second timeout (increased from 5s)
          })
        ]);

        return stats;
      } catch (error) {
        console.error('Error calculating PDF stats:', error);
        // Return fallback stats
        return {
          pages: 1,
          comments: commentCount
        };
      }
    }

    async function exportPostWithStatus(settings: ExportSettings, button: HTMLButtonElement): Promise<{ blobUrl: string; filename: string; stats: { pages: number; comments: number } }> {
      console.log('exportPostWithStatus called with button:', button.id);

      // Add overall timeout protection for the entire export process
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let isCompleted = false;

      try {
        const result = await Promise.race([
          exportPostWithStatusInternal(settings, button).then(result => {
            isCompleted = true;
            if (timeoutId) clearTimeout(timeoutId);
            console.log('Export process completed successfully');
            return result;
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              if (!isCompleted) {
                console.error('Export process timeout - operation took longer than 15 minutes');
                updateAllButtonsStatus('Timeout!', '#ef4444', false);
                setTimeout(() => {
                  updateAllButtonsStatus('To PDF', '#ff424d', false);
                }, 3000); // Reset button after 3 seconds
                reject(new Error('Export timeout: The operation took longer than expected. This may be due to very large content or browser memory limitations.'));
              }
            }, 900000); // 15 minute timeout (increased from 5 minutes)
          })
        ]);

        return result;
      } catch (error) {
        console.error('Export process failed:', error);
        if (timeoutId) clearTimeout(timeoutId);
        // Ensure button is reset on any error
        setTimeout(() => {
          updateAllButtonsStatus('To PDF', '#ff424d', false);
        }, 3000);
        throw error;
      }
    }

    async function exportPostWithStatusInternal(settings: ExportSettings, button: HTMLButtonElement): Promise<{ blobUrl: string; filename: string; stats: { pages: number; comments: number } }> {
      console.log('Starting internal export process');
      let commentCount = 0;

      // Only expand comments if the setting is enabled
      if (settings.includeComments !== false) {
        console.log('Starting comment expansion...');
        updateAllButtonsStatus('Expanding comments...', '#f59e0b', true);
        commentCount = await loadAllCommentsWithCount(button);
        console.log('Comment expansion completed, count:', commentCount);
      } else {
        console.log('Comments disabled, skipping...');
        updateAllButtonsStatus('Processing content...', '#8b5cf6', true);
      }

      // Find the main post content
      const postContent = findPostContent();
      if (!postContent) {
        throw new Error('Could not find post content on this page');
      }

      updateAllButtonsStatus('Processing content...', '#8b5cf6', true);
      await new Promise(resolve => setTimeout(resolve, 800)); // Show this status

      // Clone and clean the content
      const cleanedContent = await cleanContent(postContent, settings.includeComments !== false);

      // Get post title for filename (no date needed)
      const postTitle = getPostTitle();
      const sanitizedTitle = sanitizeFilename(postTitle);
      const filename = `${sanitizedTitle}.pdf`;

      console.log('Generated filename:', filename);

      try {
        updateAllButtonsStatus('Generating PDF...', '#06b6d4', true);
        await new Promise(resolve => setTimeout(resolve, 500)); // Show this status

        // Generate PDF with progress updates
        const pdfBlob = await generatePDFWithProgress(cleanedContent, settings, button);

        // Update status after PDF generation
        updateAllButtonsStatus('Creating download link...', '#06b6d4', true);
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause to show status

        // Create blob URL with timeout protection
        const blobUrl = await Promise.race([
          new Promise<string>((resolve) => {
            try {
              const url = URL.createObjectURL(pdfBlob);
              console.log('Blob URL created successfully');
              resolve(url);
            } catch (error) {
              throw new Error(`Failed to create blob URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }),
          new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('Blob URL creation timeout')), 30000); // 30 second timeout (increased from 10s)
          })
        ]);

        // Calculate PDF stats
        updateAllButtonsStatus('Calculating statistics...', '#06b6d4', true);
        console.log('About to calculate PDF stats...');
        const stats = await calculatePDFStats(pdfBlob, commentCount);
        console.log('PDF stats calculated successfully:', stats);

        console.log('Export completed successfully, returning result');
        return { blobUrl, filename, stats };
      } catch (error) {
        console.error('PDF generation failed:', error);
        throw error;
      } finally {
        // Clean up
        cleanedContent.remove();
      }
    }

    // Function to add a "To PDF" button to the page
    function addToPdfButton() {
      // Check if button already exists
      if (document.querySelector('#patreon-exporter-button')) {
        return;
      }

      // Check if we're on a valid post page
      const isValidPage = isPostPage();

      // Create the button element
      const button = document.createElement('button');
      button.textContent = isValidPage ? 'To PDF' : 'Not a post page';
      button.id = 'patreon-exporter-button';
      button.disabled = !isValidPage;

      // Style the button
      button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 15px;
        font-size: 14px;
        font-weight: 600;
        color: white;
        background-color: ${isValidPage ? '#ff424d' : '#cccccc'};
        border: none;
        border-radius: 8px;
        cursor: ${isValidPage ? 'pointer' : 'not-allowed'};
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
        opacity: ${isValidPage ? '1' : '0.6'};
      `;

      // Add hover effect only for valid pages
      if (isValidPage) {
        button.addEventListener('mouseover', () => {
          if (!button.disabled) {
            button.style.backgroundColor = '#e63946';
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 4px 12px rgba(255, 66, 77, 0.3)';
          }
        });

        button.addEventListener('mouseout', () => {
          if (!button.disabled) {
            button.style.backgroundColor = '#ff424d';
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
          }
        });
      }
      
      // Add click handler to export the post
      button.addEventListener('click', async () => {
        console.log('Export button clicked, starting process...');
        console.log('Button element:', button);
        console.log('Button ID:', button.id);

        // Change button state to indicate processing
        updateAllButtonsStatus('Preparing...', '#cccccc', true);

        try {
          // Get settings from storage
          const settings = await browser.storage.sync.get(['pageSize', 'imageQuality', 'includeComments', 'showDownloadDialog']);
          const exportSettings = {
            pageSize: settings.pageSize || 'letter',
            imageQuality: settings.imageQuality || 'high',
            includeComments: settings.includeComments !== undefined ? settings.includeComments : true,
            showDownloadDialog: settings.showDownloadDialog !== undefined ? settings.showDownloadDialog : false
          };

          console.log('Export settings:', exportSettings);

          // Export the post with status updates
          const result = await exportPostWithStatus(exportSettings, button);

          // Download based on user preference
          updateAllButtonsStatus('Downloading...', '#4f46e5', true);
          await downloadFileDirectly(result.blobUrl, result.filename, exportSettings.showDownloadDialog);

          // Show success state with stats
          const stats = result.stats;
          updateAllButtonsStatus(`Success! ${stats.pages}p, ${stats.comments}c`, '#10b981', false);

          // Reset button after a delay
          setTimeout(() => {
            resetButton(button);
          }, 3000);

        } catch (error) {
          console.error('Export failed:', error);

          // Show error state
          updateAllButtonsStatus('Failed!', '#ef4444', false);

          // Reset button after a delay
          setTimeout(() => {
            resetButton(button);
          }, 2000);
        }
      });
      
      // Add the button to the page
      document.body.appendChild(button);
    }
    
    // Check if we're on a post page
    function isPostPage(): boolean {
      // Check URL pattern first - must be a posts URL
      const url = window.location.href;
      const isPostURL = /https:\/\/www\.patreon\.com\/posts\//.test(url);

      if (!isPostURL) {
        console.log('Not a post URL:', url);
        return false;
      }

      // Check for post-specific elements
      const postSelectors = [
        'div[data-tag="post-card"]',
        'article[data-tag="post-card"]',
        'span[data-tag="post-title"]', // Post title element
        // Add more specific selectors if needed
      ];

      for (const selector of postSelectors) {
        if (document.querySelector(selector)) {
          console.log('Found post element:', selector);
          return true;
        }
      }

      // Check if we can find post content
      const hasPostContent = !!findPostContent();
      console.log('Post content found:', hasPostContent);

      return hasPostContent;
    }



    function findPostContent(): Element | null {
      // Use the correct Patreon selectors based on the actual HTML structure
      const selectors = [
        'div[data-tag="post-card"]',  // Main post wrapper
        // Fallbacks if the above doesn't work
        'article',
        'main > div > div'
      ];

      for (const selector of selectors) {
        const content = document.querySelector(selector);
        if (content && content.textContent && content.textContent.trim().length > 100) {
          return content;
        }
      }

      return null;
    }

    async function cleanContent(originalContent: Element, includeComments: boolean = true): Promise<HTMLElement> {
      
      // Create a hidden container for cleaned content
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 794px; /* A4 width in pixels at 96 DPI */
        background: white;
        padding: 40px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
      `;
      
      // Clone the content
      const clonedContent = originalContent.cloneNode(true) as HTMLElement;

      // Extract and process comments before removing them (only if enabled)
      let commentsSection = null;
      if (includeComments) {
        commentsSection = await extractAndProcessComments(clonedContent);
        console.log('Comments section created:', commentsSection ? 'Yes' : 'No');
      } else {
        console.log('Comments disabled, skipping comment extraction');
      }

      // Remove unwanted elements using correct Patreon selectors
      const selectorsToRemove = [
        // Post footer/reactions
        'button[data-tag="like-button"]',
        'span[data-tag="like-count"]',
        'button[data-tag="comment-post-icon"]',
        'button[data-tag="more-actions-button"]',
        'button[data-tag="share-post-icon"]',

        // Comments section (will be re-added in processed form)
        'div[data-tag="content-card-comment-thread-container"]',
        'div[data-tag="comment-row"]',
        'button[data-tag="loadMoreCommentsCta"]',
        'textarea[data-tag="comment-field"]',

        // Generic unwanted elements
        'button',
        'nav',
        '[role="navigation"]',

        // Remove problematic media elements but keep images
        'video',
        'audio',
        'iframe',
        'embed',
        'object',
        'svg'
      ];

      let removedCount = 0;
      selectorsToRemove.forEach(selector => {
        const elementsToRemove = clonedContent.querySelectorAll(selector);
        elementsToRemove.forEach(el => {
          // Don't remove img tags even if they match other selectors
          if (el.tagName.toLowerCase() !== 'img') {
            el.remove();
            removedCount++;
          }
        });
      });
      container.appendChild(clonedContent);
      document.body.appendChild(container);

      // Replace all external images with placeholders immediately
      await replaceImagesWithPlaceholders(container);

      // Add processed comments section if it exists
      if (commentsSection) {
        console.log('Adding comments section to container');
        container.appendChild(commentsSection);
        console.log('Comments section added. Container children count:', container.children.length);
      } else {
        console.log('No comments section to add');
      }

      return container;
    }

    async function extractAndProcessComments(_content: HTMLElement): Promise<HTMLElement | null> {
      // First, try to load all comments by clicking "Load more" buttons
      await loadAllComments();

      // Find the comments container from the live DOM (not cloned content)
      const liveCommentsContainer = document.querySelector('div[data-tag="content-card-comment-thread-container"]');
      if (!liveCommentsContainer) {
        console.log('No comments found');
        return null;
      }

      console.log('Processing comments with thread structure...');

      // Create a clean comments section (very compact)
      const cleanCommentsSection = document.createElement('div');
      cleanCommentsSection.style.cssText = `
        margin-top: 15px;
        padding-top: 8px;
        border-top: 1px solid #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      // Add comments header (compact)
      const commentsHeader = document.createElement('h3');
      commentsHeader.textContent = 'Comments';
      commentsHeader.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 6px;
        color: #333;
        border-bottom: 1px solid #e0e0e0;
        padding-bottom: 3px;
      `;
      cleanCommentsSection.appendChild(commentsHeader);

      // Process comments with thread structure
      const commentCount = await processCommentsWithThreads(liveCommentsContainer as HTMLElement, cleanCommentsSection);

      console.log(`Processed ${commentCount} comments with replies`);

      return commentCount > 0 ? cleanCommentsSection : null;
    }

    async function loadAllComments(): Promise<void> {
      console.log('Loading all comments...');

      // Find the comments container first to limit our scope
      const commentsContainer = document.querySelector('div[data-tag="content-card-comment-thread-container"]');
      if (!commentsContainer) {
        console.log('No comments container found, skipping comment expansion');
        return;
      }

      console.log('Found comments container, expanding comments within it...');

      // Only look for buttons within the comments container
      const loadMoreButtons = commentsContainer.querySelectorAll('button[data-tag="loadMoreCommentsCta"]');
      let clickCount = 0;

      for (const button of loadMoreButtons) {
        if (button instanceof HTMLElement && button.offsetParent !== null) { // Check if visible
          console.log('Clicking load more comments...');
          button.click();
          clickCount++;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for loading
        }
      }

      if (clickCount > 0) {
        console.log(`Clicked ${clickCount} "load more" buttons`);
      }

      // Click "Load replies" buttons within comments container only
      const allButtons = commentsContainer.querySelectorAll('button');
      let replyClickCount = 0;

      for (const button of allButtons) {
        const buttonText = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

        if ((buttonText.includes('load') && buttonText.includes('replies')) ||
            (ariaLabel.includes('replies')) ||
            buttonText.includes('collapse replies')) {
          if (button instanceof HTMLElement && button.offsetParent !== null) {
            console.log(`Clicking replies button: ${buttonText || ariaLabel}`);
            button.click();
            replyClickCount++;
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for loading
          }
        }
      }

      if (replyClickCount > 0) {
        console.log(`Clicked ${replyClickCount} reply buttons`);
      }

      console.log('Finished loading all comments');

      // Wait a bit more for all content to load
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    async function processCommentsWithThreads(commentsContainer: HTMLElement, cleanCommentsSection: HTMLElement): Promise<number> {
      let commentCount = 0;

      console.log('Processing comments with threads...');
      console.log('Comments container:', commentsContainer);

      // Try multiple selectors to find comments
      let topLevelComments = commentsContainer.querySelectorAll(':scope > div > div > div[data-tag="comment-row"]');
      console.log('Found top-level comments (method 1):', topLevelComments.length);

      if (topLevelComments.length === 0) {
        // Try alternative selector
        topLevelComments = commentsContainer.querySelectorAll('div[data-tag="comment-row"]');
        console.log('Found comments (method 2):', topLevelComments.length);
      }

      if (topLevelComments.length === 0) {
        console.log('No comments found with any selector');
        return 0;
      }

      for (const commentRow of topLevelComments) {
        console.log('Processing comment row:', commentRow);
        const processedComment = processComment(commentRow as HTMLElement, 0);
        if (processedComment) {
          cleanCommentsSection.appendChild(processedComment);
          commentCount++;
          console.log('Added comment, total count:', commentCount);

          // Look for replies to this comment
          const repliesCount = await processReplies(commentRow as HTMLElement, cleanCommentsSection, 1);
          commentCount += repliesCount;
        } else {
          console.log('Failed to process comment row');
        }
      }

      console.log('Final comment count:', commentCount);
      return commentCount;
    }

    async function processReplies(parentCommentRow: HTMLElement, container: HTMLElement, indentLevel: number): Promise<number> {
      let replyCount = 0;

      console.log('Looking for replies to comment, indent level:', indentLevel);

      // Find the parent container of this comment
      let currentElement = parentCommentRow.parentElement;
      while (currentElement && !currentElement.classList.contains('sc-e67b4030-1')) {
        currentElement = currentElement.parentElement;
      }

      if (!currentElement) {
        console.log('No parent container found for replies');
        return 0;
      }

      // Look for reply containers (usually the next sibling with class containing reply indicators)
      const nextSibling = currentElement.nextElementSibling;
      if (nextSibling && (nextSibling.classList.contains('sc-e67b4030-2') || nextSibling.querySelector('[data-tag="comment-row"]'))) {
        const replyComments = nextSibling.querySelectorAll('[data-tag="comment-row"]');
        console.log(`Found ${replyComments.length} replies at indent level ${indentLevel}`);

        for (const replyRow of replyComments) {
          const processedReply = processComment(replyRow as HTMLElement, indentLevel);
          if (processedReply) {
            container.appendChild(processedReply);
            replyCount++;
            console.log(`Added reply ${replyCount} at indent level ${indentLevel}`);

            // Recursively process nested replies (though Patreon usually has max 2 levels)
            const nestedReplies = await processReplies(replyRow as HTMLElement, container, indentLevel + 1);
            replyCount += nestedReplies;
          }
        }
      } else {
        console.log('No reply container found');
      }

      return replyCount;
    }

    function processComment(commentRow: HTMLElement, indentLevel: number): HTMLElement | null {
      try {
        console.log('Processing individual comment, indent level:', indentLevel);

        // Extract comment data
        const commenterNameElement = commentRow.querySelector('button[data-tag="commenter-name"] span');
        const commentBodyElement = commentRow.querySelector('div[data-tag="comment-body"]');
        const timeElement = commentRow.querySelector('time');
        const creatorBadge = commentRow.querySelector('p:has(strong)');

        const commenterName = commenterNameElement?.textContent?.trim() || 'Anonymous';
        const commentBody = commentBodyElement?.textContent?.trim() || '';
        const timeText = timeElement?.textContent?.trim() || '';
        const isCreator = creatorBadge?.textContent?.includes('CREATOR') || false;

        console.log('Comment data:', { commenterName, commentBody: commentBody.substring(0, 50), timeText, isCreator });

        if (!commentBody) {
          console.log('Skipping empty comment');
          return null; // Skip empty comments
        }

        // Calculate indentation for replies with more visual distinction
        const indentPx = indentLevel * 25; // Increased indent for better visibility
        const isReply = indentLevel > 0;

        // Create clean comment element with very compact styling
        const commentElement = document.createElement('div');
        commentElement.style.cssText = `
          margin-bottom: 4px;
          margin-left: ${indentPx}px;
          padding: 4px 6px;
          background: ${isReply ? '#f0f0f0' : '#f8f9fa'};
          border-radius: 3px;
          border-left: ${isReply ? '2px' : '3px'} solid ${isCreator ? '#ff424d' : (isReply ? '#999' : '#ddd')};
          font-size: 11px;
          line-height: 1.3;
          ${isReply ? 'border-top: 1px solid #e0e0e0;' : ''}
        `;

        // Comment header with name and time (very compact)
        const commentHeader = document.createElement('div');
        commentHeader.style.cssText = `
          display: flex;
          align-items: center;
          margin-bottom: 2px;
          font-size: 10px;
          color: #666;
        `;

        // Reply indicator with better visual hierarchy
        if (isReply) {
          const replyIndicator = document.createElement('span');
          replyIndicator.textContent = indentLevel === 1 ? '└─ ' : '  └─ ';
          replyIndicator.style.cssText = `
            color: #999;
            margin-right: 3px;
            font-family: monospace;
          `;
          commentHeader.appendChild(replyIndicator);
        }

        // Creator badge (very small)
        if (isCreator) {
          const creatorBadgeSpan = document.createElement('span');
          creatorBadgeSpan.textContent = 'CREATOR';
          creatorBadgeSpan.style.cssText = `
            background: #ff424d;
            color: white;
            padding: 1px 3px;
            border-radius: 2px;
            font-size: 8px;
            font-weight: 600;
            margin-right: 4px;
          `;
          commentHeader.appendChild(creatorBadgeSpan);
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = commenterName;
        nameSpan.style.cssText = `
          font-weight: 600;
          color: ${isCreator ? '#ff424d' : (isReply ? '#555' : '#333')};
          margin-right: 4px;
          font-size: ${isReply ? '10px' : '11px'};
        `;
        commentHeader.appendChild(nameSpan);

        if (timeText) {
          const timeSpan = document.createElement('span');
          timeSpan.textContent = `• ${timeText}`;
          timeSpan.style.cssText = `
            color: #999;
            font-size: 9px;
          `;
          commentHeader.appendChild(timeSpan);
        }

        // Comment body (very compact)
        const commentBodyDiv = document.createElement('div');
        commentBodyDiv.textContent = commentBody;
        commentBodyDiv.style.cssText = `
          font-size: ${isReply ? '10px' : '11px'};
          line-height: 1.3;
          color: ${isReply ? '#555' : '#333'};
          word-wrap: break-word;
          margin-top: 1px;
        `;

        commentElement.appendChild(commentHeader);
        commentElement.appendChild(commentBodyDiv);

        return commentElement;
      } catch (error) {
        console.error('Error processing comment:', error);
        return null;
      }
    }

    // Track failed images to prevent infinite retries
    const failedImageUrls = new Set<string>();

    async function replaceImagesWithPlaceholders(container: HTMLElement): Promise<void> {
      // Look for images
      const allImgTags = container.getElementsByTagName('img');

      if (allImgTags.length === 0) {
        console.log('No images found in container');
        return;
      }

      // Convert HTMLCollection to Array for easier processing
      const imageArray = Array.from(allImgTags);

      // Log image analysis
      console.log(`Found ${imageArray.length} images to process:`);
      imageArray.forEach((img, index) => {
        const src = img.src || '';
        const dataMediaId = img.getAttribute('data-media-id') || '';
        const alt = img.getAttribute('alt') || '';
        console.log(`  Image ${index + 1}: src="${src.substring(0, 50)}${src.length > 50 ? '...' : ''}", data-media-id="${dataMediaId}", alt="${alt}"`);
      });

      // Process images in parallel with limited concurrency to prevent overwhelming the browser
      const batchSize = 5; // Process 5 images at a time
      for (let i = 0; i < imageArray.length; i += batchSize) {
        const batch = imageArray.slice(i, i + batchSize);
        const batchPromises = batch.map((img, batchIndex) =>
          processImageWithFetch(img as HTMLImageElement, i + batchIndex + 1)
        );

        await Promise.allSettled(batchPromises);

        // Small delay between batches to prevent overwhelming the browser
        if (i + batchSize < imageArray.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`Image processing completed. Failed URLs: ${failedImageUrls.size}`);
    }

    async function processImageWithFetch(img: HTMLImageElement, index: number): Promise<void> {
      const originalSrc = img.src;

      // Skip if already a data URL or blob URL
      if (originalSrc.startsWith('data:') || originalSrc.startsWith('blob:')) {
        return;
      }

      // Handle images with empty or missing src - create placeholder immediately
      if (!originalSrc || originalSrc.trim() === '') {
        console.log(`Found image with empty src, creating placeholder for image ${index}`);
        // Check if image has data attributes that might indicate it's a media element
        const dataMediaId = img.getAttribute('data-media-id');
        const altText = img.getAttribute('alt') || '';
        const placeholderText = dataMediaId ? `Media ID: ${dataMediaId}` : 'Empty image source';
        createImagePlaceholder(img, placeholderText, index);
        return;
      }

      // Skip if this URL has already failed
      if (failedImageUrls.has(originalSrc)) {
        console.log(`Skipping previously failed image ${index}: ${originalSrc.substring(0, 50)}...`);
        createImagePlaceholder(img, originalSrc, index);
        return;
      }

      try {
        // Add timeout to fetch request to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        // Fetch the image using the extension's permissions
        const response = await fetch(originalSrc, {
          method: 'GET',
          mode: 'cors', // Try CORS first since we have host permissions
          credentials: 'omit',
          cache: 'force-cache', // Use cache if available for performance
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();
          
          // Create blob URL
          const blobUrl = URL.createObjectURL(blob);
          
          // Update image src
          img.src = blobUrl;
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.display = 'block';
          img.style.margin = '20px 0';
          img.style.objectFit = 'contain';
          img.style.breakInside = 'avoid';

          // Clean up blob URL after some time (but not too soon for PDF generation)
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 60000); // 1 minute should be enough for PDF generation

          // Ensure image loads properly before PDF generation
          return new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve(); // Continue even if image fails to load
              // Timeout after 5 seconds
              setTimeout(() => resolve(), 5000);
            }
          });
          
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        // Track this URL as failed to prevent future retries
        failedImageUrls.add(originalSrc);

        console.log(`Failed to fetch image ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);

        // Create placeholder as fallback
        createImagePlaceholder(img, originalSrc, index);
      }
    }

    function createImagePlaceholder(img: HTMLImageElement, originalSrc: string, index: number): void {
      // Create a properly sized placeholder div
      const placeholder = document.createElement('div');

      // Get dimensions from the original image or use defaults
      const width = img.offsetWidth || img.naturalWidth || 400;
      const height = img.offsetHeight || img.naturalHeight || 200;

      // Check for additional metadata
      const dataMediaId = img.getAttribute('data-media-id');
      const altText = img.getAttribute('alt') || '';

      // Determine the reason for placeholder
      let reason = 'Could not load image';
      let details = originalSrc;

      if (!originalSrc || originalSrc.trim() === '') {
        reason = 'Empty image source';
        if (dataMediaId) {
          details = `Media ID: ${dataMediaId}`;
        } else if (altText) {
          details = `Alt text: ${altText}`;
        } else {
          details = 'No source or metadata found';
        }
      }

      placeholder.style.cssText = `
        width: ${Math.min(width, 600)}px;
        height: ${Math.max(Math.min(height, 400), 120)}px;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border: 2px solid #dee2e6;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin: 15px 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #6c757d;
        text-align: center;
        position: relative;
        overflow: hidden;
      `;

      placeholder.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 8px;">🖼️</div>
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">Image ${index}</div>
        <div style="font-size: 14px; opacity: 0.8;">${reason}</div>
        <div style="font-size: 12px; opacity: 0.6; margin-top: 8px; max-width: 90%; word-break: break-all;">
          ${details.length > 50 ? details.substring(0, 50) + '...' : details}
        </div>
      `;

      // Replace the image with the placeholder
      if (img.parentNode) {
        img.parentNode.replaceChild(placeholder, img);
      } else {
        console.warn('Could not replace image - no parent node found');
      }
    }

    function getPostTitle(): string {
      console.log('Extracting post title...');

      // Use the exact selector from the provided HTML
      const titleSelectors = [
        'span[data-tag="post-title"]',     // Primary: Exact selector from your example
        'h1[data-tag="post-title"]',       // Alternative post title selector
        'div[data-tag="post-title"]',      // Another alternative
        '[data-tag="post-title"]',        // Any element with post-title tag
        'meta[property="og:title"]',       // Open Graph title
        'title',                           // Page title as fallback
        'div[data-tag="creator-header"] h2', // Creator name as last resort
      ];

      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        console.log(`Trying selector "${selector}":`, element);

        if (element) {
          let title = '';

          if (element.tagName === 'META') {
            title = element.getAttribute('content') || '';
          } else if (element.tagName === 'TITLE') {
            // Clean up page title (remove " | Patreon" suffix)
            title = element.textContent?.replace(/\s*\|\s*Patreon\s*$/i, '') || '';
          } else {
            title = element.textContent?.trim() || '';
          }

          console.log(`Extracted title: "${title}"`);

          if (title && title.length > 0 && title.length < 200) { // Reasonable title length
            return title;
          }
        }
      }

      // If no title found, try to extract from URL
      const urlPath = window.location.pathname;
      const urlMatch = urlPath.match(/\/posts\/(\d+)/);
      if (urlMatch) {
        console.log('Using URL-based title');
        return `Patreon Post ${urlMatch[1]}`;
      }

      console.log('Using fallback title');
      return 'Patreon Post';
    }

    function sanitizeFilename(filename: string): string {
      console.log('Sanitizing filename:', filename);

      const sanitized = filename
        // Replace all problematic characters with underscores
        .replace(/[<>:"/\\|?*]/g, '_') // Invalid filename characters
        .replace(/[!@#$%^&*()+=\[\]{}|;':",.<>?]/g, '_') // Special symbols including !
        .replace(/[丨｜]/g, '_') // Chinese pipe characters
        .replace(/[\s\t\n\r]+/g, '_') // All whitespace (spaces, tabs, newlines)
        .replace(/[^\w\u4e00-\u9fff_-]/g, '_') // Keep only letters, numbers, Chinese chars, underscore, hyphen
        .replace(/_{2,}/g, '_') // Merge multiple underscores into one
        .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
        .substring(0, 100) // Limit length to 100 characters
        .trim();

      console.log('Sanitized filename:', sanitized);

      // Fallback if everything is removed
      return sanitized || 'Patreon_Post';
    }

    async function generatePDFWithProgress(content: HTMLElement, settings: ExportSettings | undefined, button: HTMLButtonElement): Promise<Blob> {
      const imageQuality = settings?.imageQuality || 'high';

      // Page dimensions for Letter size with proper margins
      const dimensions = { width: 816, height: 1056 };
      const marginTop = 60;
      const marginBottom = 60;
      const marginLeft = 50;
      const marginRight = 50;
      const contentWidth = dimensions.width - marginLeft - marginRight;

      // Conservative quality settings to prevent memory issues
      // Research shows scale > 1 often causes blank pages with large content
      const qualityMap: Record<'high' | 'medium' | 'low', { scale: number; jpegQuality: number }> = {
        high: { scale: 1.5, jpegQuality: 1.00 },    // Reduced from 2 to 1.5
        medium: { scale: 1.3, jpegQuality: 0.90 },  // Reduced from 1.5 to 1.3
        low: { scale: 1, jpegQuality: 0.75 }      // Keep at 1
      };

      const quality = qualityMap[imageQuality];
      console.log(`Using conservative scale: ${quality.scale} for quality: ${imageQuality}`);

      // Update content styling for better PDF layout
      content.style.cssText += `
        width: ${contentWidth}px !important;
        max-width: ${contentWidth}px !important;
        padding: ${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px !important;
        background: white !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        line-height: 1.8 !important;
        color: #333 !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        box-sizing: border-box !important;
      `;

      // Clean up styles and add spacing for all elements
      content.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement;

        // Remove position fixed/absolute
        if (htmlEl.style.position === 'fixed' || htmlEl.style.position === 'absolute') {
          htmlEl.style.position = 'relative';
        }

        // Add proper spacing for text elements
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'DIV'].includes(htmlEl.tagName)) {
          htmlEl.style.marginBottom = '16px';
        }

        // Style images and placeholder divs (our image replacements)
        if (htmlEl.tagName === 'IMG' || (htmlEl.tagName === 'DIV' && htmlEl.style.background?.includes('gradient'))) {
          htmlEl.style.marginTop = '20px';
          htmlEl.style.marginBottom = '20px';
          htmlEl.style.maxWidth = '100%';
          htmlEl.style.height = 'auto';
          htmlEl.style.display = 'block';
          htmlEl.style.objectFit = 'contain';
          htmlEl.style.breakInside = 'avoid';
          // Add a data attribute to mark as image content for pagination
          htmlEl.setAttribute('data-image-content', 'true');
        }
      });

      try {
        console.log('Starting improved PDF generation...');

        // Check content height to determine if we need chunking
        const contentHeight = content.scrollHeight;
        const estimatedCanvasHeight = contentHeight * quality.scale;
        const maxSafeCanvasHeight = 32767; // Common browser limit

        console.log(`Content height: ${contentHeight}px, Estimated canvas height: ${estimatedCanvasHeight}px`);

        if (estimatedCanvasHeight > maxSafeCanvasHeight) {
          console.log('Content too large for single canvas, using chunked approach');
          return await generatePDFWithChunking(content, settings, button);
        }

        // Convert HTML to canvas first - single canvas approach with conservative settings
        const canvas = await html2canvas(content, {
          scale: quality.scale,
          useCORS: false,
          allowTaint: false,
          logging: false,
          windowWidth: dimensions.width,
          windowHeight: Math.min(dimensions.height + 200, maxSafeCanvasHeight),
          backgroundColor: '#ffffff',
          removeContainer: false,
          imageTimeout: 15000,
          ignoreElements: (element) => {
            // Skip elements that might cause tainted canvas issues
            if (element.tagName === 'IMG') {
              const src = element.getAttribute('src') || '';

              // Skip images with empty src
              if (!src || src.trim() === '') {
                console.warn('Skipping image with empty src to prevent canvas issues');
                return true;
              }

              // Skip external images that aren't blob or data URLs
              if (src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
                console.log('Skipping external image to prevent tainted canvas:', src);
                return true;
              }
            }

            // Skip potentially problematic elements that can cause memory issues
            if (['VIDEO', 'AUDIO', 'IFRAME', 'EMBED', 'OBJECT'].includes(element.tagName)) {
              console.log('Skipping potentially problematic element:', element.tagName);
              return true;
            }

            return false;
          },
          onclone: (clonedDoc) => {
            console.log('Cleaning cloned document for canvas generation...');
            
            // Remove all potentially problematic elements
            const problematicElements = clonedDoc.querySelectorAll('video, audio, iframe, embed, object, svg');
            console.log(`Removing ${problematicElements.length} problematic elements`);
            problematicElements.forEach(el => el.remove());

            // More aggressive problematic image removal
            const allImages = clonedDoc.querySelectorAll('img');
            let removedImages = 0;
            allImages.forEach(img => {
              const src = img.getAttribute('src') || '';

              // Remove images with empty src
              if (!src || src.trim() === '') {
                console.warn('Removing image with empty src from clone');
                img.remove();
                removedImages++;
                return;
              }

              // Remove any image with external URL that isn't blob or data
              if (src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
                console.warn('Removing external image from clone:', src);
                img.remove();
                removedImages++;
              }
            });
            console.log(`Removed ${removedImages} problematic images from clone`);

            // Also remove any canvas elements that might be tainted
            const canvasElements = clonedDoc.querySelectorAll('canvas');
            canvasElements.forEach(canvas => canvas.remove());
          },
        });

        console.log('Canvas created successfully, size:', canvas.width, 'x', canvas.height);

        // Validate canvas before proceeding
        if (!isCanvasValid(canvas)) {
          throw new Error('Generated canvas is invalid or corrupted');
        }

        // Create PDF with intelligent pagination and progress updates
        return await createPDFWithSimplePagination(canvas, quality, button);
      } catch (error) {
        console.error('Canvas-based PDF generation failed:', error);
        
        // Check if it's a tainted canvas error or similar issue
        if (error instanceof Error && (
          error.message.includes('tainted') || 
          error.message.includes('CORS') ||
          error.message.includes('canvas')
        )) {
          console.log('Attempting text-based fallback PDF generation...');
          updateAllButtonsStatus('Creating text-only PDF...', '#f59e0b', true);
          
          try {
            return await createTextFallbackPDF(content, settings);
          } catch (fallbackError) {
            console.error('Fallback PDF generation also failed:', fallbackError);
            throw new Error(`Failed to generate PDF: Canvas export failed due to external images, and text fallback also failed. ${error.message}`);
          }
        } else {
          console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
          throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    function isCanvasValid(canvas: HTMLCanvasElement): boolean {
      try {
        // Check basic canvas properties
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
          console.error('Canvas has invalid dimensions:', canvas.width, 'x', canvas.height);
          return false;
        }

        // Check if canvas is too large (common browser limits)
        const maxDimension = 32767;
        if (canvas.width > maxDimension || canvas.height > maxDimension) {
          console.error('Canvas exceeds maximum dimensions:', canvas.width, 'x', canvas.height);
          return false;
        }

        // Try to get image data to check if canvas is tainted or corrupted
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Cannot get 2D context from canvas');
          return false;
        }

        // Test a small area to see if we can read pixel data
        try {
          ctx.getImageData(0, 0, 1, 1);
        } catch (error) {
          console.error('Canvas is tainted or corrupted:', error);
          return false;
        }

        // Try to convert to data URL to ensure it's not corrupted
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.1);
          if (!dataUrl || dataUrl === 'data:,') {
            console.error('Canvas produces empty data URL');
            return false;
          }
        } catch (error) {
          console.error('Cannot convert canvas to data URL:', error);
          return false;
        }

        return true;
      } catch (error) {
        console.error('Error validating canvas:', error);
        return false;
      }
    }

    async function generatePDFWithChunking(content: HTMLElement, settings: ExportSettings | undefined, button: HTMLButtonElement): Promise<Blob> {
      console.log('Using chunked PDF generation for large content...');

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'letter'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Conservative settings for chunking
      const chunkHeight = Math.floor(pdfHeight * 2); // 2 pages worth of content per chunk
      const contentHeight = content.scrollHeight;
      const totalChunks = Math.ceil(contentHeight / chunkHeight);

      console.log(`Chunking content: ${contentHeight}px into ${totalChunks} chunks of ${chunkHeight}px each`);

      let isFirstPage = true;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (button) {
          updateAllButtonsStatus(`Processing chunk ${chunkIndex + 1}/${totalChunks}...`, '#06b6d4', true);
        }

        // Create a temporary container for this chunk
        const chunkContainer = document.createElement('div');
        chunkContainer.style.cssText = content.style.cssText;
        chunkContainer.style.position = 'fixed';
        chunkContainer.style.left = '-9999px';
        chunkContainer.style.top = '0';
        chunkContainer.style.height = `${chunkHeight}px`;
        chunkContainer.style.overflow = 'hidden';

        // Clone and position content for this chunk
        const clonedContent = content.cloneNode(true) as HTMLElement;
        clonedContent.style.marginTop = `-${chunkIndex * chunkHeight}px`;
        chunkContainer.appendChild(clonedContent);
        document.body.appendChild(chunkContainer);

        try {
          // Generate canvas for this chunk with conservative settings
          const chunkCanvas = await html2canvas(chunkContainer, {
            scale: 1, // Always use scale 1 for chunks
            useCORS: false,
            allowTaint: false,
            logging: false,
            windowWidth: pdfWidth,
            windowHeight: chunkHeight,
            backgroundColor: '#ffffff',
            removeContainer: false,
            imageTimeout: 10000,
            ignoreElements: (element) => {
              if (element.tagName === 'IMG') {
                const src = element.getAttribute('src') || '';
                if (!src || src.trim() === '' || (src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:'))) {
                  return true;
                }
              }
              return false;
            }
          });

          if (!isFirstPage) {
            pdf.addPage();
          }
          isFirstPage = false;

          // Add chunk to PDF
          const imgData = chunkCanvas.toDataURL('image/jpeg', 0.85);
          const imgWidth = pdfWidth;
          const imgHeight = (chunkCanvas.height * imgWidth) / chunkCanvas.width;

          pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pdfHeight));

        } catch (error) {
          console.error(`Error processing chunk ${chunkIndex + 1}:`, error);
          // Add error page
          if (!isFirstPage) {
            pdf.addPage();
          }
          isFirstPage = false;

          pdf.setFontSize(14);
          pdf.text(`Error processing chunk ${chunkIndex + 1}`, 20, 50);
          pdf.setFontSize(10);
          pdf.text('This section could not be rendered due to technical limitations.', 20, 80);
        } finally {
          // Clean up
          document.body.removeChild(chunkContainer);
        }

        // Force garbage collection and memory cleanup between chunks
        if (typeof window !== 'undefined' && 'gc' in window) {
          try {
            (window as any).gc();
          } catch (e) {
            // Ignore if gc is not available
          }
        }

        // Small delay between chunks to prevent memory issues
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log('Chunked PDF generation completed');

      // Update status before final blob generation
      if (button) {
        updateAllButtonsStatus('Finalizing PDF...', '#06b6d4', true);
      }

      try {
        // Generate final blob with timeout protection
        const blob = await Promise.race([
          new Promise<Blob>((resolve) => {
            const result = pdf.output('blob');
            resolve(result);
          }),
          new Promise<Blob>((_, reject) => {
            setTimeout(() => reject(new Error('PDF blob generation timeout')), 120000); // 2 minute timeout (increased from 30s)
          })
        ]);

        console.log('PDF blob generated successfully, size:', blob.size);
        return blob;
      } catch (error) {
        console.error('Error generating PDF blob:', error);
        throw new Error(`Failed to generate final PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    async function createPDFWithSimplePagination(
      canvas: HTMLCanvasElement,
      quality: { scale: number; jpegQuality: number },
      button?: HTMLButtonElement
    ): Promise<Blob> {
      console.log('Creating PDF with simple pagination...');

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'letter'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      console.log('PDF dimensions:', { pdfWidth, pdfHeight });

      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      console.log('Canvas to PDF ratio:', { canvasHeight: canvas.height, imgHeight, pdfHeight });

      // If content fits on one page, add it directly
      if (imgHeight <= pdfHeight) {
        console.log('Content fits on one page');
        try {
          const imageData = canvas.toDataURL('image/jpeg', quality.jpegQuality);
          pdf.addImage(imageData, 'JPEG', 0, 0, imgWidth, imgHeight);
        } catch (error) {
          if (error instanceof DOMException && error.message.includes('tainted')) {
            console.warn('Tainted canvas detected, creating fallback page');
            // Create a simple text fallback page
            pdf.setFontSize(16);
            pdf.text('Content could not be exported due to external images', 20, 50);
            pdf.setFontSize(12);
            pdf.text('Some images from external sources cannot be included in the PDF.', 20, 80);
            pdf.text('This is a security restriction to protect user data.', 20, 100);
          } else {
            throw error; // Re-throw other errors
          }
        }
        return pdf.output('blob');
      }

      // Content needs multiple pages - use improved pagination
      console.log('Content needs multiple pages');

      // Calculate pages needed with minimal overlap to prevent cutting content
      const pageOverlap = 10; // Minimal overlap to prevent content cutoff
      const effectivePageHeight = pdfHeight - pageOverlap;
      const totalPages = Math.ceil(imgHeight / effectivePageHeight);

      console.log('Total pages needed:', totalPages);

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        if (pageIndex > 0) {
          pdf.addPage();
        }

        // Update progress on button with a small delay to make it visible
        if (button) {
          updateAllButtonsStatus(`Generating PDF... (${pageIndex + 1}/${totalPages})`, '#06b6d4', true);
          // Add a small delay every few pages to make progress visible
          if (pageIndex % 3 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // Calculate the portion of the canvas for this page
        const sourceY = Math.max(0, (pageIndex * effectivePageHeight * canvas.height) / imgHeight - (pageIndex > 0 ? pageOverlap : 0));
        const sourceHeight = Math.min(
          (pdfHeight * canvas.height) / imgHeight,
          canvas.height - sourceY
        );

        console.log(`Page ${pageIndex + 1}: sourceY=${Math.round(sourceY)}, sourceHeight=${Math.round(sourceHeight)}`);

        // Ensure we don't go beyond the canvas
        if (sourceY >= canvas.height) {
          console.log('Reached end of canvas, breaking');
          break;
        }

        // Create a canvas for this page
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.min(sourceHeight, canvas.height - sourceY);
        const ctx = pageCanvas.getContext('2d')!;

        // Fill with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        // Draw the portion of the original canvas
        ctx.drawImage(
          canvas,
          0, sourceY, canvas.width, pageCanvas.height,
          0, 0, canvas.width, pageCanvas.height
        );

        // Convert to image and add to PDF
        try {
          const pageData = pageCanvas.toDataURL('image/jpeg', quality.jpegQuality);
          const actualPageHeight = Math.min(pdfHeight, (pageCanvas.height * imgWidth) / canvas.width);

          console.log(`Adding page ${pageIndex + 1} with height ${Math.round(actualPageHeight)}`);
          pdf.addImage(pageData, 'JPEG', 0, 0, imgWidth, actualPageHeight);
        } catch (error) {
          if (error instanceof DOMException && error.message.includes('tainted')) {
            console.warn(`Tainted canvas detected on page ${pageIndex + 1}, skipping this page`);
            // Add a placeholder page with an explanation
            pdf.setFontSize(14);
            pdf.text(`Page ${pageIndex + 1} - Content Skipped`, 20, 50);
            pdf.setFontSize(10);
            pdf.text('This page contained external images that could not be exported.', 20, 80);
          } else {
            console.error(`Error converting page ${pageIndex + 1} to image:`, error);
            // Continue with next page instead of failing completely
          }
        }
      }

      console.log('PDF generation completed');
      return pdf.output('blob');
    }

    async function createTextFallbackPDF(content: HTMLElement, settings: ExportSettings | undefined): Promise<Blob> {
      console.log('Creating text-based fallback PDF...');
      
      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'letter'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);
      
      let yPosition = margin + 20;
      const lineHeight = 16;
      const maxLinesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
      let currentPage = 1;
      let linesOnCurrentPage = 0;

      // Add title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Patreon Post Export (Text Only)', margin, yPosition);
      yPosition += lineHeight * 1.5;
      linesOnCurrentPage += 2;

      // Add explanation
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const explanation = 'This PDF was generated in text-only mode because some images could not be exported due to security restrictions.';
      const explanationLines = pdf.splitTextToSize(explanation, contentWidth);
      pdf.text(explanationLines, margin, yPosition);
      yPosition += lineHeight * explanationLines.length + 10;
      linesOnCurrentPage += explanationLines.length + 1;

      // Extract and add text content
      pdf.setFontSize(12);
      
      // Helper function to add new page if needed
      const checkPageBreak = () => {
        if (linesOnCurrentPage >= maxLinesPerPage - 2) {
          pdf.addPage();
          yPosition = margin + 20;
          linesOnCurrentPage = 0;
          currentPage++;
        }
      };

      // Extract text from different elements
      const textElements = content.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div, span');
      const processedTexts = new Set(); // Avoid duplicates

      for (const element of textElements) {
        const text = element.textContent?.trim();
        if (!text || text.length < 10 || processedTexts.has(text)) continue;
        
        processedTexts.add(text);
        
        // Determine if this is a header
        const isHeader = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName);
        
        checkPageBreak();
        
        if (isHeader) {
          // Add some space before headers
          yPosition += lineHeight * 0.5;
          linesOnCurrentPage += 0.5;
          checkPageBreak();
          
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
        } else {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);
        }
        
        // Split long text into multiple lines
        const lines = pdf.splitTextToSize(text, contentWidth);
        
        // Check if we need multiple pages for this text block
        if (linesOnCurrentPage + lines.length > maxLinesPerPage) {
          checkPageBreak();
        }
        
        pdf.text(lines, margin, yPosition);
        yPosition += lineHeight * lines.length + (isHeader ? lineHeight * 0.5 : lineHeight * 0.2);
        linesOnCurrentPage += lines.length + (isHeader ? 0.5 : 0.2);
      }

      // Add footer with page numbers
      const totalPages = currentPage;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 50, pageHeight - 20);
        pdf.text('Generated by Patreon Exporter (Text Mode)', margin, pageHeight - 20);
      }

      console.log(`Text-based PDF created with ${totalPages} pages`);
      return pdf.output('blob');
    }


  }
});
