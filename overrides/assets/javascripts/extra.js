/**
 * Luminous Void Theme - Extra JavaScript
 * Based on renner.dev design system
 */

// Smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function() {
  // Add smooth scrolling to all anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Add animation class to content on page load
  const content = document.querySelector('.md-content__inner');
  if (content) {
    content.classList.add('fade-in');
  }

  // External links open in new tab
  document.querySelectorAll('a[href^="http"]').forEach(link => {
    if (!link.hostname.includes(window.location.hostname)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
});

// Add copy button enhancement
document.addEventListener('DOMContentLoaded', function() {
  const copyButtons = document.querySelectorAll('.md-clipboard');

  copyButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Visual feedback
      const originalTitle = this.getAttribute('title');
      this.setAttribute('title', 'Copied!');
      this.classList.add('copied');

      setTimeout(() => {
        this.setAttribute('title', originalTitle || 'Copy to clipboard');
        this.classList.remove('copied');
      }, 2000);
    });
  });
});

// Console easter egg
console.log('%c Luminous Void Theme ', 'background: linear-gradient(135deg, #f97316, #22d3ee); color: white; padding: 10px 20px; font-size: 16px; font-weight: bold; border-radius: 5px;');
console.log('%c Based on renner.dev design ', 'color: #94a3b8; font-size: 12px;');
