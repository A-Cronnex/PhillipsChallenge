import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

export interface ResponseDelivery { turnIndex: number; text: string }

/** Reveal validated, persisted Spanish text. Never expose the model's working JSON. */
export function useResponseDelivery() {
  const [delivery, setDelivery] = useState<ResponseDelivery | null>(null);
  const reducedMotion = useRef(true);
  const mounted = useRef(true);
  const frame = useRef<number | null>(null);
  const finish = useRef<(() => void) | null>(null);
  const complete = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (mounted.current) setDelivery(null);
    finish.current?.(); finish.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { reducedMotion.current = value; }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      reducedMotion.current = value;
      if (value) complete();
    });
    const app = AppState.addEventListener('change', state => { if (state !== 'active') complete(); });
    return () => { mounted.current = false; motion.remove(); app.remove(); complete(); };
  }, [complete]);

  async function reveal(turnIndex: number, text: string, persist: () => Promise<void>) {
    complete();
    if (mounted.current) setDelivery({ turnIndex, text: '' });
    try { await persist(); } catch (error) { complete(); throw error; }
    if (!mounted.current || reducedMotion.current || AppState.currentState === 'background') { complete(); return; }
    // Array.from preserves surrogate pairs. Timing controls presentation only:
    // the complete response has already passed domain validation and been saved.
    const characters = Array.from(text);
    if (!characters.length) { complete(); return; }
    await new Promise<void>(resolve => {
      finish.current = resolve;
      let index = 0;
      let previous = -Infinity;
      let visible = '';
      function next(timestamp: number) {
        if (timestamp - previous >= 22) {
          visible += characters[index++];
          setDelivery({ turnIndex, text: visible });
          previous = timestamp;
        }
        if (index >= characters.length) complete();
        else frame.current = requestAnimationFrame(next);
      }
      frame.current = requestAnimationFrame(next);
    });
  }
  return { delivery, reveal, complete };
}
