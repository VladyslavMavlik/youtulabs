/**
 * Device detection utility for strictly separating mobile and desktop experiences.
 * This ensures mobile and desktop versions never overlap or interfere with each other.
 */

export type DeviceType = 'mobile' | 'desktop';

/**
 * Detects if the current device is mobile or desktop.
 * Uses multiple detection methods for accuracy:
 * 1. User agent string (primary)
 * 2. Touch capability
 * 3. Screen width (fallback)
 */
export function detectDevice(): DeviceType {
  // Server-side rendering check
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

  // Check user agent for mobile devices
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
  if (mobileRegex.test(userAgent.toLowerCase())) {
    return 'mobile';
  }

  // Check for touch-enabled devices with small screens
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;

  if (isTouchDevice && isSmallScreen) {
    return 'mobile';
  }

  // Default to desktop
  return 'desktop';
}

/**
 * Hook to detect device type and re-detect on window resize.
 * This ensures the correct version is always shown even if the window is resized.
 */
export function useDeviceDetection(): DeviceType {
  const [deviceType, setDeviceType] = React.useState<DeviceType>(() => detectDevice());

  React.useEffect(() => {
    const handleResize = () => {
      const newDeviceType = detectDevice();
      if (newDeviceType !== deviceType) {
        setDeviceType(newDeviceType);
        // Force page reload to ensure complete separation
        window.location.reload();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [deviceType]);

  return deviceType;
}

// Export React for the hook
import React from 'react';
