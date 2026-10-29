import { getSafeUrl } from '../utils/safeUrl';
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  DrivesIcon,
  CalendarIcon,
  CheckIcon,
  AlertIcon,
  RefreshIcon,
  SparklesIcon,
  LockIcon,
  GitHubIcon,
  LinkedInIcon,
} from '../components/Icons';
import { StudentAiMatchModal } from '../components/StudentAiMatchModal';

const API = 'http://127.0.0.1:8000/api';

interface StudentDrivesProps {
  token: string;
  activeTab?: string;
  onNavigateToVerification?: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  Applied:     { bg: 'rgba(59,130,246,0.15)',  color: '#60A5FA', label: 'Applied' },
  Shortlisted: { bg: 'rgba(245,158,11,0.15)',  color: '#FBBF24', label: 'Shortlisted' },
  Selected:    { bg: 'rgba(16,185,129,0.2)',   color: '#10B981', label: '✓ Selected' },
  Placed:      { bg: 'rgba(16,185,129,0.15)',  color: '#34D399', label: 'Placed!' },
  Rejected:    { bg: 'rgba(239,68,68,0.12)',   color: '#F87171', label: 'Rejected' },
  Cancelled:   { bg: 'rgba(239,68,68,0.18)',   color: '#F87171', label: '✕ Cancelled' },
  'On-Hold':   { bg: 'rgba(156,163,175,0.1)',  color: '#6B7280', label: 'On-Hold' },
};

function getDeadlineInfo(deadline: string): { text: string; color: string; expired: boolean; urgent: boolean } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: 'CLOSED', color: '#F87171', expired: true, urgent: false };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days === 0) return { text: `${hours}h left`, color: '#F87171', expired: false, urgent: true };
  if (days <= 2) return { text: `${days}d left`, color: '#FBBF24', expired: false, urgent: true };
  return { text: `${days} days left`, color: '#34D399', expired: false, urgent: false };
}

export const StudentDrives: React.FC<StudentDrivesProps> = ({ token, activeTab, onNavigateToVerification }) => {
  const [drives, setDrives] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tab, setTab] = useState<'feed' | 'track' | 'events'>('feed');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [aiMatchDrive, setAiMatchDrive] = useState<any | null>(null);

  // Professional Account Verification Lock State
  const [isVerificationLocked, setIsVerificationLocked] = useState(false);
  const [verificationData, setVerificationData] = useState<{
    github_connected: boolean;
    linkedin_connected: boolean;
    missing_verifications: string[];
  }>({
    github_connected: false,
    linkedin_connected: false,
    missing_verifications: ['github', 'linkedin'],
  });

  useEffect(() => {
    if (activeTab === 'events') setTab('events');
    else if (activeTab === 'drives') setTab('feed');
  }, [activeTab]);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, trackRes, eventsRes, verifRes] = await Promise.all([
        fetch(`${API}/drives/student-feed`, { headers }),
        fetch(`${API}/drives/applications/track`, { headers }),
        fetch(`${API}/students/events`, { headers }),
        fetch(`${API}/student/verification/drive-access`, { headers }),
      ]);

      if (verifRes.ok) {
        const v = await verifRes.json();
        setIsVerificationLocked(!v.access_granted);
        setVerificationData(v);
      }

      if (feedRes.status === 403) {
        try {
          const errData = await feedRes.json();
          if (errData.detail?.code === 'PROFESSIONAL_VERIFICATION_REQUIRED') {
            setIsVerificationLocked(true);
            if (errData.detail.missing_verifications) {
              setVerificationData((prev) => ({
                ...prev,
                missing_verifications: errData.detail.missing_verifications,
                github_connected: !errData.detail.missing_verifications.includes('github'),
                linkedin_connected: !errData.detail.missing_verifications.includes('linkedin'),
              }));
            }
          }
        } catch { }
      } else if (feedRes.ok) {
        setDrives(await feedRes.json());
        setIsVerificationLocked(false);
      }

      if (trackRes.ok) setApplications(await trackRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch {
      setError('Failed to load drives & events. Please check connection.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 4500);
  };

  const [previewData, setPreviewData] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedDriveForApply, setSelectedDriveForApply] = useState<any | null>(null);

  const openApplyPreview = async (drive: any) => {
    setSelectedDriveForApply(drive);
    setLoadingPreview(true);
    try {
      const res = await fetch(`${API}/drives/${drive.id}/application-preview`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      } else {
        setPreviewData(null);
      }
    } catch {
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const apply = async (driveId: string) => {
    setActionId(driveId);
    try {
      const res = await fetch(`${API}/drives/${driveId}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Application failed.');
      showMsg('Application submitted successfully with verified profile snapshot!');
      setDrives(prev => prev.map(d => d.id === driveId ? { ...d, applied: true, application_status: 'Applied' } : d));
      setSelectedDriveForApply(null);
      setPreviewData(null);
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setActionId(null);
    }
  };

  const activeCount = drives.filter(d => !getDeadlineInfo(d.drive_deadline).expired).length;
  const appliedCount = drives.filter(d => d.applied).length;

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Placement & Opportunities Hub</h1>
          <p style={styles.subtitle}>Explore eligible placement drives, track application progress, and attend targeted seminars.</p>
        </div>
        <button onClick={load} style={styles.refreshBtn}>
          <RefreshIcon size={16} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <DrivesIcon size={24} color="#3B82F6" />
          <span style={styles.statVal}>{activeCount}</span>
          <span style={styles.statLbl}>Active Drives</span>
        </div>
        <div style={styles.statCard}>
          <CheckIcon size={24} color="#10B981" />
          <span style={styles.statVal}>{appliedCount}</span>
          <span style={styles.statLbl}>Applications Submitted</span>
        </div>
        <div style={styles.statCard}>
          <CalendarIcon size={24} color="#F59E0B" />
          <span style={styles.statVal}>{events.length}</span>
          <span style={styles.statLbl}>Targeted Seminars</span>
        </div>
      </div>

      {/* Toast Feedback */}
      {error && <div style={styles.toastErr}><AlertIcon size={18} /> {error}</div>}
      {success && <div style={styles.toastOk}><CheckIcon size={18} /> {success}</div>}

      {/* LOADING */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid #3B82F6', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto' }} />
        </div>
      )}

      {/* DRIVE FEED (LOCKED OR UNLOCKED) */}
      {!loading && tab === 'feed' && (
        isVerificationLocked ? (
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1.5px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 20,
              padding: '48px 32px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
              maxWidth: 720,
              margin: '20px auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
            }}
            className="animate-fade-in"
          >
            {/* Lock Badge */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.2)',
              }}
            >
              <LockIcon size={36} color="#DC2626" />
            </div>

            <div>
              <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Placement Drives Locked
              </h2>
              <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 520, lineHeight: 1.6 }}>
                Connect and verify your GitHub and LinkedIn accounts to unlock placement opportunities.
              </p>
            </div>

            {/* Status cards preview */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
                width: '100%',
                maxWidth: 520,
                marginTop: 8,
              }}
            >
              {/* GitHub Card */}
              <div
                style={{
                  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                  border: `1.5px solid ${verificationData.github_connected ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 12,
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#24292F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  <GitHubIcon size={20} color="#fff" />
                </div>
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>GitHub</div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: verificationData.github_connected ? '#15803D' : '#DC2626',
                    }}
                  >
                    {verificationData.github_connected ? '✓ Connected' : '✕ Not Connected'}
                  </div>
                </div>
              </div>

              {/* LinkedIn Card */}
              <div
                style={{
                  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                  border: `1.5px solid ${verificationData.linkedin_connected ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 12,
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: '#0A66C2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  <LinkedInIcon size={20} color="#fff" />
                </div>
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>LinkedIn</div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: verificationData.linkedin_connected ? '#15803D' : '#DC2626',
                    }}
                  >
                    {verificationData.linkedin_connected ? '✓ Connected' : '✕ Not Connected'}
                  </div>
                </div>
              </div>
            </div>

            {/* Context Notice */}
            <div style={{ fontSize: '0.85rem', color: '#B45309', background: 'rgba(245,158,11,0.1)', padding: '8px 16px', borderRadius: 8 }}>
              {verificationData.missing_verifications.length === 2
                ? 'Both accounts are currently unverified.'
                : verificationData.missing_verifications.includes('github')
                ? 'LinkedIn verified! Only GitHub verification remains.'
                : 'GitHub verified! Only LinkedIn verification remains.'}
            </div>

            {/* Call to action */}
            <button
              onClick={() => {
                if (onNavigateToVerification) {
                  onNavigateToVerification();
                } else {
                  window.location.hash = 'verification';
                }
              }}
              style={{
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                padding: '13px 32px',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                transition: 'transform 0.15s ease',
              }}
            >
              <span>Verify Accounts →</span>
            </button>
          </div>
        ) : drives.length === 0 ? (
          <div style={styles.emptyCard}>
            <DrivesIcon size={40} color="var(--text-secondary)" />
            <p style={{ margin: '12px 0 0 0', fontWeight: 600, color: 'var(--text-primary)' }}>No eligible placement drives available right now.</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Check back soon as TPO publishes new campus hiring events.</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {drives.map(d => {
              const dl = getDeadlineInfo(d.drive_deadline);
              return (
                <div key={d.id} style={{ ...styles.card, opacity: dl.expired ? 0.7 : 1 }}>
                  <div style={styles.cardHeader}>
                    <div style={styles.avatar}>{d.company_name.charAt(0)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={styles.company}>{d.company_name}</div>
                      <div style={styles.role}>{d.job_role}</div>
                    </div>
                    <span style={{ ...styles.dlBadge, color: dl.color, background: `${dl.color}15` }}>
                      {dl.text}
                    </span>
                  </div>

                  <div style={styles.metaGrid}>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLbl}>Package</span>
                      <span style={{ fontWeight: 800, color: '#10B981', fontSize: '0.95rem' }}>{d.package}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLbl}>Location</span>
                      <span style={styles.metaVal}>{d.location}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLbl}>Mode</span>
                      <span style={styles.metaVal}>{d.mode}</span>
                    </div>
                  </div>

                  <div style={styles.cardFooter}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Deadline: {new Date(d.drive_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>

                    {d.applied ? (
                      <span style={styles.appliedPill}>
                        <CheckIcon size={14} /> Applied ({d.application_status || 'Applied'})
                      </span>
                    ) : dl.expired ? (
                      <button disabled style={styles.closedBtn}>Deadline Closed</button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {d.external_apply_link && (
                          <a href={getSafeUrl(d.external_apply_link) || "#"} target="_blank" rel="noreferrer" style={styles.extLink}>
                            External Link
                          </a>
                        )}
                        <button
                          onClick={() => setAiMatchDrive(d)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#EFF6FF',
                            color: '#2563EB',
                            border: '1px solid #BFDBFE',
                            padding: '7px 12px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <SparklesIcon size={14} color="#2563EB" /> AI Match ⚡
                        </button>
                        <button
                          onClick={() => openApplyPreview(d)}
                          disabled={actionId === d.id}
                          style={styles.applyBtn}
                        >
                          Review & Apply →
                        </button>
                      </div>

                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* TRACK APPLICATIONS */}
      {!loading && tab === 'track' && (
        applications.length === 0 ? (
          <div style={styles.emptyCard}>
            <CheckIcon size={40} color="var(--text-secondary)" />
            <p style={{ margin: '12px 0 0 0', fontWeight: 600, color: 'var(--text-primary)' }}>You haven't applied for any placement drives yet.</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {applications.map(app => {
              const st = STATUS_STYLES[app.status] || STATUS_STYLES['Applied'];
              const isCancelled = app.status === 'Cancelled';
              const isSelected = app.status === 'Selected';
              return (
                <div key={app.application_id} style={{ ...styles.card, opacity: isCancelled ? 0.75 : 1, border: isSelected ? '1px solid rgba(16,185,129,0.4)' : styles.card.border }}>
                  <div style={styles.cardHeader}>
                    <div style={{ ...styles.avatar, background: isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.15)', color: isSelected ? '#10B981' : '#3B82F6' }}>{app.company_name ? app.company_name.charAt(0) : 'C'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={styles.company}>{app.company_name}</div>
                      <div style={styles.role}>{app.job_role}</div>
                    </div>
                    <span style={{ ...styles.dlBadge, background: st.bg, color: st.color, fontWeight: 700 }}>
                      {st.label}
                    </span>
                  </div>

                  <div style={styles.metaGrid}>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLbl}>Package</span>
                      <span style={{ fontWeight: 800, color: '#10B981' }}>{app.package}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLbl}>Applied Date</span>
                      <span style={styles.metaVal}>{new Date(app.applied_at).toLocaleDateString()}</span>
                    </div>
                    {app.status_updated_at && (
                      <div style={styles.metaItem}>
                        <span style={styles.metaLbl}>Last Updated</span>
                        <span style={styles.metaVal}>{new Date(app.status_updated_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {(isSelected || isCancelled) && (
                    <div style={{ padding: '8px 10px', borderRadius: 8, background: isSelected ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.06)', border: `1px solid ${isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)'}`, fontSize: '0.8rem', color: isSelected ? '#10B981' : '#F87171', fontWeight: 600 }}>
                      {isSelected ? '✓ You have been selected for this role. Congratulations!' : '✕ Your selection was cancelled for this drive.'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* TARGETED SEMINARS & EVENTS TAB */}
      {!loading && tab === 'events' && (
        events.length === 0 ? (
          <div style={styles.emptyCard}>
            <CalendarIcon size={40} color="var(--text-secondary)" />
            <p style={{ margin: '12px 0 0 0', fontWeight: 600, color: 'var(--text-primary)' }}>No targeted seminars or workshops scheduled for your batch right now.</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {events.map(ev => (
              <div key={ev.id} style={{ ...styles.card, border: '1px solid rgba(59,130,246,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{ev.title}</span>
                  <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                    {ev.target_type === 'All' ? 'Open to All' : `Targeted: ${ev.target_type}`}
                  </span>
                </div>

                <div style={{ fontSize: '0.9rem', color: '#10B981', fontWeight: 600, marginTop: 8 }}>
                  Speaker: {ev.speaker}
                </div>

                <div style={styles.metaGrid}>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLbl}>Venue / Link</span>
                    <span style={{ ...styles.metaVal, color: '#3B82F6', fontWeight: 600 }}>{ev.venue}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <span style={styles.metaLbl}>Scheduled Time</span>
                    <span style={styles.metaVal}>{new Date(ev.date_time).toLocaleString()}</span>
                  </div>
                </div>

                {ev.description && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: 12, background: 'var(--bg-main)', padding: 10, borderRadius: 8 }}>
                    {ev.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── APPLICATION SNAPSHOT REVIEW MODAL ───────────────────────── */}
      {selectedDriveForApply && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(11, 25, 44, 0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: 20,
            boxSizing: 'border-box',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedDriveForApply(null);
              setPreviewData(null);
            }
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: 20,
              maxWidth: 580,
              width: '100%',
              padding: 26,
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              border: '1px solid var(--border-color)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  📄 Application Snapshot Preview
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Applying to <strong>{selectedDriveForApply.company_name}</strong> &bull; {selectedDriveForApply.job_role} ({selectedDriveForApply.package})
                </p>
              </div>
              <button
                onClick={() => { setSelectedDriveForApply(null); setPreviewData(null); }}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>

            {loadingPreview ? (
              <div style={{ padding: 30, textAlign: 'center' }}>Loading application snapshot data...</div>
            ) : previewData?.snapshot_preview ? (
              <div>
                <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: '0.82rem' }}>
                  ℹ️ <strong>Immutable Snapshot:</strong> A verified copy of your academic and contact information below will be frozen and sent to the recruiter.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem', marginBottom: 16 }}>
                  <div><strong>Name:</strong> {previewData.snapshot_preview.name}</div>
                  <div><strong>Roll No:</strong> {previewData.snapshot_preview.roll_number}</div>
                  <div><strong>UG CGPA:</strong> {previewData.snapshot_preview.ug_cgpa}</div>
                  <div><strong>Active Backlogs:</strong> {previewData.snapshot_preview.current_backlogs}</div>
                  <div><strong>10th %:</strong> {previewData.snapshot_preview.tenth_percentage ? `${previewData.snapshot_preview.tenth_percentage}%` : '—'}</div>
                  <div><strong>12th / Diploma %:</strong> {previewData.snapshot_preview.twelfth_percentage ? `${previewData.snapshot_preview.twelfth_percentage}%` : '—'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>Email:</strong> {previewData.snapshot_preview.institutional_email}</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>Skills:</strong> {previewData.snapshot_preview.skills?.join(', ') || 'None listed'}</div>
                </div>

                {/* Eligibility Criteria Breakdown */}
                {previewData.eligibility_breakdown && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Eligibility Criteria</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(previewData.eligibility_breakdown).map(([criterion, result]: [string, any]) => {
                        const pass = result === true || result === 'PASS' || (typeof result === 'object' && result.status === 'PASS');
                        const label = criterion.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        return (
                          <span key={criterion} style={{ background: pass ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: pass ? '#34D399' : '#F87171', padding: '3px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700 }}>
                            {pass ? '✓' : '✕'} {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button
                    onClick={() => { setSelectedDriveForApply(null); setPreviewData(null); }}
                    style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => apply(selectedDriveForApply.id)}
                    disabled={actionId === selectedDriveForApply.id}
                    style={{ background: '#10B981', border: 'none', color: '#fff', padding: '8px 22px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {actionId === selectedDriveForApply.id ? 'Submitting...' : '✓ Confirm & Submit Application'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ color: '#EF4444', fontSize: '0.85rem' }}>Failed to retrieve application preview snapshot.</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => apply(selectedDriveForApply.id)}
                    style={{ background: '#3B82F6', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Proceed with Standard Application
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── STUDENT AI ELIGIBILITY & MATCH MODAL ── */}
      {aiMatchDrive && (
        <StudentAiMatchModal
          token={token}
          drive={aiMatchDrive}
          isOpen={!!aiMatchDrive}
          onClose={() => setAiMatchDrive(null)}
          onApplyConfirmed={(driveId) => {
            setAiMatchDrive(null);
            apply(driveId);
          }}
        />
      )}
    </div>
  );
};


const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  subtitle: { color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '0.9rem' },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 },
  statCard: { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  statVal: { fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 6 },
  statLbl: { fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 },
  toastErr: { padding: '12px 18px', background: 'rgba(239,68,68,0.15)', color: '#F87171', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 },
  toastOk: { padding: '12px 18px', background: 'rgba(16,185,129,0.15)', color: '#34D399', borderRadius: 10, border: '1px solid rgba(16,185,129,0.3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 },
  tabRow: { display: 'flex', gap: 8, background: 'var(--card-bg)', padding: 6, borderRadius: 12, border: '1px solid var(--border-color)' },
  tabBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' },
  tabActive: { background: 'var(--bg-main)', color: '#3B82F6', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  emptyCard: { textAlign: 'center', padding: 60, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 },
  card: { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  cardHeader: { display: 'flex', gap: 12, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 12, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontWeight: 800, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  company: { fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' },
  role: { color: 'var(--text-secondary)', fontSize: '0.85rem' },
  dlBadge: { padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--bg-main)', padding: 12, borderRadius: 12 },
  metaItem: { display: 'flex', flexDirection: 'column' },
  metaLbl: { fontSize: '0.72rem', color: 'var(--text-secondary)' },
  metaVal: { fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  appliedPill: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', color: '#34D399', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem' },
  closedBtn: { background: 'rgba(156,163,175,0.1)', color: '#9CA3AF', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem' },
  extLink: { color: '#3B82F6', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'underline', padding: '8px 12px' },
  applyBtn: { background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' },
};
