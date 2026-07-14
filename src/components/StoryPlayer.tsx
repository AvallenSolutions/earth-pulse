"use client";
import type { Story } from "@/lib/stories";

export function StoryPlayer({
  story,
  step,
  playing,
  onPrev,
  onNext,
  onTogglePlay,
  onClose,
}: {
  story: Story;
  step: number;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onClose: () => void;
}) {
  const isFirst = step === 0;
  const isLast = step === story.steps.length - 1;

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[9.5rem] z-20 flex justify-center">
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#161615]/96 p-4 shadow-2xl backdrop-blur-sm">
        {/* Story label + close */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6da7ec]">
            {story.title}
          </div>
          <button
            onClick={onClose}
            aria-label="Close story"
            className="ml-auto shrink-0 rounded-full p-1 text-[#898781] transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M1.5 1.5l9 9M10.5 1.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Caption */}
        <p className="min-h-[3.25rem] text-sm leading-relaxed text-[#c3c2b7]">
          {story.steps[step].caption}
        </p>

        {/* Progress dots + controls */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {story.steps.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === step ? "h-1.5 w-4 bg-white" : "h-1.5 w-1.5 bg-white/25"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={onPrev}
              disabled={isFirst}
              aria-label="Previous step"
              className="rounded-full p-1.5 text-[#898781] transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M9 11L5 7l4-4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={onTogglePlay}
              aria-label={playing ? "Pause" : "Play story"}
              className="mx-0.5 rounded-full border border-white/20 bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
              {playing ? (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden="true">
                  <rect x="1.5" y="1" width="3" height="9" rx="0.75" />
                  <rect x="6.5" y="1" width="3" height="9" rx="0.75" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden="true">
                  <path d="M2.25 1.5l7.5 4-7.5 4V1.5z" />
                </svg>
              )}
            </button>
            <button
              onClick={onNext}
              disabled={isLast}
              aria-label="Next step"
              className="rounded-full p-1.5 text-[#898781] transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M5 3l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
