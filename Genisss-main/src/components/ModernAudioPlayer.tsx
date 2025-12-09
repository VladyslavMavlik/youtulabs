import { useEffect, useLayoutEffect, useRef, useState, memo, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { loadPeaksFromCache, savePeaksToCache, cleanupOldCache, getCacheKey } from '../lib/waveformCache';

interface ModernAudioPlayerProps {
  audioUrl: string;
  onVolumeSliderChange?: (isVisible: boolean) => void;
}

export const ModernAudioPlayer = memo(function ModernAudioPlayer({ audioUrl, onVolumeSliderChange }: ModernAudioPlayerProps) {
  console.log('[ModernAudioPlayer] 🎬 Component rendered with audioUrl:', audioUrl?.substring(0, 80));

  // Compute stable cache key (pathname only, ignoring query params)
  const audioCacheKey = useMemo(() => getCacheKey(audioUrl), [audioUrl]);

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [duration, setDuration] = useState('0:00');
  const [isLoading, setIsLoading] = useState(false); // Start as false, show loading only if needed
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Notify parent when volume slider visibility changes
  useEffect(() => {
    onVolumeSliderChange?.(showVolumeSlider);
  }, [showVolumeSlider, onVolumeSliderChange]);

  // Cleanup old cache entries on mount
  useEffect(() => {
    cleanupOldCache();
  }, []);

  useEffect(() => {
    console.log('[ModernAudioPlayer] 🔄 useEffect triggered for cache key:', audioCacheKey);
    if (!waveformRef.current) {
      console.log('[ModernAudioPlayer] ⚠️ No waveformRef yet');
      return;
    }

    console.log('[ModernAudioPlayer] Setting up ResizeObserver for:', audioCacheKey);

    let wavesurferInstance: WaveSurfer | null = null;
    let isInitialized = false;

    // Use ResizeObserver to detect when container gets width
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        console.log('[ModernAudioPlayer] 📏 ResizeObserver: width =', width);

        if (width > 0 && !isInitialized && waveformRef.current) {
          isInitialized = true;
          console.log('[ModernAudioPlayer] ✅ Container has width, initializing WaveSurfer...');

          // Try to load cached peaks
          loadPeaksFromCache(audioUrl).then((cachedPeaks) => {
            if (!waveformRef.current) return;

            const options: any = {
              container: waveformRef.current,
              waveColor: 'rgba(255, 255, 255, 0.6)',
              progressColor: '#d946ef',
              cursorWidth: 0,
              barWidth: 3,
              barGap: 2,
              barRadius: 2,
              height: 48,
              normalize: true,
              hideScrollbar: true,
            };

            // If we have cached peaks, use them for instant rendering
            if (cachedPeaks) {
              console.log('[ModernAudioPlayer] 🚀 Using cached peaks for instant render');
              options.peaks = cachedPeaks;
              options.url = audioUrl;
              // No loading state needed - peaks are instant
            } else {
              console.log('[ModernAudioPlayer] 📥 No cache, loading audio normally');
              options.url = audioUrl;

              // Show loading indicator only after 200ms delay (to avoid flash for fast loads)
              loadingTimeoutRef.current = setTimeout(() => {
                setIsLoading(true);
              }, 200);
            }

            // Initialize WaveSurfer
            const wavesurfer = WaveSurfer.create(options);

            wavesurferInstance = wavesurfer;
            wavesurferRef.current = wavesurfer;

            // Ready event
            wavesurfer.on('ready', () => {
              console.log('[WaveSurfer] Ready! Duration:', wavesurfer.getDuration());
              setDuration(formatTime(wavesurfer.getDuration()));

              // Clear loading timeout and hide loading
              if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
              }
              setIsLoading(false);
            });

            // Update time during playback
            wavesurfer.on('audioprocess', () => {
              setCurrentTime(formatTime(wavesurfer.getCurrentTime()));
            });

            // Handle play/pause state
            wavesurfer.on('play', () => setIsPlaying(true));
            wavesurfer.on('pause', () => setIsPlaying(false));

            // Reset on finish
            wavesurfer.on('finish', () => {
              setIsPlaying(false);
              wavesurfer.seekTo(0);
              setCurrentTime('0:00');
            });

            // Error handling
            wavesurfer.on('error', (error) => {
              console.error('[WaveSurfer] Error:', error);

              // Clear loading timeout and hide loading
              if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
              }
              setIsLoading(false);
            });

            // Loading state
            wavesurfer.on('loading', (percent) => {
              console.log('[WaveSurfer] Loading:', percent + '%');
            });

            // Decode progress - save peaks to cache
            wavesurfer.on('decode', () => {
              console.log('[WaveSurfer] Decoded successfully');

              // Export and cache peaks for future use
              if (!cachedPeaks) {
                try {
                  const peaks = wavesurfer.exportPeaks();
                  if (peaks && peaks.length > 0) {
                    savePeaksToCache(audioUrl, peaks);
                    console.log('[ModernAudioPlayer] 💾 Saved peaks to cache');
                  }
                } catch (error) {
                  console.error('[ModernAudioPlayer] Error exporting peaks:', error);
                }
              }
            });
          });
        }
      }
    });

    // Start observing
    resizeObserver.observe(waveformRef.current);
    console.log('[ModernAudioPlayer] 👀 Started observing container resize');

    // Cleanup
    return () => {
      console.log('[ModernAudioPlayer] 🧹 Cleaning up for:', audioCacheKey);
      resizeObserver.disconnect();

      // Clear loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }

      if (wavesurferInstance) {
        wavesurferInstance.destroy();
      }
      if (wavesurferRef.current) {
        wavesurferRef.current = null;
      }
    };
  }, [audioCacheKey]); // Only depend on cache key - prevents destroy/recreate when query params change

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const toggleMute = () => {
    if (wavesurferRef.current) {
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      wavesurferRef.current.setVolume(newMutedState ? 0 : volume);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(newVolume);
      if (newVolume > 0 && isMuted) {
        setIsMuted(false);
      }
    }
  };

  return (
    <div
      className={`relative rounded-2xl ${showVolumeSlider ? 'z-[10000]' : 'z-auto'}`}
      style={{
        border: '1px solid rgba(0, 255, 204, 0.3)',
        backdropFilter: 'blur(5px)',
        padding: '12px',
      }}
    >
      {/* Player Container */}
      <div className="flex items-center gap-4">
        {/* Play/Pause Button */}
        <div className="relative flex-shrink-0">
          {isPlaying && (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(217, 70, 239, 0.4) 0%, rgba(217, 70, 239, 0.1) 50%, transparent 70%)',
                filter: 'blur(8px)',
                transform: 'scale(1.3)',
              }}
            />
          )}
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className="relative w-12 h-12 rounded-full bg-white flex items-center justify-center transition-all duration-200 hover:scale-110 disabled:opacity-50"
            style={{
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-gray-900" fill="currentColor" />
            ) : (
              <Play className="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" />
            )}
          </button>
        </div>

        {/* Time Display */}
        <div className="flex-shrink-0 text-xs font-mono text-emerald-300/70" style={{ width: '95px', fontVariantNumeric: 'tabular-nums' }}>
          {currentTime} / {duration}
        </div>

        {/* Waveform Container */}
        <div className="relative" style={{ flex: '1 1 0', minWidth: '200px' }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-emerald-400/50 text-xs">Loading waveform...</div>
            </div>
          )}
          <div
            ref={waveformRef}
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '8px',
              padding: '0',
            }}
          />
        </div>

        {/* Volume Control */}
        <div
          className="relative flex-shrink-0 z-[10000]"
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <button
            onClick={toggleMute}
            className="w-8 h-8 flex items-center justify-center transition-colors hover:text-emerald-300"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-emerald-400/60" />
            ) : (
              <Volume2 className="w-5 h-5 text-emerald-400/60" />
            )}
          </button>

          {/* Volume Slider */}
          {showVolumeSlider && (
            <div
              className="absolute bottom-full mb-2 p-2 rounded-lg flex items-center justify-center z-[9999]"
              style={{
                background: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(10px)',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="cursor-pointer"
                style={{
                  writingMode: 'bt-lr',
                  WebkitAppearance: 'slider-vertical',
                  height: '80px',
                  width: '6px',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
