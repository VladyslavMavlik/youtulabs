import { motion } from 'motion/react';
import { Loader2, Sparkles } from 'lucide-react';
import { translations, type Language } from '../lib/translations';

interface LoadingScreenProps {
  language: Language;
  duration: number;
}

export function LoadingScreen({ language, duration }: LoadingScreenProps) {
  const t = translations[language];
  const mode = duration <= 60 ? t.shortMode : t.longMode;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh]"
    >
      <motion.div
        animate={{
          rotate: 360,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'linear',
        }}
        className="relative mb-8"
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 p-1">
          <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-purple-400" />
          </div>
        </div>
      </motion.div>

      <motion.h2
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-white/90 mb-2"
      >
        {t.generating}
      </motion.h2>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-white/50"
      >
        {mode}
      </motion.p>

      <motion.div
        className="mt-8 flex gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-purple-400"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
