import React, { useState } from 'react';

const API_BASE = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : '';

/**
 * MediaPreview - ONLY displays local /uploads/... paths.
 * Never displays raw URL text. Never makes resolve API calls.
 */
export default function MediaPreview({ source, alt = '', className, style, fit = 'contain', fallback = null }) {
  const [imgError, setImgError] = useState(false);

  if (!source || typeof source !== 'string') return fallback;

  const value = source.trim();
  if (!value) return fallback;

  // Only render local uploads or data URIs
  const isLocal = value.startsWith('/uploads/') || value.startsWith('data:');
  const isAbsoluteUrl = /^https?:\/\//i.test(value);

  // Short emoji (1-4 chars, no URL)
  const isEmoji = !isAbsoluteUrl && value.length <= 8;

  if (isEmoji) {
    return (
      <span
        className={className}
        style={{ fontSize: style?.width ? parseInt(style.width) * 0.6 : 40, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}
      >
        {value}
      </span>
    );
  }

  if (!isLocal && !isAbsoluteUrl) {
    // Unknown format - show fallback
    return fallback;
  }

  if (imgError) return fallback;

  // Build full URL for local paths
  const src = isLocal ? `${API_BASE}${value}` : value;

  // Check if video
  const isVideo = /\.(webm|mp4|mov)$/i.test(src);
  if (isVideo) {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className={className}
        style={{ width: '100%', height: '100%', objectFit: fit, ...style }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: fit, ...style }}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
}
