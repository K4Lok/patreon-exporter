import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ExportSettings {
  pageSize?: 'a4' | 'letter';
  imageQuality?: 'high' | 'medium' | 'low';
}

export default defineContentScript({
  matches: ['https://www.patreon.com/*'],
  async main() {

    // Listen for messages from popup
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.cmd === 'export') {
        
        // Handle async export
        exportPost(message.settings)
          .then(result => {
            sendResponse({ success: true, data: result });
          })
          .catch(error => {
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

    async function exportPost(settings?: ExportSettings): Promise<{ blobUrl: string; filename: string }> {
      
      // Find the main post content
      const postContent = findPostContent();
      if (!postContent) {
        throw new Error('Could not find post content on this page');
      }

      // Clone and clean the content
      const cleanedContent = await cleanContent(postContent);
      
      // Get post title for filename
      const postTitle = getPostTitle();
      const filename = `${sanitizeFilename(postTitle)}.pdf`;

      try {
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
          
          // Debug: Check for images in the original content
          const originalImages = content.querySelectorAll('img');
          
          return content;
        }
      }

      return null;
    }

    async function cleanContent(originalContent: Element): Promise<HTMLElement> {
      
      // Check images in original content before cloning
      const originalImages = originalContent.querySelectorAll('img');
      
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
      
      // Check images in cloned content before removal
      const clonedImages = clonedContent.querySelectorAll('img');
      
      // Remove unwanted elements using correct Patreon selectors
      const selectorsToRemove = [
        // Post footer/reactions
        'button[data-tag="like-button"]',
        'span[data-tag="like-count"]', 
        'button[data-tag="comment-post-icon"]',
        'button[data-tag="more-actions-button"]',
        'button[data-tag="share-post-icon"]',
        
        // Comments section
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
      
      
      // Check images after cleanup but before adding to DOM
      const imagesAfterCleanup = clonedContent.querySelectorAll('img');

      container.appendChild(clonedContent);
      document.body.appendChild(container);
      
      // Check images after adding to DOM
      const imagesInContainer = container.querySelectorAll('img');
      
      // Replace all external images with placeholders immediately
      await replaceImagesWithPlaceholders(container);
      
      return container;
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
          img.style.margin = '10px 0';
          
          // Clean up blob URL after some time (but not too soon for PDF generation)
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 60000); // 1 minute should be enough for PDF generation
          
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
      // Use correct Patreon selectors for post title
      const titleSelectors = [
        'span[data-tag="post-title"]',     // Correct Patreon post title selector
        'div[data-tag="creator-header"] h2', // Creator name as fallback
        'h1',
        'h2',
        'meta[property="og:title"]'
      ];

      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          if (element.tagName === 'META') {
            return element.getAttribute('content') || 'patreon-post';
          }
          const title = element.textContent?.trim();
          if (title && title.length > 0) {
            return title;
          }
        }
      }

      return 'patreon-post';
    }

    function sanitizeFilename(filename: string): string {
      return filename
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 100); // Limit length
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
          htmlEl.style.pageBreakInside = 'avoid';
        }
        
        // Style placeholder divs (our image replacements)
        if (htmlEl.tagName === 'DIV' && htmlEl.style.background?.includes('gradient')) {
          htmlEl.style.marginTop = '20px';
          htmlEl.style.marginBottom = '20px';
          htmlEl.style.pageBreakInside = 'avoid';
        }
      });
      
      try {
        // Convert HTML to canvas - now much simpler without CORS issues
        const canvas = await html2canvas(content, {
          scale: quality.scale,
          useCORS: false,
          allowTaint: true, // Allow tainted canvas since we're using blob URLs
          logging: false,
          windowWidth: dimensions.width,
          windowHeight: dimensions.height + 200,
          backgroundColor: '#ffffff',
          removeContainer: false,
          imageTimeout: 15000, // Increased timeout for blob URL images
          onclone: (clonedDoc) => {
            // Final cleanup - remove any remaining problematic elements
            const problematicElements = clonedDoc.querySelectorAll('video, audio, iframe, embed, object');
            problematicElements.forEach(el => el.remove());
            
            // Also remove any images that still have external URLs (not blob/data)
            const externalImages = clonedDoc.querySelectorAll('img[src^="http"]:not([src^="blob:"]):not([src^="data:"])');
            externalImages.forEach(el => el.remove());
            
          },
        });


        // Create PDF with improved pagination
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: pageSize === 'letter' ? 'letter' : 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Improved pagination with overlap to prevent text cutoff
        const pageOverlap = 40; // Overlap between pages to prevent cutoff
        const effectivePageHeight = pdfHeight - pageOverlap;
        const totalPages = Math.ceil(imgHeight / effectivePageHeight);
        

        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
          if (pageIndex > 0) {
            pdf.addPage();
          }

          // Calculate the portion of the canvas for this page with overlap
          const sourceY = Math.max(0, (pageIndex * effectivePageHeight * canvas.height) / imgHeight - (pageIndex > 0 ? pageOverlap : 0));
          const sourceHeight = Math.min(
            (pdfHeight * canvas.height) / imgHeight,
            canvas.height - sourceY
          );

          // Ensure we don't go beyond the canvas
          if (sourceY >= canvas.height) break;

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
          
          // Calculate actual height for this page
          const actualPageHeight = Math.min(pdfHeight, (pageCanvas.height * imgWidth) / canvas.width);
          
          pdf.addImage(pageData, 'JPEG', 0, 0, imgWidth, actualPageHeight);
          
        }

        return pdf.output('blob');
      } catch (error) {
        console.error('PDF generation failed:', error);
        throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
});
