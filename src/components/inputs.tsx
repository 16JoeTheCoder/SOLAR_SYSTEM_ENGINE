// src/components/inputs.tsx
import { useState, useEffect } from 'react';
import { InfoTip } from './InfoTip';

export function NumField({ label, unit, value, min, max, step = 1, info, onChange }: {
  label: string; unit: string; value: number;
  min: number; max: number; step?: number; info?: string;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const p = parseFloat(text);
    if (Number.isFinite(p)) onChange(Math.min(max, Math.max(min, p)));
    else setText(String(value));
  };
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-xs text-zinc-400 font-medium">{label}{info && <InfoTip id={info} />}</span>
      <div className="flex items-center gap-1">
        <input type="number" value={text} min={min} max={max} step={step}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className="w-24 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-emerald-400 text-right focus:outline-none focus:border-emerald-500" />
        <span className="text-xs text-zinc-500 w-10">{unit}</span>
      </div>
    </div>
  );
}

export function Slider({ label, unit, value, min, max, step, info, onChange }: {
  label: string; unit: string; value: number;
  min: number; max: number; step: number; info?: string;
  onChange: (v: number) => void;
}) {
  const decimals = step < 1 ? (step < 0.01 ? 3 : 2) : 0;
  const [text, setText] = useState(value.toFixed(decimals));
  useEffect(() => { setText(value.toFixed(decimals)); }, [value, decimals]);
  const commit = () => {
    const p = parseFloat(text);
    if (Number.isFinite(p)) onChange(Math.min(max, Math.max(min, p)));
    else setText(value.toFixed(decimals));
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs text-zinc-400 font-medium">{label}{info && <InfoTip id={info} />}</span>
        <div className="flex items-center gap-1">
          <input type="number" value={text} min={min} max={max} step={step}
            onChange={(e) => setText(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
            className="w-20 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-emerald-400 text-right focus:outline-none focus:border-emerald-500" />
          <span className="text-xs text-zinc-500 w-8">{unit}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
    </div>
  );
}

export function Metric({ label, value, unit, accent = 'text-white' }: {
  label: string; value: string; unit: string; accent?: string;
}) {
  return (
    <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/50">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-xl font-mono font-semibold ${accent}`}>
        {value}<span className="text-xs text-zinc-500 ml-1">{unit}</span>
      </div>
    </div>
  );
}