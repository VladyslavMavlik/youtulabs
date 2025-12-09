import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Header } from './components/Header';
import { GenerationForm, type FormData, type GenerationFormRef } from './components/GenerationForm';
import { StoryDisplay } from './components/StoryDisplay';
import { MouseFollowBackground } from './components/MouseFollowBackground';
import { ResetPassword } from './components/ResetPassword';
import { SubscriptionPage } from './components/SubscriptionPage';
import { ProfilePage } from './components/ProfilePage';
import { CreditsPage } from './components/CreditsPage';
import { AdminPanel } from './components/AdminPanel';
import { HistoryPage } from './components/HistoryPage';
import { Footer } from './components/Footer';
import { Contact } from './components/Contact';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';
import { RefundPolicy } from './components/RefundPolicy';
import { Alert, AlertDescription } from './components/ui/alert';
import { Toaster } from './components/ui/sonner';
import { AlertCircle } from 'lucide-react';
import type { Language } from './lib/translations';
import { translations } from './lib/translations';
import { calculateCrystalCost } from './lib/pricing';
import { supabase, getUserBalance, deductBalance, saveStory, getUserSubscription, getUserStories } from './lib/supabase';
import { loadCachedHistory, saveCachedHistory, clearUserCache } from './lib/historyCache';
import { uploadAudioToR2, getUserAudioList, type AudioGeneration } from './lib/audioApi';
import type { User } from '@supabase/supabase-js';
import logo from 'figma:asset/648105bdcc86c53f529dfc47027a22dee56288ab.png';

type AppState = 'idle' | 'loading' | 'success' | 'error';
type Page = 'home' | 'subscription' | 'profile' | 'credits' | 'admin' | 'history' | 'contact' | 'privacy' | 'terms' | 'refund';

// Generation history item type (exported for reuse in MobileApp/DesktopApp)
export interface GenerationItem {
  id: string;
  type: 'text' | 'audio';
  content: string | null; // story text or audio URL
  timestamp: number;
  metadata?: {
    duration?: number;
    genre?: string;
    language?: string;
    characterCount?: number;
    prompt?: string; // User's original prompt
    pov?: string;
    audioMode?: string;
    audioNumber?: number; // R2 audio number (audio_001, audio_002, etc.)
    fileSizeBytes?: number; // R2 file size
  };
}

/**
 * DesktopApp - Desktop-optimized version with horizontal split layout.
 * Form on left, story display on right. Strictly separated from mobile version.
 */
export default function DesktopApp() {
  const [state, setState] = useState<AppState>('idle');
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('appLanguage');
    return (saved as Language) || 'en';
  });
  const [story, setStory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'register'>('register');
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [userPlan, setUserPlan] = useState<string | undefined>(undefined);
  const [balance, setBalance] = useState<number>(0);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
  const [requiredGems, setRequiredGems] = useState(0);
  const [currentGems, setCurrentGems] = useState(0);

  // Voice synthesis state (legacy - for backward compatibility)
  const [voiceTaskId, setVoiceTaskId] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [outputMode, setOutputMode] = useState<'text' | 'audio'>('text');

  // Separate generation states for text and audio
  const [isTextGenerating, setIsTextGenerating] = useState(false);
  const [isAudioGenerating, setIsAudioGenerating] = useState(false);

  // Generation history state
  const [generationHistory, setGenerationHistory] = useState<GenerationItem[]>([]);

  // Current form mode (text or audio)
  const [currentFormMode, setCurrentFormMode] = useState<'text' | 'audio'>('text');

  // Ref to GenerationForm for imperative control
  const generationFormRef = useRef<GenerationFormRef>(null);

  // Active text jobs with their metadata (supports multiple concurrent generations)
  const activeTextJobs = useRef<Map<string, {
    duration?: number;
    genre?: string;
    language?: string;
  }>>(new Map());

  // Trigger for useEffect when jobs change (since ref.current.size doesn't trigger re-render)
  const [activeJobsCount, setActiveJobsCount] = useState(0);

  // Array of all active jobs metadata for displaying multiple generating cards
  const [activeJobsMetadata, setActiveJobsMetadata] = useState<Array<{
    duration?: number;
    genre?: string;
    language?: string;
  }>>([]);

  // Current displaying metadata (for generating card display)
  const currentTextMetadata = useRef<{
    duration?: number;
    genre?: string;
    language?: string;
  } | null>(null);

  // Track previous user ID for cache cleanup on logout
  const previousUserId = useRef<string | null>(null);

  const currentAudioMetadata = useRef<{
    characterCount?: number;
  } | null>(null);

  // Track active polling to prevent duplicate polling loops
  const activePollingTask = useRef<number | null>(null);

  // Active audio jobs with their metadata (supports multiple concurrent generations)
  const activeAudioJobs = useRef<Map<number, {
    characterCount?: number;
    status?: string;
  }>>(new Map());

  // Trigger for useEffect when audio jobs change
  const [activeAudioJobsCount, setActiveAudioJobsCount] = useState(0);

  // Array of all active audio jobs metadata for displaying multiple generating cards
  const [activeAudioJobsMetadata, setActiveAudioJobsMetadata] = useState<Array<{
    characterCount?: number;
  }>>([]);

  // Track active polling tasks (Set of task IDs being polled)
  const activePollingTasks = useRef<Set<number>>(new Set());

  // Guard to prevent duplicate submissions (by text hash)
  const lastSubmittedText = useRef<string>('');
  const lastSubmitTime = useRef<number>(0);

  // Helper function to update active jobs count and metadata array
  const updateActiveJobsState = () => {
    const count = activeTextJobs.current.size;
    setActiveJobsCount(count);

    // Convert Map values to array for metadata
    const metadataArray = Array.from(activeTextJobs.current.values());
    console.log(`📊 updateActiveJobsState: count=${count}, metadataArray=`, metadataArray);
    setActiveJobsMetadata(metadataArray);
  };

  // Helper function to update active audio jobs count and metadata array
  const updateActiveAudioJobsState = () => {
    const count = activeAudioJobs.current.size;
    setActiveAudioJobsCount(count);

    // Convert Map values to array for metadata
    const metadataArray = Array.from(activeAudioJobs.current.values());
    const taskIds = Array.from(activeAudioJobs.current.keys());
    console.log(`🎵 updateActiveAudioJobsState CALLED: count=${count}, taskIds=${JSON.stringify(taskIds)}, metadataArray=`, metadataArray);
    console.trace('🔍 Call stack trace');
    setActiveAudioJobsMetadata(metadataArray);
    setIsAudioGenerating(count > 0);
  };

  // Helper function to add generation to history
  const addToHistory = (item: Omit<GenerationItem, 'id' | 'timestamp'>) => {
    const newItem: GenerationItem = {
      ...item,
      id: `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    setGenerationHistory(prev => [newItem, ...prev]); // Add to beginning (newest first)
  };

  // Handler for converting story text to audio generation
  const handleConvertToAudio = (text: string) => {
    generationFormRef.current?.setAudioTextAndSwitchMode(text);
  };

  // Check if we're on the reset password page
  const isResetPasswordPage = window.location.pathname === '/reset-password' || window.location.hash.includes('type=recovery');

  // Save language to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('appLanguage', language);
  }, [language]);

  // Listen for auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Load balance and subscription plan
        loadBalance();
        loadUserPlan();
        loadHistoryFromDB();
        loadAudioHistory();
      }
    });

    // Listen for changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔐 Auth state changed:', _event, 'User:', session?.user?.id);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('✅ User logged in, loading data...');
        previousUserId.current = session.user.id; // Track user ID for cache cleanup
        loadBalance();
        loadUserPlan();
        loadHistoryFromDB(session.user.id); // Pass user ID directly to avoid race condition
        loadAudioHistory(); // Load audio generations from R2
      } else {
        console.log('❌ User logged out, clearing history...');
        // Clear cache for the logged out user
        if (previousUserId.current) {
          clearUserCache(previousUserId.current);
          previousUserId.current = null;
        }
        setUserPlan(undefined);
        setBalance(0);
        // Clear all history on logout
        setGenerationHistory([]);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const loadBalance = async () => {
    const userBalance = await getUserBalance();
    setBalance(userBalance || 0);
  };

  const loadUserPlan = async () => {
    const subscription = await getUserSubscription();
    setUserPlan(subscription?.plan_id);
  };

  const loadAudioHistory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.log('⚠️ loadAudioHistory: No session, skipping...');
      return;
    }

    try {
      console.log('🎵 Loading audio history from R2...');
      const audioList = await getUserAudioList(session.access_token, 100);
      console.log(`✅ Loaded ${audioList.length} audio files from R2`);

      // Convert audio list to GenerationItem format
      const audioHistory: GenerationItem[] = audioList.map((audio) => ({
        id: `audio-${audio.id}`,
        type: 'audio' as const,
        content: audio.signed_url,
        timestamp: new Date(audio.created_at).getTime(),
        metadata: {
          characterCount: audio.metadata?.characterCount,
          audioNumber: audio.audio_number,
          fileSizeBytes: audio.file_size_bytes,
        },
      }));

      // Merge with existing history (text stories)
      setGenerationHistory(prev => {
        const textItems = prev.filter(item => item.type === 'text');
        const merged = [...audioHistory, ...textItems];
        const sorted = merged.sort((a, b) => b.timestamp - a.timestamp);
        console.log('🔄 Updated history with audio:', sorted.length, 'items (', audioHistory.length, 'audio +', textItems.length, 'text)');
        return sorted;
      });
    } catch (error: any) {
      console.error('❌ Failed to load audio history:', error);
    }
  };

  // Load active audio tasks from database
  const loadActiveAudioTasks = async () => {
    if (!user) return;

    try {
      console.log('🔍 Loading active audio tasks from database...');
      const { data: activeTasks, error } = await supabase
        .from('audio_tasks')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['waiting', 'processing'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to load active tasks:', error);
        return;
      }

      if (activeTasks && activeTasks.length > 0) {
        console.log(`🔄 Restoring ${activeTasks.length} active audio generation(s):`, activeTasks.map(t => t.task_id));

        // Add all active tasks to Map and start polling
        for (const task of activeTasks) {
          // Add to active jobs Map
          activeAudioJobs.current.set(task.task_id, {
            characterCount: task.character_count,
            status: task.status,
          });

          // Set first task as current for backward compatibility
          if (activeTasks[0].task_id === task.task_id) {
            setVoiceTaskId(task.task_id);
            setVoiceStatus(task.status);
            currentAudioMetadata.current = {
              characterCount: task.character_count,
            };
          }

          // Resume polling for each task
          await pollVoiceStatus(task.task_id);
        }

        setState('loading');
        updateActiveAudioJobsState();
      } else {
        console.log('✅ No active tasks to restore');
      }
    } catch (error) {
      console.error('❌ Error loading active tasks:', error);
    }
  };

  // Subscribe to audio_tasks Realtime updates
  useEffect(() => {
    if (!user) return;

    console.log('🔴 Setting up Realtime subscription for audio_tasks...');

    // Load active tasks on mount
    loadActiveAudioTasks();

    // Subscribe to changes
    const channel = supabase
      .channel('audio_tasks_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audio_tasks',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('🔴 Realtime update received:', payload);

          if (payload.eventType === 'INSERT') {
            const newTask = payload.new as any;
            console.log('➕ Realtime INSERT event: task_id=', newTask.task_id, 'character_count=', newTask.character_count);
            console.log('📦 Map before INSERT:', Array.from(activeAudioJobs.current.keys()));

            // Add to active jobs Map
            activeAudioJobs.current.set(newTask.task_id, {
              characterCount: newTask.character_count,
              status: newTask.status,
            });
            console.log('📦 Map after INSERT:', Array.from(activeAudioJobs.current.keys()));
            updateActiveAudioJobsState();

            // Update legacy state for backward compatibility
            if (!voiceTaskId) {
              setVoiceTaskId(newTask.task_id);
              setVoiceStatus(newTask.status);
              setState('loading');
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = payload.new as any;
            console.log('🔄 Task updated:', updatedTask.task_id, 'status:', updatedTask.status);

            // If task completed or failed, remove from Map (polling already handling download)
            if (updatedTask.status === 'ending' || updatedTask.status === 'ending_processed') {
              console.log('✅ Task completed via Realtime, removing from Map:', updatedTask.task_id);
              activeAudioJobs.current.delete(updatedTask.task_id);
              updateActiveAudioJobsState();
              return;
            }

            // If task failed, remove from Map
            if (updatedTask.status === 'error' || updatedTask.status === 'error_handled') {
              console.log('❌ Task failed via Realtime:', updatedTask.status);
              activeAudioJobs.current.delete(updatedTask.task_id);
              updateActiveAudioJobsState();
              setState('error');
              setError(updatedTask.error || 'Audio generation failed');
              return;
            }

            // Update status in Map for in-progress tasks
            const jobMetadata = activeAudioJobs.current.get(updatedTask.task_id);
            if (jobMetadata) {
              jobMetadata.status = updatedTask.status;
              activeAudioJobs.current.set(updatedTask.task_id, jobMetadata);
              updateActiveAudioJobsState();
            }

            // Update legacy state if this is current task
            if (voiceTaskId === updatedTask.task_id) {
              setVoiceStatus(updatedTask.status);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('🔴 Realtime subscription status:', status);
      });

    return () => {
      console.log('🔴 Cleaning up Realtime subscription...');
      supabase.removeChannel(channel);
    };
  }, [user]); // Only re-run when user changes, not when voiceTaskId updates

  const loadHistoryFromDB = async (userId?: string) => {
    // Use passed userId or fall back to current user
    const targetUserId = userId || user?.id;

    if (!targetUserId) {
      console.log('⚠️ loadHistoryFromDB: No user ID available, skipping...');
      return;
    }

    console.log('📚 loadHistoryFromDB: Starting for user', targetUserId);

    // 1. Load from cache first (instant display)
    const cachedItems = loadCachedHistory(targetUserId);
    console.log('📦 Cache check:', cachedItems ? `${cachedItems.length} items` : 'null');

    if (cachedItems && cachedItems.length > 0) {
      setGenerationHistory(prev => {
        const audioItems = prev.filter(item => item.type === 'audio');
        const merged = [...cachedItems, ...audioItems];
        const sorted = merged.sort((a, b) => b.timestamp - a.timestamp);
        console.log('⚡ Instantly loaded', cachedItems.length, 'items from cache');
        return sorted;
      });
    }

    // 2. Fetch fresh data from Supabase in background
    console.log('📚 Fetching fresh data from database...');
    const { data: stories, error } = await getUserStories();

    if (error) {
      console.error('❌ Failed to load stories:', error);
      return;
    }

    console.log('📦 Stories from DB:', stories);

    if (stories && stories.length > 0) {
      console.log(`✅ Loaded ${stories.length} stories from database`);

      // Convert stories from DB to GenerationItem format
      const dbItems: GenerationItem[] = stories.map((story: any) => ({
        id: story.id,
        type: 'text' as const,
        content: story.content,
        timestamp: new Date(story.created_at).getTime(),
        metadata: {
          duration: story.duration,
          genre: story.genre,
          language: story.language,
          ...story.metadata,
        },
      }));

      // 3. Save fresh data to cache
      saveCachedHistory(targetUserId, dbItems);

      // 4. Update UI with fresh data
      setGenerationHistory(prev => {
        const audioItems = prev.filter(item => item.type === 'audio');
        const merged = [...dbItems, ...audioItems];
        // Sort by timestamp, newest first
        const sorted = merged.sort((a, b) => b.timestamp - a.timestamp);
        console.log('🔄 Updated generationHistory:', sorted.length, 'items (', dbItems.length, 'text +', audioItems.length, 'audio)');
        console.log('📝 First 3 items:', sorted.slice(0, 3).map(item => ({ id: item.id, type: item.type, contentLength: item.content?.length })));
        return sorted;
      });
    } else {
      console.log('ℹ️ No stories in database');
    }
  };

  // Check for active generations on page reload
  useEffect(() => {
    if (!user) return;

    const checkActiveGenerations = async () => {
      console.log('🔍 Checking for active generations...');
      try {
        // Only check for jobs created in the last 10 minutes (old jobs are likely stale)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: jobs, error } = await supabase
          .from('story_jobs')
          .select('job_id, status, story_id, created_at, payload')
          .eq('user_id', user.id)
          .in('status', ['pending', 'processing'])
          .gte('created_at', tenMinutesAgo)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ Failed to check active jobs:', error);
          return;
        }

        console.log('📊 Active jobs found:', jobs?.length || 0);

        if (jobs && jobs.length > 0) {
          // Add all active jobs to the Map
          jobs.forEach(job => {
            console.log('⚡ Found active job:', job.job_id);
            activeTextJobs.current.set(job.job_id, {
              duration: job.payload?.duration,
              genre: job.payload?.genre,
              language: job.payload?.language,
            });
          });

          // Set the most recent job's metadata for display
          const mostRecentJob = jobs[0];
          currentTextMetadata.current = {
            duration: mostRecentJob.payload?.duration,
            genre: mostRecentJob.payload?.genre,
            language: mostRecentJob.payload?.language,
          };

          setIsTextGenerating(true);
          setState('loading');
          updateActiveJobsState();
          console.log(`⚡ Restored ${jobs.length} active jobs, isTextGenerating=true, activeJobsMetadata will be:`, Array.from(activeTextJobs.current.values()));
        } else {
          console.log('✅ No active jobs - isTextGenerating should be false');
          updateActiveJobsState();
        }
      } catch (err) {
        console.error('❌ Error checking active generations:', err);
      }
    };

    checkActiveGenerations();
  }, [user]);

  // Supabase Realtime subscription for job updates with polling fallback (supports multiple jobs)
  useEffect(() => {
    if (!user || activeJobsCount === 0) return;

    console.log(`🔔 Subscribing to Realtime updates for ${activeTextJobs.current.size} active job(s)`);
    let realtimeActive = false;
    const pollingIntervals = new Map<string, NodeJS.Timeout>();
    const pollingAttempts = new Map<string, number>();
    const MAX_POLLING_ATTEMPTS = 180; // 180 * 5s = 15 minutes max

    // Shared handler for job completion/failure (works for both Realtime and polling)
    const handleJobUpdate = async (jobId: string, status: string, storyId?: string, error?: string) => {
      // CRITICAL: Check if job is still active (prevent duplicate processing from Realtime + polling)
      if (!activeTextJobs.current.has(jobId)) {
        console.log(`⚠️ Job ${jobId} already processed, skipping duplicate handleJobUpdate call`);
        return;
      }

      // Remove job from active jobs immediately to prevent race conditions
      const jobMetadata = activeTextJobs.current.get(jobId);
      activeTextJobs.current.delete(jobId);
      updateActiveJobsState();

      if (status === 'completed' && storyId) {
        console.log(`✅ Job ${jobId} completed! Fetching story with ID: ${storyId}`);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Session expired');
          setState('error');
          if (activeTextJobs.current.size === 0) setIsTextGenerating(false);
          return;
        }

        try {
          const API_URL = import.meta.env.VITE_API_URL ?? '';
          const storyResponse = await fetch(`${API_URL}/api/story/${storyId}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          if (!storyResponse.ok) {
            throw new Error('Failed to fetch story content');
          }

          const storyData = await storyResponse.json();
          console.log(`📖 Story fetched successfully (${storyData.content?.length || 0} characters)`);

          const storyContent = storyData.content || 'Story generated successfully!';

          setStory(storyContent);
          setState('success');
          await loadBalance();

          // Reload history from database (worker already saved the story)
          // This prevents duplicate entries - worker saves once, we just reload
          await loadHistoryFromDB();

          // If no more active jobs, stop generating state
          if (activeTextJobs.current.size === 0) {
            setIsTextGenerating(false);
          }
        } catch (err) {
          console.error('Error fetching story:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch story');
          setState('error');
          if (activeTextJobs.current.size === 0) setIsTextGenerating(false);
        }
      } else if (status === 'failed') {
        const errorMessage = error || 'Story generation failed';
        console.error(`❌ Job ${jobId} failed:`, errorMessage);
        setError(errorMessage);
        setState('error');
        await loadBalance();

        if (activeTextJobs.current.size === 0) {
          setIsTextGenerating(false);
          setTimeout(() => setState('idle'), 3000);
        }
      }
    };

    // Start polling for a specific job (fallback)
    const startPollingForJob = (jobId: string) => {
      console.log(`🔄 Starting polling fallback for job ${jobId} (every 5 seconds)`);
      pollingAttempts.set(jobId, 0);

      const interval = setInterval(async () => {
        const attempts = (pollingAttempts.get(jobId) || 0) + 1;
        pollingAttempts.set(jobId, attempts);

        if (attempts > MAX_POLLING_ATTEMPTS) {
          console.error(`⏱️ Polling timeout for job ${jobId} (15 minutes exceeded)`);
          setError('Story generation is taking too long. Please check back later.');
          setState('error');
          activeTextJobs.current.delete(jobId);
          updateActiveJobsState();
          if (activeTextJobs.current.size === 0) setIsTextGenerating(false);
          const interval = pollingIntervals.get(jobId);
          if (interval) clearInterval(interval);
          pollingIntervals.delete(jobId);
          return;
        }

        try {
          const { data: job, error } = await supabase
            .from('story_jobs')
            .select('status, story_id, error')
            .eq('job_id', jobId)
            .single();

          if (error) {
            console.error(`Polling error for job ${jobId}:`, error);
            return;
          }

          if (job && (job.status === 'completed' || job.status === 'failed')) {
            console.log(`📊 Polling detected job update for ${jobId}:`, job.status);
            const interval = pollingIntervals.get(jobId);
            if (interval) clearInterval(interval);
            pollingIntervals.delete(jobId);
            await handleJobUpdate(jobId, job.status, job.story_id, job.error);
          }
        } catch (err) {
          console.error(`Polling exception for job ${jobId}:`, err);
        }
      }, 5000);

      pollingIntervals.set(jobId, interval);
    };

    // Subscribe to all story_jobs changes for this user
    const channel = supabase
      .channel(`user-jobs:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'story_jobs',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          const jobId = payload.new.job_id;

          // Only handle jobs that are in our active list
          if (activeTextJobs.current.has(jobId)) {
            console.log(`📡 Realtime update received for job ${jobId}:`, payload.new.status);
            realtimeActive = true;

            // Stop polling for this job if Realtime works
            const interval = pollingIntervals.get(jobId);
            if (interval) {
              console.log(`✅ Realtime working for job ${jobId}, stopping polling fallback`);
              clearInterval(interval);
              pollingIntervals.delete(jobId);
            }

            await handleJobUpdate(jobId, payload.new.status, payload.new.story_id, payload.new.error);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription active for all user jobs');

          // Wait 2 seconds, if no update received, start polling for all jobs
          setTimeout(() => {
            if (!realtimeActive) {
              console.warn('⚠️ No Realtime updates received in 2s, starting polling fallback for all jobs');
              activeTextJobs.current.forEach((_, jobId) => {
                startPollingForJob(jobId);
              });
            }
          }, 2000);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime subscription error, starting polling fallback for all jobs');
          activeTextJobs.current.forEach((_, jobId) => {
            startPollingForJob(jobId);
          });
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Realtime connection closed, starting polling fallback for all jobs');
          if (!realtimeActive) {
            activeTextJobs.current.forEach((_, jobId) => {
              startPollingForJob(jobId);
            });
          }
        }
      });

    return () => {
      console.log('🔕 Unsubscribing from job updates');
      pollingIntervals.forEach(interval => clearInterval(interval));
      pollingIntervals.clear();
      supabase.removeChannel(channel);
    };
  }, [user, activeJobsCount]);

  // Supabase Realtime subscription for balance updates
  useEffect(() => {
    if (!user) return;

    console.log('💎 Subscribing to Realtime balance updates for user:', user.id);

    const channel = supabase
      .channel(`credits:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',  // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('💰 Credits changed via Realtime, reloading balance...', payload.eventType);
          // Reload balance from server using RPC function
          await loadBalance();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Balance Realtime subscription active (watching user_credits)');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Balance Realtime subscription error');
        }
      });

    return () => {
      console.log('🔕 Unsubscribing from balance updates');
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Supabase Realtime subscription for subscription plan updates
  useEffect(() => {
    if (!user) return;

    console.log('📋 Subscribing to Realtime subscription updates for user:', user.id);

    const channel = supabase
      .channel(`subscription:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',  // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('📊 Subscription changed via Realtime, reloading plan...', payload.eventType);
          // Reload subscription plan from server
          await loadUserPlan();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscription Realtime subscription active (watching user_subscriptions)');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Subscription Realtime subscription error');
        }
      });

    return () => {
      console.log('🔕 Unsubscribing from subscription updates');
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Listen for navigation events from UserMenu and Footer
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{ page: string }>;
      const pageMap: { [key: string]: Page } = {
        'subscription': 'subscription',
        'profile': 'profile',
        'credits': 'credits',
        'admin': 'admin',
        'history': 'history',
        'contact': 'contact',
        'privacy': 'privacy',
        'terms': 'terms',
        'refund': 'refund',
      };
      const page = pageMap[customEvent.detail.page];
      if (page) {
        setCurrentPage(page);
      }
    };

    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  // Voice synthesis handler
  const handleVoiceSynthesis = async (data: FormData) => {
    const currentText = data.audioText || '';
    const now = Date.now();

    // Prevent duplicate submissions within 2 seconds with same text
    if (
      lastSubmittedText.current === currentText &&
      now - lastSubmitTime.current < 2000
    ) {
      console.log('⚠️ Duplicate submission prevented (same text within 2s)');
      return;
    }

    lastSubmittedText.current = currentText;
    lastSubmitTime.current = now;

    console.log('🎙️ Starting voice synthesis...');
    setState('loading');
    setVoiceStatus('creating');
    setAudioUrl(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';

      // Store metadata for history
      currentAudioMetadata.current = {
        characterCount: data.audioText?.length || 0,
      };

      // Get JWT token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No valid session found. Please log in.');
      }

      // Build request body
      const requestBody: any = {
        text: data.audioText,
        voice_id: data.voiceId || null,
        voice_name: data.voiceName || null,
        chunk_size: data.voiceChunkSize || null,
      };

      // Add pause settings if enabled
      if (data.voicePausesEnabled) {
        requestBody.pause_settings = {
          enabled: true,
          max_pause_symb: data.voiceMaxPauseSymbols || 2000,
          pause_time: data.voicePauseTime || 1.0,
          auto_paragraph_pause: data.voiceAutoParagraphPause || false,
        };
      }

      // Add stress settings if enabled
      if (data.voiceStressEnabled) {
        requestBody.stress_settings = {
          enabled: true,
        };
      }

      console.log('🚀 Voice API request:', requestBody);

      // Create synthesis task
      const response = await fetch(`${API_URL}/api/voice/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to create synthesis task';

        try {
          const error = JSON.parse(errorText);
          errorMessage = error.detail || error.error || errorMessage;
        } catch {
          // If not JSON, use the text directly
          errorMessage = errorText || errorMessage;
        }

        // Special handling for rate limit errors
        if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      const taskId = result.task_id;
      setVoiceTaskId(taskId);

      console.log(`✅ Task created: ${taskId}`);
      setVoiceStatus('processing');

      // Task is saved to audio_tasks table by backend
      // Realtime subscription will handle adding to Map and UI updates
      // (DO NOT add manually here to avoid duplicate animations!)

      // Start polling for status (non-blocking for new submissions)
      await pollVoiceStatus(taskId);
    } catch (error: any) {
      console.error('❌ Voice synthesis error:', error);
      setError(error.message || 'Failed to synthesize audio');
      setState('error');
      // Note: isAudioGenerating will be auto-updated by updateActiveAudioJobsState()
      // when Map is empty, so no need to manually set to false
    }
  };

  // Poll voice task status
  const pollVoiceStatus = async (taskId: number) => {
    // Prevent duplicate polling for the same task
    if (activePollingTasks.current.has(taskId)) {
      console.log(`⚠️ Already polling for task ${taskId}, skipping duplicate`);
      return;
    }

    console.log(`🔄 Starting polling for task ${taskId}`);
    activePollingTasks.current.add(taskId);

    const API_URL = import.meta.env.VITE_API_URL ?? '';
    const MAX_ATTEMPTS = 120; // 120 * 3s = 6 minutes max
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts++;

      try {
        const response = await fetch(`${API_URL}/api/voice/status/${taskId}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Status check failed [${response.status}]:`, errorText);
          throw new Error(`Failed to check status: ${response.status}`);
        }

        const responseText = await response.text();
        let status;

        try {
          status = JSON.parse(responseText);
        } catch (parseError) {
          console.error('❌ Failed to parse status response:', responseText);
          throw new Error('Invalid response from server');
        }

        console.log(`📊 Status [${attempts}/${MAX_ATTEMPTS}]:`, status.status, '-', status.status_label);
        setVoiceStatus(status.status);

        // Update status in Map
        const jobMetadata = activeAudioJobs.current.get(taskId);
        if (jobMetadata) {
          jobMetadata.status = status.status;
          activeAudioJobs.current.set(taskId, jobMetadata);
          updateActiveAudioJobsState();
        }

        // Check if completed
        if (status.status === 'ending_processed' || status.status === 'ending') {
          // Task completed, fetch result
          console.log(`✅ Synthesis completed for task ${taskId}! Fetching result...`);
          await fetchVoiceResult(taskId);
          activePollingTasks.current.delete(taskId); // Clear polling lock
          console.log(`✅ fetchVoiceResult completed for task ${taskId}, polling lock cleared`);
          return;
        }

        // Check if error
        if (status.status === 'error' || status.status === 'error_handled') {
          throw new Error('Synthesis failed on server');
        }

        // Continue polling if still processing
        if (status.status === 'waiting' || status.status === 'processing') {
          if (attempts >= MAX_ATTEMPTS) {
            throw new Error('Synthesis timeout (6 minutes exceeded)');
          }

          // Poll again in 3 seconds
          setTimeout(() => poll(), 3000);
        } else {
          // Unknown status - log warning and remove task to prevent stuck animations
          console.warn(`⚠️ Unknown status "${status.status}" for task ${taskId}, removing from active jobs`);
          activeAudioJobs.current.delete(taskId);
          updateActiveAudioJobsState();
          activePollingTasks.current.delete(taskId);
        }
      } catch (error: any) {
        console.error(`❌ Polling error for task ${taskId}:`, error);
        setError(error.message || 'Failed to check synthesis status');
        setState('error');

        // Remove from active jobs Map
        activeAudioJobs.current.delete(taskId);
        updateActiveAudioJobsState();

        // Clear polling lock on error
        activePollingTasks.current.delete(taskId);
      }
    };

    // Start polling
    poll();
  };

  // Fetch voice synthesis result
  const fetchVoiceResult = async (taskId: number) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';

      console.log('📥 Downloading audio...');
      const response = await fetch(`${API_URL}/api/voice/result/${taskId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch audio');
      }

      // Create blob URL for audio player (temporary)
      const blob = await response.blob();
      const tempUrl = URL.createObjectURL(blob);

      console.log('✅ Audio ready!');
      setAudioUrl(tempUrl);

      // Dispatch event to refresh Voice API balance
      window.dispatchEvent(new CustomEvent('audioGenerationComplete'));

      // Get JWT token for R2 upload
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('⚠️ No session found, skipping R2 upload');
        // Add to history with temporary URL
        addToHistory({
          type: 'audio',
          content: tempUrl,
          metadata: currentAudioMetadata.current || undefined,
        });
        setState('completed');

        // Remove from active jobs Map
        activeAudioJobs.current.delete(taskId);
        updateActiveAudioJobsState();
        return;
      }

      // Upload to R2 storage
      console.log('☁️ Uploading to R2 storage...');
      try {
        const uploadResult = await uploadAudioToR2(blob, {
          ...currentAudioMetadata.current,
          title: `Audio Generation ${new Date().toISOString()}`,
        }, session.access_token);

        console.log(`✅ Uploaded to R2 as audio_${String(uploadResult.audio.audio_number).padStart(3, '0')}.mp3`);

        // Replace temporary URL with permanent signed URL
        setAudioUrl(uploadResult.audio.signed_url);

        // Add to history with permanent URL and metadata
        addToHistory({
          type: 'audio',
          content: uploadResult.audio.signed_url,
          metadata: {
            ...currentAudioMetadata.current,
            audioNumber: uploadResult.audio.audio_number,
            fileSizeBytes: uploadResult.audio.file_size_bytes,
          },
        });

        // Clean up temporary blob URL
        URL.revokeObjectURL(tempUrl);

        // Complete generation AFTER everything is done
        setState('completed');

        // Remove from active jobs Map
        activeAudioJobs.current.delete(taskId);
        updateActiveAudioJobsState();
      } catch (uploadError: any) {
        console.error('❌ R2 upload failed:', uploadError);
        // Fall back to temporary URL if upload fails
        addToHistory({
          type: 'audio',
          content: tempUrl,
          metadata: currentAudioMetadata.current || undefined,
        });
        setState('completed');

        // Remove from active jobs Map
        activeAudioJobs.current.delete(taskId);
        updateActiveAudioJobsState();
      }
    } catch (error: any) {
      console.error(`❌ Result fetch error for task ${taskId}:`, error);
      setError(error.message || 'Failed to download audio');
      setState('error');

      // Remove from active jobs Map
      activeAudioJobs.current.delete(taskId);
      updateActiveAudioJobsState();
    }
  };

  const handleFormSubmit = async (data: FormData) => {
    setError(null);

    try {
      // Check if user is logged in
      if (!user) {
        throw new Error('You must be logged in to generate stories');
      }

      // Determine if this is Audio or Text mode
      const isAudioMode = !!data.audioText;
      setOutputMode(isAudioMode ? 'audio' : 'text');

      if (isAudioMode) {
        // Voice synthesis flow
        await handleVoiceSynthesis(data);
        return;
      }

      // Text generation flow (existing code)

      // Check concurrent generation limit (MAX 5 active generations)
      const MAX_CONCURRENT_GENERATIONS = 5;
      const activeGenerationsCount = activeTextJobs.current.size;

      if (activeGenerationsCount >= MAX_CONCURRENT_GENERATIONS) {
        setError(t.tooManyConcurrentGenerations);
        setState('error');
        setTimeout(() => {
          setState('idle');
        }, 5000);
        return;
      }

      // Calculate cost and do quick client-side check (UX only, not for security)
      const cost = calculateCrystalCost(data.duration);
      const currentBalance = await getUserBalance();

      // Quick check to avoid showing loading animation if obviously insufficient
      if (!currentBalance || currentBalance < cost) {
        setRequiredGems(cost);
        setCurrentGems(currentBalance || 0);
        setShowInsufficientBalanceModal(true);
        return;
      }

      // Only set loading state after quick balance check passes
      setState('loading');
      setIsTextGenerating(true);
      // Clear story to show generation animation
      setStory(null);

      // Store metadata for history
      currentTextMetadata.current = {
        duration: data.duration,
        genre: data.genre,
        language: data.storyLanguage,
      };

      // Map form data to our backend API format
      const requestPayload = {
        language: data.storyLanguage,
        genre: data.genre, // Genres now use underscores (noir_drama, sci_fi, etc.)
        minutes: data.duration,
        prompt: data.storyPrompt,
        pov: data.pointOfView, // Backend expects 'first' or 'third'
        audioMode: data.audioMode,
        policy: {
          no_explicit_content: data.noExplicitContent,
          violence_level: data.violenceLevel,
        },
        options: {
          time_beacons: data.timeBeacons,
          tight_cadence: data.tightCadence,
        }
      };

      console.log('🚀 SENDING TO BACKEND:', JSON.stringify(requestPayload, null, 2));

      // Get JWT token for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No valid session found');
      }

      const API_URL = import.meta.env.VITE_API_URL ?? '';
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          throw new Error('Failed to communicate with server');
        }

        // Handle concurrent generation limit (429 Too Many Requests)
        if (response.status === 429) {
          // Use server message if available, otherwise fallback to generic message
          throw new Error(errorData.message || 'Too many concurrent generations. Please wait for one to complete.');
        }

        // Handle insufficient balance error from server
        if (response.status === 402) {
          setRequiredGems(errorData.required || cost);
          setCurrentGems(errorData.current || 0);
          setShowInsufficientBalanceModal(true);
          setState('idle');
          return;
        }

        throw new Error(errorData.error || 'Generation failed');
      }

      let queueResponse;
      try {
        queueResponse = await response.json();
      } catch (parseError) {
        throw new Error('Failed to parse server response');
      }
      const { jobId } = queueResponse;

      console.log(`📋 Job queued: ${jobId}, waiting for Realtime updates...`);

      // Update balance immediately (it was deducted on server)
      await loadBalance();

      // Add this job to active jobs Map with its metadata
      activeTextJobs.current.set(jobId, {
        duration: currentTextMetadata.current?.duration,
        genre: currentTextMetadata.current?.genre,
        language: currentTextMetadata.current?.language,
      });
      updateActiveJobsState();

      console.log(`✅ Added job ${jobId} to active jobs (total: ${activeTextJobs.current.size})`);
    } catch (err) {
      console.error('Error generating story:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setState('error');
      setIsTextGenerating(false);
      setTimeout(() => {
        setState('idle');
      }, 3000);
    }
  };

  const t = translations[language];

  // Show reset password page if user came from reset password email
  if (isResetPasswordPage) {
    return <ResetPassword />;
  }

  // Show subscription page
  if (currentPage === 'subscription') {
    return <SubscriptionPage onBack={() => setCurrentPage('home')} user={user} balance={balance} language={language} userPlan={userPlan} />;
  }

  // Show profile page
  if (currentPage === 'profile') {
    return <ProfilePage onBack={() => setCurrentPage('home')} user={user} balance={balance} language={language} onLanguageChange={setLanguage} userPlan={userPlan} />;
  }

  // Show credits page
  if (currentPage === 'credits') {
    return <CreditsPage onBack={() => setCurrentPage('home')} user={user} balance={balance} language={language} userPlan={userPlan} />;
  }

  // Show admin page
  if (currentPage === 'admin') {
    return <AdminPanel onBack={() => setCurrentPage('home')} user={user} language={language} balance={balance} />;
  }

  // Show history page
  if (currentPage === 'history') {
    return <HistoryPage onBack={() => setCurrentPage('home')} user={user} language={language} balance={balance} onConvertToAudio={handleConvertToAudio} />;
  }

  // Show legal pages
  if (currentPage === 'contact') {
    return <Contact />;
  }

  if (currentPage === 'privacy') {
    return <PrivacyPolicy />;
  }

  if (currentPage === 'terms') {
    return <TermsOfService />;
  }

  if (currentPage === 'refund') {
    return <RefundPolicy />;
  }

  // DESKTOP LAYOUT: Horizontal split (form on left, story on right)
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-[#054538] to-black relative flex flex-col">
      {/* Mouse follow background */}
      <MouseFollowBackground />

      <Header
        user={user}
        language={language}
        onLanguageChange={setLanguage}
        balance={balance}
        userPlan={userPlan}
      />

      {/* Spacer for fixed header */}
      <div className="h-20 flex-shrink-0"></div>

      {/* Vertical divider line - fixed position, very tall to reach footer */}
      <div className="fixed pointer-events-none" style={{
        left: '49.4%',
        top: '80px',
        width: '1px',
        height: '200vh',
        background: 'rgba(16, 185, 129, 0.25)',
        transform: 'translateX(-50%)',
        zIndex: 40,
        boxShadow: '0 0 8px rgba(16, 185, 129, 0.15)'
      }}></div>

      <main className="relative z-10 flex-1 min-h-0">
        <div className="h-full flex relative">

          {/* Left side - Generation Form */}
          <div className="w-1/2 h-full overflow-y-auto custom-scrollbar px-6">
            <div className="w-full py-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6"
                >
                  <Alert className="bg-red-500/10 border-red-500/30">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-red-300">
                      {error}
                    </AlertDescription>
                  </Alert>
                </motion.div>
              )}

              <GenerationForm
                ref={generationFormRef}
                language={language}
                onSubmit={handleFormSubmit}
                isAuthenticated={!!user}
                onAuthRequired={() => {
                  setAuthInitialTab('register');
                  setShowAuthModal(true);
                }}
                userPlan={userPlan}
                showInsufficientBalance={showInsufficientBalanceModal}
                requiredGems={requiredGems}
                currentGems={currentGems}
                onDismissInsufficientBalance={() => setShowInsufficientBalanceModal(false)}
                onBuyGems={() => {
                  setShowInsufficientBalanceModal(false);
                  setCurrentPage('credits');
                }}
                onModeChange={setCurrentFormMode}
              />
            </div>
          </div>

          {/* Right side - Story Display */}
          <div className="w-1/2 h-full px-6 py-4 flex">
            <div className="w-full h-full">
              <div style={{ display: currentFormMode === 'text' ? 'block' : 'none' }}>
                <StoryDisplay
                  story={story}
                  isGenerating={isTextGenerating}
                  activeJobsCount={activeJobsCount}
                  activeJobsMetadata={activeJobsMetadata}
                  language={language}
                  audioUrl={null}
                  voiceStatus={null}
                  outputMode="text"
                  generationHistory={generationHistory.filter(item => item.type === 'text')}
                  currentFormMode={currentFormMode}
                  onConvertToAudio={handleConvertToAudio}
                  currentGenre={currentTextMetadata.current?.genre}
                  currentDuration={currentTextMetadata.current?.duration}
                  currentStoryLanguage={currentTextMetadata.current?.language}
                />
              </div>
              <div style={{ display: currentFormMode === 'audio' ? 'block' : 'none' }}>
                <StoryDisplay
                  story={null}
                  isGenerating={isAudioGenerating}
                  activeJobsCount={activeAudioJobsCount}
                  activeJobsMetadata={activeAudioJobsMetadata}
                  language={language}
                  audioUrl={audioUrl}
                  voiceStatus={voiceStatus}
                  outputMode="audio"
                  generationHistory={generationHistory.filter(item => item.type === 'audio')}
                  currentFormMode={currentFormMode}
                  onConvertToAudio={handleConvertToAudio}
                  currentGenre={undefined}
                  currentDuration={undefined}
                  currentStoryLanguage={undefined}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <Toaster theme="dark" />

      <style>{`
        /* Force scrollbar to always be visible */
        html, body {
          overflow-y: scroll !important;
          scrollbar-gutter: stable;
        }

        .custom-scrollbar {
          scrollbar-gutter: stable;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 10px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.3) !important;
          border-radius: 5px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.8) !important;
          border-radius: 5px !important;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 1) !important;
        }

        /* Bright red glow for checked radio buttons */
        button[role="radio"][data-state="checked"] {
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.9) !important;
        }

        /* Force slider thumb to be perfectly circular */
        [data-slot="slider-thumb"] {
          width: 20px !important;
          height: 20px !important;
          min-width: 20px !important;
          min-height: 20px !important;
          max-width: 20px !important;
          max-height: 20px !important;
          border-radius: 50% !important;
          aspect-ratio: 1 / 1 !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      `}</style>
    </div>
  );
}