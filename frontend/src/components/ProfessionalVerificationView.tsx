import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitHubIcon,
  LinkedInIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  LockIcon,
  RefreshIcon,
  CloseIcon,
  DrivesIcon
} from './Icons';

const API = 'http://127.0.0.1:8000/api';

interface VerificationInfo {
  connected: boolean;
  provider_user_id?: string | null;
  username?: string | null;
  profile_url?: string | null;
  verified_at?: string | null;
}

interface VerificationStatusResponse {
  github: VerificationInfo;
  linkedin: VerificationInfo;
  drives_unlocked: boolean;
  missing_verifications: string[];
  config?: {
    github_configured: boolean;
    linkedin_configured: boolean;
  };
}

interface ProfessionalVerificationViewProps {
  token: string;
  onNavigateToDrives?: () => void;
  onStatusChange?: (unlocked: boolean) => void;
}

export const ProfessionalVerificationView: React.FC<ProfessionalVerificationViewProps> = ({
  token,
  onNavigateToDrives,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<VerificationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Connection pending state
  const [connectingProvider, setConnectingProvider] = useState<'github' | 'linkedin' | null>(null);

  // Disconnect confirmation modal state
  const [disconnectModal, setDisconnectModal] = useState<{
    open: boolean;
    provider: 'github' | 'linkedin' | null;
  }>({ open: false, provider: null });
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Optional manual LinkedIn vanity URL state
  const [showLinkedInUrlInput, setShowLinkedInUrlInput] = useState(false);
  const [linkedInUrlInput, setLinkedInUrlInput] = useState('');
  const [savingLinkedInUrl, setSavingLinkedInUrl] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/student/verification`, { headers });
      if (res.status === 401) {
        localStorage.removeItem('auth');
        window.location.reload();
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to load verification status');
      }
      const data: VerificationStatusResponse = await res.json();
      setStatus(data);
      if (onStatusChangeRef.current) {
        onStatusChangeRef.current(data.drives_unlocked);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to verification service.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Check URL parameters for OAuth redirect callbacks
  useEffect(() => {
    const handleUrlCallbacks = () => {
      const hash = window.location.hash;
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = hash.includes('?') ? new URLSearchParams(hash.split('?')[1]) : new URLSearchParams();

      const callbackStatus = searchParams.get('status') || hashParams.get('status');
      const provider = searchParams.get('provider') || hashParams.get('provider');
      const msg = searchParams.get('message') || hashParams.get('message');
      const username = searchParams.get('username') || hashParams.get('username');

      if (callbackStatus === 'success' && provider) {
        const providerName = provider === 'github' ? 'GitHub' : 'LinkedIn';
        const userNotice = username ? ` as @${username}` : '';
        setSuccessMsg(`Successfully connected and verified your ${providerName} account${userNotice}!`);
        // Clean up URL parameters
        window.history.replaceState({}, document.title, window.location.pathname + '#verification');
      } else if (callbackStatus === 'error') {
        setError(msg || 'Authentication callback failed. Please try connecting again.');
        window.history.replaceState({}, document.title, window.location.pathname + '#verification');
      }
    };

    handleUrlCallbacks();
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async (provider: 'github' | 'linkedin') => {
    setConnectingProvider(provider);
    setError(null);
    try {
      const res = await fetch(`${API}/student/verification/${provider}/connect`, { headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `Failed to initiate ${provider} connection.`);
      }
      if (data.authorization_url) {
        // Redirect to provider OAuth authorization page
        window.location.href = data.authorization_url;
      }
    } catch (err: any) {
      setError(err.message || `Unable to start ${provider} verification.`);
      setConnectingProvider(null);
    }
  };

  const handleConfirmDisconnect = async () => {
    const provider = disconnectModal.provider;
    if (!provider) return;

    setIsDisconnecting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/student/verification/${provider}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `Failed to disconnect ${provider}.`);
      }
      setSuccessMsg(`Your ${provider === 'github' ? 'GitHub' : 'LinkedIn'} account has been disconnected.`);
      setDisconnectModal({ open: false, provider: null });
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || `Failed to disconnect ${provider}.`);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSaveLinkedInUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkedInUrlInput.trim()) return;

    setSavingLinkedInUrl(true);
    setError(null);
    try {
      const res = await fetch(`${API}/student/verification/linkedin/profile-url`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profile_url: linkedInUrlInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update LinkedIn link.');
      setSuccessMsg('LinkedIn profile URL saved.');
      setShowLinkedInUrlInput(false);
      setLinkedInUrlInput('');
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to save LinkedIn link.');
    } finally {
      setSavingLinkedInUrl(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  if (loading && !status) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshIcon size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
        <div>Loading verification credentials...</div>
      </div>
    );
  }

  const github = status?.github;
  const linkedin = status?.linkedin;
  const drivesUnlocked = !!status?.drives_unlocked;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">
      {/* ── TOP SECTION: TITLE & CONTEXT BANNER ───────────────────────────────── */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 14,
          padding: '24px 28px',
          color: '#0F172A',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>Professional Account Verification</h2>
            {drivesUnlocked ? (
              <span
                style={{
                  background: '#F0FDF4',
                  color: '#16A34A',
                  border: '1px solid #BBF7D0',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <CheckCircleIcon size={13} color="#16A34A" /> DRIVES UNLOCKED
              </span>
            ) : (
              <span
                style={{
                  background: '#FEF2F2',
                  color: '#DC2626',
                  border: '1px solid #FECACA',
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <LockIcon size={13} color="#DC2626" /> DRIVES LOCKED
              </span>
            )}
          </div>
          <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: '0.88rem', maxWidth: 650, lineHeight: 1.5 }}>
            Verify ownership of both your <strong>GitHub</strong> (developer profile) and <strong>LinkedIn</strong> (professional profile) via secure OAuth.
            Both accounts must be connected to browse and apply for active campus placement drives.
          </p>
        </div>

        {drivesUnlocked && onNavigateToDrives && (
          <button
            onClick={onNavigateToDrives}
            style={{
              background: '#10B981',
              color: '#FFFFFF',
              border: 'none',
              padding: '12px 24px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
            }}
          >
            <DrivesIcon size={18} color="#FFFFFF" />
            <span>View Placement Drives</span>
          </button>
        )}
      </div>

      {/* ── NOTIFICATION BANNERS ────────────────────────────────────────────── */}
      {successMsg && (
        <div
          style={{
            padding: '14px 18px',
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            color: '#059669',
            borderRadius: 12,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircleIcon size={18} color="#059669" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '14px 18px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#DC2626',
            borderRadius: 12,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircleIcon size={18} color="#DC2626" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {/* ── UNLOCK PROGRESS NOTICE ───────────────────────────────────────────── */}
      {!drivesUnlocked && (
        <div
          style={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <LockIcon size={22} color="#F59E0B" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#D97706', fontSize: '0.95rem' }}>
              Placement Drive Access Is Currently Locked
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
              {status?.missing_verifications.length === 2 ? (
                <span>You must connect and verify both your GitHub and LinkedIn accounts.</span>
              ) : status?.missing_verifications.includes('github') ? (
                <span>LinkedIn is verified! Please connect your <strong>GitHub account</strong> to unlock drives.</span>
              ) : (
                <span>GitHub is verified! Please connect your <strong>LinkedIn account</strong> to unlock drives.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TWO INDEPENDENT VERIFICATION CARDS (GRID) ───────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 24,
        }}
      >
        {/* ── GITHUB VERIFICATION CARD ───────────────────────────────────────── */}
        <div
          style={{
            background: 'var(--card-bg, #FFFFFF)',
            border: `1.5px solid ${github?.connected ? 'rgba(34,197,94,0.3)' : 'var(--border-color, rgba(0,0,0,0.08))'}`,
            borderRadius: 16,
            padding: 26,
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 20,
            position: 'relative',
          }}
        >
          <div>
            {/* Header: Icon, Title & Status Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: '#24292F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    boxShadow: '0 4px 10px rgba(36,41,47,0.25)',
                  }}
                >
                  <GitHubIcon size={26} color="#FFFFFF" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    GitHub Account
                  </h3>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>
                    Developer Ownership Verification
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              {connectingProvider === 'github' ? (
                <span
                  style={{
                    background: 'rgba(59,130,246,0.1)',
                    color: '#2563EB',
                    border: '1px solid rgba(59,130,246,0.3)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  Connecting...
                </span>
              ) : github?.connected ? (
                <span
                  style={{
                    background: 'rgba(34,197,94,0.1)',
                    color: '#15803D',
                    border: '1px solid rgba(34,197,94,0.3)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <CheckCircleIcon size={12} color="#15803D" /> Connected
                </span>
              ) : (
                <span
                  style={{
                    background: 'rgba(156,163,175,0.1)',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(156,163,175,0.3)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  Not Connected
                </span>
              )}
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 16px 0' }}>
              Connect your GitHub account to verify ownership of your developer profile. This authenticates your technical identity for placement evaluation.
            </p>

            {/* Connected Details Box */}
            {github?.connected && (
              <div
                style={{
                  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.06))',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GitHub Username:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>@{github.username}</strong>
                </div>
                {github.profile_url && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Profile Link:</span>
                    <a
                      href={github.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#2563EB',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 600,
                      }}
                    >
                      <span>github.com/{github.username}</span>
                      <ExternalLinkIcon size={13} color="#2563EB" />
                    </a>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Verified On:</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                    {formatDate(github.verified_at)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 8 }}>
            {!github?.connected ? (
              <button
                onClick={() => handleConnect('github')}
                disabled={connectingProvider === 'github'}
                style={{
                  background: '#24292F',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 22px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: connectingProvider === 'github' ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 2px 8px rgba(36,41,47,0.2)',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                <GitHubIcon size={18} color="#FFFFFF" />
                <span>{connectingProvider === 'github' ? 'Opening GitHub...' : 'Connect GitHub'}</span>
              </button>
            ) : (
              <>
                {github.profile_url && (
                  <a
                    href={github.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'rgba(37,99,235,0.1)',
                      color: '#2563EB',
                      border: '1px solid rgba(37,99,235,0.3)',
                      padding: '10px 18px',
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>View Profile</span>
                    <ExternalLinkIcon size={14} color="#2563EB" />
                  </a>
                )}
                <button
                  onClick={() => setDisconnectModal({ open: true, provider: 'github' })}
                  style={{
                    background: 'transparent',
                    color: '#DC2626',
                    border: '1px solid rgba(239,68,68,0.3)',
                    padding: '10px 16px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── LINKEDIN VERIFICATION CARD ─────────────────────────────────────── */}
        <div
          style={{
            background: 'var(--card-bg, #FFFFFF)',
            border: `1.5px solid ${linkedin?.connected ? 'rgba(34,197,94,0.3)' : 'var(--border-color, rgba(0,0,0,0.08))'}`,
            borderRadius: 16,
            padding: 26,
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 20,
            position: 'relative',
          }}
        >
          <div>
            {/* Header: Icon, Title & Status Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: '#0A66C2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    boxShadow: '0 4px 10px rgba(10,102,194,0.25)',
                  }}
                >
                  <LinkedInIcon size={26} color="#FFFFFF" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    LinkedIn Account
                  </h3>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>
                    Professional Identity Verification
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              {connectingProvider === 'linkedin' ? (
                <span
                  style={{
                    background: 'rgba(59,130,246,0.1)',
                    color: '#2563EB',
                    border: '1px solid rgba(59,130,246,0.3)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  Connecting...
                </span>
              ) : linkedin?.connected ? (
                <span
                  style={{
                    background: 'rgba(34,197,94,0.1)',
                    color: '#15803D',
                    border: '1px solid rgba(34,197,94,0.3)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <CheckCircleIcon size={12} color="#15803D" /> Connected
                </span>
              ) : (
                <span
                  style={{
                    background: 'rgba(156,163,175,0.1)',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(156,163,175,0.3)',
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  Not Connected
                </span>
              )}
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 16px 0' }}>
              Connect your LinkedIn account to verify ownership of your professional profile. Verified through official LinkedIn OpenID Connect credentials.
            </p>

            {/* Connected Details Box */}
            {linkedin?.connected && (
              <div
                style={{
                  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.06))',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Member Status:</span>
                  <span style={{ color: '#15803D', fontWeight: 700 }}>✓ OIDC Verified</span>
                </div>
                {linkedin.profile_url ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Profile Link:</span>
                    <a
                      href={linkedin.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#0A66C2',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 600,
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span>{linkedin.profile_url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                      <ExternalLinkIcon size={13} color="#0A66C2" />
                    </a>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Public Profile URL:</span>
                    <button
                      onClick={() => setShowLinkedInUrlInput(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0A66C2',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      + Add Public Link
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Verified On:</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                    {formatDate(linkedin.verified_at)}
                  </span>
                </div>
              </div>
            )}

            {/* Optional Vanity URL Input form */}
            {showLinkedInUrlInput && (
              <form onSubmit={handleSaveLinkedInUrl} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  placeholder="https://linkedin.com/in/username"
                  value={linkedInUrlInput}
                  onChange={(e) => setLinkedInUrlInput(e.target.value)}
                  required
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
                <button
                  type="submit"
                  disabled={savingLinkedInUrl}
                  style={{
                    background: '#0A66C2',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  {savingLinkedInUrl ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLinkedInUrlInput(false)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 8 }}>
            {!linkedin?.connected ? (
              <button
                onClick={() => handleConnect('linkedin')}
                disabled={connectingProvider === 'linkedin'}
                style={{
                  background: '#0A66C2',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 22px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: connectingProvider === 'linkedin' ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 2px 8px rgba(10,102,194,0.25)',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                <LinkedInIcon size={18} color="#FFFFFF" />
                <span>{connectingProvider === 'linkedin' ? 'Opening LinkedIn...' : 'Connect LinkedIn'}</span>
              </button>
            ) : (
              <>
                {linkedin.profile_url && (
                  <a
                    href={linkedin.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'rgba(10,102,194,0.1)',
                      color: '#0A66C2',
                      border: '1px solid rgba(10,102,194,0.3)',
                      padding: '10px 18px',
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>View Profile</span>
                    <ExternalLinkIcon size={14} color="#0A66C2" />
                  </a>
                )}
                <button
                  onClick={() => setDisconnectModal({ open: true, provider: 'linkedin' })}
                  style={{
                    background: 'transparent',
                    color: '#DC2626',
                    border: '1px solid rgba(239,68,68,0.3)',
                    padding: '10px 16px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── DISCONNECT CONFIRMATION MODAL ────────────────────────────────────── */}
      {disconnectModal.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color)',
              borderRadius: 16,
              maxWidth: 440,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: 'rgba(239,68,68,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626',
                }}
              >
                <AlertCircleIcon size={22} color="#DC2626" />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Disconnect {disconnectModal.provider === 'github' ? 'GitHub' : 'LinkedIn'} Account?
              </h3>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Disconnecting this account will remove your verified ownership status.
              <strong style={{ display: 'block', color: '#DC2626', marginTop: 8 }}>
                ⚠ Warning: Your Placement Drive access will be locked until both accounts are verified again.
              </strong>
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setDisconnectModal({ open: false, provider: null })}
                disabled={isDisconnecting}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '9px 16px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDisconnect}
                disabled={isDisconnecting}
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: isDisconnecting ? 'wait' : 'pointer',
                }}
              >
                {isDisconnecting ? 'Disconnecting...' : 'Yes, Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
