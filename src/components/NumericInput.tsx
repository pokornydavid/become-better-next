import { useEffect, useRef, useState } from 'react';
import type { Value } from '../lib/model';

export function NumericInput({ value, onCommit, label, min = 0, max, step = 1, className = '' }: { value: Value | undefined; onCommit: (n: number | null) => void; label: string; min?: number; max?: number; step?: number; className?: string }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  const changed = useRef(false);
  useEffect(() => { if (!focused) setDraft(value == null ? '' : String(value)); }, [value, focused]);
  const valid = (n: number) => Number.isFinite(n) && n >= min && (max === undefined || n <= max);
  return <input aria-label={label} className={className} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft}
    onFocus={() => { changed.current = false; setFocused(true); }}
    onChange={e => {
      const input = e.currentTarget;
      changed.current = true;
      setDraft(input.value);
      // Persist valid numbers before the phone can suspend the app. A temporary
      // empty/invalid draft while replacing a value must not erase a saved load.
      if (input.value !== '' && valid(input.valueAsNumber) && input.valueAsNumber !== value) onCommit(input.valueAsNumber);
    }}
    onBlur={e => {
      setFocused(false);
      const n = draft === '' && !e.currentTarget.validity.badInput ? null : Number(draft);
      if (e.currentTarget.validity.badInput || (n !== null && !valid(n))) { setDraft(value == null ? '' : String(value)); return; }
      // Valid numbers were already saved in onChange. Merely focusing an old
      // value must never write it over a newer value received from the phone.
      if (changed.current && n === null && n !== value) onCommit(n);
    }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}
