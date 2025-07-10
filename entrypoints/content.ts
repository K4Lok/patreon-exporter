import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ExportSettings {
  pageSize?: 'a4' | 'letter';
  imageQuality?: 'high' | 'medium' | 'low';
}

export default defineContentScript({
  matches: ['https://www.patreon.com/*'],
  async main() {

    // Add a "To PDF" button to the page
    addToPdfButton();

    // Listen for messages from popup
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.cmd === 'export') {

        // Handle async export - create a dummy button for status (popup export)
        const dummyButton = document.createElement('button') as HTMLButtonElement;

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

    // Helper functions for button status updates
    function updateButtonStatus(button: HTMLButtonElement, text: string, color: string) {
      button.textContent = text;
      button.style.backgroundColor = color;
    }

    function resetButton(button: HTMLButtonElement) {
      button.disabled = false;
      button.textContent = 'To PDF';
      button.style.backgroundColor = '#ff424d';
    }

    async function downloadFileDirectly(blobUrl: string, filename: string) {
      try {
        // Method 1: Try using Chrome downloads API through background script
        if (typeof browser !== 'undefined' && browser.runtime) {
          try {
            await browser.runtime.sendMessage({
              cmd: 'download',
              blobUrl: blobUrl,
              filename: filename
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

    async function exportPostWithStatus(settings: ExportSettings, button: HTMLButtonElement): Promise<{ blobUrl: string; filename: string }> {
      updateButtonStatus(button, 'Expanding comments...', '#f59e0b');

      // Find the main post content
      const postContent = findPostContent();
      if (!postContent) {
        throw new Error('Could not find post content on this page');
      }

      updateButtonStatus(button, 'Expanding comments...', '#8b5cf6');

      // Clone and clean the content
      const cleanedContent = await cleanContent(postContent);

      // Get post title for filename (no date needed)
      const postTitle = getPostTitle();
      const sanitizedTitle = sanitizeFilename(postTitle);
      const filename = `${sanitizedTitle}.pdf`;

      console.log('Generated filename:', filename);

      try {
        updateButtonStatus(button, 'Generating PDF...', '#06b6d4');

        // Generate PDF
        const pdfBlob = await generatePDF(cleanedContent, settings);

        const blobUrl = URL.createObjectURL(pdfBlob);

        return { blobUrl, filename };
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
      // Only add the button if we're on a post page
      if (!isPostPage()) return;

      // Create the button element
      const button = document.createElement('button');
      button.textContent = 'To PDF';
      button.id = 'patreon-exporter-button';
      
      // Style the button
      button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 15px;
        font-size: 14px;
        font-weight: 600;
        color: white;
        background-color: #ff424d;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
      `;
      
      // Add hover effect
      button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#e63946';
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 4px 12px rgba(255, 66, 77, 0.3)';
      });
      
      button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#ff424d';
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
      });
      
      // Add click handler to export the post
      button.addEventListener('click', async () => {
        // Change button state to indicate processing
        button.disabled = true;
        updateButtonStatus(button, 'Preparing...', '#cccccc');

        try {
          // Get settings from storage
          const settings = await browser.storage.sync.get(['pageSize', 'imageQuality']);
          const exportSettings = {
            pageSize: settings.pageSize || 'a4',
            imageQuality: settings.imageQuality || 'high'
          };

          // Export the post with status updates
          const result = await exportPostWithStatus(exportSettings, button);

          // Download directly without user interaction
          updateButtonStatus(button, 'Downloading...', '#4f46e5');
          await downloadFileDirectly(result.blobUrl, result.filename);

          // Show success state briefly
          updateButtonStatus(button, 'Success!', '#10b981');

          // Reset button after a delay
          setTimeout(() => {
            resetButton(button);
          }, 2000);

        } catch (error) {
          console.error('Export failed:', error);

          // Show error state
          updateButtonStatus(button, 'Failed!', '#ef4444');

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
      // Check for post-specific elements
      const postSelectors = [
        'div[data-tag="post-card"]',
        'article[data-tag="post-card"]',
        // Add more specific selectors if needed
      ];
      
      for (const selector of postSelectors) {
        if (document.querySelector(selector)) {
          return true;
        }
      }
      
      // Check URL pattern as fallback
      return window.location.pathname.includes('/posts/');
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

    async function cleanContent(originalContent: Element): Promise<HTMLElement> {
      
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

      // Extract and process comments before removing them
      const commentsSection = await extractAndProcessComments(clonedContent);
      console.log('Comments section created:', commentsSection ? 'Yes' : 'No');

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

    async function replaceImagesWithPlaceholders(container: HTMLElement): Promise<void> {
      // Debug: log the container structure
      
      // Look for images
      const allImgTags = container.getElementsByTagName('img');
      
      if (allImgTags.length === 0) {
        return;
      }

      // Convert HTMLCollection to Array for easier processing
      const imageArray = Array.from(allImgTags);
      
      // Process images in parallel
      const imagePromises = imageArray.map((img, index) => 
        processImageWithFetch(img as HTMLImageElement, index + 1)
      );
      
      await Promise.allSettled(imagePromises);

      // Add a small delay to ensure all images are fully loaded and rendered
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async function processImageWithFetch(img: HTMLImageElement, index: number): Promise<void> {
      const originalSrc = img.src;
      
      // Skip if already a data URL or blob URL
      if (originalSrc.startsWith('data:') || originalSrc.startsWith('blob:')) {
        return;
      }

      // Skip if no src
      if (!originalSrc || originalSrc.trim() === '') {
        return;
      }

      try {
        
        // Fetch the image using the extension's permissions
        const response = await fetch(originalSrc, {
          method: 'GET',
          mode: 'cors', // Try CORS first since we have host permissions
          credentials: 'omit',
          cache: 'force-cache' // Use cache if available for performance
        });

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
        <div style="font-size: 14px; opacity: 0.8;">Could not load image</div>
        <div style="font-size: 12px; opacity: 0.6; margin-top: 8px; max-width: 90%; word-break: break-all;">
          ${originalSrc.length > 50 ? originalSrc.substring(0, 50) + '...' : originalSrc}
        </div>
      `;
      
      // Replace the image with the placeholder
      if (img.parentNode) {
        img.parentNode.replaceChild(placeholder, img);
      } else {
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

    async function generatePDF(content: HTMLElement, settings?: ExportSettings): Promise<Blob> {
      const pageSize = settings?.pageSize || 'a4';
      const imageQuality = settings?.imageQuality || 'high';

      // Page dimensions based on settings with proper margins
      const pageDimensions: Record<'a4' | 'letter', { width: number; height: number }> = {
        a4: { width: 794, height: 1123 },
        letter: { width: 816, height: 1056 }
      };

      const dimensions = pageDimensions[pageSize];
      const marginTop = 60;
      const marginBottom = 60;
      const marginLeft = 50;
      const marginRight = 50;
      const contentWidth = dimensions.width - marginLeft - marginRight;

      // Image quality settings
      const qualityMap: Record<'high' | 'medium' | 'low', { scale: number; jpegQuality: number }> = {
        high: { scale: 2, jpegQuality: 1.00 },
        medium: { scale: 1.5, jpegQuality: 0.85 },
        low: { scale: 1, jpegQuality: 0.75 }
      };

      const quality = qualityMap[imageQuality];

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

        // Convert HTML to canvas first - single canvas approach
        const canvas = await html2canvas(content, {
          scale: quality.scale,
          useCORS: false,
          allowTaint: true,
          logging: false,
          windowWidth: dimensions.width,
          windowHeight: dimensions.height + 200,
          backgroundColor: '#ffffff',
          removeContainer: false,
          imageTimeout: 15000,
          onclone: (clonedDoc) => {
            // Final cleanup - remove any remaining problematic elements
            const problematicElements = clonedDoc.querySelectorAll('video, audio, iframe, embed, object');
            problematicElements.forEach(el => el.remove());

            // Also remove any images that still have external URLs (not blob/data)
            const externalImages = clonedDoc.querySelectorAll('img[src^="http"]:not([src^="blob:"]):not([src^="data:"])');
            externalImages.forEach(el => el.remove());
          },
        });

        console.log('Canvas created successfully, size:', canvas.width, 'x', canvas.height);

        // Create PDF with intelligent pagination
        return await createPDFWithSimplePagination(canvas, quality, pageSize);
      } catch (error) {
        console.error('PDF generation failed with detailed error:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    async function createPDFWithSimplePagination(
      canvas: HTMLCanvasElement,
      quality: { scale: number; jpegQuality: number },
      pageSize: 'a4' | 'letter'
    ): Promise<Blob> {
      console.log('Creating PDF with simple pagination...');

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: pageSize === 'letter' ? 'letter' : 'a4'
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
        const imageData = canvas.toDataURL('image/jpeg', quality.jpegQuality);
        pdf.addImage(imageData, 'JPEG', 0, 0, imgWidth, imgHeight);
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
        const pageData = pageCanvas.toDataURL('image/jpeg', quality.jpegQuality);
        const actualPageHeight = Math.min(pdfHeight, (pageCanvas.height * imgWidth) / canvas.width);

        console.log(`Adding page ${pageIndex + 1} with height ${Math.round(actualPageHeight)}`);
        pdf.addImage(pageData, 'JPEG', 0, 0, imgWidth, actualPageHeight);
      }

      console.log('PDF generation completed');
      return pdf.output('blob');
    }


  }
});
