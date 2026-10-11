import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import type { DataRecord } from '../lib/model';
import { text } from '../lib/model';
import { readPhoto } from '../lib/photos';
import { supabase } from '../lib/sync';
export function usePhotoSource(record: DataRecord | undefined, scope: string, enabled = true) {
  const [state, setState] = useState({ url: '', error: '' });
  useEffect(() => {
    let cancelled = false, url = '';
    setState({ url: '', error: '' });
    if (!record || !enabled) return;
    void (async () => {
      let blob = await readPhoto(scope, record.id);
      if (!blob && supabase && record.payload.storagePath) {
        const { data, error } = await supabase.storage.from('progress-photos').download(text(record.payload.storagePath));
        if (error) throw error; blob = data;
      }
      if (cancelled) return;
      if (!blob) throw new Error('Fotka není na tomto zařízení dostupná.');
      url = URL.createObjectURL(blob); setState({ url, error: '' });
    })().catch((error: Error) => { if (!cancelled) setState({ url: '', error: error.message }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [scope, record?.id, record?.payload.storagePath, enabled]);
  return state;
}
export function Photo({ record, scope, onClick, label }: { record?: DataRecord; scope: string; onClick?: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null), [visible,setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); } },{rootMargin:'150px'});
    if (ref.current) observer.observe(ref.current); return () => observer.disconnect();
  },[]);
  const { url, error } = usePhotoSource(record, scope, visible);
  const content = url ? <img src={url} alt={text(record?.payload.caption) || 'Fotka progresu'} loading="lazy"/> : <span><Camera size={25}/>{record ? error || 'Načítám…' : 'Tahle pozice chybí'}</span>;
  return <div ref={ref} className="photo-load-frame">{onClick ? <button className="progress-photo" onClick={onClick} aria-label={label || 'Otevřít fotku'}>{content}</button> : <div className="progress-photo">{content}</div>}</div>;
}
