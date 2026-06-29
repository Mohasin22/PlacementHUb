import React, { useState, useEffect } from 'react';
import { BulkStudentUpload } from '../components/BulkStudentUpload';

const API_BASE = 'http://localhost:8000/api';

interface FacultyDashboardProps {
  token: string;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({ token }) => {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ [key: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'reviews' | 'students'>('reviews');

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/faculty/reviews/pending`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to load pending queue.');
      }
      const data = await response.json();
      setSubmissions(data.submissions || []);
      setUpdates(data.updates || []);
      
      // Also fetch enrolled students
      const stdResponse = await fetch(`${API_BASE}/faculty/students`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (stdResponse.ok) {
        const stdData = await stdResponse.json();
        setEnrolledStudents(stdData.students || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveSubmission = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/faculty/reviews/submissions/${id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to approve student registration.');
      alert('Registration approved successfully!');
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRejectSubmission = async (id: string) => {
    const reason = feedback[id] || 'Details could not be verified.';
    try {
      const response = await fetch(`${API_BASE}/faculty/reviews/submissions/${id}/reject?feedback=${encodeURIComponent(reason)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to reject registration.');
      alert('Registration rejected.');
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApproveUpdate = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/faculty/reviews/updates/${id}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to approve profile changes.');
      alert('Profile updates merged successfully!');
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRejectUpdate = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/faculty/reviews/updates/${id}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to reject changes.');
      alert('Profile changes rejected.');
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.pageTitle}>Faculty Verification Desk</h2>
          <p style={styles.pageSubtitle}>Review and approve student registrations and profile changes for your class.</p>
        </div>
        <button onClick={fetchReviews} style={styles.refreshBtn} disabled={isLoading}>
          {isLoading ? '⟳ Syncing...' : '↻ Sync Queue'}
        </button>
      </div>

      <div className="mb-md">
        <BulkStudentUpload token={token} onUploadSuccess={fetchReviews} />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button 
          onClick={() => setTab('reviews')} 
          style={{ ...styles.tabBtn, ...(tab === 'reviews' ? styles.tabActive : {}) }}>
          Pending Reviews ({submissions.length + updates.length})
        </button>
        <button 
          onClick={() => setTab('students')} 
          style={{ ...styles.tabBtn, ...(tab === 'students' ? styles.tabActive : {}) }}>
          Enrolled Students ({enrolledStudents.length})
        </button>
      </div>

      {tab === 'reviews' && (
        <>
          {/* Stats Bar */}
          <div style={styles.statsBar}>
            <div style={styles.statItem}>
              <span style={{ ...styles.statVal, color: '#F59E0B' }}>{submissions.length}</span>
              <span style={styles.statLabel}>Pending Registrations</span>
            </div>
        <div style={styles.statDivider}/>
        <div style={styles.statItem}>
          <span style={{ ...styles.statVal, color: '#2563EB' }}>{updates.length}</span>
          <span style={styles.statLabel}>Pending Updates</span>
        </div>
        <div style={styles.statDivider}/>
        <div style={styles.statItem}>
          <span style={{ ...styles.statVal, color: submissions.length + updates.length === 0 ? '#34D399' : '#E5E7EB' }}>
            {submissions.length + updates.length === 0 ? '✓ All Clear' : submissions.length + updates.length + ' total'}
          </span>
          <span style={styles.statLabel}>Review Queue Status</span>
        </div>
      </div>

      {error && <div style={styles.errorAlert}>{error}</div>}

      {isLoading ? (
        <div style={styles.loadingText}>
          <div style={styles.spinner}/>
          Syncing reviews queue...
        </div>
      ) : (
        <div style={styles.contentGrid}>
          {/* Submissions Column */}
          <div style={styles.column}>
            <div style={styles.colHeader}>
              <h3>New Student Submissions ({submissions.length})</h3>
              <span style={styles.badge}>Google Form Inbox</span>
            </div>
            
            {submissions.length === 0 ? (
              <div style={styles.emptyState}>No new student registrations to verify.</div>
            ) : (
              <div style={styles.cardList}>
                {submissions.map((sub) => (
                  <div key={sub.id} className="glass-card animate-fade-in" style={styles.reviewCard}>
                    <div style={styles.cardTop}>
                      <div>
                        <h4 style={styles.studentName}>{sub.name}</h4>
                        <span style={styles.rollNo}>Roll: {sub.roll_number} ({sub.class_name})</span>
                      </div>
                      {sub.photo_url && (
                        <img src={sub.photo_url} alt="Profile" style={styles.profileThumb} />
                      )}
                    </div>

                    <div style={styles.studentDetails}>
                      <p><strong>CGPA:</strong> {sub.cgpa} | <strong>Backlogs:</strong> {sub.active_backlogs} active ({sub.total_backlogs} total)</p>
                      <p><strong>Email:</strong> {sub.institute_email}</p>
                      <p><strong>Mobile:</strong> {sub.mobile}</p>
                      <p>
                        <strong>Resume: </strong>
                        {sub.resume_url ? (
                          <a href={sub.resume_url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                            View Resume PDF ↗
                          </a>
                        ) : 'Not uploaded'}
                      </p>
                    </div>

                    <div style={styles.feedbackInputRow}>
                      <input 
                        type="text" 
                        placeholder="Rejection note..." 
                        value={feedback[sub.id] || ''}
                        onChange={(e) => setFeedback({ ...feedback, [sub.id]: e.target.value })}
                        style={styles.feedbackInput}
                      />
                    </div>

                    <div style={styles.cardActions}>
                      <button onClick={() => handleRejectSubmission(sub.id)} style={styles.rejectBtn}>
                        Reject
                      </button>
                      <button onClick={() => handleApproveSubmission(sub.id)} className="btn-primary" style={styles.approveBtn}>
                        Verify & Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Profile Updates Column */}
          <div style={styles.column}>
            <div style={styles.colHeader}>
              <h3>Profile Update Requests ({updates.length})</h3>
              <span style={styles.badge}>Student Edits Queue</span>
            </div>

            {updates.length === 0 ? (
              <div style={styles.emptyState}>No pending profile changes.</div>
            ) : (
              <div style={styles.cardList}>
                {updates.map((upd) => (
                  <div key={upd.id} className="glass-card animate-fade-in" style={styles.reviewCard}>
                    <div style={styles.cardTop}>
                      <div>
                        <h4 style={styles.studentName}>{upd.student_name}</h4>
                        <span style={styles.rollNo}>Roll: {upd.roll_number}</span>
                      </div>
                    </div>

                    <div style={styles.diffBox}>
                      <p style={styles.diffTitle}>Requested Modifications</p>
                      <table style={styles.diffTable}>
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Current Value</th>
                            <th>Proposed Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(upd.requested_changes).map((key) => (
                            <tr key={key}>
                              <td style={styles.diffField}>{key.toUpperCase()}</td>
                              <td style={styles.diffOld}>
                                {Array.isArray(upd.current_state[key]) 
                                  ? upd.current_state[key].join(', ') 
                                  : String(upd.current_state[key] ?? 'N/A')}
                              </td>
                              <td style={styles.diffNew}>
                                {Array.isArray(upd.requested_changes[key]) 
                                  ? upd.requested_changes[key].join(', ') 
                                  : String(upd.requested_changes[key])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={styles.cardActions}>
                      <button onClick={() => handleRejectUpdate(upd.id)} style={styles.rejectBtn}>
                        Reject Changes
                      </button>
                      <button onClick={() => handleApproveUpdate(upd.id)} className="btn-primary" style={styles.approveBtn}>
                        Merge Updates
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </>
    )}

      {tab === 'students' && (
        <div style={styles.cardList}>
          {enrolledStudents.length === 0 ? (
            <div style={styles.emptyState}>No enrolled students found for your class.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', color: '#6B7280', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', color: '#6B7280', textTransform: 'uppercase' }}>Roll No</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', color: '#6B7280', textTransform: 'uppercase' }}>Email</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', color: '#6B7280', textTransform: 'uppercase' }}>Mobile</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', color: '#6B7280', textTransform: 'uppercase' }}>Password</th>
                </tr>
              </thead>
              <tbody>
                {enrolledStudents.map(student => (
                  <tr key={student.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>{student.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#4B5563' }}>{student.roll_number}</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#4B5563' }}>{student.emails?.institute || student.emails?.personal || 'N/A'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#4B5563' }}>{student.mobile || 'N/A'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem', color: '#EF4444', fontFamily: 'monospace', fontWeight: 700 }}>{student.password_plain || 'Not Set'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200, margin: '0 auto', width: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: '1.6rem', fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#10B981,#059669)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  pageSubtitle: { color: '#6B7280', fontSize: '0.875rem', margin: '6px 0 0' },
  tabBtn: { background: 'none', border: 'none', color: '#6B7280', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, transition: 'all 0.2s' },
  tabActive: { background: 'rgba(16,185,129,0.1)', color: '#059669', boxShadow: 'inset 0 0 0 1px rgba(16,185,129,0.2)' },
  refreshBtn: { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#059669', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 },
  statsBar: { display: 'flex', gap: 0, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
  statItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 20px' },
  statVal: { fontSize: '1.6rem', fontWeight: 800, color: '#111827' },
  statLabel: { fontSize: '0.75rem', color: '#6B7280', marginTop: 4 },
  statDivider: { width: 1, background: 'rgba(0,0,0,0.08)', alignSelf: 'stretch' },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '32px',
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  colHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  badge: {
    background: 'rgba(37, 99, 235, 0.1)',
    border: '1px solid rgba(37, 99, 235, 0.2)',
    color: '#2563EB',
    fontSize: '0.75rem',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  emptyState: {
    background: '#F9FAFB',
    border: '1px dashed rgba(0,0,0,0.15)',
    borderRadius: '10px',
    padding: '40px',
    textAlign: 'center',
    color: '#6B7280',
    fontSize: '0.9rem',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  reviewCard: {
    padding: '24px',
    background: '#FFFFFF',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  studentName: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#111827',
  },
  rollNo: {
    fontSize: '0.82rem',
    color: '#6B7280',
  },
  profileThumb: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid rgba(0, 0, 0, 0.1)',
  },
  studentDetails: {
    fontSize: '0.85rem',
    color: '#4B5563',
    lineHeight: '1.6',
    marginBottom: '16px',
    background: '#F9FAFB',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid rgba(0,0,0,0.04)',
  },
  link: {
    color: '#2563EB',
    textDecoration: 'underline',
  },
  feedbackInputRow: {
    marginBottom: '16px',
  },
  feedbackInput: {
    fontSize: '0.85rem',
    padding: '8px 12px',
    background: '#FFFFFF',
    border: '1px solid rgba(0,0,0,0.1)',
    color: '#111827',
  },
  cardActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  approveBtn: {
    padding: '8px 16px',
    fontSize: '0.85rem',
  },
  rejectBtn: {
    background: 'none',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#DC2626',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  diffBox: {
    background: '#F9FAFB',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  diffTitle: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
    marginBottom: '10px',
    letterSpacing: '0.05em',
  },
  diffTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.82rem',
  },
  diffField: {
    color: '#6B7280',
    fontWeight: '500',
    padding: '6px 4px',
  },
  diffOld: {
    color: '#EF4444',
    textDecoration: 'line-through',
    padding: '6px 4px',
  },
  diffNew: {
    color: '#10B981',
    fontWeight: '600',
    padding: '6px 4px',
  },
  spinner: { width: 20, height: 20, border: '3px solid rgba(16,185,129,0.2)', borderTop: '3px solid #10B981', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block', marginRight: 10 },
  loadingText: { color: '#6B7280', fontSize: '0.9rem', textAlign: 'center' as const, padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#DC2626',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.85rem',
    marginBottom: '20px',
  },
};
