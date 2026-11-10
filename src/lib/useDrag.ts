import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Lets a floating panel be dragged by its header. Returns the offset to apply as a transform and
 * the handler for the header. Double-click the header to snap back. Disabled on phone widths.
 * The offset is remembered per panel key for this browser.
 */
export function useDrag(key: string) {
  const [offset, setOffset] = useState<{ x: number; y: number }>(() => {
    try { return JSON.parse(localStorage.getItem('drag-' + key) || '') || { x: 0, y: 0 }; } catch { return { x: 0, y: 0 }; }
  });
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  useEffect(() => { try { localStorage.setItem('drag-' + key, JSON.stringify(offset)); } catch { /* storage unavailable */ } }, [key, offset]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (window.innerWidth < 760 || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, summary')) return;
    start.current = { px: e.clientX, py: e.clientY, x: offset.x, y: offset.y };
    const move = (ev: PointerEvent) => {
      const s = start.current; if (!s) return;
      // Keep at least part of the panel on screen.
      const x = Math.max(-window.innerWidth + 120, Math.min(window.innerWidth - 120, s.x + ev.clientX - s.px));
      const y = Math.max(-40, Math.min(window.innerHeight - 160, s.y + ev.clientY - s.py));
      setOffset({ x, y });
    };
    const up = () => { start.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.classList.add('dragging');
    e.preventDefault();
  }, [offset]);

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), []);
  const style = window.innerWidth < 760 ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px)` };
  return { style, handle: { onPointerDown, onDoubleClick: reset, title: 'Drag to move · double-click to reset' } };
}
