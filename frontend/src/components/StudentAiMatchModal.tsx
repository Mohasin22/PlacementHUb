import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  SparklesIcon,
  BotIcon,
  CheckIcon,
  AlertIcon,
  CloseIcon
} from './Icons';


interface StudentAiMatchModalProps {
  token: string;
  drive: any;
  isOpen: boolean;
  onClose: () => void;
  onApplyConfirmed: (driveId: string) => void;
}

export const StudentAiMatchModal: React.FC<StudentAiMatchModalProps> = ({
  token,
  drive,
  isOpen,
  onClose,
  onApplyConfirmed,
}) => {
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // Parse student user_id from token
  const parseUserId = () => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id || payload.sub;
    } catch {
      return '';
    }
  };

  const API_BASE = 'http://localhost:8000/api';

  const parseJsonResponse = async (res: Response, fallbackError: string) => {
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text || `${fallbackError} (Status: ${res.status})` };
    }
    if (!res.ok) {
      throw new Error(data.detail || data.message || `${fallbackError} (Status: ${res.status})`);
    }
    return data;
  };

  const studentId = parseUserId();

  const loadMatch = async () => {
    if (!drive || !studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ai/students/${studentId}/match/${drive.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseJsonResponse(res, 'Failed to generate AI match assessment.');
      setMatchData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMatch();
    }
  }, [isOpen, drive]);

  const handleAcceptCorrection = async (issue: any) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ai/students/${studentId}/issues/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          field: issue.field,
          original_value: issue.original_value,
          suggested_value: issue.suggested_value,
        }),
      });
      await parseJsonResponse(res, 'Failed to update profile correction.');

      setSuccess(`Correction applied: ${issue.original_value} → ${issue.suggested_value}`);
      // Reload match after correction
      loadMatch();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApproveAndProceed = async () => {
    if (!drive) return;
    setApproving(true);
    setError(null);
    try {
      // 1. Record AI Match Approval event
      const res = await fetch(`${API_BASE}/ai/students/${studentId}/match/${drive.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await parseJsonResponse(res, 'Failed to record AI match approval.');

      // 2. Delegate to existing application snapshot submission
      onApplyConfirmed(drive.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to approve assessment.');
    } finally {
      setApproving(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      style={s.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !approving) {
          onClose();
        }
      }}
    >
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={s.iconBadge}>
              <SparklesIcon size={20} color="#6366F1" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={s.title}>AI Eligibility & Profile Match</h2>
                <span style={s.verifiedPill}>Automated Verification</span>
              </div>
              <p style={s.subtitle}>
                Comparing your verified student database records against <strong>{drive.company_name}</strong> requirements.
              </p>
            </div>
          </div>
          <button onClick={onClose} style={s.closeBtn}>
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Data Provenance Legend */}
        <div style={s.provenanceBar}>
          <span style={s.provItem}>
            <span style={{ ...s.dot, background: '#3B82F6' }} /> Authoritative Data (Your Verified DB Records)
          </span>
          <span style={s.provItem}>
            <span style={{ ...s.dot, background: '#10B981' }} /> Derived Data (Calculated & Normalized)
          </span>
          <span style={s.provItem}>
            <span style={{ ...s.dot, background: '#F59E0B' }} /> Proposed Data (AI Suggestions)
          </span>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div style={s.alertErr}>
            <AlertIcon size={18} color="#EF4444" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div style={s.alertOk}>
            <CheckIcon size={18} color="#10B981" />
            <span>{success}</span>
          </div>
        )}

        {/* Modal Body */}
        <div style={s.body}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="animate-spin" style={s.spinner} />
              <p style={{ marginTop: 16, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Evaluating eligibility rules and inspecting data quality...
              </p>
            </div>
          ) : matchData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Overall Eligibility Status Banner */}
              <div
                style={{
                  ...s.verdictCard,
                  borderColor: matchData.is_eligible ? '#10B981' : '#EF4444',
                  background: matchData.is_eligible ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: matchData.is_eligible ? '#10B981' : '#EF4444',
                      color: '#FFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {matchData.is_eligible ? <CheckIcon size={20} color="#FFF" /> : <AlertIcon size={20} color="#FFF" />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: matchData.is_eligible ? '#065F46' : '#991B1B' }}>
                      {matchData.is_eligible ? '✓ You Meet All Mandatory Eligibility Criteria!' : '⚠ Ineligible for this Drive'}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: matchData.is_eligible ? '#047857' : '#B91C1C', marginTop: 2 }}>
                      {matchData.ai_explanation}
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversion Rule Explanation (if used) */}
              {matchData.conversion_details && (
                <div style={s.conversionCard}>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#1E40AF', marginBottom: 4 }}>
                    Official Board Normalization Applied
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#1D4ED8' }}>
                    {matchData.conversion_details.explanation}
                  </div>
                </div>
              )}

              {/* Mandatory Criteria Comparison Table */}
              <div style={s.section}>
                <h3 style={s.sectionTitle}>Mandatory Eligibility Rules (Deterministic)</h3>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thRow}>
                        <th style={s.th}>Criterion</th>
                        <th style={s.th}>Evaluation Detail</th>
                        <th style={s.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchData.mandatory_criteria.map((crit: any, idx: number) => (
                        <tr key={idx} style={s.tr}>
                          <td style={{ ...s.td, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {crit.criterion}
                          </td>
                          <td style={{ ...s.td, color: 'var(--text-secondary)' }}>
                            {crit.detail}
                          </td>
                          <td style={s.td}>
                            <span
                              style={{
                                ...s.statusPill,
                                background: crit.status === 'PASS' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: crit.status === 'PASS' ? '#10B981' : '#EF4444',
                              }}
                            >
                              {crit.status === 'PASS' ? '✓ Met' : '✗ Failed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preferred Requirements (Skills, Certifications) */}
              {matchData.preferred_criteria?.length > 0 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>Preferred Requirements & Technical Skills</h3>
                  <div style={s.skillGrid}>
                    {matchData.preferred_criteria.map((pref: any, idx: number) => (
                      <div key={idx} style={s.prefCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {pref.criterion}
                          </span>
                          <span
                            style={{
                              ...s.statusPill,
                              background: pref.status === 'PASS' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                              color: pref.status === 'PASS' ? '#10B981' : '#D97706',
                            }}
                          >
                            {pref.status === 'PASS' ? '✓ Present' : 'Optional / Missing'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          {pref.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Quality Agent Panel (Suggestions & Typos) */}
              {matchData.data_quality_issues?.length > 0 && (
                <div style={s.qualityCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <BotIcon size={18} color="#6366F1" />
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      AI Profile Assistant Recommendations
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                    The AI detected potential optimizations in your profile. You may accept or keep your original values.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {matchData.data_quality_issues.map((iss: any, idx: number) => (
                      <div key={idx} style={s.issueRow}>
                        <div style={{ flex: 1 }}>
                          <span style={s.issueTag}>{iss.issue_type}</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginLeft: 8 }}>
                            {iss.original_value ? `"${iss.original_value}" → "${iss.suggested_value}"` : iss.suggested_value}
                          </span>
                          <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {iss.explanation}
                          </p>
                        </div>

                        {iss.issue_type === 'typo' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleAcceptCorrection(iss)}
                              style={s.acceptBtn}
                            >
                              Accept Correction
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={s.footer}>
                <button onClick={onClose} style={s.cancelBtn}>
                  Cancel
                </button>
                <button
                  onClick={handleApproveAndProceed}
                  disabled={!matchData.is_eligible || approving}
                  style={{
                    ...s.applyBtn,
                    opacity: matchData.is_eligible ? 1 : 0.5,
                    cursor: matchData.is_eligible ? 'pointer' : 'not-allowed',
                  }}
                >
                  {approving ? 'Verifying & Applying...' : 'Approve Assessment & Apply →'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(11, 25, 44, 0.72)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '24px 16px',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  modal: {
    background: 'var(--card-bg, #1e293b)',
    color: 'var(--text-primary, #f8fafc)',
    width: '100%',
    maxWidth: 820,
    maxHeight: '90vh',
    borderRadius: 20,
    border: '1px solid rgba(99, 102, 241, 0.3)',
    boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    margin: 'auto',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'rgba(99, 102, 241, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '0.82rem',
    color: 'var(--text-secondary)',
  },
  verifiedPill: {
    background: 'rgba(16, 185, 129, 0.12)',
    color: '#10B981',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: '0.72rem',
    fontWeight: 700,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 4,
  },
  provenanceBar: {
    background: 'var(--bg-main)',
    padding: '8px 24px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    gap: 18,
    flexWrap: 'wrap',
  },
  provItem: {
    fontSize: '0.74rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  body: {
    padding: 24,
    overflowY: 'auto',
    flex: 1,
  },
  verdictCard: {
    border: '1px solid',
    borderRadius: 12,
    padding: 16,
  },
  conversionCard: {
    background: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: 10,
    padding: '12px 16px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionTitle: {
    margin: 0,
    fontSize: '0.88rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  tableWrap: {
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.84rem',
  },
  thRow: {
    background: 'var(--bg-main)',
    textAlign: 'left',
  },
  th: {
    padding: '10px 14px',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '0.76rem',
    textTransform: 'uppercase',
  },
  tr: {
    borderTop: '1px solid var(--border-color)',
  },
  td: {
    padding: '10px 14px',
  },
  statusPill: {
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  skillGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 10,
  },
  prefCard: {
    background: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: 12,
  },
  qualityCard: {
    background: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 16,
  },
  issueRow: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  issueTag: {
    background: 'rgba(99, 102, 241, 0.1)',
    color: '#6366F1',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  acceptBtn: {
    background: '#4F46E5',
    color: '#FFF',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 6,
    fontWeight: 700,
    fontSize: '0.76rem',
    cursor: 'pointer',
  },
  footer: {
    borderTop: '1px solid var(--border-color)',
    paddingTop: 16,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    background: 'var(--bg-main)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    padding: '10px 18px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: '0.88rem',
    cursor: 'pointer',
  },
  applyBtn: {
    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    color: '#FFF',
    border: 'none',
    padding: '10px 22px',
    borderRadius: 8,
    fontWeight: 800,
    fontSize: '0.9rem',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
  },
  alertErr: {
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#EF4444',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: '0.84rem',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '12px 24px 0',
  },
  alertOk: {
    background: 'rgba(16, 185, 129, 0.1)',
    color: '#10B981',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: '0.84rem',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '12px 24px 0',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #6366F1',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    margin: '0 auto',
  },
};
