import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Volume2, FileText, Copy, ChevronDown, BookText } from 'lucide-react';
import { Button } from './ui/button';
import type { GenerationItem } from '../DesktopApp';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';
import { supabase } from '../lib/supabase';
import { ModernAudioPlayer } from './ModernAudioPlayer';

interface GenerationHistoryItemProps {
  item: GenerationItem;
  index: number;
  totalCount: number;
  onConvertToAudio?: (text: string) => void;
  language?: Language;
}

// Helper function to convert language code to flag emoji
function getLanguageFlag(languageCode: string): string {
  const flags: Record<string, string> = {
    'en-US': '🇺🇸',
    'en-GB': '🇬🇧',
    'uk-UA': '🇺🇦',
    'pl-PL': '🇵🇱',
    'es-ES': '🇪🇸',
    'fr-FR': '🇫🇷',
    'de-DE': '🇩🇪',
    'it-IT': '🇮🇹',
    'pt-BR': '🇧🇷',
    'pt-PT': '🇵🇹',
    'ru-RU': '🇷🇺',
    'zh-CN': '🇨🇳',
    'ja-JP': '🇯🇵',
    'ko-KR': '🇰🇷',
    'ar-SA': '🇸🇦',
    'th-TH': '🇹🇭',
    'tr-TR': '🇹🇷',
    'nl-NL': '🇳🇱',
    'sv-SE': '🇸🇪',
    'no-NO': '🇳🇴',
    'da-DK': '🇩🇰',
    'fi-FI': '🇫🇮',
    'cs-CZ': '🇨🇿',
    'el-GR': '🇬🇷',
    'ro-RO': '🇷🇴',
    'hu-HU': '🇭🇺',
  };
  return flags[languageCode] || '🌐';
}

export function GenerationHistoryItem({ item, index, totalCount, onConvertToAudio, language = 'en' }: GenerationHistoryItemProps) {
  const generationNumber = totalCount - index;
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isVolumeSliderVisible, setIsVolumeSliderVisible] = useState(false);
  const t = translations[language];

  // Memoize callback to prevent ModernAudioPlayer re-renders
  const handleVolumeSliderChange = useCallback((isVisible: boolean) => {
    setIsVolumeSliderVisible(isVisible);
  }, []);

  // Check if item is new (generated less than 10 minutes ago AND in top 3)
  const isNew = index < 3 && Date.now() - item.timestamp < 10 * 60 * 1000;

  // Auto-close prompt when card is collapsed
  useEffect(() => {
    if (!isExpanded) {
      setShowPrompt(false);
    }
  }, [isExpanded]);

  const handleDownload = async () => {
    if (item.type === 'audio' && item.content) {
      try {
        // Use download API endpoint with authentication
        const audioNum = item.metadata?.audioNumber || generationNumber;
        const API_URL = import.meta.env.VITE_API_URL ?? '';
        const filename = `YoutuLabs_audio_${String(audioNum).padStart(3, '0')}.mp3`;

        // Get JWT token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.error('No session found for download');
          return;
        }

        // Fetch file with auth
        const response = await fetch(`${API_URL}/api/audio/download/${audioNum}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          throw new Error('Download failed');
        }

        // Create blob and download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Download failed:', error);
      }
    } else if (item.type === 'text' && item.content) {
      // Download text as TXT
      const blob = new Blob([item.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `story-generation-${generationNumber}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const handleCopy = async () => {
    if (item.content) {
      try {
        await navigator.clipboard.writeText(item.content);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleConvertToAudio = () => {
    if (item.type === 'text' && item.content && onConvertToAudio) {
      onConvertToAudio(item.content);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 rounded-2xl border border-emerald-600/20 backdrop-blur-sm mb-4 relative overflow-visible"
      style={{ zIndex: isVolumeSliderVisible ? 10001 : (1000 - index) }}
    >
      {/* NEW badge in top right corner */}
      {isNew && (
        <div
          className="absolute top-0 right-0 px-3 py-1 font-semibold"
          style={{
            backgroundColor: 'rgba(147, 51, 234, 0.8)',
            border: '1px solid rgba(147, 51, 234, 0.9)',
            borderTopRightRadius: '1rem',
            borderBottomLeftRadius: '0.5rem',
            color: '#ffffff',
            fontSize: '10px',
            boxShadow: '0 0 10px rgba(147, 51, 234, 0.3), 0 0 20px rgba(147, 51, 234, 0.15)',
          }}
        >
          {t.newBadge}
        </div>
      )}
      {/* Header with number and action buttons */}
      <div
        className={`flex items-center justify-between p-8 pb-4 transition-all rounded-t-2xl ${
          item.type === 'text' ? 'cursor-pointer hover:bg-emerald-950/30' : ''
        }`}
        onClick={() => item.type === 'text' && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/50">
            {item.type === 'audio' ? (
              <Volume2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <BookText className="w-5 h-5" style={{ color: '#c9a468' }} />
            )}
          </div>
          <div className="flex-1">
            <div className="text-emerald-100 text-sm" style={{ fontWeight: 700 }}>
              {item.type === 'audio' ? (
                item.metadata?.audioNumber
                  ? `${item.metadata.audioNumber}`
                  : `${generationNumber}`
              ) : (
                item.content
                  ? item.content.substring(0, 60) + (item.content.length > 60 ? '...' : '')
                  : `Story #${generationNumber}`
              )}
            </div>
            <div className="text-emerald-300/60 text-xs flex items-center gap-1">
              <span>{item.type === 'audio' ? 'Audio' : 'Story'}</span>
              {item.metadata?.characterCount && <span> • {item.metadata.characterCount} chars</span>}
              {item.metadata?.fileSizeBytes && <span> • {(item.metadata.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>}
              {item.metadata?.duration && <span> • {item.metadata.duration} min</span>}
              {item.metadata?.genre && <span> • {item.metadata.genre}</span>}
              {item.metadata?.language && <span> • <span className="text-white" style={{ opacity: 1, filter: 'none', display: 'inline-block' }}>{getLanguageFlag(item.metadata.language)}</span></span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy button - only for text items */}
          {item.type === 'text' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="flex items-center justify-center transition-all duration-150 rounded-md"
              style={{
                minWidth: '40px',
                height: '32px',
                padding: '0 8px',
                backgroundColor: 'rgba(6, 78, 59, 0.2)',
                border: '1px solid rgba(5, 150, 105, 0.5)',
                color: '#6ee7b7',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(6, 78, 59, 0.3)';
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.7)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(6, 78, 59, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(5, 150, 105, 0.5)';
              }}
            >
              <Copy className="w-4 h-4" />
            </button>
          )}

          {/* Convert to Audio button - only for text items */}
          {item.type === 'text' && onConvertToAudio && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConvertToAudio();
              }}
              className="flex items-center justify-center transition-all duration-150 rounded-md"
              style={{
                minWidth: '40px',
                height: '32px',
                padding: '0 8px',
                backgroundColor: 'rgba(147, 51, 234, 0.15)',
                border: '1px solid rgba(147, 51, 234, 0.5)',
                color: '#c084fc',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(147, 51, 234, 0.25)';
                e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.7)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(147, 51, 234, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.5)';
              }}
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}

          {/* Download button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            className="flex items-center justify-center transition-all duration-150 rounded-md"
            style={{
              minWidth: '40px',
              height: '32px',
              padding: '0 8px',
              backgroundColor: 'rgba(6, 78, 59, 0.2)',
              border: '1px solid rgba(5, 150, 105, 0.5)',
              color: '#fbbf24',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(6, 78, 59, 0.3)';
              e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.7)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(6, 78, 59, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(5, 150, 105, 0.5)';
            }}
          >
            <Download className="w-4 h-4" />
          </button>

          {/* ChevronDown - only for text items */}
          {item.type === 'text' && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="ml-2"
            >
              <ChevronDown className="w-5 h-5 text-emerald-400" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Content preview - only show when NOT expanded */}
      {!isExpanded && (
        <div style={{ paddingLeft: '32px', paddingRight: '32px', paddingBottom: '24px', overflow: 'visible' }}>
          {(() => {
            console.log(`[HistoryItem] Rendering item:`, {
              type: item.type,
              hasContent: !!item.content,
              contentPreview: item.content?.substring(0, 50),
              isExpanded,
              audioNumber: item.metadata?.audioNumber
            });
            return null;
          })()}
          {item.type === 'audio' && item.content ? (
              <ModernAudioPlayer
                key={`audio-${item.metadata?.audioNumber || generationNumber}`}
                audioUrl={item.content}
                onVolumeSliderChange={handleVolumeSliderChange}
              />
            ) : item.type === 'text' && item.content ? (
              <div
                className="text-emerald-100/90 text-sm leading-relaxed"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.content}
              </div>
            ) : null}
        </div>
      )}

      {/* Full content - collapsible (only for text items) */}
      <AnimatePresence>
        {isExpanded && item.type === 'text' && item.content && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div style={{ paddingLeft: '32px', paddingRight: '32px', paddingBottom: '32px', paddingTop: '24px' }} className="border-t border-emerald-600/20">
              {/* Show Prompt button - left side, only when expanded and has prompt */}
              {item.metadata?.prompt && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPrompt(!showPrompt);
                  }}
                  className="flex items-center gap-2 transition-all duration-150 rounded-md mb-4"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: showPrompt ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)',
                    border: showPrompt ? '1px solid rgba(59, 130, 246, 0.7)' : '1px solid rgba(59, 130, 246, 0.5)',
                    color: '#60a5fa',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = showPrompt ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)';
                    e.currentTarget.style.borderColor = showPrompt ? 'rgba(59, 130, 246, 0.7)' : 'rgba(59, 130, 246, 0.5)';
                  }}
                >
                  <FileText className="w-4 h-4" />
                  <span className="text-sm font-medium">{showPrompt ? t.hidePrompt : t.showPrompt}</span>
                </button>
              )}

              {/* Prompt display */}
              <AnimatePresence>
                {showPrompt && item.metadata?.prompt && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden mb-4"
                  >
                    <div className="backdrop-blur-sm rounded-lg border border-purple-600/30" style={{ padding: '20px', backgroundColor: 'rgba(20, 18, 25, 0.95)' }}>
                      <p className="text-purple-50/90 leading-relaxed text-sm">
                        {item.metadata.prompt}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Story content */}
              {item.content.split('\n\n').map((paragraph, idx) => (
                <p key={idx} className="text-emerald-50/70 leading-relaxed mb-4 text-base">
                  {paragraph}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
