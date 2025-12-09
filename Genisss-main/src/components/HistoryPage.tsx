import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, FileText, Trash2, Calendar, Clock, ChevronDown, Download, Copy, Volume2 } from 'lucide-react';
import { Header } from './Header';
import { Footer } from './Footer';
import { MouseFollowBackground } from './MouseFollowBackground';
import { getUserStories, deleteStory } from '../lib/supabase';
import { toast } from 'sonner';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Language } from '../lib/translations';
import { translations } from '../lib/translations';

interface HistoryPageProps {
  onBack: () => void;
  user?: SupabaseUser | null;
  language?: Language;
  balance?: number;
  onConvertToAudio?: (text: string) => void;
}

interface Story {
  id: string;
  title: string;
  content: string;
  genre?: string;
  duration?: number;
  language?: string;
  created_at: string;
}

export function HistoryPage({ onBack, user, language = 'en', balance = 0, onConvertToAudio }: HistoryPageProps) {
  const t = translations[language];
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);

  useEffect(() => {
    loadStories();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadMenuOpen) {
        setDownloadMenuOpen(null);
      }
      if (deleteConfirmId) {
        setDeleteConfirmId(null);
      }
    };

    if (downloadMenuOpen || deleteConfirmId) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [downloadMenuOpen, deleteConfirmId]);

  const loadStories = async () => {
    setLoading(true);
    const { data, error } = await getUserStories();

    if (error) {
      console.error('Failed to load stories:', error);
      toast.error(t.failedToLoadStories);
    }

    setStories(data || []);
    setLoading(false);
  };

  const handleDelete = async (storyId: string) => {
    console.log('🔴 handleDelete called with storyId:', storyId);
    setDeleteConfirmId(null);
    setDeletingStoryId(storyId);

    // Wait for animation to start
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('🔴 Calling deleteStory...');
    const { error } = await deleteStory(storyId);

    if (error) {
      toast.error(t.failedToDeleteStory, {
        style: {
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          color: '#fca5a5'
        }
      });
      setDeletingStoryId(null);
    } else {
      toast.success(t.storyDeletedSuccessfully, {
        style: {
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#6ee7b7'
        }
      });

      // Wait for animation to complete before removing from state
      await new Promise(resolve => setTimeout(resolve, 400));
      setStories(stories.filter(s => s.id !== storyId));
      setDeletingStoryId(null);
      if (expandedStoryId === storyId) {
        setExpandedStoryId(null);
      }
    }
  };

  const toggleStory = (storyId: string) => {
    setExpandedStoryId(expandedStoryId === storyId ? null : storyId);
  };

  const downloadStory = (story: Story, format: 'txt' | 'docx') => {
    // Create the file content - only content, no title
    const content = story.content;

    // Generate filename with youtulabs_story and index
    const storyIndex = stories.findIndex(s => s.id === story.id) + 1;
    const fileName = `youtulabs_story_${storyIndex}`;

    if (format === 'txt') {
      // Download as TXT
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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
      // Download as DOCX (simple HTML format that Word can open)
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body>
          ${story.content.split('\n\n').map(p => `<p>${p}</p>`).join('\n')}
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
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStoryTitle = (story: Story) => {
    const firstLine = story.content.split('\n')[0].trim();
    return firstLine.length > 50
      ? firstLine.substring(0, 50) + '...'
      : firstLine || story.title;
  };

  const handleCopyStory = async (story: Story) => {
    try {
      await navigator.clipboard.writeText(story.content);
      toast.success(t.copiedToClipboard || 'Copied to clipboard!', {
        style: {
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#6ee7b7'
        }
      });
    } catch (err) {
      toast.error(t.failedToCopy || 'Failed to copy', {
        style: {
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          color: '#fca5a5'
        }
      });
    }
  };

  const handleConvertToAudio = (story: Story) => {
    if (onConvertToAudio) {
      // Go back to main page first
      onBack();
      // Then set the audio text and switch mode after a small delay
      setTimeout(() => {
        onConvertToAudio(story.content);
        toast.success(t.textConvertedToAudio || 'Story copied to audio generation', {
          style: {
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            color: '#c084fc'
          }
        });
      }, 100);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black relative flex flex-col" style={{ scrollbarGutter: 'stable' }}>
      <MouseFollowBackground />

      <Header
        user={user || null}
        language={language}
        onLanguageChange={() => {}}
        balance={balance}
      />

      <div className="h-20 flex-shrink-0"></div>

      <div className="relative z-10 px-24 flex-1" style={{ paddingBottom: '30rem' }}>
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 rounded-full mb-4 transition-all duration-150"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            marginTop: '1rem',
            marginLeft: '1rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
          }}
        >
          <ArrowLeft className="w-5 h-5 text-emerald-400" />
        </button>

        <div className="text-center" style={{ marginTop: '-3rem', marginBottom: '2.5rem' }}>
          <h1 className="text-5xl mb-3 font-bold">
            <span style={{ background: 'linear-gradient(to right, #10b981, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t.storyHistory.split(' ')[0]} </span>
            <span style={{ background: 'linear-gradient(to right, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t.storyHistory.split(' ')[1]}</span>
          </h1>
        </div>

        <div className="mx-auto" style={{ maxWidth: '900px' }}>
          {loading ? (
            <div className="text-center text-emerald-300/60 py-8">{t.loading}</div>
          ) : stories.length === 0 ? (
            <div className="text-center text-emerald-300/60 py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-40" />
              {t.noStoriesYet}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="space-y-8">
                {stories.map((story) => (
                  <motion.div
                    key={story.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={deletingStoryId === story.id ? {
                      opacity: 0,
                      x: -100,
                      scale: 0.8
                    } : { opacity: 1, y: 0, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: -100, height: 0, marginBottom: 0 }}
                    transition={{
                      duration: 0.4,
                      layout: { duration: 0.3 }
                    }}
                    className="rounded-2xl bg-emerald-950/40 border-2 border-emerald-600/20 overflow-visible relative"
                    style={{ overflow: 'visible' }}
                  >
                  {/* Header - Always visible */}
                  <div
                    className="p-8 cursor-pointer hover:bg-emerald-950/60 transition-all"
                    onClick={() => toggleStory(story.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-6">
                          <h3 className="text-white font-semibold text-xl">{getStoryTitle(story)}</h3>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-emerald-300/60">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(story.created_at)}
                          </span>
                          {story.duration && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {story.duration} min
                            </span>
                          )}
                          {story.genre && (
                            <span className="text-sm px-3 py-1 rounded bg-purple-500/20 text-purple-300">
                              {story.genre}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-4" style={{ marginTop: '8px' }}>
                        {/* Copy button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyStory(story);
                          }}
                          className="p-2 transition-all duration-200"
                        >
                          <Copy className="w-5 h-5" style={{ color: '#10b981', transition: 'color 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#6ee7b7'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#10b981'}
                          />
                        </button>

                        {/* Convert to Audio button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConvertToAudio(story);
                          }}
                          className="p-2 transition-all duration-200"
                        >
                          <Volume2 className="w-5 h-5" style={{ color: '#a855f7', transition: 'color 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#c084fc'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#a855f7'}
                          />
                        </button>

                        <div className="relative z-50">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDownloadMenuOpen(downloadMenuOpen === story.id ? null : story.id);
                            }}
                            className="p-2 transition-all duration-200"
                          >
                            <Download className="w-5 h-5" style={{ color: '#ca8a04', transition: 'color 0.2s' }}
                              onMouseEnter={(e) => e.currentTarget.style.color = '#facc15'}
                              onMouseLeave={(e) => e.currentTarget.style.color = '#ca8a04'}
                            />
                          </button>

                          {/* Download dropdown */}
                          <AnimatePresence>
                            {downloadMenuOpen === story.id && (
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
                                <div className="bg-emerald-950/98 border border-emerald-600/30 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden" style={{ width: '200px' }}>
                                  <motion.button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadStory(story, 'txt');
                                      setDownloadMenuOpen(null);
                                    }}
                                    className="block w-full text-left px-6 py-4 text-base text-emerald-100"
                                    whileHover={{
                                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                      color: '#ecfdf5',
                                      paddingLeft: '28px'
                                    }}
                                    transition={{ duration: 0.15 }}
                                  >
                                    {t.downloadAs} <span className="inline-block" style={{ width: '45px' }}>TXT</span>
                                  </motion.button>
                                  <div className="h-px bg-emerald-600/50 mx-3"></div>
                                  <motion.button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadStory(story, 'docx');
                                      setDownloadMenuOpen(null);
                                    }}
                                    className="block w-full text-left px-6 py-4 text-base text-emerald-100"
                                    whileHover={{
                                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                      color: '#ecfdf5',
                                      paddingLeft: '28px'
                                    }}
                                    transition={{ duration: 0.15 }}
                                  >
                                    {t.downloadAs} <span className="inline-block" style={{ width: '45px' }}>DOCX</span>
                                  </motion.button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('🟠 DELETE ICON CLICKED - Toggling dropdown for story:', story.id);
                              setDeleteConfirmId(deleteConfirmId === story.id ? null : story.id);
                            }}
                            className="p-2 transition-all duration-200"
                          >
                            <Trash2 className="w-5 h-5" style={{ color: '#dc2626', transition: 'color 0.2s' }}
                              onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                              onMouseLeave={(e) => e.currentTarget.style.color = '#dc2626'}
                            />
                          </button>

                          {/* Dropdown confirmation */}
                          {deleteConfirmId === story.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: -10 }}
                              className="absolute right-0 top-full mt-2 bg-gradient-to-br from-emerald-950/95 to-emerald-900/95 border-2 border-red-500/30 rounded-lg p-3 shadow-2xl z-50 min-w-[200px]"
                              style={{ boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-sm text-emerald-200/90 mb-3 whitespace-nowrap">
                                {t.deleteStoryConfirmation}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('🟢 CANCEL CLICKED');
                                    setDeleteConfirmId(null);
                                  }}
                                  className="flex-1 px-3 py-1.5 text-xs rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors"
                                >
                                  {t.cancel}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('🟢 CONFIRM DELETE CLICKED for story:', story.id);
                                    handleDelete(story.id);
                                  }}
                                  className="flex-1 px-3 py-1.5 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-colors"
                                >
                                  {t.delete}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </div>

                        <motion.div
                          animate={{ rotate: expandedStoryId === story.id ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="w-5 h-5 text-emerald-400" />
                        </motion.div>
                      </div>
                    </div>
                  </div>

                  {/* Content - Collapsible */}
                  <AnimatePresence>
                    {expandedStoryId === story.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="px-12 pb-8 pt-6 border-t border-emerald-600/20">
                          <div className="prose prose-invert prose-emerald max-w-none px-6">
                            {story.content.split('\n\n').map((paragraph, index) => (
                              <p key={index} className="text-emerald-50/90 leading-relaxed mb-4 text-base">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
