import { useState, useEffect } from 'react';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Animate in after a short delay
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
        position: 'relative',
        zIndex: 100,
      }}
    >
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center max-md:flex-col max-md:gap-3 relative">
          {/* Logo & Copyright - Left (absolute positioning) */}
          <div className="flex items-center gap-2 absolute left-0 max-md:relative">
            <img
              src="/youtulabs-logo.png"
              alt="youtulabs"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                objectFit: 'contain',
              }}
            />
            <div className="flex flex-col">
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                YoutuLabs
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '10px' }}>
                © {currentYear} YoutuLabs Inc.
              </span>
            </div>
          </div>

          {/* Navigation Links - Center */}
          <div className="flex items-center gap-1" style={{ marginRight: '10px' }}>
            {[
              { path: '/', label: 'Home' },
              { path: '/subscription', label: 'Pricing' },
              { path: '/contact', label: 'Contact' },
            ].map((link) => (
              <button
                key={link.path}
                onClick={() => handleNavigation(link.path)}
                style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '12px',
                  background: 'none',
                  border: '1px solid transparent',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  borderRadius: '6px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#10b981';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                {link.label}
              </button>
            ))}
            <span style={{ color: 'rgba(255, 255, 255, 0.3)', margin: '0 4px' }}>|</span>
            {[
              { path: '/terms-of-service', label: 'Terms' },
              { path: '/privacy-policy', label: 'Privacy' },
              { path: '/refund-policy', label: 'Refund' },
            ].map((link) => (
              <button
                key={link.path}
                onClick={() => handleNavigation(link.path)}
                style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '12px',
                  background: 'none',
                  border: '1px solid transparent',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  borderRadius: '6px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#10b981';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
