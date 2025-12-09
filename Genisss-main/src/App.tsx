import { useDeviceDetection } from './lib/deviceDetection';
import MobileApp from './MobileApp';
import DesktopApp from './DesktopApp';

/**
 * Main App Router - Detects device type and strictly separates mobile/desktop experiences.
 *
 * Mobile devices (phones, tablets) -> MobileApp (vertical stacking layout)
 * Desktop devices (laptops, desktops) -> DesktopApp (horizontal split layout)
 *
 * These versions are completely separated and will never overlap or interfere.
 */

// Re-export GenerationItem type for compatibility
export type { GenerationItem } from './DesktopApp';

export default function App() {
  const deviceType = useDeviceDetection();

  console.log(`📱 Device detected: ${deviceType.toUpperCase()}`);

  // Strictly separate mobile and desktop versions
  if (deviceType === 'mobile') {
    return <MobileApp />;
  }

  return <DesktopApp />;
}
