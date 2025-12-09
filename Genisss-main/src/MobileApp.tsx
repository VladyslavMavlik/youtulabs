import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MobileHeader } from './components/MobileHeader';
import { MobileFooter } from './components/MobileFooter';
import { GenerationForm, type FormData, type GenerationFormRef } from './components/GenerationForm';
import { StoryDisplay } from './components/StoryDisplay';
import { MouseFollowBackground } from './components/MouseFollowBackground';
import { ResetPassword } from './components/ResetPassword';
import { SubscriptionPage } from './components/SubscriptionPage';
import { ProfilePage } from './components/ProfilePage';
import { CreditsPage } from './components/CreditsPage';
import { AdminPanel } from './components/AdminPanel';
import { HistoryPage } from './components/HistoryPage';
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
import { supabase, getUserBalance, deductBalance, saveStory, getUserSubscription } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { GenerationItem } from './App';

type AppState = 'idle' | 'loading' | 'success' | 'error';
type Page = 'home' | 'subscription' | 'profile' | 'credits' | 'admin' | 'history' | 'contact' | 'privacy' | 'terms' | 'refund';

/**
 * MobileApp - Mobile-optimized version with vertical stacking.
 * Form on top, story display below. Strictly separated from desktop version.
 */
export default function MobileApp() {
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
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Voice synthesis state
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

  // Ref to store current generation metadata
  const currentGenerationMetadata = useRef<{
    duration?: number;
    genre?: string;
    language?: string;
    characterCount?: number;
  } | null>(null);

  // Helper function to add generation to history
  const addToHistory = (item: Omit<GenerationItem, 'id' | 'timestamp'>) => {
    const newItem: GenerationItem = {
      ...item,
      id: `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    setGenerationHistory(prev => [newItem, ...prev]);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadBalance();
        loadUserPlan();
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadBalance();
        loadUserPlan();
      } else {
        setUserPlan(undefined);
        setBalance(0);
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

  // Supabase Realtime subscription for job updates with polling fallback
  useEffect(() => {
    if (!currentJobId || !user) return;

    console.log('🔔 [MOBILE] Subscribing to Realtime updates for job:', currentJobId);
    let realtimeActive = false;
    let pollingInterval: NodeJS.Timeout | null = null;
    let pollingAttempts = 0;
    const MAX_POLLING_ATTEMPTS = 180;

    const handleJobUpdate = async (status: string, storyId?: string, error?: string) => {
      if (status === 'completed' && storyId) {
        console.log(`✅ [MOBILE] Job completed! Fetching story with ID: ${storyId}`);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Session expired');
          setState('error');
          setCurrentJobId(null);
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
          const storyContent = storyData.content || 'Story generated successfully!';
          setStory(storyContent);
          setState('success');
          setIsTextGenerating(false);
          setCurrentJobId(null);
          await loadBalance();

          addToHistory({
            type: 'text',
            content: storyContent,
            metadata: currentGenerationMetadata.current || undefined,
          });
        } catch (err) {
          console.error('[MOBILE] Error fetching story:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch story');
          setState('error');
          setIsTextGenerating(false);
          setCurrentJobId(null);
        }
      } else if (status === 'failed') {
        const errorMessage = error || 'Story generation failed';
        console.error('❌ [MOBILE] Job failed:', errorMessage);
        setError(errorMessage);
        setState('error');
        setCurrentJobId(null);
        await loadBalance();
        setIsTextGenerating(false);

        setTimeout(() => {
          setState('idle');
        }, 3000);
      }
    };

    const startPollingFallback = () => {
      pollingInterval = setInterval(async () => {
        pollingAttempts++;
        if (pollingAttempts > MAX_POLLING_ATTEMPTS) {
          setError('Story generation is taking too long. Please check back later.');
          setState('error');
          setCurrentJobId(null);
          if (pollingInterval) clearInterval(pollingInterval);
          return;
        }

        try {
          const { data: job, error } = await supabase
            .from('story_jobs')
            .select('status, story_id, error')
            .eq('job_id', currentJobId)
            .single();

          if (error) return;

          if (job && (job.status === 'completed' || job.status === 'failed')) {
            if (pollingInterval) clearInterval(pollingInterval);
            await handleJobUpdate(job.status, job.story_id, job.error);
          }
        } catch (err) {
          console.error('[MOBILE] Polling exception:', err);
        }
      }, 5000);
    };

    const channel = supabase
      .channel(`job:${currentJobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'story_jobs',
          filter: `job_id=eq.${currentJobId}`
        },
        async (payload) => {
          realtimeActive = true;
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
          }
          await handleJobUpdate(payload.new.status, payload.new.story_id, payload.new.error);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeActive = true;
          setTimeout(() => {
            if (!realtimeActive && currentJobId) {
              startPollingFallback();
            }
          }, 10000);
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          if (!realtimeActive) {
            startPollingFallback();
          }
        }
      });

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [currentJobId, user]);

  // Supabase Realtime subscription for balance updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`credits:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`
        },
        async () => {
          await loadBalance();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Supabase Realtime subscription for subscription plan updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`subscription:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${user.id}`
        },
        async () => {
          await loadUserPlan();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Listen for navigation events from UserMenu
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
    setState('loading');
    setIsAudioGenerating(true);
    setVoiceStatus('creating');
    setAudioUrl(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';

      currentGenerationMetadata.current = {
        characterCount: data.audioText?.length || 0,
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No valid session found. Please log in.');
      }

      const requestBody: any = {
        text: data.audioText,
        voice_id: data.voiceId || null,
        voice_name: data.voiceName || null,
        chunk_size: data.voiceChunkSize || null,
      };

      if (data.voicePausesEnabled) {
        requestBody.pause_settings = {
          enabled: true,
          max_pause_symb: data.voiceMaxPauseSymbols || 2000,
          pause_time: data.voicePauseTime || 1.0,
          auto_paragraph_pause: data.voiceAutoParagraphPause || false,
        };
      }

      if (data.voiceStressEnabled) {
        requestBody.stress_settings = {
          enabled: true,
        };
      }

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
          errorMessage = errorText || errorMessage;
        }

        if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();
      const taskId = result.task_id;
      setVoiceTaskId(taskId);
      setVoiceStatus('processing');

      await pollVoiceStatus(taskId);
    } catch (error: any) {
      setError(error.message || 'Failed to synthesize audio');
      setState('error');
      setIsAudioGenerating(false);
    }
  };

  // Poll voice task status
  const pollVoiceStatus = async (taskId: number) => {
    const API_URL = import.meta.env.VITE_API_URL ?? '';
    const MAX_ATTEMPTS = 120;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts++;

      try {
        const response = await fetch(`${API_URL}/api/voice/status/${taskId}`);

        if (!response.ok) {
          throw new Error(`Failed to check status: ${response.status}`);
        }

        const status = await response.json();
        setVoiceStatus(status.status);

        if (status.status === 'ending_processed' || status.status === 'ending') {
          await fetchVoiceResult(taskId);
          return;
        }

        if (status.status === 'error' || status.status === 'error_handled') {
          throw new Error('Synthesis failed on server');
        }

        if (status.status === 'waiting' || status.status === 'processing') {
          if (attempts >= MAX_ATTEMPTS) {
            throw new Error('Synthesis timeout (6 minutes exceeded)');
          }

          setTimeout(() => poll(), 3000);
        }
      } catch (error: any) {
        setError(error.message || 'Failed to check synthesis status');
        setState('error');
        setIsAudioGenerating(false);
      }
    };

    poll();
  };

  // Fetch voice synthesis result
  const fetchVoiceResult = async (taskId: number) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';

      const response = await fetch(`${API_URL}/api/voice/result/${taskId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch audio');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setAudioUrl(url);
      setState('completed');
      setIsAudioGenerating(false);

      window.dispatchEvent(new CustomEvent('audioGenerationComplete'));

      addToHistory({
        type: 'audio',
        content: url,
        metadata: currentGenerationMetadata.current || undefined,
      });
    } catch (error: any) {
      setError(error.message || 'Failed to download audio');
      setState('error');
      setIsAudioGenerating(false);
    }
  };

  const handleFormSubmit = async (data: FormData) => {
    setError(null);

    try {
      if (!user) {
        throw new Error('You must be logged in to generate stories');
      }

      const isAudioMode = !!data.audioText;
      setOutputMode(isAudioMode ? 'audio' : 'text');

      if (isAudioMode) {
        await handleVoiceSynthesis(data);
        return;
      }

      const cost = calculateCrystalCost(data.duration);
      const currentBalance = await getUserBalance();

      if (!currentBalance || currentBalance < cost) {
        setRequiredGems(cost);
        setCurrentGems(currentBalance || 0);
        setShowInsufficientBalanceModal(true);
        return;
      }

      setState('loading');
      setIsTextGenerating(true);
      setStory(null);

      currentGenerationMetadata.current = {
        duration: data.duration,
        genre: data.genre,
        language: data.storyLanguage,
      };

      const requestPayload = {
        language: data.storyLanguage,
        genre: data.genre,
        minutes: data.duration,
        prompt: data.storyPrompt,
        pov: data.pointOfView,
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
        if (response.status === 429) {
          throw new Error('Server is busy. Please try again in a moment.');
        }

        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          throw new Error('Failed to communicate with server');
        }

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

      await loadBalance();
      setCurrentJobId(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setState('error');
      setIsTextGenerating(false);
      setTimeout(() => {
        setState('idle');
      }, 3000);
    }
  };

  const t = translations[language];

  // Show reset password page
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

  // MOBILE LAYOUT: Vertical stacking (form on top, story display below)
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black relative flex flex-col">
      <MouseFollowBackground />

      <MobileHeader
        user={user}
        language={language}
        onLanguageChange={setLanguage}
        balance={balance}
        userPlan={userPlan}
      />

      {/* Spacer for fixed header */}
      <div className="h-16 flex-shrink-0"></div>

      <main className="relative z-10 flex-1 min-h-0 px-3">
        <div className="h-full flex flex-col gap-3 py-3">
          {/* Error alert */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-300">
                  {error}
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Generation Form - Top */}
          <div className="w-full">
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

          {/* Story Display - Bottom */}
          <div className="w-full flex-1 min-h-[400px]">
            <div style={{ display: currentFormMode === 'text' ? 'block' : 'none', height: '100%' }}>
              <StoryDisplay
                story={story}
                isGenerating={isTextGenerating}
                language={language}
                audioUrl={null}
                voiceStatus={null}
                outputMode="text"
                generationHistory={generationHistory.filter(item => item.type === 'text')}
                currentFormMode={currentFormMode}
                onConvertToAudio={handleConvertToAudio}
              />
            </div>
            <div style={{ display: currentFormMode === 'audio' ? 'block' : 'none', height: '100%' }}>
              <StoryDisplay
                story={null}
                isGenerating={isAudioGenerating}
                language={language}
                audioUrl={audioUrl}
                voiceStatus={voiceStatus}
                outputMode="audio"
                generationHistory={generationHistory.filter(item => item.type === 'audio')}
                currentFormMode={currentFormMode}
                onConvertToAudio={handleConvertToAudio}
              />
            </div>
          </div>
        </div>
      </main>

      <MobileFooter />

      <Toaster theme="dark" />

      <style>{`
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

        button[role="radio"][data-state="checked"] {
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.9) !important;
        }

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
