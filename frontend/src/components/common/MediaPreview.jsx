import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

function isDirectMediaUrl(source) {
  return /^https?:\/\//i.test(String(source || '')) || /^data:/i.test(String(source || ''));
}

function needsResolution(source) {
  const value = String(source || '').trim();
  if (!value) return false;
  if (/^https?:\/\/(?:t\.me|telegram\.me)\//i.test(value)) return true;
  if (isDirectMediaUrl(value)) return false;
  if (/[\s<>]/.test(value)) return false;
  if (/^[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u.test(value)) return false;
  return value.length >= 20;
}

function guessKind(url) {
  const value = String(url || '').toLowerCase();
  if (value.endsWith('.webm') || value.endsWith('.mp4') || value.endsWith('.mov')) return 'video';
  if (value.endsWith('.gif')) return 'gif';
  return 'image';
}

export default function MediaPreview({ source, alt = '', className, style, fit = 'contain', fallback = null }) {
  const [resolved, setResolved] = useState({ url: null, kind: 'image' });
  const [loading, setLoading] = useState(false);

  const direct = useMemo(() => {
    const value = String(source || '').trim();
    return value && isDirectMediaUrl(value) && !/^https?:\/\/(?:t\.me|telegram\.me)\//i.test(value)
      ? value
      : null;
  }, [source]);

  useEffect(() => {
    let mounted = true;
    const value = String(source || '').trim();

    if (!value) {
      setResolved({ url: null, kind: 'image' });
      setLoading(false);
      return;
    }

    if (direct) {
      setResolved({ url: direct, kind: guessKind(direct) });
      setLoading(false);
      return;
    }

    if (!needsResolution(value)) {
      setResolved({ url: null, kind: 'image' });
      setLoading(false);
      return;
    }

    setLoading(true);
    axios.get('/api/media/resolve', { params: { source: value }, timeout: 15000 })
      .then((r) => {
        if (!mounted) return;
        setResolved({ url: r.data?.url || null, kind: r.data?.kind || guessKind(r.data?.url) });
      })
      .catch(() => {
        if (!mounted) return;
        setResolved({ url: null, kind: 'image' });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [source, direct]);

  if (!source) return fallback;

  const url = resolved.url || direct;
  if (!url) {
    return fallback || <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', fontSize: 40 }}>{source}</div>;
  }

  if (resolved.kind === 'video') {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        className={className}
        style={{ width: '100%', height: '100%', objectFit: fit, ...style }}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: fit, ...style }}
      loading={loading ? 'eager' : 'lazy'}
    />
  );
}
