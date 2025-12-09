import { useState, useRef, useEffect, useId, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, ChevronDown } from 'lucide-react';
import { Label } from './ui/label';
import { InfoTooltip } from './InfoTooltip';

interface Voice {
  id: string;
  name: string;
  multilingual: boolean;
  accent: string | null;
  description: {
    uk: string;
    en: string;
    pl: string;
  };
}

interface VoiceSelectorProps {
  voices: Voice[];
  selectedVoiceId: string;
  onVoiceChange: (voiceId: string, voiceName: string) => void;
  gender: 'male' | 'female';
  language: 'uk' | 'en' | 'pl';
  label?: string;
  tooltip?: string;
}

// Кольори в залежності від статі
const GENDER_COLORS = {
  male: {
    primary: '#3b82f6',
    secondary: '#60a5fa',
    light: '#93c5fd',
    glow: 'rgba(59, 130, 246, 0.5)',
    bg: 'rgba(59, 130, 246, 0.08)',
    bgHover: 'rgba(59, 130, 246, 0.4)',
    border: 'rgba(59, 130, 246, 0.25)',
    gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    buttonBg: 'rgba(59, 130, 246, 0.3)',
    dropdownBg: 'rgba(8, 15, 28, 0.45)',
    itemBorder: 'rgba(59, 130, 246, 0.15)',
    scrollThumb: 'rgba(59, 130, 246, 0.4)',
    scrollTrack: 'rgba(59, 130, 246, 0.1)',
  },
  female: {
    primary: '#ec4899',
    secondary: '#f472b6',
    light: '#f9a8d4',
    glow: 'rgba(236, 72, 153, 0.5)',
    bg: 'rgba(236, 72, 153, 0.08)',
    bgHover: 'rgba(236, 72, 153, 0.4)',
    border: 'rgba(236, 72, 153, 0.25)',
    gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
    buttonBg: 'rgba(236, 72, 153, 0.3)',
    dropdownBg: 'rgba(20, 10, 18, 0.45)',
    itemBorder: 'rgba(236, 72, 153, 0.15)',
    scrollThumb: 'rgba(236, 72, 153, 0.4)',
    scrollTrack: 'rgba(236, 72, 153, 0.1)',
  }
};

// Окремий мемоізований компонент кнопки Play
interface PlayButtonProps {
  voice: Voice;
  size?: number;
  isPlaying: boolean;
  isHovered: boolean;
  currentProgress: number;
  colors: typeof GENDER_COLORS.male;
  onPlay: (e: React.MouseEvent, voice: Voice) => void;
  onHoverStart: (voiceId: string) => void;
  onHoverEnd: () => void;
}

const PlayButton = memo(function PlayButton({
  voice,
  size = 48,
  isPlaying,
  isHovered,
  currentProgress,
  colors,
  onPlay,
  onHoverStart,
  onHoverEnd,
}: PlayButtonProps) {
  const strokeWidth = size > 40 ? 3 : 2.5;
  const radius = (size / 2) - strokeWidth - 2;
  const circumference = 2 * Math.PI * radius;

  const buttonBackground = isPlaying
    ? colors.gradient
    : isHovered
      ? colors.bgHover
      : colors.buttonBg;

  const buttonShadow = isPlaying
    ? `0 0 20px ${colors.glow}, 0 4px 15px rgba(0,0,0,0.3)`
    : isHovered
      ? `0 0 15px ${colors.glow}, 0 4px 12px rgba(0,0,0,0.25)`
      : `0 2px 8px rgba(0,0,0,0.2)`;

  return (
    <button
      type="button"
      onClick={(e) => onPlay(e, voice)}
      onMouseEnter={() => onHoverStart(voice.id)}
      onMouseLeave={onHoverEnd}
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: buttonBackground,
        boxShadow: buttonShadow,
        transition: 'background 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isPlaying ? 'rgba(255,255,255,0.2)' : colors.border}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isPlaying ? '#ffffff' : colors.light}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${(currentProgress / 100) * circumference} ${circumference}`}
          style={{
            filter: isPlaying ? `drop-shadow(0 0 4px ${colors.light})` : 'none',
            transition: 'stroke-dasharray 0.35s linear',
            opacity: currentProgress > 0 ? 1 : 0,
          }}
        />
      </svg>
      <div className="relative z-10">
        {isPlaying ? (
          <Pause
            style={{ width: size * 0.4, height: size * 0.4 }}
            className="text-white"
            fill="white"
            strokeWidth={0}
          />
        ) : (
          <Play
            style={{ width: size * 0.4, height: size * 0.4, marginLeft: size * 0.05 }}
            fill={colors.light}
            stroke={colors.light}
            strokeWidth={0}
          />
        )}
      </div>
    </button>
  );
});

export function VoiceSelector({
  voices,
  selectedVoiceId,
  onVoiceChange,
  gender,
  language,
  label = 'Voice',
  tooltip = 'Select a voice for audio synthesis'
}: VoiceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ [key: string]: number }>({});
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [hoveredButtonId, setHoveredButtonId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const playingVoiceIdRef = useRef<string | null>(null);

  const selectedVoice = voices.find(v => v.id === selectedVoiceId);
  const colors = GENDER_COLORS[gender];
  const scrollId = useId().replace(/:/g, '');

  // Update dropdown position when opened (using viewport coordinates for fixed positioning)
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px gap below trigger
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside (check both trigger and dropdown since dropdown is in Portal)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);

      if (isOutsideTrigger && isOutsideDropdown) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const getVoiceSampleUrl = (voiceName: string) => {
    const folder = gender === 'male' ? 'men' : 'women';
    return `/voice-samples/${folder}/${voiceName}.mp3`;
  };

  const handlePlayPause = useCallback((e: React.MouseEvent, voice: Voice) => {
    e.stopPropagation();
    e.preventDefault();

    const currentPlayingId = playingVoiceIdRef.current;

    // Зупиняємо поточне аудіо
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (currentPlayingId === voice.id) {
      // Той самий голос - просто зупиняємо
      playingVoiceIdRef.current = null;
      setPlayingVoiceId(null);
      setProgress({}); // Скидаємо весь прогрес
    } else {
      // Інший голос - запускаємо новий
      // Синхронно оновлюємо ref
      playingVoiceIdRef.current = voice.id;
      setPlayingVoiceId(voice.id);
      // Скидаємо весь прогрес і встановлюємо 0 для нового
      setProgress({ [voice.id]: 0 });

      const audio = new Audio(getVoiceSampleUrl(voice.name));
      audioRef.current = audio;

      audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
          setProgress(prev => ({
            ...prev,
            [voice.id]: (audio.currentTime / audio.duration) * 100
          }));
        }
      });

      audio.addEventListener('ended', () => {
        playingVoiceIdRef.current = null;
        setPlayingVoiceId(null);
        setProgress({});
        audioRef.current = null;
      });

      audio.addEventListener('error', () => {
        console.error('Failed to load audio sample for', voice.name);
        playingVoiceIdRef.current = null;
        setPlayingVoiceId(null);
        setProgress({});
        audioRef.current = null;
      });

      audio.play().catch(err => {
        console.error('Failed to play audio:', err);
        playingVoiceIdRef.current = null;
        setPlayingVoiceId(null);
        setProgress({});
        audioRef.current = null;
      });
    }
  }, [gender]);

  const handleSelectVoice = useCallback((voice: Voice) => {
    // Зупиняємо поточне аудіо при виборі іншого голосу
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    playingVoiceIdRef.current = null;
    setPlayingVoiceId(null);
    setProgress({});

    onVoiceChange(voice.id, voice.name);
    setIsOpen(false);
  }, [onVoiceChange]);

  const handleHoverStart = useCallback((voiceId: string) => {
    setHoveredButtonId(voiceId);
  }, []);

  const handleHoverEnd = useCallback(() => {
    setHoveredButtonId(null);
  }, []);

  // Динамічні стилі для скролбара
  const scrollbarStyles = `
    .voice-scroll-${scrollId}::-webkit-scrollbar {
      width: 6px;
    }
    .voice-scroll-${scrollId}::-webkit-scrollbar-track {
      background: ${colors.scrollTrack};
      border-radius: 3px;
    }
    .voice-scroll-${scrollId}::-webkit-scrollbar-thumb {
      background: ${colors.scrollThumb};
      border-radius: 3px;
    }
    .voice-scroll-${scrollId}::-webkit-scrollbar-thumb:hover {
      background: ${colors.border};
    }
  `;

  return (
    <div className="relative" style={{ marginBottom: '12px' }}>
      <style>{scrollbarStyles}</style>
      <div className="flex items-center gap-2 mb-3">
        <Label className="text-emerald-100/90">{label}</Label>
        <InfoTooltip content={tooltip} />
      </div>

      {/* Main Trigger with Play Button */}
      <div
        ref={triggerRef}
        className="flex items-center transition-all duration-200"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          padding: '8px 14px 8px 10px',
          gap: '12px',
        }}
      >
        {/* Play Button для обраного голосу */}
        {selectedVoice && (
          <PlayButton
            voice={selectedVoice}
            size={44}
            isPlaying={playingVoiceId === selectedVoice.id}
            isHovered={hoveredButtonId === selectedVoice.id}
            currentProgress={progress[selectedVoice.id] || 0}
            colors={colors}
            onPlay={handlePlayPause}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />
        )}

        {/* Voice Name & Dropdown Trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center justify-between text-white transition-colors"
          style={{ padding: '4px 0' }}
        >
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base">{selectedVoice?.name || 'Select voice'}</span>
              {selectedVoice?.multilingual ? (
                <span className="text-sm">🌍</span>
              ) : selectedVoice?.accent && (
                <span className="text-sm">{selectedVoice.accent}</span>
              )}
            </div>
            {selectedVoice?.description && (
              <span className="text-xs text-gray-400 mt-0.5">
                {selectedVoice.description[language] || selectedVoice.description.en}
              </span>
            )}
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ marginRight: '4px' }}
          >
            <ChevronDown className="w-5 h-5" style={{ color: colors.primary }} />
          </motion.div>
        </button>
      </div>

      {/* Dropdown Menu - rendered via Portal for backdrop-filter to work */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                zIndex: 9999,
              }}
            >
            {/* Background layer with blur */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: colors.dropdownBg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                zIndex: -1,
              }}
            />
            {/* Scrollable content inside - показуємо ~5 голосів */}
            <div
              className={`overflow-y-auto voice-scroll-${scrollId}`}
              style={{
                position: 'relative',
                padding: '10px 8px 10px 12px',
                maxHeight: '320px',
                scrollbarWidth: 'thin',
                scrollbarColor: `${colors.scrollThumb} ${colors.scrollTrack}`,
                borderRadius: '8px',
              }}
            >
              {voices.map((voice, index) => {
                const isSelected = selectedVoiceId === voice.id;
                const isLast = index === voices.length - 1;

                return (
                  <div
                    key={voice.id}
                    onClick={() => handleSelectVoice(voice)}
                    className="flex items-center cursor-pointer transition-all duration-200"
                    style={{
                      background: isSelected ? colors.bg : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected ? '1px solid rgba(251, 191, 36, 0.6)' : `1px solid ${colors.itemBorder}`,
                      boxShadow: isSelected ? '0 0 8px rgba(251, 191, 36, 0.3)' : 'none',
                      borderRadius: '10px',
                      padding: '10px 14px 10px 12px',
                      gap: '12px',
                      marginBottom: isLast ? '0' : '8px',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                        e.currentTarget.style.border = `1px solid ${colors.border}`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                        e.currentTarget.style.border = `1px solid ${colors.itemBorder}`;
                      }
                    }}
                  >
                    {/* Play Button */}
                    <PlayButton
                      voice={voice}
                      size={44}
                      isPlaying={playingVoiceId === voice.id}
                      isHovered={hoveredButtonId === voice.id}
                      currentProgress={progress[voice.id] || 0}
                      colors={colors}
                      onPlay={handlePlayPause}
                      onHoverStart={handleHoverStart}
                      onHoverEnd={handleHoverEnd}
                    />

                    {/* Voice Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold"
                          style={{ color: isSelected ? colors.light : '#ffffff' }}
                        >
                          {voice.name}
                        </span>
                        {voice.multilingual ? (
                          <span className="text-sm">🌍</span>
                        ) : voice.accent && (
                          <span className="text-sm">{voice.accent}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {voice.description[language] || voice.description.en}
                      </p>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: '#fbbf24',
                          boxShadow: '0 0 10px rgba(251, 191, 36, 0.6)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </div>
  );
}
