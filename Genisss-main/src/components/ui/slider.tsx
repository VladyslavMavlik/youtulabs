"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider@1.2.3";

import { cn } from "./utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  // Calculate the percentage for the glow position
  const currentValue = Array.isArray(value) ? value[0] : (Array.isArray(defaultValue) ? defaultValue[0] : min);
  const percentage = ((currentValue - min) / (max - min)) * 100;

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      {/* Purple glow shadow - positioned outside overflow-hidden */}
      <div
        className="absolute h-2 pointer-events-none transition-all duration-200 ease-out"
        style={{
          left: 0,
          width: `${percentage}%`,
          top: 0,
          filter: 'blur(6px)',
          opacity: 0.6,
          background: 'linear-gradient(to right, transparent, #a855f7)',
          zIndex: 0
        }}
      />

      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-2 w-full grow overflow-hidden rounded-full"
        style={{
          backgroundColor: 'transparent'
        }}
      >
        {/* Segmented track - each segment separate with gaps */}
        {/* Positions: 40min = 22.58%, 80min = 48.39%, 120min = 74.19% (relative to 5-160 range) */}
        <div className="absolute inset-0 flex items-center">
          {/* Segment 1: 5-40min (0-22.58%) */}
          <div
            className="absolute h-full rounded-l-full"
            style={{
              left: '0%',
              width: 'calc(22.58% - 1.5px)',
              backgroundColor: 'rgba(202, 138, 4, 0.3)',
              border: '1px solid rgba(234, 179, 8, 0.2)'
            }}
          />
          {/* Segment 2: 40-80min (22.58-48.39%) */}
          <div
            className="absolute h-full"
            style={{
              left: 'calc(22.58% + 1.5px)',
              width: 'calc(25.81% - 3px)',
              backgroundColor: 'rgba(202, 138, 4, 0.3)',
              border: '1px solid rgba(234, 179, 8, 0.2)'
            }}
          />
          {/* Segment 3: 80-120min (48.39-74.19%) */}
          <div
            className="absolute h-full"
            style={{
              left: 'calc(48.39% + 1.5px)',
              width: 'calc(25.8% - 3px)',
              backgroundColor: 'rgba(202, 138, 4, 0.3)',
              border: '1px solid rgba(234, 179, 8, 0.2)'
            }}
          />
          {/* Segment 4: 120-160min (74.19-100%) */}
          <div
            className="absolute h-full rounded-r-full"
            style={{
              left: 'calc(74.19% + 1.5px)',
              width: 'calc(25.81% - 1.5px)',
              backgroundColor: 'rgba(202, 138, 4, 0.3)',
              border: '1px solid rgba(234, 179, 8, 0.2)'
            }}
          />
        </div>

        {/* Shadow for purple glow */}
        <div
          className="absolute h-full w-full pointer-events-none"
          style={{
            top: '2px',
            maskImage: `linear-gradient(to right,
              black 0%,
              black calc(22.58% - 1.5px),
              transparent calc(22.58% - 1.5px),
              transparent calc(22.58% + 1.5px),
              black calc(22.58% + 1.5px),
              black calc(48.39% - 1.5px),
              transparent calc(48.39% - 1.5px),
              transparent calc(48.39% + 1.5px),
              black calc(48.39% + 1.5px),
              black calc(74.19% - 1.5px),
              transparent calc(74.19% - 1.5px),
              transparent calc(74.19% + 1.5px),
              black calc(74.19% + 1.5px),
              black 100%
            )`,
            WebkitMaskImage: `linear-gradient(to right,
              black 0%,
              black calc(22.58% - 1.5px),
              transparent calc(22.58% - 1.5px),
              transparent calc(22.58% + 1.5px),
              black calc(22.58% + 1.5px),
              black calc(48.39% - 1.5px),
              transparent calc(48.39% - 1.5px),
              transparent calc(48.39% + 1.5px),
              black calc(48.39% + 1.5px),
              black calc(74.19% - 1.5px),
              transparent calc(74.19% - 1.5px),
              transparent calc(74.19% + 1.5px),
              black calc(74.19% + 1.5px),
              black 100%
            )`
          }}
        >
          <SliderPrimitive.Range
            className="absolute h-full"
            style={{
              backgroundColor: 'transparent',
              boxShadow: '0 3px 10px rgba(168, 85, 247, 0.7)'
            }}
          />
        </div>

        {/* Mask wrapper for Range to create gaps */}
        <div
          className="absolute h-full w-full"
          style={{
            maskImage: `linear-gradient(to right,
              black 0%,
              black calc(22.58% - 1.5px),
              transparent calc(22.58% - 1.5px),
              transparent calc(22.58% + 1.5px),
              black calc(22.58% + 1.5px),
              black calc(48.39% - 1.5px),
              transparent calc(48.39% - 1.5px),
              transparent calc(48.39% + 1.5px),
              black calc(48.39% + 1.5px),
              black calc(74.19% - 1.5px),
              transparent calc(74.19% - 1.5px),
              transparent calc(74.19% + 1.5px),
              black calc(74.19% + 1.5px),
              black 100%
            )`,
            WebkitMaskImage: `linear-gradient(to right,
              black 0%,
              black calc(22.58% - 1.5px),
              transparent calc(22.58% - 1.5px),
              transparent calc(22.58% + 1.5px),
              black calc(22.58% + 1.5px),
              black calc(48.39% - 1.5px),
              transparent calc(48.39% - 1.5px),
              transparent calc(48.39% + 1.5px),
              black calc(48.39% + 1.5px),
              black calc(74.19% - 1.5px),
              transparent calc(74.19% - 1.5px),
              transparent calc(74.19% + 1.5px),
              black calc(74.19% + 1.5px),
              black 100%
            )`
          }}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="absolute h-full transition-all duration-200 ease-out"
            style={{
              backgroundColor: '#a855f7',
              filter: 'drop-shadow(0 2px 4px rgba(168, 85, 247, 0.8)) drop-shadow(0 1px 8px rgba(168, 85, 247, 0.6))'
            }}
          />
        </div>
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="transition-all hover:scale-110 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          style={{
            display: 'block',
            width: '20px !important',
            height: '20px !important',
            minWidth: '20px !important',
            minHeight: '20px !important',
            maxWidth: '20px !important',
            maxHeight: '20px !important',
            flexShrink: '0',
            borderRadius: '50% !important',
            border: '2px solid #c084fc',
            backgroundColor: '#9333ea',
            boxShadow: '0 0 15px rgba(168, 85, 247, 0.6)',
            aspectRatio: '1 / 1',
            padding: '0 !important',
            margin: '0 !important',
            zIndex: 10
          } as React.CSSProperties}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
