import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api';

interface FacultyDashboardProps {
  token: string;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({ token, activeTab }) => {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ [key: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [tab, setTabState] = useState<'reviews' | 'students'>('reviews');



  useEffect(() => {
    if (activeTab && (activeTab === 'reviews' || activeTab === 'students') && activeTab !== tab) {
      setTabState(activeTab);
    }
  }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; action: string } | null>(null);

  const toggleSubmissionExpand = (id: string) => {
    setExpandedSubmissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  // Edit student state
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const startEditing = (student: any) => {
    setEditingStudentId(student.id);
    setEditForm({
      name: student.name || '',
      roll_number: student.roll_number || '',
      mobile: student.mobile || '',
      institute_email: student.emails?.institute || '',
      personal_email: student.emails?.personal || '',
      cgpa: student.cgpa || 0,
      active_backlogs: student.active_backlogs || 0,
      total_backlogs: student.total_backlogs || 0,
    });
  };

  const handleEditChange = (field: string, value: any) => {
    setEditForm((prev: any) => ({ ...prev, [field]: value }));
  };

  const saveStudentEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const response = await fetch(`${API_BASE}/faculty/students/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          roll_number: editForm.roll_number,
          mobile: editForm.mobile,
          institute_email: editForm.institute_email,
          personal_email: editForm.personal_email,
          cgpa: Number(editForm.cgpa),
          active_backlogs: Number(editForm.active_backlogs),
          total_backlogs: Number(editForm.total_backlogs)
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update student');
      }
      alert('Student updated successfully');
      setEditingStudentId(null);
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Edit pending submission state
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [editSubmissionForm, setEditSubmissionForm] = useState<any>({});
  const [savingSubmissionEdit, setSavingSubmissionEdit] = useState(false);

  const startEditingSubmission = (sub: any) => {
    setEditingSubmissionId(sub.id);
    setEditSubmissionForm({
      name: sub.name || '',
      roll_number: sub.roll_number || '',
      mobile: sub.mobile || '',
      institute_email: sub.institute_email || '',
      personal_email: sub.personal_email || '',
      cgpa: sub.cgpa || 0,
      active_backlogs: sub.active_backlogs || 0,
      total_backlogs: sub.total_backlogs || 0,
    });
  };

  const handleSubmissionEditChange = (field: string, value: any) => {
    setEditSubmissionForm((prev: any) => ({ ...prev, [field]: value }));
  };

  const saveSubmissionEdit = async (id: string) => {
    setSavingSubmissionEdit(true);
    try {
      const response = await fetch(`${API_BASE}/faculty/reviews/submissions/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editSubmissionForm.name,
          roll_number: editSubmissionForm.roll_number,
          mobile: editSubmissionForm.mobile,
          institute_email: editSubmissionForm.institute_email,
          personal_email: editSubmissionForm.personal_email,
          cgpa: Number(editSubmissionForm.cgpa),
          active_backlogs: Number(editSubmissionForm.active_backlogs),
          total_backlogs: Number(editSubmissionForm.total_backlogs)
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update submission');
      }
      alert('Pending submission updated successfully');
      setEditingSubmissionId(null);
      fetchReviews();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingSubmissionEdit(false);
    }
  };

  const [classOptions, setClassOptions] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  useEffect(() => {
    fetchReviews(selectedClassId);
  }, [selectedClassId]);

  const fetchReviews = async (classId?: string) => {
    setIsLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const qParam = classId ? `?class_id=${classId}` : '';
      const response = await fetch(`${API_BASE}/faculty/reviews/pending${qParam}`, {
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
      const stdResponse = await fetch(`${API_BASE}/faculty/students${qParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (stdResponse.ok) {
        const stdData = await stdResponse.json();
        setEnrolledStudents(stdData.students || []);
        if (stdData.class_options) {
          setClassOptions(stdData.class_options);
        }
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

  // ── Bulk actions ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === submissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submissions.map(s => s.id)));
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkProgress({ done: 0, total: ids.length, action: 'Approving' });
    let done = 0;
    for (const id of ids) {
      try {
        await fetch(`${API_BASE}/faculty/reviews/submissions/${id}/approve`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch { }
      done++;
      setBulkProgress({ done, total: ids.length, action: 'Approving' });
    }
    setBulkProgress(null);
    setSelectedIds(new Set());
    fetchReviews();
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkProgress({ done: 0, total: ids.length, action: 'Rejecting' });
    let done = 0;
    for (const id of ids) {
      const reason = feedback[id] || 'Details could not be verified.';
      try {
        await fetch(`${API_BASE}/faculty/reviews/submissions/${id}/reject?feedback=${encodeURIComponent(reason)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch { }
      done++;
      setBulkProgress({ done, total: ids.length, action: 'Rejecting' });
    }
    setBulkProgress(null);
    setSelectedIds(new Set());
    fetchReviews();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.pageTitle}>Faculty Verification Desk</h2>
          <p style={styles.pageSubtitle}>Review and approve student registrations and profile changes for your assigned batch & class.</p>
        </div>
        <button onClick={() => fetchReviews(selectedClassId)} style={styles.refreshBtn} disabled={isLoading}>
          {isLoading ? '⟳ Syncing...' : '↻ Sync Queue'}
        </button>
      </div>

      {classOptions && classOptions.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
          flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            ASSIGNED CLASS SECTIONS:
          </span>
          <button
            onClick={() => setSelectedClassId('')}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: !selectedClassId ? '#4F46E5' : 'rgba(0,0,0,0.06)',
              color: !selectedClassId ? '#fff' : 'var(--text-primary)',
            }}
          >
            All Assigned Classes ({classOptions.length})
          </button>
          {classOptions.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: selectedClassId === cls.id ? '#4F46E5' : 'rgba(0,0,0,0.06)',
                color: selectedClassId === cls.id ? '#fff' : 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>🏫</span>
              <span>{cls.name}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <input
            type="text"
            placeholder="Search by Roll No or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', width: '250px' }}
          />
        </div>
      </div>

      {tab === 'reviews' && (
        <>
          {/* Stats Bar */}
          <div style={styles.statsBar}>
            <div style={styles.statItem}>
              <span style={{ ...styles.statVal, color: '#F59E0B' }}>{submissions.length}</span>
              <span style={styles.statLabel}>Pending Registrations</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statItem}>
              <span style={{ ...styles.statVal, color: '#2563EB' }}>{updates.length}</span>
              <span style={styles.statLabel}>Pending Updates</span>
            </div>
            <div style={styles.statDivider} />
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
              <div style={styles.spinner} />
              Syncing reviews queue...
            </div>
          ) : (
            <div style={styles.contentGrid}>
              {/* Submissions Column */}
              <div style={styles.column}>
                <div style={styles.colHeader}>
                  <h3>New Student Submissions ({submissions.length})</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {submissions.length > 0 && (
                      <button
                        onClick={toggleSelectAll}
                        style={{ background: selectedIds.size === submissions.length ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', color: selectedIds.size === submissions.length ? '#059669' : '#6B7280', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
                      >
                        {selectedIds.size === submissions.length ? '☑ Deselect All' : '☐ Select All'}
                      </button>
                    )}
                    <span style={styles.badge}>Google Form Inbox</span>
                  </div>
                </div>

                {submissions.filter(s => (s.roll_number?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (s.name?.toLowerCase() || '').includes(searchQuery.toLowerCase())).length === 0 ? (
                  <div style={styles.emptyState}>No new student registrations match your search.</div>
                ) : (
                  <div style={styles.cardList}>
                    {submissions.filter(s => (s.roll_number?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (s.name?.toLowerCase() || '').includes(searchQuery.toLowerCase())).map((sub) => (
                      <div key={sub.id} className="glass-card animate-fade-in" style={{ ...styles.reviewCard, outline: selectedIds.has(sub.id) ? '2px solid #10B981' : 'none', outlineOffset: -2 }}>
                        {/* Selection checkbox */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(sub.id)}
                            onChange={() => toggleSelect(sub.id)}
                            style={{ width: 16, height: 16, accentColor: '#10B981', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600 }}>Select for bulk action</span>
                        </label>
                        <div style={styles.cardTop}>
                          <div>
                            <h4 style={styles.studentName}>{sub.name}</h4>
                            <span style={styles.rollNo}>Roll: {sub.roll_number} ({sub.class_name})</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {sub.photo_url && (
                              <img src={sub.photo_url} alt="Profile" style={styles.profileThumb} />
                            )}
                            <button
                              onClick={() => toggleSubmissionExpand(sub.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#6B7280', padding: 4 }}
                              title="Toggle Details"
                            >
                              {expandedSubmissions.has(sub.id) ? '▲' : '▼'}
                            </button>
                          </div>
                        </div>

                        {expandedSubmissions.has(sub.id) && (
                          <>
                            <div style={styles.studentDetails}>
                              <p><strong>CGPA (Normalized):</strong> <span style={{ color: '#2563EB', fontWeight: 700 }}>{sub.education?.undergraduate?.normalized_cgpa ?? sub.cgpa}</span> | <strong>Backlogs:</strong> {sub.active_backlogs} active ({sub.total_backlogs} total)</p>
                              {sub.education?.secondary?.normalized_percentage && (
                                <p><strong>10th Board:</strong> {sub.education.secondary.board || '—'} &bull; <strong>Score:</strong> {sub.education.secondary.normalized_percentage}% ({sub.education.secondary.raw_score || 'raw'})</p>
                              )}
                              {sub.education?.higher_secondary_or_diploma?.normalized_percentage && (
                                <p><strong>12th/Diploma:</strong> {sub.education.higher_secondary_or_diploma.board || '—'} &bull; <strong>Score:</strong> {sub.education.higher_secondary_or_diploma.normalized_percentage}% ({sub.education.higher_secondary_or_diploma.raw_score || 'raw'})</p>
                              )}
                              <p><strong>Email:</strong> {sub.emails?.institute || sub.institute_email} | <strong>Mobile:</strong> {sub.mobile}</p>
                              <p>
                                <strong>Resume: </strong>
                                {sub.resume_url ? (
                                  <a href={sub.resume_url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                                    View Resume PDF ↗
                                  </a>
                                ) : 'Not uploaded'}
                              </p>
                            </div>

                            {/* All Form Data from Excel */}
                            {sub.extra_data && Object.keys(sub.extra_data).length > 0 && (
                              <div style={{ background: '#F9FAFB', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>All Google Form Data</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 20px' }}>
                                  {Object.entries(sub.extra_data).map(([key, val]: [string, any]) => (
                                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      <span style={{ fontSize: '0.71rem', color: '#6B7280', fontWeight: 600 }}>{key}:</span>
                                      <span style={{ fontSize: '0.75rem', color: '#374151', overflowWrap: 'break-word' }}>{String(val ?? '—')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {editingSubmissionId === sub.id && (
                          <div style={{ marginTop: 12, background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#111827' }}>Edit Pending Submission</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Name</label>
                                <input type="text" value={editSubmissionForm.name} onChange={e => handleSubmissionEditChange('name', e.target.value)} style={styles.feedbackInput} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Roll No</label>
                                <input type="text" value={editSubmissionForm.roll_number} onChange={e => handleSubmissionEditChange('roll_number', e.target.value)} style={styles.feedbackInput} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Institute Email</label>
                                <input type="text" value={editSubmissionForm.institute_email} onChange={e => handleSubmissionEditChange('institute_email', e.target.value)} style={styles.feedbackInput} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Mobile</label>
                                <input type="text" value={editSubmissionForm.mobile} onChange={e => handleSubmissionEditChange('mobile', e.target.value)} style={styles.feedbackInput} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>CGPA</label>
                                <input type="number" step="0.01" value={editSubmissionForm.cgpa} onChange={e => handleSubmissionEditChange('cgpa', e.target.value)} style={styles.feedbackInput} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                              <button onClick={() => saveSubmissionEdit(sub.id)} disabled={savingSubmissionEdit} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                {savingSubmissionEdit ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button onClick={() => setEditingSubmissionId(null)} disabled={savingSubmissionEdit} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

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
                          <button onClick={() => startEditingSubmission(sub)} style={{ ...styles.rejectBtn, background: 'none', border: '1px solid #D1D5DB', color: '#4B5563' }}>
                            Edit
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

                {updates.filter(u => (u.roll_number?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (u.student_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())).length === 0 ? (
                  <div style={styles.emptyState}>No pending profile changes match your search.</div>
                ) : (
                  <div style={styles.cardList}>
                    {updates.filter(u => (u.roll_number?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (u.student_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())).map((upd) => (
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
        <div>
          {enrolledStudents.filter(s => (s.roll_number?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (s.name?.toLowerCase() || '').includes(searchQuery.toLowerCase())).length === 0 ? (
            <div style={styles.emptyState}>No enrolled students match your search.</div>
          ) : (
            <div>
              {enrolledStudents.filter(s => (s.roll_number?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || (s.name?.toLowerCase() || '').includes(searchQuery.toLowerCase())).map(student => (
                <div key={student.id} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, marginBottom: 12, overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                  {/* Summary row */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', cursor: 'pointer' }}
                    onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>
                      {(student.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.95rem' }}>{student.name}</div>
                      <div style={{ color: '#6B7280', fontSize: '0.78rem', marginTop: 2 }}>
                        {student.roll_number} · {student.emails?.institute || student.emails?.personal || ''} · {student.mobile || ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: student.cgpa >= 8 ? '#10B981' : student.cgpa >= 6 ? '#F59E0B' : '#EF4444' }}>{student.cgpa || '—'}</span>
                      <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>CGPA</span>
                      {student.password_plain && student.password_plain !== 'Not Set' && (
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#EF4444', fontSize: '0.82rem', background: 'rgba(239,68,68,0.08)', padding: '2px 8px', borderRadius: 6 }}>
                          🔑 {student.password_plain}
                        </span>
                      )}
                      <span style={{ color: '#9CA3AF', fontSize: '1rem' }}>{expandedStudent === student.id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {/* Expanded details */}
                  {expandedStudent === student.id && (
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '20px', background: '#F9FAFB' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 24px', marginBottom: 16 }}>
                        {[
                          { label: 'Full Name', val: student.name },
                          { label: 'Roll Number', val: student.roll_number },
                          { label: 'Institute Email', val: student.emails?.institute },
                          { label: 'Personal Email', val: student.emails?.personal },
                          { label: 'Mobile', val: student.mobile },
                          { label: 'Program', val: student.program_name },
                          { label: 'Department', val: student.department_name },
                          { label: 'Class', val: student.class_name },
                          { label: 'CGPA', val: student.cgpa },
                          { label: 'Active Backlogs', val: student.active_backlogs },
                          { label: 'Total Backlogs', val: student.total_backlogs },
                        ].map(({ label, val }) => (
                          <div key={label}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                            <div style={{ fontSize: '0.875rem', color: '#111827', fontWeight: 500, marginTop: 2 }}>{val ?? '—'}</div>
                          </div>
                        ))}
                      </div>
                      {student.extra_data && Object.keys(student.extra_data).length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>All Form Data</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px 24px' }}>
                            {Object.entries(student.extra_data).map(([key, val]: [string, any]) => (
                              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontSize: '0.73rem', color: '#6B7280', fontWeight: 600 }}>{key}:</span>
                                <span style={{ fontSize: '0.75rem', color: '#374151', overflowWrap: 'break-word' }}>{String(val ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
                        <button onClick={() => startEditing(student)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                          Edit Student
                        </button>
                      </div>

                      {editingStudentId === student.id && (
                        <div style={{ marginTop: 20, background: '#fff', padding: 20, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)' }}>
                          <h4 style={{ margin: '0 0 16px 0' }}>Edit Student Details</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Name</label>
                              <input type="text" value={editForm.name} onChange={e => handleEditChange('name', e.target.value)} style={styles.feedbackInput} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Roll Number</label>
                              <input type="text" value={editForm.roll_number} onChange={e => handleEditChange('roll_number', e.target.value)} style={styles.feedbackInput} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mobile</label>
                              <input type="text" value={editForm.mobile} onChange={e => handleEditChange('mobile', e.target.value)} style={styles.feedbackInput} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Institute Email</label>
                              <input type="email" value={editForm.institute_email} onChange={e => handleEditChange('institute_email', e.target.value)} style={styles.feedbackInput} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Personal Email</label>
                              <input type="email" value={editForm.personal_email} onChange={e => handleEditChange('personal_email', e.target.value)} style={styles.feedbackInput} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>CGPA</label>
                              <input type="number" step="0.01" value={editForm.cgpa} onChange={e => handleEditChange('cgpa', e.target.value)} style={styles.feedbackInput} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Active Backlogs</label>
                              <input type="number" value={editForm.active_backlogs} onChange={e => handleEditChange('active_backlogs', e.target.value)} style={styles.feedbackInput} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Total Backlogs</label>
                              <input type="number" value={editForm.total_backlogs} onChange={e => handleEditChange('total_backlogs', e.target.value)} style={styles.feedbackInput} />
                            </div>
                          </div>
                          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                            <button onClick={() => saveStudentEdit(student.id)} disabled={savingEdit} className="btn-primary" style={{ padding: '8px 20px' }}>
                              {savingEdit ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button onClick={() => setEditingStudentId(null)} style={styles.rejectBtn}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Floating Bulk Action Bar ── */}
      {tab === 'reviews' && selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: '#1F2937', color: '#F9FAFB', borderRadius: 16,
          padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 20,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 1000,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {bulkProgress ? (
            <>
              <div style={{ width: 200, background: 'rgba(255,255,255,0.1)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(bulkProgress.done / bulkProgress.total) * 100}%`, background: bulkProgress.action === 'Approving' ? '#10B981' : '#EF4444', borderRadius: 99, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{bulkProgress.action}… {bulkProgress.done}/{bulkProgress.total}</span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{selectedIds.size} selected</span>
              <button
                onClick={handleBulkApprove}
                style={{ background: '#10B981', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
              >
                ✓ Approve All Selected
              </button>
              <button
                onClick={handleBulkReject}
                style={{ background: '#EF4444', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
              >
                ✗ Reject All Selected
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9CA3AF', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
            </>
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
