import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Volume2, FileText, Lock, Gem } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Slider } from './ui/slider';
import { translations, storyLanguages, genres, type Language } from '../lib/translations';
import { InfoTooltip } from './InfoTooltip';
import { isAudioEnabled, calculateCrystalCost, calculateAudioCrystalCost } from '../lib/pricing';
import { calculateWordCount } from '../lib/wordsPerMinute';
import { VoiceSelector } from './VoiceSelector';

export interface GenerationFormRef {
  setAudioTextAndSwitchMode: (text: string) => void;
}

interface GenerationFormProps {
  language: Language;
  onSubmit: (data: FormData) => void;
  isAuthenticated: boolean;
  onAuthRequired: () => void;
  userPlan?: string;
  showInsufficientBalance?: boolean;
  requiredGems?: number;
  currentGems?: number;
  onDismissInsufficientBalance?: () => void;
  onBuyGems?: () => void;
  onModeChange?: (mode: 'text' | 'audio') => void;
}

export interface FormData {
  // Text generation fields
  storyLanguage: string;
  genre: string;
  duration: number;
  storyPrompt: string;
  pointOfView: 'first' | 'third';
  noExplicitContent: boolean;
  violenceLevel: 'none' | 'mild' | 'moderate' | 'graphic';
  audioMode: boolean;
  timeBeacons: boolean;
  tightCadence: boolean;

  // Voice synthesis fields (Voice API)
  voiceGender?: 'male' | 'female';
  voiceId?: string;
  voiceName?: string;
  audioText?: string;
  voiceChunkSize?: number;
  voicePausesEnabled?: boolean;
  voiceMaxPauseSymbols?: number;
  voicePauseTime?: number;
  voiceAutoParagraphPause?: boolean;
  voiceStressEnabled?: boolean;
}

// Voice options for ElevenLabs multilingual v2
const VOICE_OPTIONS = {
  male: [
    {
      id: 'pNInz6obpgDQGcFmaJgB',
      name: 'Adam',
      multilingual: true,
      accent: null,
      description: {
        uk: 'Глибокий, впевнений голос середніх років',
        en: 'Deep, confident middle-aged voice',
        pl: 'Głęboki, pewny siebie głos w średnim wieku'
      }
    },
    {
      id: 'ErXwobaYiN019PkySvjV',
      name: 'Antoni',
      multilingual: true,
      accent: null,
      description: {
        uk: 'М\'який, добре сформульований молодий голос',
        en: 'Soft, well-articulated young voice',
        pl: 'Miękki, dobrze wyartykułowany młody głos'
      }
    },
    {
      id: 'VR6AewLTigWG4xSOukaG',
      name: 'Arnold',
      multilingual: true,
      accent: null,
      description: {
        uk: 'Резонуючий, авторитетний зрілий голос',
        en: 'Resonant, authoritative mature voice',
        pl: 'Rezonujący, autorytatywny dojrzały głos'
      }
    },
    {
      id: 'nPczCjzI2devNBz1zQrb',
      name: 'Brian',
      multilingual: false,
      accent: '🇺🇸',
      description: {
        uk: 'Глибокий американський голос середніх років',
        en: 'Deep American middle-aged voice',
        pl: 'Głęboki amerykański głos w średnim wieku'
      }
    },
    {
      id: 'onwK4e9ZLuTAKqWW03F9',
      name: 'Daniel',
      multilingual: false,
      accent: '🇬🇧',
      description: {
        uk: 'Глибокий британський голос середніх років',
        en: 'Deep British middle-aged voice',
        pl: 'Głęboki brytyjski głos w średnim wieku'
      }
    },
    {
      id: 'N2lVS1w4EtoT3dr4eOWO',
      name: 'Callum',
      multilingual: false,
      accent: '🇬🇧',
      description: {
        uk: 'Чіткий шотландський акцент, енергійний',
        en: 'Clear Scottish accent, energetic',
        pl: 'Wyraźny szkocki akcent, energiczny'
      }
    },
    {
      id: 'TxGEqnHWrfWFTfGW9XjX',
      name: 'Josh',
      multilingual: false,
      accent: '🇺🇸',
      description: {
        uk: 'Молодий американський голос, жвавий',
        en: 'Young American voice, lively',
        pl: 'Młody amerykański głos, żywy'
      }
    },
    {
      id: 'IKne3meq5aSn9XLyUdCD',
      name: 'Charlie',
      multilingual: false,
      accent: '🇦🇺',
      description: {
        uk: 'Дружній австралійський голос, невимушений',
        en: 'Friendly Australian voice, casual',
        pl: 'Przyjazny australijski głos, swobodny'
      }
    },
    {
      id: 'XrExE9yKIg1WjnnlVkGX',
      name: 'Matthew',
      multilingual: false,
      accent: '🌍',
      description: {
        uk: 'Теплий голос, дружній',
        en: 'Warm voice, friendly',
        pl: 'Ciepły głos, przyjazny'
      }
    },
  ],
  female: [
    {
      id: '21m00Tcm4TlvDq8ikWAM',
      name: 'Rachel',
      multilingual: true,
      accent: null,
      description: {
        uk: 'Спокійний, приємний молодий голос',
        en: 'Calm, pleasant young voice',
        pl: 'Spokojny, przyjemny młody głos'
      }
    },
    {
      id: 'AZnzlk1XvdvUeBnXmlld',
      name: 'Domi',
      multilingual: true,
      accent: null,
      description: {
        uk: 'Виразний, впевнений молодий голос',
        en: 'Expressive, confident young voice',
        pl: 'Wyrazisty, pewny siebie młody głos'
      }
    },
    {
      id: 'EXAVITQu4vr4xnSDxMaL',
      name: 'Bella',
      multilingual: true,
      accent: null,
      description: {
        uk: 'М\'який, витончений молодий голос',
        en: 'Soft, refined young voice',
        pl: 'Miękki, wyrafinowany młody głos'
      }
    },
    {
      id: 'MF3mGyEYCl7XYWbV9V6O',
      name: 'Elli',
      multilingual: true,
      accent: null,
      description: {
        uk: 'Енергійний, емоційний молодий голос',
        en: 'Energetic, emotional young voice',
        pl: 'Energiczny, emocjonalny młody głos'
      }
    },
    {
      id: 'pMsXgVXv3BLzUgSXRplE',
      name: 'Serena',
      multilingual: false,
      accent: '🇺🇸',
      description: {
        uk: 'Приємний американський голос середніх років',
        en: 'Pleasant American middle-aged voice',
        pl: 'Przyjemny amerykański głos w średnim wieku'
      }
    },
    {
      id: 'pFZP5JQG7iQjIQuC4Bku',
      name: 'Lily',
      multilingual: false,
      accent: '🇬🇧',
      description: {
        uk: 'Хрипкий британський голос середніх років',
        en: 'Raspy British middle-aged voice',
        pl: 'Ochrypły brytyjski głos w średnim wieku'
      }
    },
    {
      id: 'XB0fDUnXU5powFXDhCwa',
      name: 'Charlotte',
      multilingual: false,
      accent: '🇬🇧',
      description: {
        uk: 'Елегантний британський голос, вишуканий',
        en: 'Elegant British voice, sophisticated',
        pl: 'Elegancki brytyjski głos, wyrafinowany'
      }
    },
  ]
};

export const GenerationForm = forwardRef<GenerationFormRef, GenerationFormProps>(({ language, onSubmit, isAuthenticated, onAuthRequired, userPlan, showInsufficientBalance, requiredGems, currentGems, onDismissInsufficientBalance, onBuyGems, onModeChange }, ref) => {
  const t = translations[language];
  const [outputMode, setOutputMode] = useState<'audio' | 'text'>('text');
  const audioAllowed = isAudioEnabled(userPlan);
  const [showAudioLockedModal, setShowAudioLockedModal] = useState(false);

  // Notify parent when mode changes and clear inappropriate fields
  useEffect(() => {
    onModeChange?.(outputMode);

    // Clear audioText when switching to text mode to prevent audio generation
    if (outputMode === 'text') {
      setFormData(prev => ({
        ...prev,
        audioText: undefined
      }));
    }
  }, [outputMode, onModeChange]);

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    setAudioTextAndSwitchMode: (text: string) => {
      setOutputMode('audio');
      setFormData(prev => ({
        ...prev,
        audioText: text
      }));
    }
  }));
  const [formData, setFormData] = useState<FormData>({
    storyLanguage: 'en-US',
    genre: 'romance',
    duration: 80,
    storyPrompt: '',
    pointOfView: 'first',
    noExplicitContent: true,
    violenceLevel: 'moderate',
    audioMode: true,
    timeBeacons: true,
    tightCadence: true,
    voiceGender: 'male',
    voiceId: VOICE_OPTIONS.male[0].id,
    voiceName: VOICE_OPTIONS.male[0].name,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Voice API state
  const [voiceTemplates, setVoiceTemplates] = useState<Array<{ uuid: string; name: string }>>([]);
  const [voiceBalance, setVoiceBalance] = useState<number | null>(null);
  const [voiceBalanceText, setVoiceBalanceText] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Load voice templates and balance when Audio mode is active
  useEffect(() => {
    if (outputMode === 'audio' && isAuthenticated) {
      loadVoiceData();

      // Auto-refresh balance every 30 seconds
      const balanceInterval = setInterval(() => {
        loadVoiceBalance();
      }, 30000);

      // Listen for audio generation complete event
      const handleAudioComplete = () => {
        console.log('🔄 Audio generation complete - refreshing balance');
        loadVoiceBalance();
      };
      window.addEventListener('audioGenerationComplete', handleAudioComplete);

      return () => {
        clearInterval(balanceInterval);
        window.removeEventListener('audioGenerationComplete', handleAudioComplete);
      };
    }
  }, [outputMode, isAuthenticated]);

  const loadVoiceData = async () => {
    const API_URL = import.meta.env.VITE_API_URL ?? '';

    // Load templates
    setLoadingTemplates(true);
    try {
      const templatesResponse = await fetch(`${API_URL}/api/voice/templates`);
      if (templatesResponse.ok) {
        const templates = await templatesResponse.json();
        setVoiceTemplates(templates);
      } else {
        console.error('Failed to load voice templates:', await templatesResponse.text());
      }
    } catch (error) {
      console.error('Error loading voice templates:', error);
    } finally {
      setLoadingTemplates(false);
    }

    // Load balance
    await loadVoiceBalance();
  };

  const loadVoiceBalance = async () => {
    const API_URL = import.meta.env.VITE_API_URL ?? '';

    setLoadingBalance(true);
    try {
      const balanceResponse = await fetch(`${API_URL}/api/voice/balance`);
      if (balanceResponse.ok) {
        const balance = await balanceResponse.json();
        setVoiceBalance(balance.balance);
        setVoiceBalanceText(balance.balance_text);
      } else {
        console.error('Failed to load voice balance:', await balanceResponse.text());
      }
    } catch (error) {
      console.error('Error loading voice balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      e.stopPropagation();
      // Dispatch custom event to open auth dialog
      window.dispatchEvent(new CustomEvent('openAuthDialog', { detail: { tab: 'register' } }));
      onAuthRequired();
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-xl mx-auto bg-emerald-950/40 backdrop-blur-sm rounded-2xl border border-emerald-600/20"
    >
      {/* Output Mode Toggle - Sliding Button Style */}
      <div className="p-6 rounded-t-2xl">
        <div
          className="relative rounded-2xl"
          style={{
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.2))',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(0, 0, 0, 0.2)',
            padding: '4px 6px',
            marginLeft: '16px',
            marginRight: '16px',
            marginTop: '16px'
          }}
        >
          {/* Sliding Button - the actual moving button */}
          <motion.div
            className="absolute"
            animate={{
              left: outputMode === 'text' ? '6px' : '50%',
              top: '4px',
              bottom: '4px',
              width: 'calc(50% - 6px)',
            }}
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 35,
              mass: 1
            }}
            style={{
              background: outputMode === 'text'
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'linear-gradient(135deg, #eab308, #ca8a04)',
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25)',
              borderRadius: '12px'
            }}
          >
            {/* Content inside the moving button */}
            <div className="h-full flex items-center justify-center gap-2 px-4 py-2">
              <motion.div
                animate={{
                  rotate: outputMode === 'text' ? [0, -5, 0] : [0, 5, 0],
                }}
                transition={{ duration: 0.4 }}
              >
                {outputMode === 'text' ? (
                  <FileText className="w-5 h-5 text-white" strokeWidth={2.5} />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                )}
              </motion.div>
              <span className="text-base font-bold text-white tracking-wide">
                {outputMode === 'text' ? 'Text' : 'Audio'}
              </span>
            </div>
          </motion.div>

          {/* Static labels */}
          <div className="relative flex w-full">
            <button
              type="button"
              onClick={() => setOutputMode('text')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl z-10"
              style={{
                transition: 'all 0.3s ease',
                opacity: outputMode === 'text' ? 0 : 1,
                pointerEvents: outputMode === 'text' ? 'none' : 'auto'
              }}
            >
              <FileText
                className="w-5 h-5"
                strokeWidth={2}
                style={{
                  color: 'rgba(16, 185, 129, 0.6)',
                }}
              />
              <span
                className="text-base font-semibold tracking-wide"
                style={{
                  color: 'rgba(16, 185, 129, 0.6)',
                }}
              >
                Text
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (audioAllowed) {
                  setOutputMode('audio');
                } else {
                  setShowAudioLockedModal(true);
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl z-10 relative group"
              style={{
                transition: 'all 0.3s ease',
                opacity: outputMode === 'audio' ? 0 : 1,
                pointerEvents: outputMode === 'audio' ? 'none' : 'auto',
                cursor: 'pointer'
              }}
            >
              {!audioAllowed && (
                <Lock
                  className="w-4 h-4 absolute"
                  style={{
                    color: 'rgba(234, 179, 8, 0.8)',
                    top: '10px',
                    right: '8px',
                    filter: 'drop-shadow(0 0 4px rgba(234, 179, 8, 0.6))'
                  }}
                />
              )}
              <Volume2
                className="w-5 h-5"
                strokeWidth={2}
                style={{
                  color: audioAllowed ? 'rgba(234, 179, 8, 0.6)' : 'rgba(234, 179, 8, 0.4)',
                }}
              />
              <span
                className="text-base font-semibold tracking-wide"
                style={{
                  color: audioAllowed ? 'rgba(234, 179, 8, 0.6)' : 'rgba(234, 179, 8, 0.4)',
                }}
              >
                Audio
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-8">

      <motion.div
        variants={itemVariants}
        className="flex items-center gap-3 mb-6"
      >
        <motion.div
          className="flex-shrink-0"
          animate={{
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {outputMode === 'text' ? (
            <img src="/peroo.ico" alt="Pero" style={{ width: '40px', height: '40px', objectFit: 'contain', marginRight: '-8px', marginTop: '4px', filter: 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.3))' }} />
          ) : (
            <Volume2 className="w-6 h-6" style={{ color: '#c084fc', filter: 'drop-shadow(0 0 6px rgba(192, 132, 252, 0.4))' }} />
          )}
        </motion.div>
        <div className="text-left">
          <h1 className="text-2xl text-emerald-100 leading-tight">
            {outputMode === 'text' ? t.formTitle : t.audioFormTitle}
          </h1>
          <p className="text-xs text-emerald-300/60 mt-0.5">
            {outputMode === 'text' ? t.formSubtitle : t.audioFormSubtitle}
          </p>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Tab Content */}
        <motion.div
          key={outputMode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 gap-6"
        >
          {outputMode === 'text' ? (
            <>
          {/* Story Language */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="language" className="text-emerald-100/90">{t.languageLabel}</Label>
              <InfoTooltip content={t.tooltipLanguage} />
            </div>
            <Select
              value={formData.storyLanguage}
              onValueChange={(value) => setFormData({ ...formData, storyLanguage: value })}
            >
              <SelectTrigger
                id="language"
                className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100 hover:bg-emerald-900/40 transition-colors"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-emerald-950/95 backdrop-blur-xl border border-emerald-600/30">
                {Object.values(storyLanguages).map((lang) => (
                  <SelectItem
                    key={lang.code}
                    value={lang.code}
                    className="text-emerald-100/70 focus:text-emerald-50 focus:bg-emerald-900/30"
                  >
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Genre */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="genre" className="text-emerald-100/90">{t.genreLabel}</Label>
              <InfoTooltip content={t.tooltipGenre} />
            </div>
            <Select
              value={formData.genre}
              onValueChange={(value) => setFormData({ ...formData, genre: value })}
            >
              <SelectTrigger
                id="genre"
                className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100 hover:bg-emerald-900/40 transition-colors"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-emerald-950/95 backdrop-blur-xl border border-emerald-600/30">
                {genres.map((genre) => (
                  <SelectItem
                    key={genre}
                    value={genre}
                    className="text-emerald-100/70 focus:text-emerald-50 focus:bg-emerald-900/30"
                  >
                    {t[genre]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
            </>
          ) : (
            <>
              {/* Audio Mode Interface - Voice API Integration */}

              {/* Gender Toggle */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-emerald-100/70">{t.voiceGender}</Label>
                  <InfoTooltip content={t.voiceGenderTooltip} />
                </div>
                <div className="flex items-center justify-center gap-6 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.voiceGender === 'male') return;
                      const newGender = 'male';
                      setFormData({
                        ...formData,
                        voiceGender: newGender,
                        voiceId: VOICE_OPTIONS[newGender][0].id,
                        voiceName: VOICE_OPTIONS[newGender][0].name,
                      });
                    }}
                    style={{
                      background: formData.voiceGender === 'male'
                        ? 'linear-gradient(to bottom right, rgba(96, 165, 250, 0.85), rgba(59, 130, 246, 0.75), rgba(37, 99, 235, 0.85))'
                        : 'linear-gradient(to bottom right, rgba(59, 130, 246, 0.35), rgba(37, 99, 235, 0.25), rgba(29, 78, 216, 0.35))',
                      boxShadow: formData.voiceGender === 'male'
                        ? '0 0 20px rgba(59, 130, 246, 0.5), inset 0 0 15px rgba(59, 130, 246, 0.2)'
                        : '0 0 8px rgba(59, 130, 246, 0.15), inset 0 0 8px rgba(59, 130, 246, 0.08)',
                      borderColor: formData.voiceGender === 'male' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(59, 130, 246, 0.3)',
                    }}
                    className={`group relative flex items-center justify-center w-32 h-10 rounded-lg border-2 transition-all duration-300 ease-in-out backdrop-blur-sm ${
                      formData.voiceGender === 'male' ? 'scale-105' : ''
                    } hover:scale-105 active:scale-100`}
                  >
                    <span
                      className={`font-bold transition-all duration-200 drop-shadow-[0_0_12px_rgba(59,130,246,0.8)] ${
                        formData.voiceGender === 'male' ? 'drop-shadow-[0_0_20px_rgba(59,130,246,1)]' : 'group-hover:drop-shadow-[0_0_16px_rgba(59,130,246,0.9)]'
                      }`}
                      style={{ color: '#93c5fd', fontSize: '2.25rem', lineHeight: '1', marginTop: '-4px' }}
                    >
                      ♂
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.voiceGender === 'female') return;
                      const newGender = 'female';
                      setFormData({
                        ...formData,
                        voiceGender: newGender,
                        voiceId: VOICE_OPTIONS[newGender][0].id,
                        voiceName: VOICE_OPTIONS[newGender][0].name,
                      });
                    }}
                    style={{
                      background: formData.voiceGender === 'female'
                        ? 'linear-gradient(to bottom right, rgba(244, 114, 182, 0.85), rgba(236, 72, 153, 0.75), rgba(219, 39, 119, 0.85))'
                        : 'linear-gradient(to bottom right, rgba(236, 72, 153, 0.35), rgba(219, 39, 119, 0.25), rgba(190, 24, 93, 0.35))',
                      boxShadow: formData.voiceGender === 'female'
                        ? '0 0 20px rgba(236, 72, 153, 0.5), inset 0 0 15px rgba(236, 72, 153, 0.2)'
                        : '0 0 8px rgba(236, 72, 153, 0.15), inset 0 0 8px rgba(236, 72, 153, 0.08)',
                      borderColor: formData.voiceGender === 'female' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(236, 72, 153, 0.3)',
                    }}
                    className={`group relative flex items-center justify-center w-32 h-10 rounded-lg border-2 transition-all duration-300 ease-in-out backdrop-blur-sm ${
                      formData.voiceGender === 'female' ? 'scale-105' : ''
                    } hover:scale-105 active:scale-100`}
                  >
                    <span
                      className={`font-bold transition-all duration-200 drop-shadow-[0_0_12px_rgba(236,72,153,0.8)] ${
                        formData.voiceGender === 'female' ? 'drop-shadow-[0_0_20px_rgba(236,72,153,1)]' : 'group-hover:drop-shadow-[0_0_16px_rgba(236,72,153,0.9)]'
                      }`}
                      style={{ color: '#f9a8d4', fontSize: '2.25rem', lineHeight: '1', marginTop: '-4px' }}
                    >
                      ♀
                    </span>
                  </button>
                </div>
              </div>

              {/* Voice Selection with Audio Preview */}
              <div className="relative">
                <VoiceSelector
                  key={formData.voiceGender}
                  voices={VOICE_OPTIONS[formData.voiceGender || 'male']}
                  selectedVoiceId={formData.voiceId || VOICE_OPTIONS[formData.voiceGender || 'male'][0].id}
                  onVoiceChange={(voiceId, voiceName) => {
                    setFormData({
                      ...formData,
                      voiceId,
                      voiceName
                    });
                  }}
                  gender={formData.voiceGender || 'male'}
                  language={language as 'uk' | 'en' | 'pl'}
                  label="Voice"
                  tooltip={t.tooltipVoice}
                />
              </div>

              {/* Text Input */}
              <div className="space-y-3 mb-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="audioText" className="text-emerald-100/90">Text to Synthesize</Label>
                    <InfoTooltip content={t.tooltipAudioText} />
                  </div>
                  <span className="text-xs text-emerald-300/60">
                    {(formData.audioText || '').length} / 50,000
                  </span>
                </div>
                <Textarea
                  id="audioText"
                  value={formData.audioText || ''}
                  onChange={(e) => setFormData({ ...formData, audioText: e.target.value })}
                  placeholder="Paste or type the text you want to convert to speech audio..."
                  className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100 placeholder:text-emerald-400/40 hover:bg-emerald-900/40 focus:bg-emerald-900/40 transition-colors h-[300px] resize-y"
                  maxLength={50000}
                  rows={12}
                  required
                />

                {/* Balance and Cost Display - Hidden for now */}
                {false && (
                <div className="flex items-center justify-between p-3 bg-emerald-950/20 rounded-lg border border-emerald-600/20">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-emerald-100/60">Your Balance</p>
                      <p className="text-sm font-semibold text-emerald-100">
                        {loadingBalance ? (
                          <span className="text-emerald-300/50">Loading...</span>
                        ) : voiceBalance !== null ? (
                          <span style={{ color: '#e0a955' }}>{voiceBalanceText} units</span>
                        ) : (
                          <span className="text-red-400">Not available</span>
                        )}
                      </p>
                    </div>
                    <div className="h-8 w-px bg-emerald-600/30" />
                    <div>
                      <p className="text-xs text-emerald-100/60">Estimated Cost</p>
                      <p className="text-sm font-semibold" style={{ color: '#e0a955' }}>
                        {(formData.audioText || '').length} units
                      </p>
                    </div>
                  </div>
                  {voiceBalance !== null && (formData.audioText || '').length > voiceBalance && (
                    <div className="flex items-center gap-2 text-red-400 text-xs">
                      <span>⚠️ Insufficient balance</span>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* Advanced Audio Settings - Collapsible - Hidden for now */}
              {false && (
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 text-emerald-100/80 hover:text-emerald-100 transition-colors">
                  <span className="text-sm font-medium">Advanced Settings</span>
                  <motion.div
                    animate={{ rotate: advancedOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    ▼
                  </motion.div>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4">
                  {/* Chunk Size */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-emerald-100/90">Chunk Size</Label>
                        <InfoTooltip content={t.tooltipChunkSize} />
                      </div>
                      <span className="text-sm text-emerald-300/60">{formData.voiceChunkSize || 1000} chars</span>
                    </div>
                    <Slider
                      value={[formData.voiceChunkSize || 1000]}
                      onValueChange={(value) => setFormData({ ...formData, voiceChunkSize: value[0] })}
                      min={500}
                      max={2000}
                      step={100}
                      className="w-full"
                    />
                  </div>

                  {/* Pause Settings */}
                  <div className="space-y-3 p-4 bg-emerald-950/20 rounded-lg border border-emerald-600/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-emerald-100/90">Pause Settings</Label>
                      <Checkbox
                        checked={formData.voicePausesEnabled || false}
                        onCheckedChange={(checked) => setFormData({ ...formData, voicePausesEnabled: checked as boolean })}
                        className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                      />
                    </div>
                    {formData.voicePausesEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 pt-2"
                      >
                        <div className="space-y-2">
                          <Label className="text-xs text-emerald-100/70">Max Pause Symbols</Label>
                          <Input
                            type="number"
                            value={formData.voiceMaxPauseSymbols || 2000}
                            onChange={(e) => setFormData({ ...formData, voiceMaxPauseSymbols: parseInt(e.target.value) })}
                            min={100}
                            max={5000}
                            className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-emerald-100/70">Pause Duration (seconds)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={formData.voicePauseTime || 1.0}
                            onChange={(e) => setFormData({ ...formData, voicePauseTime: parseFloat(e.target.value) })}
                            min={0.1}
                            max={5.0}
                            className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="autoParagraph"
                            checked={formData.voiceAutoParagraphPause || false}
                            onCheckedChange={(checked) => setFormData({ ...formData, voiceAutoParagraphPause: checked as boolean })}
                            className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                          />
                          <Label htmlFor="autoParagraph" className="text-xs text-emerald-100/70 cursor-pointer">
                            Auto pause between paragraphs
                          </Label>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Stress Settings */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="stressMarks"
                      checked={formData.voiceStressEnabled || false}
                      onCheckedChange={(checked) => setFormData({ ...formData, voiceStressEnabled: checked as boolean })}
                      className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                    />
                    <Label htmlFor="stressMarks" className="text-emerald-100/80 cursor-pointer flex items-center gap-2">
                      Enable stress marks (акценты)
                      <InfoTooltip content={t.tooltipStressMarks} />
                    </Label>
                  </div>
                </CollapsibleContent>
              </Collapsible>
              )}
            </>
          )}
        </motion.div>

        {/* Duration Slider - Only for Text mode */}
        {outputMode === 'text' && (
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-emerald-100/90">{t.durationLabel}</Label>
              <InfoTooltip content={t.tooltipDuration} />
            </div>
            {/* Current value - compact inline display */}
            <div className="flex items-center gap-1">
              <span className="text-base font-semibold tabular-nums" style={{ color: '#e0a955', textShadow: '0 0 12px rgba(224, 169, 85, 0.5)' }}>{formData.duration}</span>
              <span className="text-xs" style={{ color: '#e0a955', opacity: 0.7 }}>min</span>
              <span className="text-emerald-500/30 mx-0.5">·</span>
              <span className="text-xs tabular-nums" style={{ color: '#e0a955', opacity: 0.6 }}>{calculateWordCount(formData.duration, formData.storyLanguage)}</span>
              <span className="text-xs" style={{ color: '#e0a955', opacity: 0.6 }}>words</span>
            </div>
          </div>

          {/* Slider with marks */}
          <div className="relative px-1 py-4">
            <Slider
              value={[formData.duration]}
              onValueChange={(value) => setFormData({ ...formData, duration: value[0] })}
              min={5}
              max={160}
              step={5}
              className="w-full"
            />

            {/* Labels directly below slider */}
            <div className="relative w-full mt-3 mb-3 h-7">
              {/* 40min divider - at 22.58% */}
              <div className="absolute" style={{ left: '22.58%', transform: 'translateX(-50%)' }}>
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ fontSize: '11px', lineHeight: '1.1', color: 'rgba(156, 163, 175, 0.5)' }}>Medium</span>
                  <span style={{ fontSize: '10px', lineHeight: '1.1', color: 'rgba(156, 163, 175, 0.45)' }}>40</span>
                </div>
              </div>
              {/* 80min divider - at 48.39% */}
              <div className="absolute" style={{ left: '48.39%', transform: 'translateX(-50%)' }}>
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ fontSize: '11px', lineHeight: '1.1', color: 'rgba(156, 163, 175, 0.5)' }}>Long</span>
                  <span style={{ fontSize: '10px', lineHeight: '1.1', color: 'rgba(156, 163, 175, 0.45)' }}>80</span>
                </div>
              </div>
              {/* 120min divider - at 74.19% */}
              <div className="absolute" style={{ left: '74.19%', transform: 'translateX(-50%)' }}>
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ fontSize: '11px', lineHeight: '1.1', color: 'rgba(156, 163, 175, 0.5)' }}>Epic</span>
                  <span style={{ fontSize: '10px', lineHeight: '1.1', color: 'rgba(156, 163, 175, 0.45)' }}>120</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick select buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[10, 20, 30, 40, 60].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setFormData({ ...formData, duration: minutes })}
                className={`px-4 py-1 text-xs rounded-md border transition-all font-medium min-w-[60px] ${
                  formData.duration === minutes
                    ? 'bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-500/30'
                    : 'bg-emerald-950/30 border-emerald-600/30 text-emerald-300/80 hover:bg-emerald-900/40 hover:border-emerald-500/50'
                }`}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </motion.div>
        )}

        {/* Story Prompt - Only for Text mode */}
        {outputMode === 'text' && (
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="prompt" className="text-emerald-100/90">{t.storyPrompt}</Label>
            <InfoTooltip content={t.tooltipPrompt} />
          </div>
          <Textarea
            id="prompt"
            placeholder={t.storyPromptPlaceholder}
            value={formData.storyPrompt}
            onChange={(e) => setFormData({ ...formData, storyPrompt: e.target.value })}
            className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100 placeholder:text-emerald-400/40 hover:bg-emerald-900/40 focus:bg-emerald-900/40 transition-colors h-[180px] resize-none overflow-y-auto"
            required
          />
        </motion.div>
        )}

        {/* Point of View - Only for Text mode */}
        {outputMode === 'text' && (
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-emerald-100/90">{t.pointOfView}</Label>
            <InfoTooltip content={t.tooltipPOV} />
          </div>
          <RadioGroup
            value={formData.pointOfView}
            onValueChange={(value: 'first' | 'third') => setFormData({ ...formData, pointOfView: value })}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="third" id="third" className="border-purple-400/50 text-purple-400" />
              <Label htmlFor="third" className="text-emerald-100/80 cursor-pointer">{t.thirdPerson}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="first" id="first" className="border-purple-400/50 text-purple-400" />
              <Label htmlFor="first" className="text-emerald-100/80 cursor-pointer">{t.firstPerson}</Label>
            </div>
          </RadioGroup>
        </motion.div>
        )}

        {/* Content Policy - Only for Text mode */}
        {outputMode === 'text' && (
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-emerald-100/90">{t.contentPolicy}</Label>
            <InfoTooltip content={t.tooltipContentPolicy} />
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="explicit"
                checked={formData.noExplicitContent}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, noExplicitContent: checked as boolean })
                }
                className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
              />
              <Label htmlFor="explicit" className="text-emerald-100/80 cursor-pointer">
                {t.noExplicitContent}
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="violence" className="text-emerald-100/80">{t.violenceLevel}</Label>
              <Select
                value={formData.violenceLevel}
                onValueChange={(value: any) => setFormData({ ...formData, violenceLevel: value })}
              >
                <SelectTrigger
                  id="violence"
                  className="bg-emerald-950/30 border-emerald-600/30 text-emerald-100 hover:bg-emerald-900/40 transition-colors"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-emerald-950/95 backdrop-blur-xl border border-emerald-600/30">
                  {['none', 'mild', 'moderate', 'graphic'].map((level) => (
                    <SelectItem
                      key={level}
                      value={level}
                      className="text-emerald-100/70 focus:text-emerald-50 focus:bg-emerald-900/30"
                    >
                      {t[`violence_${level}` as keyof typeof t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </motion.div>
        )}

        {/* Advanced Options - Only for Text mode */}
        {outputMode === 'text' && (
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-emerald-100/90">{t.advancedOptions}</Label>
            <InfoTooltip content={t.tooltipAdvancedOptions} />
          </div>
          <div className="flex flex-wrap gap-4 pl-1">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="audio"
                checked={formData.audioMode}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, audioMode: checked as boolean })
                }
                className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
              />
              <Label htmlFor="audio" className="text-emerald-100/80 cursor-pointer">
                {t.audioMode}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="beacons"
                checked={formData.timeBeacons}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, timeBeacons: checked as boolean })
                }
                className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
              />
              <Label htmlFor="beacons" className="text-emerald-100/80 cursor-pointer">
                {t.timeBeacons}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="cadence"
                checked={formData.tightCadence}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, tightCadence: checked as boolean })
                }
                className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
              />
              <Label htmlFor="cadence" className="text-emerald-100/80 cursor-pointer">
                {t.tightCadence}
              </Label>
            </div>
          </div>
        </motion.div>
        )}

        {/* Submit Button */}
        <motion.div variants={itemVariants}>
          <Button
            type={isAuthenticated ? "submit" : "button"}
            onClick={handleButtonClick}
            style={{
              background: isAuthenticated
                ? (outputMode === 'text'
                    ? 'linear-gradient(to right, rgb(5, 150, 105), rgb(202, 138, 4))'
                    : 'linear-gradient(to right, rgb(147, 51, 234), rgb(202, 138, 4))')
                : 'linear-gradient(to right, rgb(107, 114, 128), rgb(156, 163, 175))',
              opacity: isAuthenticated ? 1 : 0.7,
              filter: isAuthenticated ? 'none' : 'blur(0.3px)',
              boxShadow: isAuthenticated
                ? (outputMode === 'text'
                    ? '0 10px 15px -3px rgba(16, 185, 129, 0.2)'
                    : '0 10px 15px -3px rgba(147, 51, 234, 0.2)')
                : '0 0 30px 8px rgba(156, 163, 175, 0.7)'
            }}
            className={`w-full border-0 py-6 relative overflow-hidden group ${
              isAuthenticated ? '' : 'cursor-pointer'
            } text-white`}
          >
            {isAuthenticated && (
              <motion.div
                className={`absolute inset-0 ${
                  outputMode === 'text'
                    ? 'bg-gradient-to-r from-yellow-600 to-emerald-600'
                    : 'bg-gradient-to-r from-yellow-600 to-purple-600'
                } opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                initial={false}
              />
            )}
            {!isAuthenticated && (
              <motion.div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                initial={false}
                style={{
                  background: 'linear-gradient(to right, rgb(156, 163, 175), rgb(107, 114, 128))'
                }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-3">
              <Sparkles className="w-5 h-5" />
              {isAuthenticated
                ? (outputMode === 'text' ? t.generateStory : 'Generate Audio')
                : 'Sign Up to Generate'
              }
              {isAuthenticated && (
                <>
                  <span className="text-white/40">•</span>
                  <span className="flex items-center gap-1.5" style={{
                    background: 'linear-gradient(to right, #ec4899, #a855f7)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textShadow: '0 0 1px white, 0 0 8px rgba(236, 72, 153, 0.6), 0 1px 2px rgba(0, 0, 0, 0.9)'
                  }}>
                    <motion.div
                      animate={{
                        y: [0, -3, 0],
                        rotate: [0, 5, -5, 0],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      <Gem className="w-4 h-4" style={{
                        color: '#ec4899',
                        filter: 'drop-shadow(0 0 12px rgba(236, 72, 153, 1)) drop-shadow(0 4px 8px rgba(236, 72, 153, 0.6)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9))'
                      }} />
                    </motion.div>
                    {outputMode === 'text'
                      ? calculateCrystalCost(formData.duration)
                      : calculateAudioCrystalCost(formData.audioText?.length || 0)
                    }
                  </span>
                </>
              )}
            </span>
          </Button>
        </motion.div>

        {/* Insufficient Balance Notification */}
        {showInsufficientBalance && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="mt-4"
          >
            <div
              className="rounded-md shadow-2xl border-2"
              style={{
                background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.3), rgba(153, 27, 27, 0.2))',
                borderColor: 'rgba(239, 68, 68, 0.7)',
                boxShadow: '0 0 30px rgba(239, 68, 68, 0.5)',
                padding: '12px 16px'
              }}
            >
              <div className="flex items-start gap-3 mb-2">
                <Gem className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#a855f7' }} />
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm mb-1">
                    {t.insufficientGems}
                  </p>
                  <p className="text-emerald-100/80 text-xs">
                    {t.getSubscriptionOrBuyGems}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onDismissInsufficientBalance}
                  className="flex-1 rounded-md text-xs font-medium transition-all duration-200"
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#6ee7b7',
                    padding: '6px 10px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                  }}
                >
                  {t.cancel}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDismissInsufficientBalance?.();
                    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'subscription' } }));
                  }}
                  className="flex-1 rounded-md text-xs font-medium transition-all duration-200"
                  style={{
                    background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                    border: '1px solid rgba(234, 179, 8, 0.8)',
                    color: '#ffffff',
                    boxShadow: '0 0 10px rgba(234, 179, 8, 0.5)',
                    padding: '6px 10px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(234, 179, 8, 0.7)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(234, 179, 8, 0.5)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  View Plans
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </form>
      </div>

      {/* Audio Locked Modal */}
      {showAudioLockedModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          onClick={() => setShowAudioLockedModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-md mx-4"
            style={{
              background: 'linear-gradient(135deg, #0a1a1a 0%, #1a0a0a 100%)',
              border: '2px solid rgba(220, 38, 38, 0.5)',
              borderRadius: '1.5rem',
              padding: '2rem',
              boxShadow: '0 0 30px rgba(220, 38, 38, 0.3), 0 20px 40px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
                style={{
                  background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.2), rgba(239, 68, 68, 0.1))',
                  borderRadius: '50%',
                  padding: '1rem',
                  border: '2px solid rgba(220, 38, 38, 0.4)'
                }}
              >
                <Lock className="w-12 h-12 text-red-400" />
              </motion.div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center mb-3" style={{ color: '#fca5a5' }}>
              {t.audioLockedTitle}
            </h2>

            {/* Message */}
            <p className="text-center text-gray-300 mb-6 leading-relaxed">
              {t.audioLockedMessage}
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowAudioLockedModal(false)}
                className="flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#d1d5db'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  setShowAudioLockedModal(false);
                  window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'subscription' } }));
                }}
                className="flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                  border: '1px solid rgba(234, 179, 8, 0.5)',
                  color: 'white',
                  boxShadow: '0 0 20px rgba(234, 179, 8, 0.4)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 30px rgba(234, 179, 8, 0.6)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(234, 179, 8, 0.4)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {t.viewSubscriptions}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
});
GenerationForm.displayName = "GenerationForm";
