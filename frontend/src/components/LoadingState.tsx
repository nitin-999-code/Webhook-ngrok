import { useState, useEffect } from 'react';
import { theme as T } from '../lib/theme';

const STEPS = [
  { label: "Fetching repository metadata from GitHub...", target: 12 },
  { label: "Cloning and traversing file tree structure...", target: 28 },
  { label: "Parsing dependencies from package files...", target: 42 },
  { label: "Running AI heuristics to identify key files...", target: 58 },
  { label: "Generating system architecture overview...", target: 72 },
  { label: "Compiling comprehensive documentation...", target: 88 },
  { label: "Finalizing analysis results...", target: 97 },
];

interface LoadingStateProps {
  customMessage?: string;
}

export function LoadingState({ customMessage }: LoadingStateProps = {}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [percent, setPercent] = useState(0);

  // Advance through steps at intervals
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Smoothly animate percentage toward the target of the current step
  useEffect(() => {
    const target = STEPS[stepIndex].target;
    const timer = setInterval(() => {
      setPercent((prev) => {
        if (prev >= target) {
          clearInterval(timer);
          return target;
        }
        // Ease toward target in small increments
        const diff = target - prev;
        const step = Math.max(0.3, diff * 0.08);
        return Math.min(prev + step, target);
      });
    }, 50);
    return () => clearInterval(timer);
  }, [stepIndex]);

  const displayPercent = Math.round(percent);

  const shimmerStyle = {
    background: T.card,
    border: `1px solid ${T.border}`,
  };

  const skeletonBar = (w: string) => (
    <div className="rounded" style={{ width: w, height: 12, background: 'rgba(255,255,255,0.04)' }} />
  );

  return (
    <div className="min-h-screen pb-20 overflow-hidden" style={{ background: T.bg, color: T.text }}>
      {/* Skeleton Header */}
      <header
        className="sticky top-0 z-40 w-full px-6 py-4 flex items-center justify-between"
        style={{
          background: 'rgba(10,26,47,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div className="flex items-center gap-4 animate-pulse">
           <div className="w-10 h-10 rounded-lg" style={{ background: T.bgSec, border: `1px solid ${T.border}` }} />
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg" style={{ background: T.bgSec, border: `1px solid ${T.border}` }} />
              <div className="space-y-2">
                 <div className="rounded" style={{ width: 192, height: 20, background: 'rgba(255,255,255,0.05)' }} />
                 <div className="rounded" style={{ width: 128, height: 12, background: 'rgba(255,255,255,0.03)' }} />
              </div>
           </div>
        </div>

        {/* ── Percentage indicator ── */}
        <div className="flex items-center gap-4">
          {/* Circular percentage */}
          <div className="relative flex items-center justify-center w-11 h-11">
            <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
              {/* Background ring */}
              <circle
                cx="22" cy="22" r="18"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="3"
              />
              {/* Progress ring */}
              <circle
                cx="22" cy="22" r="18"
                fill="none"
                stroke={T.accent}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - percent / 100)}`}
                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
              />
            </svg>
            <span
              className="absolute text-[11px] font-bold"
              style={{ color: T.accent }}
            >
              {displayPercent}%
            </span>
          </div>

          <p className="font-medium text-sm hidden md:block w-72" style={{ color: T.muted }}>
            {customMessage || STEPS[stepIndex].label}
          </p>
        </div>
      </header>

      {/* ── Progress bar below header ── */}
      <div className="w-full h-1 relative" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div
          className="h-full rounded-r-full"
          style={{
            width: `${percent}%`,
            background: `linear-gradient(90deg, ${T.accent}, #3B82F6)`,
            transition: 'width 0.3s ease',
            boxShadow: `0 0 12px ${T.accent}40`,
          }}
        />
      </div>

      {/* Skeleton Dashboard Layout */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-pulse">
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
             <div key={i} className="rounded-xl h-28 flex flex-col justify-center items-center gap-3" style={shimmerStyle}>
               <div className="w-8 h-8 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
               <div className="w-16 h-4 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
               <div className="w-12 h-2 rounded" style={{ background: 'rgba(255,255,255,0.03)' }} />
             </div>
          ))}
        </div>

        {/* Big Cards Skeleton Rows */}
        {[...Array(3)].map((_, row) => (
          <div key={row} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl min-h-[300px] p-6" style={shimmerStyle}>
              <div className="mb-6">{skeletonBar('60%')}</div>
              <div className="space-y-3">
                {skeletonBar('100%')}
                {skeletonBar('85%')}
                {skeletonBar('70%')}
              </div>
              <div className="mt-6 rounded-lg" style={{ height: 96, background: 'rgba(255,255,255,0.03)' }} />
            </div>
            <div className="rounded-xl min-h-[300px] p-6" style={shimmerStyle}>
              <div className="mb-6">{skeletonBar('50%')}</div>
              <div className="space-y-3">
                {skeletonBar('100%')}
                {skeletonBar('75%')}
                {skeletonBar('90%')}
              </div>
              <div className="mt-6 rounded-xl" style={{ height: 128, background: 'rgba(255,255,255,0.03)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
