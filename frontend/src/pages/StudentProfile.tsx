import React, { useState, useEffect } from 'react';
import { ChangePassword } from '../components/ChangePassword';
import { formatDocumentUrl } from '../components/StudentDetailModal';
import { StudentAvatar } from '../components/StudentAvatar';
import {
  CloseIcon,
  IdCardIcon,
  CheckIcon,
  GraduationCapIcon,
  SchoolIcon,
  FileTextIcon,
  CodeIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
  UploadIcon,
  RefreshIcon,
  SparklesIcon,
} from '../components/Icons';

const API_BASE = 'http://127.0.0.1:8000/api';

interface StudentProfileProps {
  token: string;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({ token }) => {
  const [profile, setProfile] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scanningResume, setScanningResume] = useState(false);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [selectedScanSkills, setSelectedScanSkills] = useState<string[]>([]);
  const [selectedScanProjects, setSelectedScanProjects] = useState<string[]>([]);
  const [showScanModal, setShowScanModal] = useState(false);

  // Resume Document Viewer subtab
  const [docSubTab, setDocSubTab] = useState<'resume' | 'tech_certs' | 'achieve_certs'>('resume');
  const [previewDoc, setPreviewDoc] = useState<{ title: string; doc: any } | null>(null);

  // Direct Re-upload / Link update state
  const [showDirectUploadModal, setShowDirectUploadModal] = useState(false);
  const [directUploadFile, setDirectUploadFile] = useState<File | null>(null);
  const [directInputUrl, setDirectInputUrl] = useState('');
  const [isDirectUploading, setIsDirectUploading] = useState(false);

  // Correction request state
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [corrFieldName, setCorrFieldName] = useState('UG CGPA');
  const [corrCurrentVal, setCorrCurrentVal] = useState('');
  const [corrReqVal, setCorrReqVal] = useState('');
  const [corrReason, setCorrReason] = useState('');
  const [corrSubmitting, setCorrSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Edit fields state
  const [mobile, setMobile] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [skills, setSkills] = useState('');
  const [projects, setProjects] = useState('');
  const [certifications, setCertifications] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [portfolio, setPortfolio] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/students/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load profile.');
      const data = await response.json();
      setProfile(data);

      setMobile(data.mobile || data.contact?.mobile || '');
      setPersonalEmail(data.emails?.personal || data.contact?.personal_email || '');
      setSkills(data.skills?.join(', ') || '');
      setProjects(data.projects?.join('\n') || '');
      setCertifications(data.certifications?.join(', ') || '');
      setLinkedin(data.links?.linkedin || '');
      setGithub(data.links?.github || '');
      setPortfolio(data.links?.portfolio || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const payload = {
      mobile: mobile.trim() || undefined,
      personal_email: personalEmail.trim() || undefined,
      skills: skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [],
      projects: projects ? projects.split('\n').map(p => p.trim()).filter(Boolean) : [],
      certifications: certifications ? certifications.split(',').map(c => c.trim()).filter(Boolean) : [],
      links: {
        linkedin: linkedin.trim() || undefined,
        github: github.trim() || undefined,
        portfolio: portfolio.trim() || undefined,
      },
    };

    try {
      const response = await fetch(`${API_BASE}/students/profile/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to update profile.');
      setMessage(data.message || 'Profile updated successfully!');
      setEditMode(false);
      fetchProfile();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResumeScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const formData = new FormData();
    formData.append('file', file);

    setScanningResume(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/resume/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Resume scan failed');
      setScanResult(data);
      setSelectedScanSkills(data.profile_diff?.skills?.new_suggested || []);
      setSelectedScanProjects(data.profile_diff?.projects?.detected?.map((p: any) => p.title || p) || []);
      setShowScanModal(true);
      fetchProfile();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanningResume(false);
    }
  };

  const handleConfirmScanSuggestions = async () => {
    if (!scanResult) return;
    try {
      const res = await fetch(`${API_BASE}/resume/${scanResult.scan_id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accepted_skills: selectedScanSkills,
          accepted_projects: selectedScanProjects,
          accepted_certifications: scanResult.profile_diff?.certifications?.detected || [],
          accepted_links: scanResult.profile_diff?.links?.new_suggested || {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to merge suggestions');
      setMessage('Resume skills and projects successfully merged into your profile!');
      setShowScanModal(false);
      setScanResult(null);
      fetchProfile();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDirectResumeUpload = async () => {
    if (!profile) return;
    setIsDirectUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      if (directUploadFile) {
        formData.append('file', directUploadFile);
      } else if (directInputUrl.trim()) {
        formData.append('resume_url', directInputUrl.trim());
      } else {
        throw new Error('Please choose a resume file or enter a document URL.');
      }

      const res = await fetch(`${API_BASE}/students/${profile.id || profile._id}/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update resume');

      setMessage('Resume updated successfully!');
      setShowDirectUploadModal(false);
      setDirectUploadFile(null);
      setDirectInputUrl('');
      fetchProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to update resume');
    } finally {
      setIsDirectUploading(false);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setCorrSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/students/${profile.id || profile._id}/correction-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          field_name: corrFieldName,
          current_value: corrCurrentVal,
          requested_value: corrReqVal,
          reason: corrReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to submit correction request');
      setMessage('Academic correction request submitted to your Faculty Coordinator!');
      setShowCorrectionModal(false);
      setCorrReason('');
      setCorrReqVal('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCorrSubmitting(false);
    }
  };

  if (isLoading && !profile) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading your profile...</div>;
  }

  const identity = profile?.identity || {};
  const education = profile?.education || {};
  const academicId = profile?.academic_identity || {};
  const eligibility = profile?.eligibility_data || {};

  // Document formatting
  const rawResumeUrl = profile?.resume_url || profile?.documents?.resume || profile?.documents?.combined_documents;
  const rawTechCertsUrl = profile?.documents?.technical_certificates;
  const rawAchieveCertsUrl = profile?.documents?.achievement_certificates;

  const resumeDoc = formatDocumentUrl(rawResumeUrl);
  const techCertsDoc = formatDocumentUrl(rawTechCertsUrl);
  const achieveCertsDoc = formatDocumentUrl(rawAchieveCertsUrl);

  const currentActiveDoc =
    docSubTab === 'resume' ? resumeDoc : docSubTab === 'tech_certs' ? techCertsDoc : achieveCertsDoc;
  const currentDocLabel =
    docSubTab === 'resume'
      ? 'Resume & Combined PDF'
      : docSubTab === 'tech_certs'
      ? 'Technical Certificates'
      : 'Achievement Certificates';

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', paddingBottom: 60 }}>
      {/* ── HEADER BANNER ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0B192C 0%, #1E3E62 100%)',
          borderRadius: 20,
          padding: '28px 32px',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
          boxShadow: '0 8px 24px rgba(11,25,44,0.25)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <StudentAvatar
            photoUrl={profile?.photo_url || profile?.documents?.profile_photo}
            name={profile?.name || identity.full_name || 'Student'}
            size={72}
            fontSize="1.8rem"
            border="2px solid rgba(255,255,255,0.3)"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
                {profile?.name || identity.full_name || 'Student Profile'}
              </h2>
              <span
                style={{
                  background: profile?.status === 'verified' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)',
                  color: profile?.status === 'verified' ? '#86EFAC' : '#FDE68A',
                  border: `1px solid ${profile?.status === 'verified' ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <CheckCircleIcon size={12} color="currentColor" />
                {profile?.status === 'verified' ? 'FACULTY VERIFIED' : 'PENDING APPROVAL'}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <IdCardIcon size={14} color="#93C5FD" />
              <span>{profile?.roll_number || profile?.student_id}</span>
              <span style={{ opacity: 0.6 }}>•</span>
              <SchoolIcon size={14} color="#93C5FD" />
              <span>{profile?.department_name || academicId.department_name || 'Department'}</span>
              <span style={{ opacity: 0.6 }}>•</span>
              <GraduationCapIcon size={14} color="#C4B5FD" />
              <span>Class of {profile?.passout_year || academicId.graduation_year || 2027}</span>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              style={{
                background: '#FFFFFF',
                color: '#0B192C',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 10,
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <UserIcon size={15} color="#0B192C" />
              <span>Edit Dynamic Profile</span>
            </button>
          ) : (
            <button
              onClick={() => setEditMode(false)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.4)',
                padding: '10px 18px',
                borderRadius: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: '12px 18px',
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            color: '#059669',
            borderRadius: 10,
            marginBottom: 20,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircleIcon size={16} color="#059669" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 18px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#DC2626',
            borderRadius: 10,
            marginBottom: 20,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircleIcon size={16} color="#DC2626" />
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
        {/* ── SECTION 0: ACADEMIC BATCH & SYSTEM-DERIVED TIMELINE ───────────── */}
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: 24,
            gridColumn: '1 / -1',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SchoolIcon size={18} color="#2563EB" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Academic Identity & System Timeline
              </h3>
            </div>
            <span
              style={{
                background: 'rgba(59,130,246,0.12)',
                color: '#2563EB',
                border: '1px solid rgba(59,130,246,0.3)',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              SYSTEM DERIVED
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '12px 14px', borderRadius: 10 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>PROGRAM & DEGREE</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginTop: 2 }}>
                {profile?.program_name || academicId.program_name || 'B.Tech'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '12px 14px', borderRadius: 10 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>DEPARTMENT / BRANCH</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginTop: 2 }}>
                {profile?.department_name || academicId.department_name || 'Computer Science & Engineering'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '12px 14px', borderRadius: 10 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>ACADEMIC BATCH</div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#4F46E5', marginTop: 2 }}>
                {profile?.derived_academic_status?.batch_label || profile?.batch_label || academicId.batch_label || '2023–2027'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '12px 14px', borderRadius: 10 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>STUDY YEAR & SEMESTER</div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#059669', marginTop: 2 }}>
                {profile?.derived_academic_status?.status_label || `${profile?.current_study_year ?? 4}th Year - ${profile?.current_semester ?? 7}th Sem`}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '12px 14px', borderRadius: 10 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>CLASS / SECTION</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginTop: 2 }}>
                {profile?.class_name || academicId.class_name || 'Section-A'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '12px 14px', borderRadius: 10 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>GRADUATION YEAR</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginTop: 2 }}>
                {profile?.expected_graduation_year || profile?.passout_year || academicId.graduation_year || 2027}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 1: VERIFIED ACADEMIC RECORDS (AUTHORITATIVE) ──────────── */}
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GraduationCapIcon size={18} color="#10B981" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Authoritative Academic Records
              </h3>
            </div>
            <span
              style={{
                background: 'rgba(16,185,129,0.12)',
                color: '#059669',
                border: '1px solid rgba(16,185,129,0.3)',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: '0.7rem',
                fontWeight: 700,
              }}
            >
              VERIFIED RECORD
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: '0.88rem' }}>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>UG CGPA (Normalized)</div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#2563EB' }}>
                {education.undergraduate?.normalized_cgpa ?? profile?.cgpa ?? '—'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Active Backlogs</div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: (eligibility.current_backlogs || profile?.active_backlogs) ? '#EF4444' : '#10B981' }}>
                {eligibility.current_backlogs ?? profile?.active_backlogs ?? 0}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>10th Score (Normalized %)</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {education.secondary?.normalized_percentage ? `${education.secondary.normalized_percentage}%` : '—'}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>12th / Diploma (%)</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {education.higher_secondary_or_diploma?.normalized_percentage ? `${education.higher_secondary_or_diploma.normalized_percentage}%` : '—'}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setCorrCurrentVal(String(education.undergraduate?.normalized_cgpa ?? profile?.cgpa ?? ''));
              setShowCorrectionModal(true);
            }}
            style={{
              marginTop: 18,
              width: '100%',
              background: 'rgba(99,102,241,0.08)',
              border: '1px dashed rgba(99,102,241,0.4)',
              color: '#4F46E5',
              padding: '8px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <ClockIcon size={14} color="#4F46E5" />
            <span>Request Faculty Academic Correction</span>
          </button>
        </div>

        {/* ── SECTION 2: IN-PORTAL RESUME VIEWER & SCANNER ─────────────────── */}
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileTextIcon size={18} color="#2563EB" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Resume & Documents Viewer
              </h3>
            </div>
            <span
              style={{
                background: 'rgba(34,197,94,0.12)',
                color: '#16A34A',
                border: '1px solid rgba(34,197,94,0.3)',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: '0.7rem',
                fontWeight: 700,
              }}
            >
              ACTIVE ON PORTAL
            </span>
          </div>

          {/* Subtabs for Documents */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setDocSubTab('resume')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 8,
                border: 'none',
                background: docSubTab === 'resume' ? '#2563EB' : 'var(--bg-secondary, #F8FAFC)',
                color: docSubTab === 'resume' ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>Resume / PDF</span>
              {resumeDoc.hasUrl && <span>●</span>}
            </button>
            <button
              onClick={() => setDocSubTab('tech_certs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 8,
                border: 'none',
                background: docSubTab === 'tech_certs' ? '#2563EB' : 'var(--bg-secondary, #F8FAFC)',
                color: docSubTab === 'tech_certs' ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>Technical Certs</span>
              {techCertsDoc.hasUrl && <span>●</span>}
            </button>
            <button
              onClick={() => setDocSubTab('achieve_certs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 8,
                border: 'none',
                background: docSubTab === 'achieve_certs' ? '#2563EB' : 'var(--bg-secondary, #F8FAFC)',
                color: docSubTab === 'achieve_certs' ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>Achievements</span>
              {achieveCertsDoc.hasUrl && <span>●</span>}
            </button>
          </div>

          {/* Document Preview & Actions */}
          {currentActiveDoc.hasUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => setPreviewDoc({ title: `${currentDocLabel} - ${profile?.name || 'Student'}`, doc: currentActiveDoc })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <FileTextIcon size={12} color="#FFFFFF" />
                    <span>Full Screen</span>
                  </button>
                  <a
                    href={currentActiveDoc.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#059669',
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <UploadIcon size={12} style={{ transform: 'rotate(180deg)' }} />
                    <span>Download</span>
                  </a>
                  <a
                    href={currentActiveDoc.directUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: 'var(--bg-main, #F8FAFC)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <span>Open ↗</span>
                  </a>
                </div>

                <button
                  onClick={() => setShowDirectUploadModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: '#0B192C',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <UploadIcon size={12} />
                  <span>Re-upload / Update</span>
                </button>
              </div>

              {/* Embedded Frame */}
              <iframe
                src={currentActiveDoc.previewUrl}
                title={currentDocLabel}
                style={{
                  width: '100%',
                  height: 320,
                  border: '1px solid var(--border-color)',
                  borderRadius: 10,
                  background: '#F9FAFB',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: 10,
                padding: '24px 16px',
                textAlign: 'center',
                background: 'var(--input-bg)',
              }}
            >
              <FileTextIcon size={28} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                No {currentDocLabel} uploaded yet.
              </div>
              <button
                onClick={() => setShowDirectUploadModal(true)}
                style={{
                  marginTop: 10,
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <UploadIcon size={13} />
                <span>Upload Document</span>
              </button>
            </div>
          )}

          {/* AI Scan Option */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
            <label
              style={{
                display: 'block',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '10px 12px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(139,92,246,0.05)',
              }}
            >
              <input
                type="file"
                accept=".pdf,.docx"
                style={{ display: 'none' }}
                onChange={handleResumeScanUpload}
                disabled={scanningResume}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#7C3AED' }}>
                <SparklesIcon size={15} color="#7C3AED" />
                <span>{scanningResume ? 'Scanning Resume with AI...' : 'Scan Resume to Auto-Extract Skills'}</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: STUDENT DYNAMIC & EDITABLE PROFILE ────────────────── */}
      <div
        style={{
          marginTop: 24,
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CodeIcon size={18} color="#2563EB" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Dynamic Profile (Skills, Projects & Portfolio)
            </h3>
          </div>
          <span
            style={{
              background: 'rgba(59,130,246,0.12)',
              color: '#2563EB',
              border: '1px solid rgba(59,130,246,0.3)',
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: '0.7rem',
              fontWeight: 700,
            }}
          >
            STUDENT EDITABLE
          </span>
        </div>

        <form onSubmit={handleSaveProfile}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Personal Email
              </label>
              <input
                type="email"
                disabled={!editMode}
                value={personalEmail}
                onChange={e => setPersonalEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: editMode ? 'var(--input-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Mobile Number
              </label>
              <input
                type="text"
                disabled={!editMode}
                value={mobile}
                onChange={e => setMobile(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: editMode ? 'var(--input-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Technical Skills & Tools (comma separated)
              </label>
              <input
                type="text"
                disabled={!editMode}
                value={skills}
                onChange={e => setSkills(e.target.value)}
                placeholder="Python, React, FastAPI, Docker, MongoDB"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: editMode ? 'var(--input-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Academic & Key Projects (one per line)
              </label>
              <textarea
                disabled={!editMode}
                rows={3}
                value={projects}
                onChange={e => setProjects(e.target.value)}
                placeholder="Placement Portal: Fullstack automation platform using FastAPI & React"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: editMode ? 'var(--input-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                LinkedIn Profile URL
              </label>
              <input
                type="url"
                disabled={!editMode}
                value={linkedin}
                onChange={e => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: editMode ? 'var(--input-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>
                GitHub Profile URL
              </label>
              <input
                type="url"
                disabled={!editMode}
                value={github}
                onChange={e => setGithub(e.target.value)}
                placeholder="https://github.com/..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: editMode ? 'var(--input-bg)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {editMode && (
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '8px 18px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  background: '#2563EB',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 22px',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* ── SECTION 4: SECURITY SETTINGS ─────────────────────────────────── */}
      <div style={{ marginTop: 24 }}>
        <ChangePassword token={token} />
      </div>

      {/* ── DIRECT RESUME RE-UPLOAD MODAL ── */}
      {showDirectUploadModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDirectUploadModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              borderRadius: 16,
              maxWidth: 500,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UploadIcon size={20} color="#2563EB" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Upload / Replace Resume
                </h3>
              </div>
              <button
                onClick={() => setShowDirectUploadModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* File Upload Option */}
            <div
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: 12,
                padding: '24px 16px',
                textAlign: 'center',
                background: 'var(--input-bg, #F9FAFB)',
                cursor: 'pointer',
              }}
              onClick={() => document.getElementById('student-profile-resume-input')?.click()}
            >
              <input
                id="student-profile-resume-input"
                type="file"
                accept=".pdf,.docx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setDirectUploadFile(e.target.files[0]);
                    setDirectInputUrl('');
                  }
                }}
              />
              <FileTextIcon size={32} color="#3B82F6" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {directUploadFile ? directUploadFile.name : 'Click to Browse PDF or DOCX File'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                {directUploadFile ? `${(directUploadFile.size / 1024).toFixed(1)} KB` : 'Maximum file size: 15MB'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>OR PASTE CLOUD / DRIVE LINK</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Google Drive or Document Link
              </label>
              <input
                type="url"
                placeholder="https://drive.google.com/open?id=... or https://.../resume.pdf"
                value={directInputUrl}
                onChange={(e) => {
                  setDirectInputUrl(e.target.value);
                  if (e.target.value) setDirectUploadFile(null);
                }}
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setShowDirectUploadModal(false)}
                disabled={isDirectUploading}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDirectResumeUpload}
                disabled={isDirectUploading || (!directUploadFile && !directInputUrl.trim())}
                style={{
                  background: isDirectUploading ? '#9CA3AF' : '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: isDirectUploading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isDirectUploading ? <RefreshIcon size={14} /> : <CheckIcon size={14} color="#FFFFFF" />}
                <span>{isDirectUploading ? 'Updating...' : 'Save & Update'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI RESUME SUGGESTIONS DIFF MODAL ─────────────────────────────── */}
      {showScanModal && scanResult && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: 16,
              maxWidth: 620,
              width: '100%',
              padding: 24,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <SparklesIcon size={18} color="#7C3AED" />
                <span>AI Resume Suggestions</span>
              </h3>
              <button
                onClick={() => setShowScanModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Select which detected items you wish to merge into your dynamic placement profile.
            </p>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                Suggested Skills to Add:
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {scanResult.profile_diff?.skills?.new_suggested?.map((sk: string) => (
                  <label
                    key={sk}
                    style={{
                      background: selectedScanSkills.includes(sk) ? '#2563EB' : 'var(--input-bg)',
                      color: selectedScanSkills.includes(sk) ? '#fff' : 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      padding: '4px 10px',
                      borderRadius: 14,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedScanSkills.includes(sk)}
                      onChange={e => {
                        if (e.target.checked) setSelectedScanSkills([...selectedScanSkills, sk]);
                        else setSelectedScanSkills(selectedScanSkills.filter(s => s !== sk));
                      }}
                      style={{ display: 'none' }}
                    />
                    {sk}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowScanModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleConfirmScanSuggestions}
                style={{
                  background: '#10B981',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <CheckIcon size={14} color="#FFFFFF" />
                <span>Accept & Merge Suggestions</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACADEMIC CORRECTION REQUEST MODAL ─────────────────────────────── */}
      {showCorrectionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: 16,
              maxWidth: 480,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Request Academic Correction
              </h3>
              <button
                onClick={() => setShowCorrectionModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitCorrection}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Academic Field</label>
                <select
                  value={corrFieldName}
                  onChange={e => setCorrFieldName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
                >
                  <option value="UG CGPA">UG CGPA</option>
                  <option value="10th Percentage">10th Percentage</option>
                  <option value="12th / Diploma Percentage">12th / Diploma Percentage</option>
                  <option value="Active Backlogs">Active Backlogs</option>
                  <option value="Date of Birth">Date of Birth</option>
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Requested Correct Value</label>
                <input
                  type="text"
                  required
                  value={corrReqVal}
                  onChange={e => setCorrReqVal(e.target.value)}
                  placeholder="e.g. 8.85"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Reason / Proof Reference</label>
                <textarea
                  required
                  rows={3}
                  value={corrReason}
                  onChange={e => setCorrReason(e.target.value)}
                  placeholder="e.g. Updated Grade card for 3-1 published on portal."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={corrSubmitting}
                  style={{ background: '#2563EB', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  {corrSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── FULL SCREEN DOCUMENT VIEWER OVERLAY ── */}
      {previewDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(5, 12, 22, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            padding: '16px 20px',
            boxSizing: 'border-box',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewDoc(null);
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
              borderRadius: 20,
              width: '100%',
              maxWidth: 1100,
              height: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 30px 60px rgba(0, 0, 0, 0.45)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 22px',
                background: 'linear-gradient(135deg, #0B192C 0%, #1E3E62 100%)',
                color: '#FFFFFF',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileTextIcon size={20} color="#93C5FD" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                    {previewDoc.title}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#93C5FD', opacity: 0.9 }}>
                    {previewDoc.doc?.isDrive ? 'Google Drive Cloud Document' : 'PDF Document Viewer'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <a
                  href={previewDoc.doc?.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#16A34A',
                    color: '#FFFFFF',
                    padding: '7px 14px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  <UploadIcon size={14} style={{ transform: 'rotate(180deg)' }} />
                  <span>Download</span>
                </a>
                <a
                  href={previewDoc.doc?.directUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(255, 255, 255, 0.15)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: '#FFFFFF',
                    padding: '7px 14px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <span>Open ↗</span>
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '50%',
                    width: 34,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                  }}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, position: 'relative', background: '#F8FAFC' }}>
              <iframe
                src={previewDoc.doc?.previewUrl}
                title={previewDoc.title}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#FFFFFF' }}
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
