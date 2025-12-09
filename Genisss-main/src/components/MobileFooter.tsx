import { useState, useEffect } from 'react';

/**
 * MobileFooter - Optimized footer for mobile devices
 * Vertical stacking layout for better mobile experience
 */
export function MobileFooter() {
  const currentYear = new Date().getFullYear();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleNavigation = (path: string) => {
    if (path === '/subscription') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'subscription' } }));
    } else if (path === '/contact') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'contact' } }));
    } else if (path === '/privacy-policy') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'privacy' } }));
    } else if (path === '/terms-of-service') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'terms' } }));
    } else if (path === '/refund-policy') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'refund' } }));
    } else {
      window.location.href = path;
    }
  };

  return (
    <footer
      style={{
        width: '100%',
        marginTop: 'auto',
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'rgba(10, 35, 30, 0.6)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(16, 185, 129, 0.2)',
      }}
    >
      <div className="container mx-auto px-4 py-4">
        {/* Вертикальна розкладка для мобільних */}
        <div className="flex flex-col gap-3 items-center text-center">
          {/* Логотип і копірайт */}
          <div className="flex items-center gap-2">
            <img
              src="/youtulabs-logo.png"
              alt="youtulabs"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                objectFit: 'contain',
              }}
            />
            <div className="flex flex-col">
              <span style={{ color: '#fff', fontSize: '13px', fontWeight: '600' }}>
                YoutuLabs
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '9px' }}>
                © {currentYear} YoutuLabs Inc.
              </span>
            </div>
          </div>

          {/* Навігаційні лінки - компактні */}
          <div className="flex flex-wrap justify-center gap-1 text-xs">
            {[
              { path: '/', label: 'Home' },
              { path: '/subscription', label: 'Pricing' },
              { path: '/contact', label: 'Contact' },
            ].map((link, index) => (
              <span key={link.path} className="flex items-center">
                {index > 0 && <span style={{ color: 'rgba(255, 255, 255, 0.3)', margin: '0 4px' }}>•</span>}
                <button
                  onClick={() => handleNavigation(link.path)}
                  style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: '11px',
                    background: 'none',
                    border: 'none',
                    padding: '4px 6px',
                    cursor: 'pointer',
                  }}
                >
                  {link.label}
                </button>
              </span>
            ))}
          </div>

          {/* Юридичні лінки */}
          <div className="flex flex-wrap justify-center gap-1 text-xs">
            {[
              { path: '/terms-of-service', label: 'Terms' },
              { path: '/privacy-policy', label: 'Privacy' },
              { path: '/refund-policy', label: 'Refund' },
            ].map((link, index) => (
              <span key={link.path} className="flex items-center">
                {index > 0 && <span style={{ color: 'rgba(255, 255, 255, 0.3)', margin: '0 4px' }}>•</span>}
                <button
                  onClick={() => handleNavigation(link.path)}
                  style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '10px',
                    background: 'none',
                    border: 'none',
                    padding: '4px 6px',
                    cursor: 'pointer',
                  }}
                >
                  {link.label}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
