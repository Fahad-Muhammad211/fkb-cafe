"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { HERO_SLIDES, type HeroSlide } from "@/data/hero";
import { HERO_IMAGES } from "@/data/assets";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 4000;
const TRANSITION_MS = 700;
const SWIPE_THRESHOLD_PX = 40;

interface HeroProps {
  slides?: HeroSlide[];
}

export function Hero({ slides = HERO_SLIDES }: HeroProps) {
  const count = slides.length;
  const looping = count > 1;

  // The track is [last clone, ...slides, first clone] so the loop always moves in the same
  // direction. `pos` indexes the track: 1..count are real slides, 0 and count + 1 are clones.
  const track = looping ? [slides[count - 1], ...slides, slides[0]] : slides;
  const [pos, setPos] = useState(looping ? 1 : 0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const moving = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const touchStartX = useRef<number | null>(null);

  const index = looping ? (pos - 1 + count) % count : 0;

  // After landing on a clone, jump to the matching real slide with the transition off.
  const settle = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    moving.current = false;
    setPos((p) => {
      if (p === 0 || p === count + 1) {
        setAnimate(false);
        return p === 0 ? count : 1;
      }
      return p;
    });
  }, [count]);

  const moveTo = useCallback(
    (target: number) => {
      if (!looping || moving.current) return;
      moving.current = true;
      setAnimate(true);
      setPos(target);
      // Fallback in case transitionend never fires (reduced motion, background tab).
      settleTimer.current = window.setTimeout(settle, TRANSITION_MS + 50);
    },
    [looping, settle],
  );

  const next = useCallback(() => moveTo(pos + 1), [moveTo, pos]);
  const prev = useCallback(() => moveTo(pos - 1), [moveTo, pos]);

  // Turn the transition back on once the instant jump has been painted.
  useEffect(() => {
    if (animate) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [animate]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Autoplay, paused on hover/focus and disabled for reduced-motion users.
  useEffect(() => {
    if (paused || !looping) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(next, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, looping, next]);

  const onSwipeEnd = (x: number) => {
    if (touchStartX.current === null) return;
    const dx = x - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) next();
    else prev();
  };

  return (
    <section
      aria-label="Promotions"
      aria-roledescription="carousel"
      className="mx-auto w-full max-w-[1318px] px-3 pt-1.5 md:px-6 md:pt-[17px] xl:px-0"
    >
      <div
        className="group relative aspect-[2.65/1] w-full overflow-hidden rounded-[20px] bg-zinc-800 shadow-[0_4px_20px_rgba(0,0,0,0.08)] md:aspect-[3.35/1] md:rounded-[24px]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0].clientX)}
      >
        <div
          className={cn("flex h-full ease-in-out motion-reduce:transition-none", animate && "transition-transform")}
          style={{ transform: `translateX(-${pos * 100}%)`, transitionDuration: `${TRANSITION_MS}ms` }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget) settle();
          }}
        >
          {track.map((slide, t) => {
            const isClone = looping && (t === 0 || t === count + 1);
            const i = looping ? (t - 1 + count) % count : t;
            const active = !isClone && i === index;
            const image = slide.image ?? HERO_IMAGES[slide.id];
            return (
              <div
                key={isClone ? `clone-${t}` : slide.id}
                role={isClone ? undefined : "group"}
                aria-roledescription={isClone ? undefined : "slide"}
                aria-label={isClone ? undefined : `${i + 1} of ${count}: ${slide.label}`}
                aria-hidden={!active}
                className={cn("relative h-full w-full shrink-0 bg-gradient-to-br", slide.gradient)}
              >
                {image && (
                  // The slide image fills the whole hero area. The artwork is the only content.
                  <Image
                    src={image}
                    alt={slide.label}
                    fill
                    priority={!isClone && i === 0}
                    // Loop copies are shown mid-transition, so load them up front to avoid a blank flash.
                    loading={isClone ? "eager" : undefined}
                    quality={90}
                    sizes="(min-width: 1318px) 1318px, 100vw"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            );
          })}
        </div>

        {looping && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-md transition-all duration-200 hover:scale-110 active:scale-95 md:left-4 md:h-[50px] md:w-[50px] md:bg-white"
            >
              <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-md transition-all duration-200 hover:scale-110 active:scale-95 md:right-4 md:h-[50px] md:w-[50px] md:bg-white"
            >
              <ChevronRight className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
            </button>

            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 md:bottom-3">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => i !== index && moveTo(i + 1)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={cn(
                    "h-2 rounded-full bg-white transition-all duration-300",
                    i === index ? "w-8" : "w-2 opacity-60 hover:opacity-100",
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
