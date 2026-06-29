import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api';

interface StudentProfileProps {
  token: string;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({ token }) => {
  const [profile, setProfile] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Edit fields state
  const [mobile, setMobile] = useState('');
  const [cgpa, setCgpa] = useState<number>(0.0);
  const [activeBacklogs, setActiveBacklogs] = useState<number>(0);
  const [totalBacklogs, setTotalBacklogs] = useState<number>(0);
  const [skills, setSkills] = useState('');
  const [projects, setProjects] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/students/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load profile.');
      const data = await response.json();
      setProfile(data);
      
      // Initialize edit form
      setMobile(data.mobile || '');
      setCgpa(data.cgpa || 0.0);
      setActiveBacklogs(data.active_backlogs || 0);
      setTotalBacklogs(data.total_backlogs || 0);
      setSkills(data.skills?.join(', ') || '');
      setProjects(data.projects?.join(', ') || '');
      setResumeUrl(data.resume_url || '');
      setPhotoUrl(data.photo_url || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'resume' | 'photo') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    const formData = new FormData();
    formData.append('file', file);
    
    if (type === 'resume') setUploadingResume(true);
    else setUploadingPhoto(true);
    
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/files/upload?file_type=${type}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Upload failed');
      
      if (type === 'resume') {
        setResumeUrl(data.url);
        setMessage('Resume uploaded successfully! Click save profile to finalize.');
      } else {
        setPhotoUrl(data.url);
        setMessage('Passport photo uploaded! Click save profile to finalize.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingResume(false);
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    const payload = {
      mobile,
      cgpa: Number(cgpa),
      active_backlogs: Number(activeBacklogs),
      total_backlogs: Number(totalBacklogs),
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      projects: projects.split(',').map(p => p.trim()).filter(Boolean),
      resume_url: resumeUrl || null,
      photo_url: photoUrl || null
    };

    try {
      const response = await fetch(`${API_BASE}/students/profile/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Update request failed');
      
      setMessage(data.message || 'Changes submitted to coordinator review.');
      setEditMode(false);
      fetchProfile();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !profile) return <div style={styles.loadingText}>Loading profile data...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>Your Profile</h2>
        {!editMode ? (
          <button onClick={() => setEditMode(true)} className="btn-primary" style={styles.editBtn}>
            ✏️ Edit Profile
          </button>
        ) : (
          <button onClick={() => { setEditMode(false); fetchProfile(); }} className="btn-secondary" style={styles.editBtn}>
            Cancel
          </button>
        )}
      </div>

      {error && <div style={styles.errorAlert}>{error}</div>}
      {message && <div style={styles.successAlert}>{message}</div>}

      {profile && (
        <div style={styles.layoutGrid}>
          {/* Left Column: Photo & Basic Details */}
          <div className="glass-card" style={styles.profileCard}>
            <div style={styles.photoContainer}>
              <img 
                src={photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} 
                alt="Profile Avatar" 
                style={styles.profilePhoto} 
              />
              {editMode && (
                <div style={styles.photoUploadBtnRow}>
                  <label htmlFor="photo-upload" style={styles.uploadLabelBtn}>
                    {uploadingPhoto ? 'Uploading...' : 'Replace Photo'}
                  </label>
                  <input 
                    id="photo-upload" 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => handleFileUpload(e, 'photo')} 
                    style={{ display: 'none' }}
                    disabled={uploadingPhoto}
                  />
                </div>
              )}
            </div>

            <div style={styles.nameHeader}>
              <h3>{profile.name}</h3>
              <p style={styles.rollBadge}>Roll No: {profile.roll_number}</p>
              <span style={styles.classText}>{profile.program_name} {profile.department_name} ({profile.class_name})</span>
            </div>

            <div style={styles.basicMetadata}>
              <p><strong>Institute Email:</strong> {profile.emails?.institute}</p>
              <p><strong>Personal Email:</strong> {profile.emails?.personal}</p>
              <p><strong>DOB:</strong> {profile.dob}</p>
              <p><strong>Gender:</strong> {profile.gender}</p>
            </div>
          </div>

          {/* Right Column: Edit / View Profile Form */}
          <div className="glass-card" style={styles.detailsCard}>
            <form onSubmit={handleSaveProfile} style={styles.form}>
              <h3 style={styles.sectionTitle}>Academic Records & Files</h3>
              
              <div style={styles.row}>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label>Current CGPA</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={cgpa} 
                    onChange={e => setCgpa(Number(e.target.value))} 
                    disabled={!editMode} 
                    required 
                  />
                </div>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label>Active Backlogs</label>
                  <input 
                    type="number" 
                    value={activeBacklogs} 
                    onChange={e => setActiveBacklogs(Number(e.target.value))} 
                    disabled={!editMode} 
                    required 
                  />
                </div>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label>Total Backlogs</label>
                  <input 
                    type="number" 
                    value={totalBacklogs} 
                    onChange={e => setTotalBacklogs(Number(e.target.value))} 
                    disabled={!editMode} 
                    required 
                  />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label>Mobile Number</label>
                <input 
                  type="tel" 
                  value={mobile} 
                  onChange={e => setMobile(e.target.value)} 
                  disabled={!editMode} 
                  required 
                />
              </div>

              <div style={styles.inputGroup}>
                <label>Skills (Comma Separated)</label>
                <input 
                  type="text" 
                  placeholder="e.g. Python, React, MongoDB" 
                  value={skills} 
                  onChange={e => setSkills(e.target.value)} 
                  disabled={!editMode} 
                />
              </div>

              <div style={styles.inputGroup}>
                <label>Projects (Comma Separated)</label>
                <textarea 
                  placeholder="e.g. PlacementHub, E-Commerce App" 
                  value={projects} 
                  onChange={e => setProjects(e.target.value)} 
                  disabled={!editMode} 
                  rows={3}
                />
              </div>

              <div style={styles.inputGroup}>
                <label>Resume Document (PDF/DOCX)</label>
                <div style={styles.resumeUploadBox}>
                  {resumeUrl ? (
                    <div style={styles.fileLinkRow}>
                      <span style={styles.fileIcon}>📄</span>
                      <a href={resumeUrl} target="_blank" rel="noopener noreferrer" style={styles.resumeLink}>
                        View Uploaded Resume
                      </a>
                    </div>
                  ) : (
                    <span style={styles.noFileText}>No resume uploaded yet.</span>
                  )}
                  
                  {editMode && (
                    <div style={{ marginTop: '10px' }}>
                      <label htmlFor="resume-upload" style={styles.uploadLabelBtn}>
                        {uploadingResume ? 'Uploading...' : 'Upload New Resume'}
                      </label>
                      <input 
                        id="resume-upload" 
                        type="file" 
                        accept=".pdf,.docx" 
                        onChange={(e) => handleFileUpload(e, 'resume')} 
                        style={{ display: 'none' }}
                        disabled={uploadingResume}
                      />
                    </div>
                  )}
                </div>
              </div>

              {editMode && (
                <div style={styles.approvalWarning}>
                  ⚠️ <strong>Notice:</strong> Saving changes will not immediately update your live profile. It sends a change request to your class Faculty Coordinator for verification.
                </div>
              )}

              {editMode && (
                <button type="submit" className="btn-primary" style={styles.saveBtn} disabled={isLoading || uploadingPhoto || uploadingResume}>
                  {isLoading ? 'Submitting...' : 'Save Profile Changes'}
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editBtn: {
    padding: '8px 16px',
    fontSize: '0.85rem',
  },
  layoutGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: '32px',
    alignItems: 'start',
  },
  profileCard: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  photoContainer: {
    position: 'relative',
    marginBottom: '20px',
  },
  profilePhoto: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid #2563EB',
    boxShadow: '0 0 20px rgba(37, 99, 235, 0.2)',
  },
  photoUploadBtnRow: {
    marginTop: '10px',
  },
  uploadLabelBtn: {
    display: 'inline-block',
    background: 'rgba(37, 99, 235, 0.1)',
    border: '1px solid rgba(37, 99, 235, 0.3)',
    color: '#2563EB',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '0.78rem',
    cursor: 'pointer',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  nameHeader: {
    marginBottom: '24px',
  },
  rollBadge: {
    background: 'rgba(0, 0, 0, 0.06)',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '0.8rem',
    color: '#6B7280',
    display: 'inline-block',
    marginTop: '6px',
    marginBottom: '4px',
  },
  classText: {
    display: 'block',
    fontSize: '0.85rem',
    color: '#2563EB',
    fontWeight: '600',
  },
  basicMetadata: {
    width: '100%',
    textAlign: 'left',
    fontSize: '0.85rem',
    color: '#6B7280',
    borderTop: '1px solid rgba(0, 0, 0, 0.08)',
    paddingTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  detailsCard: {
    padding: '40px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sectionTitle: {
    fontSize: '1.2rem',
    fontWeight: '700',
    marginBottom: '10px',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  resumeUploadBox: {
    background: '#F9FAFB',
    border: '1px dashed var(--border-color)',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileLinkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fileIcon: {
    fontSize: '1.4rem',
  },
  resumeLink: {
    color: '#2563EB',
    fontSize: '0.9rem',
    textDecoration: 'underline',
  },
  noFileText: {
    color: '#6B7280',
    fontSize: '0.85rem',
  },
  approvalWarning: {
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    color: '#D97706',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.82rem',
    lineHeight: '1.5',
  },
  saveBtn: {
    width: '100%',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: '0.9rem',
    textAlign: 'center',
    padding: '40px',
  },
  errorAlert: {
    background: 'rgba(220, 38, 38, 0.1)',
    border: '1px solid rgba(220, 38, 38, 0.25)',
    color: '#DC2626',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.85rem',
    marginBottom: '20px',
  },
  successAlert: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    color: '#059669',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.85rem',
    marginBottom: '20px',
  },
};
