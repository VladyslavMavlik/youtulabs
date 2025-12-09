import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

export function MouseFollowBackground() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const smoothMouseX = useSpring(mouseX, { damping: 50, stiffness: 200 });
  const smoothMouseY = useSpring(mouseY, { damping: 50, stiffness: 200 });

  useEffect(() => {
    // Detect mobile devices
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };

    // Detect reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Only track mouse on desktop
    if (isMobile || prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY, isMobile, prefersReducedMotion]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Mouse follower gradient - only on desktop */}
      {!isMobile && !prefersReducedMotion && (
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(255, 215, 0, 0.2) 50%, transparent 70%)',
            x: smoothMouseX,
            y: smoothMouseY,
            translateX: '-50%',
            translateY: '-50%',
            willChange: 'transform',
          }}
        />
      )}

      {/* Static background gradients - simplified animations */}
      <motion.div
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(6, 78, 59, 0.5) 0%, transparent 70%)',
          willChange: prefersReducedMotion ? 'auto' : 'transform',
        }}
        animate={prefersReducedMotion ? {} : {
          x: [0, 100, 0],
          y: [0, 50, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl"
        style={{
          background: 'radial-gradient(circle, rgba(184, 134, 11, 0.3) 0%, transparent 70%)',
          willChange: prefersReducedMotion ? 'auto' : 'transform',
        }}
        animate={prefersReducedMotion ? {} : {
          x: [0, -80, 0],
          y: [0, -60, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Only show these 2 extra gradients on desktop for performance */}
      {!isMobile && (
        <>
          <motion.div
            className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%)',
              willChange: prefersReducedMotion ? 'auto' : 'transform',
            }}
            animate={prefersReducedMotion ? {} : {
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <motion.div
            className="absolute top-1/4 right-1/4 w-[350px] h-[350px] rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(255, 215, 0, 0.15) 0%, transparent 70%)',
              willChange: prefersReducedMotion ? 'auto' : 'transform',
            }}
            animate={prefersReducedMotion ? {} : {
              x: [0, -50, 50, 0],
              y: [0, 60, -40, 0],
              scale: [1, 1.2, 0.9, 1],
            }}
            transition={{
              duration: 35,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </>
      )}
    </div>
  );
}
