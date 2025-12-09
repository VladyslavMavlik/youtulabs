import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, Loader2, Sparkles, Download, Volume2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner@2.0.3';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';
import type { GenerationItem } from '../App';
import { GenerationHistoryItem } from './GenerationHistoryItem';

// Helper function to convert language code to flag emoji
function getLanguageFlag(languageCode: string): string {
  const flags: Record<string, string> = {
    'en-US': '🇺🇸',
    'uk-UA': '🇺🇦',
    'pl-PL': '🇵🇱',
    'es-ES': '🇪🇸',
    'fr-FR': '🇫🇷',
    'de-DE': '🇩🇪',
    'it-IT': '🇮🇹',
    'pt-BR': '🇧🇷',
    'ru-RU': '🇷🇺',
    'zh-CN': '🇨🇳',
    'ja-JP': '🇯🇵',
    'ko-KR': '🇰🇷',
    'ar-SA': '🇸🇦',
    'th-TH': '🇹🇭',
    'tr-TR': '🇹🇷',
  };
  return flags[languageCode] || '🌐';
}

interface StoryDisplayProps {
  story: string | null;
  isGenerating: boolean;
  activeJobsCount?: number;
  activeJobsMetadata?: Array<{
    duration?: number;
    genre?: string;
    language?: string;
  }>;
  language: Language;
  audioUrl?: string | null;
  voiceStatus?: string | null;
  outputMode?: 'text' | 'audio';
  generationHistory?: GenerationItem[];
  currentFormMode?: 'text' | 'audio';
  onConvertToAudio?: (text: string) => void;
  currentGenre?: string;
  currentDuration?: number;
  currentStoryLanguage?: string;
}

export function StoryDisplay({ story, isGenerating, activeJobsCount = 0, activeJobsMetadata = [], language, audioUrl, voiceStatus, outputMode = 'text', generationHistory = [], currentFormMode = 'text', onConvertToAudio, currentGenre, currentDuration, currentStoryLanguage }: StoryDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const t = translations[language];

  // Reset showAllHistory when mode changes
  useEffect(() => {
    setShowAllHistory(false);
  }, [currentFormMode]);

  // Debug logging
  console.log(`🎨 StoryDisplay render: isGenerating=${isGenerating}, outputMode=${outputMode}, currentFormMode=${currentFormMode}, activeJobsCount=${activeJobsCount}, activeJobsMetadata.length=${activeJobsMetadata.length}`, activeJobsMetadata);

  const handleCopy = async () => {
    if (!story) return;

    try {
      await navigator.clipboard.writeText(story);
      setCopied(true);
      toast.success(t.copiedToClipboard);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(t.failedToCopy);
    }
  };

  const handleDownload = (format: 'txt' | 'docx') => {
    if (!story) return;

    const fileName = 'youtulabs_story';

    if (format === 'txt') {
      const blob = new Blob([story], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t.storyDownloadedAsTxt);
    } else {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body>
          ${story.split('\n\n').map(p => `<p>${p}</p>`).join('\n')}
        </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t.storyDownloadedAsDocx);
    }

    setDownloadMenuOpen(false);
  };

  const handleDownloadAudio = async () => {
    if (!audioUrl) return;

    try {
      // Fetch the audio file as a blob
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error('Failed to fetch audio');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'youtulabs_audio.mp3';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      URL.revokeObjectURL(url);

      toast.success('Audio downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download audio');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuOpen) {
        setDownloadMenuOpen(false);
      }
    };

    if (downloadMenuOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [downloadMenuOpen]);

  // Get status label for voice synthesis
  const getVoiceStatusLabel = () => {
    if (!voiceStatus) return 'Processing...';

    // Check if status contains queue position (e.g., "waiting:5")
    const match = voiceStatus.match(/^(\w+):(\d+)$/);
    if (match) {
      const [, status, position] = match;
      const queueNumber = parseInt(position, 10);

      if (status === 'waiting' && !isNaN(queueNumber)) {
        return `Waiting in queue... Position: ${queueNumber}`;
      }
    }

    const statusLabels: Record<string, string> = {
      'creating': 'Creating synthesis task...',
      'waiting': 'Waiting in queue...',
      'processing': 'Synthesizing audio...',
      'ending': 'Finalizing audio...',
      'ending_processed': 'Audio ready!',
    };

    return statusLabels[voiceStatus] || voiceStatus;
  };

  // Check if we have any history for current mode
  const hasHistory = generationHistory.filter(item => item.type === currentFormMode).length > 0;

  console.log('[StoryDisplay] Mode:', currentFormMode, 'isGenerating:', isGenerating, 'History count:', generationHistory.length, 'Filtered:', generationHistory.filter(item => item.type === currentFormMode).length, 'hasHistory:', hasHistory);

  return (
    <div className="h-full">
      <AnimatePresence mode="wait">
        {story && currentFormMode === 'text' && !isGenerating && !hasHistory ? (
          <motion.div
            key="story"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="h-full flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <motion.h2
                className="text-2xl text-emerald-100"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                {outputMode === 'audio' ? (t.yourAudio || 'Your Audio') : (t.yourStory || 'Your Story')}
              </motion.h2>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center"
                style={{ marginRight: '28px', gap: '28px' }}
              >
                {/* Audio button - converts text to audio generation */}
                <Button
                  onClick={() => {
                    if (story && onConvertToAudio) {
                      onConvertToAudio(story);
                      toast.success(t.textConvertedToAudio || 'Text copied to audio generation');
                    }
                  }}
                  variant="outline"
                  className="transition-all duration-300"
                  style={{
                    minWidth: '95px',
                    paddingLeft: '1.25rem',
                    paddingRight: '1.25rem',
                    paddingTop: '0.5rem',
                    paddingBottom: '0.5rem',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderColor: 'rgba(168, 85, 247, 0.5)',
                    color: '#a855f7',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.7)';
                    e.currentTarget.style.color = '#c084fc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
                    e.currentTarget.style.color = '#a855f7';
                  }}
                >
                  <Volume2 className="w-4 h-4 mr-3" style={{ color: '#a855f7' }} />
                  {t.convertToAudio || 'Narrate'}
                </Button>

                {/* Download and Copy buttons group */}
                <div className="flex items-center" style={{ gap: '12px' }}>
                <div className="relative z-50">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDownloadMenuOpen(!downloadMenuOpen);
                    }}
                    variant="outline"
                    size={undefined}
                    className="transition-all duration-300"
                    style={{
                      paddingLeft: '0.75rem',
                      paddingRight: '0.75rem',
                      paddingTop: '0.5rem',
                      paddingBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(202, 138, 4, 0.1)',
                      borderColor: 'rgba(202, 138, 4, 0.5)',
                      borderWidth: '1px',
                      boxSizing: 'border-box',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(202, 138, 4, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(202, 138, 4, 0.7)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(202, 138, 4, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(202, 138, 4, 0.5)';
                    }}
                  >
                    <Download className="w-5 h-5" style={{ color: '#ca8a04' }} />
                  </Button>

                  {/* Download dropdown */}
                  <AnimatePresence>
                    {downloadMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute"
                        style={{
                          zIndex: 99999,
                          right: '100%',
                          marginRight: '8px',
                          top: '-4px'
                        }}
                      >
                        <div className="bg-emerald-950/95 border border-emerald-600/40 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden" style={{ width: '200px', backgroundColor: 'rgba(6, 78, 59, 0.95)' }}>
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload('txt');
                            }}
                            className="block w-full text-left px-6 py-4 text-base text-emerald-100"
                            whileHover={{
                              backgroundColor: 'rgba(16, 185, 129, 0.2)',
                              color: '#ecfdf5',
                              paddingLeft: '28px'
                            }}
                            transition={{ duration: 0.15 }}
                          >
                            {t.downloadAsTxt}
                          </motion.button>
                          <div className="h-px bg-emerald-600/50 mx-3"></div>
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload('docx');
                            }}
                            className="block w-full text-left px-6 py-4 text-base text-emerald-100"
                            whileHover={{
                              backgroundColor: 'rgba(16, 185, 129, 0.2)',
                              color: '#ecfdf5',
                              paddingLeft: '28px'
                            }}
                            transition={{ duration: 0.15 }}
                          >
                            {t.downloadAsDocx}
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Copy button - only show for text mode */}
                {outputMode === 'text' && (
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    size={undefined}
                    className="transition-all duration-300"
                    style={{
                      paddingLeft: '0.75rem',
                      paddingRight: '0.75rem',
                      paddingTop: '0.5rem',
                      paddingBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(6, 78, 59, 0.2)',
                      borderColor: 'rgba(5, 150, 105, 0.5)',
                      borderWidth: '1px',
                      boxSizing: 'border-box',
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
                    {copied ? (
                      <Check className="w-5 h-5 text-yellow-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-yellow-400" />
                    )}
                  </Button>
                )}
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex-1"
            >
              <div className="bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 rounded-2xl border border-emerald-600/20 p-8 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                  className="prose prose-invert prose-emerald max-w-none"
                >
                  {story.split('\n\n').map((paragraph, index) => (
                    <motion.p
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 + index * 0.1 }}
                      className="text-emerald-50/90 leading-relaxed mb-4 last:mb-0"
                    >
                      {paragraph}
                    </motion.p>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex flex-col"
          >
            {/* History - filtered by current form mode */}
            {generationHistory.length > 0 || isGenerating ? (
              <>
                <motion.div
                  className="mb-6 mt-6"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <h2 className="text-2xl text-emerald-100">
                    {currentFormMode === 'text' ? t.textHistory : t.audioHistory}
                  </h2>
                </motion.div>

                {/* Filtered history list */}
                <motion.div
                  className="flex-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <div className="space-y-4 max-w-xl mx-auto">
                    <AnimatePresence mode="popLayout">
                      {/* Show generating cards at the top when generating (one per active job) */}
                      {(() => {
                        const shouldShowCards = isGenerating && outputMode === currentFormMode;
                        console.log(`🎯 Rendering cards check: isGenerating=${isGenerating}, outputMode=${outputMode}, currentFormMode=${currentFormMode}, shouldShowCards=${shouldShowCards}, activeJobsMetadata.length=${activeJobsMetadata.length}`);
                        return shouldShowCards && activeJobsMetadata.map((jobMeta, idx) => (
                        <motion.div
                          key={`generating-card-${idx}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.3, delay: idx * 0.1 }}
                          className="bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 rounded-2xl border border-emerald-600/20 backdrop-blur-sm mb-4"
                        >
                          <div className="flex items-center gap-3 ml-4 p-8 pb-4">
                            {/* Animated loading circle */}
                            <motion.div
                              animate={{
                                scale: [1, 1.15, 1],
                                rotate: [0, 360],
                                borderColor: [
                                  'rgba(16, 185, 129, 0.4)',
                                  'rgba(239, 68, 68, 0.6)',
                                  'rgba(16, 185, 129, 0.4)',
                                ],
                              }}
                              transition={{
                                scale: {
                                  duration: 1.2,
                                  repeat: Infinity,
                                  ease: [0.4, 0, 0.6, 1],
                                },
                                rotate: {
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: 'linear',
                                },
                                borderColor: {
                                  duration: 1.2,
                                  repeat: Infinity,
                                  ease: [0.4, 0, 0.6, 1],
                                },
                              }}
                              className="flex items-center justify-center w-10 h-10 rounded-full"
                              style={{
                                overflow: 'hidden',
                                border: '3px solid rgba(16, 185, 129, 0.4)',
                              }}
                            >
                              <img
                                src="/Genis osnowa.gif"
                                alt="Generating"
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  objectFit: 'cover',
                                  mixBlendMode: 'screen',
                                  filter: 'contrast(1.2) brightness(1.1)',
                                }}
                              />
                            </motion.div>
                            <div className="flex-1">
                              <div className="text-emerald-100 text-sm" style={{ fontWeight: 700 }}>
                                {outputMode === 'audio' ? 'Generating audio...' : 'Generating story...'}
                              </div>
                              <div className="text-emerald-300/60 text-xs flex items-center gap-1">
                                <span>{outputMode === 'audio' ? getVoiceStatusLabel() : 'This may take a moment'}</span>
                                {jobMeta.duration && <span> • {jobMeta.duration} min</span>}
                                {jobMeta.genre && <span> • {jobMeta.genre}</span>}
                                {jobMeta.language && <span> • <span className="text-white" style={{ opacity: 1, filter: 'none', display: 'inline-block' }}>{getLanguageFlag(jobMeta.language)}</span></span>}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ));
                      })()}

                      {(() => {
                        const filteredHistory = generationHistory.filter(item => item.type === currentFormMode);
                        // Always show first 10
                        const firstTen = filteredHistory.slice(0, 10);
                        // Additional items to show when expanded
                        const remaining = showAllHistory ? filteredHistory.slice(10) : [];
                        const displayedHistory = [...firstTen, ...remaining];

                        return displayedHistory.map((item, index) => (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3, delay: index < 10 ? index * 0.05 : (index - 10) * 0.05 }}
                          >
                            <GenerationHistoryItem
                              item={item}
                              index={index}
                              totalCount={filteredHistory.length}
                              onConvertToAudio={onConvertToAudio}
                              language={language}
                            />
                          </motion.div>
                        ));
                      })()}
                    </AnimatePresence>

                    {/* Show More Button */}
                    {(() => {
                      const filteredHistory = generationHistory.filter(item => item.type === currentFormMode);
                      const hasMore = filteredHistory.length > 10;

                      if (!hasMore || showAllHistory) return null;

                      return (
                        <motion.button
                          onClick={() => setShowAllHistory(true)}
                          className="w-full py-4 mt-4 rounded-2xl transition-all duration-200 flex items-center justify-center gap-2"
                          style={{
                            backgroundColor: 'rgba(147, 51, 234, 0.15)',
                            border: '1px solid rgba(147, 51, 234, 0.5)',
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(147, 51, 234, 0.25)';
                            e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.7)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(147, 51, 234, 0.15)';
                            e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.5)';
                          }}
                        >
                          <span className="text-sm font-medium" style={{ color: '#c084fc' }}>
                            {t.showMore} {filteredHistory.length - 10} {t.more}
                          </span>
                          <motion.div
                            animate={{ y: [0, 3, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: '#c084fc' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </motion.div>
                        </motion.button>
                      );
                    })()}
                    {generationHistory.filter(item => item.type === currentFormMode).length === 0 && !(isGenerating && outputMode === currentFormMode) && (
                      <motion.div
                        className="text-center text-emerald-300/40 py-12"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-40" />
                        <p>No {currentFormMode} generations yet</p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4 mt-6">
                  <h2 className="text-2xl text-emerald-100/40">
                    {outputMode === 'audio' ? (t.yourAudio || 'Your Audio') : (t.yourStory || 'Your Story')}
                  </h2>
                  {outputMode === 'text' && (
                    <Button
                      disabled
                      variant="outline"
                      size="sm"
                      className="bg-emerald-950/30 border-emerald-600/20 text-emerald-400/40 cursor-not-allowed"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {t.copy || 'Copy'}
                    </Button>
                  )}
                </div>

                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md" style={{ marginTop: '20rem' }}>
                    <motion.div
                      animate={{
                        y: [0, -10, 0],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className="inline-block mb-6"
                    >
                      <Sparkles className="w-16 h-16 text-emerald-400/40" />
                    </motion.div>
                    <h2 className="text-xl text-emerald-200/60 mb-2">
                      {t.noStoryYet || 'No story yet'}
                    </h2>
                    <p className="text-emerald-300/40">
                      {outputMode === 'audio'
                        ? (t.fillFormToGenerateAudio || 'Fill out the form to generate audio')
                        : (t.fillFormToGenerate || 'Fill out the form to generate your story')
                      }
                    </p>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.3) !important;
          border-radius: 4px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.8) !important;
          border-radius: 4px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 1) !important;
        }
      `}</style>
    </div>
  );
}
