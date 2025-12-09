import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface InfoTooltipProps {
  content: string;
}

export function InfoTooltip({ content }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={150} disableHoverableContent>
      <Tooltip open={open} onOpenChange={setOpen} delayDuration={999999}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setOpen(!open);
            }}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors flex-shrink-0"
            aria-label="More information"
            style={{ color: 'rgba(234, 179, 8, 0.5)' }}
          >
            <HelpCircle className="w-3 h-3" style={{ stroke: 'currentColor' }} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          sideOffset={4}
          className="bg-emerald-900/90 backdrop-blur-xl border border-yellow-400/30 text-emerald-100/95 px-4 py-3 rounded-md shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
          style={{ maxWidth: '280px', width: '280px' }}
        >
          <p className="text-xs leading-relaxed" style={{ whiteSpace: 'normal', wordWrap: 'break-word', overflowWrap: 'break-word' }}>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
