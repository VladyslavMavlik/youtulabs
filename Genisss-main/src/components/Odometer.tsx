import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookText } from 'lucide-react';

interface OdometerProps {
  value: number;
  label?: string;
}

interface DigitProps {
  value: string;
  isAnimating: boolean;
}

function Digit({ value, isAnimating }: DigitProps) {
  return (
    <motion.span
      key={value}
      initial={isAnimating ? { y: -20, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        duration: 0.3,
        ease: 'easeOut',
      }}
      className="text-xl"
      style={{
        color: '#c9a468',
        fontFamily: '"Inter Tight", "Inter", sans-serif',
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
        opacity: 0.9
      }}
    >
      {value}
    </motion.span>
  );
}

export function Odometer({ value, label }: OdometerProps) {
  // Format number with comma separator and two leading zeros (e.g., 001,323)
  const formatNumber = (num: number) => {
    const formatted = num.toLocaleString('en-US');
    // Always add two leading zeros (001,323 -> 10,323 -> 100,323)
    const parts = formatted.split(',');
    if (parts.length > 0) {
      parts[0] = parts[0].padStart(3, '0');
    }
    return parts.join(',');
  };

  // Initialize digits from value immediately (including comma)
  const initialDigits = formatNumber(value).split('');
  const [digits, setDigits] = useState<string[]>(initialDigits);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(new Set());
  const prevValueRef = useRef(value);

  useEffect(() => {
    // Convert number to array of digits with comma
    const newDigits = formatNumber(value).split('');
    setDigits(newDigits);

    // Detect which digits changed
    if (prevValueRef.current !== value) {
      const prevDigits = formatNumber(prevValueRef.current).split('');
      const changedIndices = new Set<number>();

      newDigits.forEach((char, index) => {
        if (char !== prevDigits[index]) {
          changedIndices.add(index);
        }
      });

      setAnimatingIndices(changedIndices);

      // Clear animation state after animation completes
      setTimeout(() => {
        setAnimatingIndices(new Set());
      }, 500);

      prevValueRef.current = value;
    }
  }, [value]);

  return (
    <div className="flex items-center gap-6">
      {/* Grey separator line */}
      <div
        style={{
          width: '1px',
          height: '48px',
          background: 'rgba(156, 163, 175, 0.4)',
        }}
      />

      {/* Book icon */}
      <BookText
        className="w-6 h-6"
        style={{
          color: '#c9a468',
          opacity: 0.8
        }}
      />

      {/* Digits display - airless design */}
      <div className="px-1.5">
        <div className="flex justify-center tracking-wider">
          {digits.map((char, index) => (
            <Digit
              key={index}
              value={char}
              isAnimating={animatingIndices.has(index)}
            />
          ))}
        </div>
      </div>

      {/* Label */}
      {label && (
        <motion.span
          className="text-sm tracking-wide uppercase"
          style={{
            color: '#d1d5db',
            opacity: 0.6,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.3 }}
        >
          {label}
        </motion.span>
      )}
    </div>
  );
}
