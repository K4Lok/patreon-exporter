// Patreon Exporter Homepage JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all interactive features
    initMobileMenu();
    initSmoothScrolling();
    initFAQAccordion();
    initInstallButtons();
    initScrollEffects();
    initAnimations();
});

// Mobile menu functionality
function initMobileMenu() {
    const header = document.querySelector('.header');
    const nav = document.querySelector('.nav');
    
    // Create mobile menu button
    const mobileMenuBtn = document.createElement('button');
    mobileMenuBtn.className = 'mobile-menu-btn';
    mobileMenuBtn.innerHTML = `
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
    `;
    mobileMenuBtn.setAttribute('aria-label', 'Toggle navigation menu');
    
    // Add mobile menu styles
    const mobileStyles = `
        .mobile-menu-btn {
            display: none;
            flex-direction: column;
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            gap: 4px;
        }
        
        .hamburger-line {
            width: 24px;
            height: 2px;
            background: var(--gray-700);
            transition: var(--transition-base);
        }
        
        .mobile-menu-btn.active .hamburger-line:nth-child(1) {
            transform: rotate(45deg) translate(6px, 6px);
        }
        
        .mobile-menu-btn.active .hamburger-line:nth-child(2) {
            opacity: 0;
        }
        
        .mobile-menu-btn.active .hamburger-line:nth-child(3) {
            transform: rotate(-45deg) translate(6px, -6px);
        }
        
        @media (max-width: 768px) {
            .mobile-menu-btn {
                display: flex;
            }
            
            .nav {
                display: none;
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(10px);
                border-top: 1px solid var(--gray-200);
                flex-direction: column;
                padding: var(--spacing-lg);
                gap: var(--spacing-lg);
            }
            
            .nav.active {
                display: flex;
            }
            
            .nav-link {
                padding: var(--spacing-md) 0;
                border-bottom: 1px solid var(--gray-100);
            }
            
            .nav-link:last-child {
                border-bottom: none;
            }
        }
    `;
    
    // Add styles to document
    const styleSheet = document.createElement('style');
    styleSheet.textContent = mobileStyles;
    document.head.appendChild(styleSheet);
    
    // Insert mobile menu button
    const headerContent = document.querySelector('.header-content');
    headerContent.appendChild(mobileMenuBtn);
    
    // Toggle mobile menu
    mobileMenuBtn.addEventListener('click', function() {
        this.classList.toggle('active');
        nav.classList.toggle('active');
    });
    
    // Close mobile menu when clicking nav links
    nav.addEventListener('click', function(e) {
        if (e.target.classList.contains('nav-link')) {
            mobileMenuBtn.classList.remove('active');
            nav.classList.remove('active');
        }
    });
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!header.contains(e.target)) {
            mobileMenuBtn.classList.remove('active');
            nav.classList.remove('active');
        }
    });
}

// Smooth scrolling for navigation links
function initSmoothScrolling() {
    const navLinks = document.querySelectorAll('a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetElement.offsetTop - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// FAQ accordion functionality
function initFAQAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        
        question.addEventListener('click', function() {
            const isActive = item.classList.contains('active');
            
            // Close all other FAQ items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                    const otherAnswer = otherItem.querySelector('.faq-answer');
                    otherAnswer.style.maxHeight = null;
                }
            });
            
            // Toggle current item
            if (isActive) {
                item.classList.remove('active');
                answer.style.maxHeight = null;
            } else {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });
}

// Install button functionality
function initInstallButtons() {
    const chromeBtn = document.getElementById('chrome-install');
    const firefoxBtn = document.getElementById('firefox-install');
    
    // Detect browser and update install buttons
    const userAgent = navigator.userAgent.toLowerCase();
    const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
    const isFirefox = userAgent.includes('firefox');
    const isEdge = userAgent.includes('edg');
    
    // Update Chrome button for different browsers
    if (isEdge) {
        chromeBtn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Install for Edge
        `;
    }
    
    // Add click handlers with user feedback
    chromeBtn.addEventListener('click', function(e) {
        // The button now has the real Chrome Web Store URL, so let it navigate normally
        // Just add some visual feedback
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = 'scale(1)';
        }, 150);
    });
    
    firefoxBtn.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Show loading state
        const originalText = this.innerHTML;
        this.innerHTML = `
            <svg class="btn-icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            Opening Firefox Add-ons...
        `;
        this.disabled = true;
        
        // Simulate store opening
        setTimeout(() => {
            showNotification('Firefox Add-ons store will open when the extension is published!', 'info');
            this.innerHTML = originalText;
            this.disabled = false;
        }, 1500);
    });
}

// Scroll effects for header
function initScrollEffects() {
    const header = document.querySelector('.header');
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', function() {
        const currentScrollY = window.scrollY;
        
        // Add/remove scrolled class for styling
        if (currentScrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        // Hide/show header on scroll
        if (currentScrollY > lastScrollY && currentScrollY > 200) {
            header.style.transform = 'translateY(-100%)';
        } else {
            header.style.transform = 'translateY(0)';
        }
        
        lastScrollY = currentScrollY;
    });
    
    // Add scrolled header styles
    const scrollStyles = `
        .header {
            transition: var(--transition-base), transform var(--transition-base);
        }
        
        .header.scrolled {
            background: rgba(255, 255, 255, 0.98);
            box-shadow: var(--shadow-sm);
        }
        
        .animate-spin {
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = scrollStyles;
    document.head.appendChild(styleSheet);
}

// Animation on scroll
function initAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature-card, .step, .install-card, .faq-item');
    animateElements.forEach(el => {
        observer.observe(el);
    });
    
    // Add animation styles
    const animationStyles = `
        .feature-card,
        .step,
        .install-card,
        .faq-item {
            opacity: 0;
            transform: translateY(30px);
            transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        
        .feature-card.animate-in,
        .step.animate-in,
        .install-card.animate-in,
        .faq-item.animate-in {
            opacity: 1;
            transform: translateY(0);
        }
        
        /* Stagger animation for grid items */
        .feature-card:nth-child(1).animate-in { transition-delay: 0s; }
        .feature-card:nth-child(2).animate-in { transition-delay: 0.1s; }
        .feature-card:nth-child(3).animate-in { transition-delay: 0.2s; }
        .feature-card:nth-child(4).animate-in { transition-delay: 0.3s; }
        .feature-card:nth-child(5).animate-in { transition-delay: 0.4s; }
        .feature-card:nth-child(6).animate-in { transition-delay: 0.5s; }
        
        .step:nth-child(1).animate-in { transition-delay: 0s; }
        .step:nth-child(2).animate-in { transition-delay: 0.2s; }
        .step:nth-child(3).animate-in { transition-delay: 0.4s; }
        
        .install-card:nth-child(1).animate-in { transition-delay: 0s; }
        .install-card:nth-child(2).animate-in { transition-delay: 0.2s; }
        .install-card:nth-child(3).animate-in { transition-delay: 0.4s; }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = animationStyles;
    document.head.appendChild(styleSheet);
}

// Notification system
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">
                ${getNotificationIcon(type)}
            </div>
            <span class="notification-message">${message}</span>
            <button class="notification-close" aria-label="Close notification">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;
    
    // Add notification styles
    const notificationStyles = `
        .notification {
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 1000;
            max-width: 400px;
            background: var(--white);
            border-radius: var(--border-radius-lg);
            box-shadow: var(--shadow-xl);
            border-left: 4px solid;
            transform: translateX(450px);
            transition: var(--transition-base);
        }
        
        .notification-info {
            border-left-color: var(--accent-color);
        }
        
        .notification-success {
            border-left-color: var(--success-color);
        }
        
        .notification-warning {
            border-left-color: var(--warning-color);
        }
        
        .notification-error {
            border-left-color: var(--primary-color);
        }
        
        .notification.show {
            transform: translateX(0);
        }
        
        .notification-content {
            display: flex;
            align-items: center;
            gap: var(--spacing-md);
            padding: var(--spacing-lg);
        }
        
        .notification-icon {
            flex-shrink: 0;
            width: 24px;
            height: 24px;
        }
        
        .notification-icon svg {
            width: 100%;
            height: 100%;
        }
        
        .notification-info .notification-icon {
            color: var(--accent-color);
        }
        
        .notification-success .notification-icon {
            color: var(--success-color);
        }
        
        .notification-warning .notification-icon {
            color: var(--warning-color);
        }
        
        .notification-error .notification-icon {
            color: var(--primary-color);
        }
        
        .notification-message {
            flex: 1;
            font-size: var(--font-size-sm);
            color: var(--gray-700);
        }
        
        .notification-close {
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: var(--gray-400);
            transition: var(--transition-fast);
            flex-shrink: 0;
            width: 20px;
            height: 20px;
        }
        
        .notification-close:hover {
            color: var(--gray-600);
        }
        
        .notification-close svg {
            width: 100%;
            height: 100%;
        }
        
        @media (max-width: 480px) {
            .notification {
                right: 10px;
                left: 10px;
                max-width: none;
                transform: translateY(-100px);
            }
            
            .notification.show {
                transform: translateY(0);
            }
        }
    `;
    
    // Add styles if not already added
    if (!document.querySelector('#notification-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'notification-styles';
        styleSheet.textContent = notificationStyles;
        document.head.appendChild(styleSheet);
    }
    
    // Add to document
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Auto close after 5 seconds
    const autoCloseTimer = setTimeout(() => {
        closeNotification(notification);
    }, 5000);
    
    // Close button functionality
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        clearTimeout(autoCloseTimer);
        closeNotification(notification);
    });
    
    // Close on click outside
    setTimeout(() => {
        const clickOutsideHandler = (e) => {
            if (!notification.contains(e.target)) {
                clearTimeout(autoCloseTimer);
                closeNotification(notification);
                document.removeEventListener('click', clickOutsideHandler);
            }
        };
        document.addEventListener('click', clickOutsideHandler);
    }, 500);
}

function closeNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 300);
}

function getNotificationIcon(type) {
    const icons = {
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
               </svg>`,
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                   <polyline points="22,4 12,14.01 9,11.01"></polyline>
                  </svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                   <line x1="12" y1="9" x2="12" y2="13"></line>
                   <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <circle cx="12" cy="12" r="10"></circle>
                 <line x1="15" y1="9" x2="9" y2="15"></line>
                 <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>`
    };
    return icons[type] || icons.info;
}

// Performance optimization: Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debouncing to scroll events
window.addEventListener('scroll', debounce(function() {
    // Scroll event handlers are already optimized above
}, 10));

// Add keyboard navigation support
document.addEventListener('keydown', function(e) {
    // ESC key closes mobile menu and notifications
    if (e.key === 'Escape') {
        // Close mobile menu
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
        const nav = document.querySelector('.nav');
        if (mobileMenuBtn && mobileMenuBtn.classList.contains('active')) {
            mobileMenuBtn.classList.remove('active');
            nav.classList.remove('active');
        }
        
        // Close notifications
        const notifications = document.querySelectorAll('.notification.show');
        notifications.forEach(closeNotification);
    }
});

// Add focus management for accessibility
document.addEventListener('focusin', function(e) {
    // Add visible focus outline for keyboard users
    if (e.target.matches('button, a, input, textarea, select')) {
        e.target.classList.add('keyboard-focus');
    }
});

document.addEventListener('focusout', function(e) {
    if (e.target.matches('button, a, input, textarea, select')) {
        e.target.classList.remove('keyboard-focus');
    }
});

// Add focus styles
const focusStyles = `
    .keyboard-focus {
        outline: 2px solid var(--primary-color) !important;
        outline-offset: 2px !important;
    }
`;

const focusStyleSheet = document.createElement('style');
focusStyleSheet.textContent = focusStyles;
document.head.appendChild(focusStyleSheet);