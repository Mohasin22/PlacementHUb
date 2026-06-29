import React, { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:8000/api';

interface StudentDrivesProps {
  token: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  Applied:     { bg: 'rgba(59,130,246,0.15)',  color: '#60A5FA', label: '📋 Applied' },
  Shortlisted: { bg: 'rgba(245,158,11,0.15)',  color: '#FBBF24', label: '⭐ Shortlisted' },
  Placed:      { bg: 'rgba(16,185,129,0.15)',  color: '#34D399', label: '✅ Placed!' },
  Rejected:    { bg: 'rgba(239,68,68,0.12)',   color: '#F87171', label: '✗ Rejected' },
  'On-Hold':   { bg: 'rgba(156,163,175,0.1)',  color: '#6B7280', label: '⏸ On-Hold' },
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

export const StudentDrives: React.FC<StudentDrivesProps> = ({ token }) => {
  const [drives, setDrives] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [tab, setTab] = useState<'feed' | 'track'>('feed');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, trackRes] = await Promise.all([
        fetch(`${API}/drives/student-feed`, { headers }),
        fetch(`${API}/drives/applications/track`, { headers }),
      ]);
      if (feedRes.ok) setDrives(await feedRes.json());
      if (trackRes.ok) setApplications(await trackRes.json());
    } catch {
      setError('Failed to load drives. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 4500);
  };

  const handleApply = async (driveId: string) => {
    setActionId(driveId);
    try {
      const res = await fetch(`${API}/drives/${driveId}/apply`, { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Application failed.');
      showMsg('Application submitted! Your verified profile was shared with HR. 🎉');
      load();
    } catch (e: any) {
      showMsg(e.message, true);
    } finally { setActionId(null); }
  };

  const handleWithdraw = async (driveId: string) => {
    if (!confirm('Withdraw your application? This cannot be undone.')) return;
    setActionId(driveId);
    try {
      const res = await fetch(`${API}/drives/${driveId}/withdraw`, { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Withdraw failed.');
      showMsg('Application withdrawn.');
      load();
    } catch (e: any) {
      showMsg(e.message, true);
    } finally { setActionId(null); }
  };

  const appliedCount = drives.filter(d => d.applied).length;
  const shortlistedCount = applications.filter(a => a.status === 'Shortlisted').length;
  const placedCount = applications.filter(a => a.status === 'Placed').length;

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>Placement Drive Board</h1>
          <p style={s.subtitle}>Drives you are eligible for — based on your verified academic profile.</p>
        </div>
        <button onClick={load} style={s.refreshBtn}>↻ Refresh</button>
      </div>

      {/* Stats Bar */}
      <div style={s.statsBar}>
        {[
          { label: 'Eligible Drives', val: drives.length, color: '#2563EB' },
          { label: 'Applied',         val: appliedCount,  color: '#60A5FA' },
          { label: 'Shortlisted',     val: shortlistedCount, color: '#FBBF24' },
          { label: 'Placed',          val: placedCount,   color: '#34D399' },
        ].map((st, i, arr) => (
          <React.Fragment key={st.label}>
            <div style={s.stat}>
              <span style={{ ...s.statVal, color: st.color }}>{st.val}</span>
              <span style={s.statLabel}>{st.label}</span>
            </div>
            {i < arr.length - 1 && <div style={s.statDiv}/>}
          </React.Fragment>
        ))}
      </div>

      {/* Toasts */}
      {error && <div style={s.toastErr}>⚠️ {error}</div>}
      {success && <div style={s.toastOk}>{success}</div>}

      {/* Tabs */}
      <div style={s.tabs}>
        <button onClick={() => setTab('feed')} style={{ ...s.tab, ...(tab === 'feed' ? s.tabActive : {}) }}>
          🏢 Drive Feed ({drives.length})
        </button>
        <button onClick={() => setTab('track')} style={{ ...s.tab, ...(tab === 'track' ? s.tabActive : {}) }}>
          📊 My Applications ({applications.length})
        </button>
      </div>

      {loading ? (
        <div style={s.loader}>
          <div style={s.spinner}/>
          Loading drives…
        </div>
      ) : (
        <>
          {/* ── DRIVE FEED ── */}
          {tab === 'feed' && (
            drives.length === 0 ? (
              <div style={s.empty}>
                <span style={{ fontSize: '3.5rem' }}>🔍</span>
                <p style={{ color: '#E5E7EB', fontSize: '1rem' }}>No eligible drives available right now.</p>
                <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>Check back later — you'll get an email when new drives open!</p>
              </div>
            ) : (
              <div style={s.grid}>
                {drives.map(d => {
                  const dl = getDeadlineInfo(d.drive_deadline);
                  const appStatus = d.applied && d.application_status ? STATUS_STYLES[d.application_status] : null;
                  const isActing = actionId === d.id;
                  return (
                    <div key={d.id} style={{ ...s.card, ...(dl.expired ? s.cardClosed : {}) }}>
                      {/* Glow accent on active urgent drives */}
                      {!dl.expired && dl.urgent && <div style={s.urgentBar}/>}

                      {/* Card Header */}
                      <div style={s.cardHead}>
                        <div style={s.companyLogo}>{d.company_name.charAt(0)}</div>
                        <div style={{ flex: 1 }}>
                          <h3 style={s.companyName}>{d.company_name}</h3>
                          <p style={s.jobRole}>{d.job_role}</p>
                        </div>
                        {appStatus ? (
                          <span style={{ ...s.pill, background: appStatus.bg, color: appStatus.color }}>
                            {appStatus.label}
                          </span>
                        ) : (
                          <span style={{ ...s.pill, background: dl.expired ? 'rgba(239,68,68,0.1)' : `${dl.color}15`, color: dl.color }}>
                            ⏰ {dl.text}
                          </span>
                        )}
                      </div>

                      {/* Detail Chips */}
                      <div style={s.chips}>
                        <span style={s.chip}>💰 {d.package}</span>
                        <span style={s.chip}>📍 {d.location}</span>
                        <span style={s.chip}>🏢 {d.mode}</span>
                        <span style={s.chip}>📅 {new Date(d.drive_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>

                      {/* Eligibility */}
                      <div style={s.eligGrid}>
                        <div style={s.eligItem}>
                          <span style={s.eligLabel}>Min CGPA</span>
                          <span style={s.eligVal}>{d.min_cgpa}</span>
                        </div>
                        <div style={s.eligItem}>
                          <span style={s.eligLabel}>Max Backlogs</span>
                          <span style={s.eligVal}>{d.max_backlogs}</span>
                        </div>
                        {d.gender_filter && d.gender_filter !== 'All' && (
                          <div style={s.eligItem}>
                            <span style={s.eligLabel}>Gender</span>
                            <span style={s.eligVal}>{d.gender_filter}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={s.actions}>
                        {d.external_apply_link && (
                          <a href={d.external_apply_link} target="_blank" rel="noopener noreferrer" style={s.extLink}>
                            🔗 External Portal
                          </a>
                        )}
                        {dl.expired ? (
                          d.applied
                            ? <span style={{ ...s.pill, background: 'rgba(59,130,246,0.1)', color: '#60A5FA' }}>Applied</span>
                            : <span style={{ color: '#6B7280', fontSize: '0.82rem' }}>Deadline passed</span>
                        ) : (
                          d.applied ? (
                            <button onClick={() => handleWithdraw(d.id)} disabled={isActing} style={s.withdrawBtn}>
                              {isActing ? '…' : 'Withdraw'}
                            </button>
                          ) : (
                            <button onClick={() => handleApply(d.id)} disabled={isActing} style={s.applyBtn}>
                              {isActing ? 'Applying…' : 'Apply Now →'}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── APPLICATION TRACKER ── */}
          {tab === 'track' && (
            applications.length === 0 ? (
              <div style={s.empty}>
                <span style={{ fontSize: '3.5rem' }}>📭</span>
                <p style={{ color: '#E5E7EB', fontSize: '1rem' }}>You haven't applied to any drives yet.</p>
              </div>
            ) : (
              <div style={s.trackList}>
                {applications.map(app => {
                  const si = STATUS_STYLES[app.status] || STATUS_STYLES.Applied;
                  return (
                    <div key={app.application_id} style={s.trackCard}>
                      <div style={{ ...s.trackAccent, background: si.color }}/>
                      <div style={s.trackLogo}>{app.company_name.charAt(0)}</div>
                      <div style={s.trackInfo}>
                        <span style={s.trackCompany}>{app.company_name}</span>
                        <span style={s.trackRole}>{app.job_role}</span>
                        <span style={{ color: '#34D399', fontWeight: 700, fontSize: '0.82rem' }}>{app.package}</span>
                      </div>
                      <div style={s.trackMeta}>
                        <span style={{ ...s.pill, background: si.bg, color: si.color, fontSize: '0.8rem', padding: '4px 12px' }}>
                          {si.label}
                        </span>
                        {app.ctc_offered && (
                          <span style={{ color: '#34D399', fontSize: '0.8rem', fontWeight: 700 }}>CTC: {app.ctc_offered}</span>
                        )}
                        <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                          Applied {new Date(app.applied_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  wrap: { color: '#111827', maxWidth: 1200, margin: '0 auto' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: '1.7rem', fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#2563EB,#6366F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { color: '#6B7280', fontSize: '0.875rem', marginTop: 6 },
  refreshBtn: { background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)', color: '#2563EB', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' },
  statsBar: { display: 'flex', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, marginBottom: 24, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
  stat: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 20px' },
  statVal: { fontSize: '2rem', fontWeight: 800, color: '#111827' },
  statLabel: { fontSize: '0.72rem', color: '#6B7280', marginTop: 4 },
  statDiv: { width: 1, background: 'rgba(0,0,0,0.08)', alignSelf: 'stretch' },
  toastErr: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#DC2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' },
  toastOk: { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#059669', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: '0.875rem' },
  tabs: { display: 'flex', gap: 4, background: 'rgba(0,0,0,0.03)', padding: 4, borderRadius: 10, marginBottom: 24, width: 'fit-content' },
  tab: { background: 'none', border: 'none', color: '#6B7280', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.2s' },
  tabActive: { background: 'rgba(37,99,235,0.12)', color: '#2563EB' },
  loader: { display: 'flex', alignItems: 'center', gap: 12, color: '#6B7280', justifyContent: 'center', padding: 80 },
  spinner: { width: 24, height: 24, border: '3px solid rgba(37,99,235,0.2)', borderTop: '3px solid #2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 },
  card: { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
  cardClosed: { opacity: 0.55 },
  urgentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#2563EB,#6366F1)' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 14 },
  companyLogo: { width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#2563EB,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#fff', flexShrink: 0 },
  companyName: { margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' },
  jobRole: { margin: '3px 0 0', fontSize: '0.82rem', color: '#6B7280' },
  pill: { padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', color: '#4B5563' },
  eligGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(0,0,0,0.04)' },
  eligItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  eligLabel: { fontSize: '0.68rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' },
  eligVal: { fontSize: '0.9rem', fontWeight: 700, color: '#111827' },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  extLink: { color: '#2563EB', fontSize: '0.82rem', textDecoration: 'none' },
  applyBtn: { background: 'linear-gradient(135deg,#2563EB,#6366F1)', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' },
  withdrawBtn: { background: 'none', border: '1px solid rgba(220,38,38,0.3)', color: '#DC2626', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.875rem' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', color: '#6B7280', textAlign: 'center', gap: 12 },
  trackList: { display: 'flex', flexDirection: 'column', gap: 12 },
  trackCard: { display: 'flex', alignItems: 'center', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
  trackAccent: { width: 5, alignSelf: 'stretch', flexShrink: 0 },
  trackLogo: { width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#2563EB,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 800, color: '#fff', flexShrink: 0, margin: '14px 16px' },
  trackInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '14px 0' },
  trackCompany: { fontWeight: 700, color: '#111827', fontSize: '0.95rem' },
  trackRole: { color: '#6B7280', fontSize: '0.82rem' },
  trackMeta: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, padding: '14px 20px' },
};
