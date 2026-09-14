import React, { useState } from 'react';

export function formatPhotoUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  const clean = rawUrl.trim();
  
  // Extract Google Drive File ID
  const driveMatch = clean.match(/(?:drive\.google\.com\/(?:open\?id=|file\/d\/|uc\?(?:export=download&)?id=)|docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/)([a-zA-Z0-9_-]+)/i);
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }
  
  return clean;
}

interface StudentAvatarProps {
  photoUrl?: string | null;
  name: string;
  size?: number;
  fontSize?: string;
  borderRadius?: string | number;
  border?: string;
  style?: React.CSSProperties;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  photoUrl,
  name,
  size = 44,
  fontSize = '0.95rem',
  borderRadius = '50%',
  border,
  style,
}) => {
  const [imgError, setImgError] = useState(false);
  const formattedUrl = formatPhotoUrl(photoUrl);

  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'ST';

  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: borderRadius,
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: fontSize,
        border: border || 'none',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        ...style,
      }}
    >
      {formattedUrl && !imgError ? (
        <img
          src={formattedUrl}
          alt={name}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
          loading="lazy"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};
