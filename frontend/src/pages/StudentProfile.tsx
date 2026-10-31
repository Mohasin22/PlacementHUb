import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
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
  GoogleDriveIcon,
} from '../components/Icons';

import { StudentGDriveVault } from '../components/StudentGDriveVault';

const API_BASE = 'http://127.0.0.1:8000/api';

interface StudentProfileProps {
  token: string;
  initialTab?: string;
  defaultTab?: string;
  onNavigateToDrives?: () => void;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({ token, initialTab, defaultTab }) => {
  const [profile, setProfile] = useState<any>(null);
  type ProfileNavTab = 'basic' | 'education' | 'skills' | 'gdrive_vault';
  const effectiveTab = defaultTab || initialTab;
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileNavTab>(() => {
    if (effectiveTab === 'gdrive_vault') {
      return 'gdrive_vault';
    }
    if (effectiveTab === 'education' || effectiveTab === 'skills') {
      return effectiveTab;
    }
    return 'basic';
  });

  useEffect(() => {
    const tab = defaultTab || initialTab;
    if (tab === 'gdrive_vault') {
      setActiveProfileTab('gdrive_vault');
    } else if (tab === 'basic' || tab === 'education' || tab === 'skills') {
      setActiveProfileTab(tab);
    }
  }, [initialTab, defaultTab]);

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

  // Validation report state
  const [validationReport, setValidationReport] = useState<any | null>(null);

  // Backlog history state
  const [backlogHistory, setBacklogHistory] = useState<any[]>([]);
  const [showBacklogHistory, setShowBacklogHistory] = useState(false);

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
    fetchValidationReport();
    fetchBacklogHistory();
  }, []);

  const fetchValidationReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/students/profile/validation-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setValidationReport(await res.json());
    } catch { }
  };

  const fetchBacklogHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/students/profile/backlog-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setBacklogHistory(d.backlog_history || d || []);
      }
    } catch { }
  };

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/students/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('auth');
        window.location.reload();
        return;
      }
      if (!response.ok) {
        let msg = 'Failed to load profile.';
        try {
          const errData = await response.json();
          if (errData?.detail) {
            msg = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
          }
        } catch {}
        throw new Error(msg);
      }
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

  const handleScanExistingResume = async () => {
    if (!profile) return;
    const rawResume = profile.resume_url || profile.documents?.resume || profile.documents?.combined_documents;
    if (!rawResume || !rawResume.trim()) {
      setError('No active resume found on your profile. Please upload or link your resume first using "Re-upload / Update".');
      setShowDirectUploadModal(true);
      return;
    }

    setScanningResume(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/resume/scan-existing`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Resume analysis failed');
      setScanResult(data);
      setSelectedScanSkills(data.profile_diff?.skills?.new_suggested || []);
      setSelectedScanProjects(data.profile_diff?.projects?.detected?.map((p: any) => p.title || p) || []);
      setShowScanModal(true);
      fetchProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to analyze resume');
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

    const docLabel = docSubTab === 'resume' ? 'Resume' : docSubTab === 'tech_certs' ? 'Technical certificates' : 'Achievement certificates';

    try {
      const formData = new FormData();
      if (directUploadFile) {
        formData.append('file', directUploadFile);
      } else if (directInputUrl.trim()) {
        formData.append('resume_url', directInputUrl.trim());
      } else {
        throw new Error(`Please choose a ${docLabel.toLowerCase()} file or enter a document URL.`);
      }
      formData.append('doc_type', docSubTab);

      const res = await fetch(`${API_BASE}/students/${profile.id || profile._id}/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Failed to update ${docLabel.toLowerCase()}`);

      setMessage(data.message || `${docLabel} updated successfully!`);
      setShowDirectUploadModal(false);
      setDirectUploadFile(null);
      setDirectInputUrl('');
      fetchProfile();
    } catch (err: any) {
      setError(err.message || `Failed to update ${docLabel.toLowerCase()}`);
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

      {/* ── CHANGES REQUESTED NOTICE BANNER ─────────────────────────────────── */}
      {profile?.review_status === 'CHANGES_REQUESTED' && profile?.review_note && (
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}>
          <AlertCircleIcon size={22} color="#FBBF24" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#FBBF24', fontSize: '0.95rem', marginBottom: 4 }}>
              ⚠ Faculty Has Requested Data Corrections
            </div>
            <div style={{ color: '#FDE68A', fontSize: '0.85rem', lineHeight: 1.6 }}>
              {profile.review_note}
            </div>
            <div style={{ marginTop: 10, color: 'rgba(253,230,138,0.7)', fontSize: '0.78rem' }}>
              Please update the relevant fields and resubmit your profile for verification.
            </div>
          </div>
        </div>
      )}

      {/* ── MISSING DATA VALIDATION BANNER ──────────────────────────────────── */}
      {validationReport && (
        (validationReport.errors?.length > 0 || validationReport.warnings?.length > 0 || validationReport.missing_fields?.length > 0)
      ) && (
        <div style={{
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 14,
          padding: '16px 20px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <AlertCircleIcon size={20} color="#F87171" />
            <span style={{ fontWeight: 700, color: '#F87171', fontSize: '0.92rem' }}>Profile Validation Issues Detected</span>
            <span style={{ marginLeft: 'auto', color: '#F87171', fontSize: '0.8rem' }}>
              Complete your profile to improve placement eligibility.
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(validationReport.errors || []).map((e: string, i: number) => (
              <span key={i} style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171', padding: '3px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700 }}>❌ {e}</span>
            ))}
            {(validationReport.warnings || []).map((w: string, i: number) => (
              <span key={i} style={{ background: 'rgba(245,158,11,0.12)', color: '#FBBF24', padding: '3px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700 }}>⚠️ {w}</span>
            ))}
            {(validationReport.missing_fields || []).map((f: string, i: number) => (
              <span key={i} style={{ background: 'rgba(156,163,175,0.1)', color: '#9CA3AF', padding: '3px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700 }}>🔲 Missing: {f}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── HEADER BANNER ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 14,
          padding: '24px 28px',
          color: '#0F172A',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <StudentAvatar
            photoUrl={profile?.photo_url || profile?.documents?.profile_photo}
            name={profile?.name || identity.full_name || 'Student'}
            size={68}
            fontSize="1.6rem"
            border="2px solid #E2E8F0"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
                {profile?.name || identity.full_name || 'Student Profile'}
              </h2>
              <span
                style={{
                  background: profile?.status === 'verified' ? '#F0FDF4' : '#FFFBEB',
                  color: profile?.status === 'verified' ? '#16A34A' : '#D97706',
                  border: `1px solid ${profile?.status === 'verified' ? '#BBF7D0' : '#FDE68A'}`,
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: '0.72rem',
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
            <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <IdCardIcon size={14} color="#2563EB" />
              <span>{profile?.roll_number || profile?.student_id}</span>
              <span style={{ color: '#CBD5E1' }}>•</span>
              <SchoolIcon size={14} color="#2563EB" />
              <span>{profile?.department_name || academicId.department_name || 'Department'}</span>
              <span style={{ color: '#CBD5E1' }}>•</span>
              <GraduationCapIcon size={14} color="#7C3AED" />
              <span>Class of {profile?.passout_year || academicId.graduation_year || 2027}</span>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              style={{
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                padding: '9px 18px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
              }}
            >
              <UserIcon size={15} color="#FFFFFF" />
              <span>Edit Dynamic Profile</span>
            </button>
          ) : (
            <button
              onClick={() => setEditMode(false)}
              style={{
                background: '#FFFFFF',
                color: '#0F172A',
                border: '1px solid #E2E8F0',
                padding: '9px 18px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
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

      {/* ── STUDENT PROFILE SUB-NAVIGATION TABS ───────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 4,
          marginBottom: 24,
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'basic', label: 'Basic Info', icon: UserIcon },
          { key: 'education', label: 'Education & Location', icon: GraduationCapIcon },
          { key: 'skills', label: 'Skills & Preferences', icon: CodeIcon },
          {
            key: 'gdrive_vault',
            label: 'Drive Placement Vault',
            icon: GoogleDriveIcon,
            badge: profile?.gdrive_vault?.is_connected
              ? (profile?.gdrive_vault?.verification_report?.overall_result === 'ALL_VERIFIED' ? '✓ Verified' : 'AI Active')
              : 'Setup',
          },
        ].map((t) => {
          const isActive = activeProfileTab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setActiveProfileTab(t.key as ProfileNavTab);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 18px',
                borderRadius: '10px 10px 0 0',
                border: 'none',
                background: isActive ? 'var(--card-bg, #FFFFFF)' : 'transparent',
                color: isActive ? '#2563EB' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                borderBottom: isActive ? '3px solid #2563EB' : '3px solid transparent',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={16} color="currentColor" />
              <span>{t.label}</span>
              {t.badge && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontWeight: 700,
                    background: t.badge.includes('✓') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: t.badge.includes('✓') ? '#15803D' : '#DC2626',
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── GDRIVE VAULT TAB CONTENT ─────────────────────────────────────────── */}
      {activeProfileTab === 'gdrive_vault' && (
        <StudentGDriveVault token={token} studentProfile={profile} />
      )}



      {/* ── BASIC INFO TAB CONTENT ──────────────────────────────────────────── */}
      {activeProfileTab === 'basic' && (
        <>
          {/* ── SECTION 0: ACADEMIC BATCH & SYSTEM-DERIVED TIMELINE ───────────── */}
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
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

          {/* ── SECTION 4: SECURITY SETTINGS (IN BASIC INFO) ──────────────────── */}
          <div style={{ marginTop: 24 }}>
            <ChangePassword token={token} />
          </div>
        </>
      )}

      {/* ── EDUCATION & LOCATION TAB CONTENT ────────────────────────────────── */}
      {activeProfileTab === 'education' && (
        <div className="profile-academic-docs-grid" style={{ marginBottom: 24 }}>
          {/* ── SECTION 1: VERIFIED ACADEMIC RECORDS (AUTHORITATIVE) ──────────── */}
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GraduationCapIcon size={18} color="#10B981" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* UG CGPA Card */}
            <div
              style={{
                background: 'rgba(37,99,235,0.04)',
                border: '1px solid rgba(37,99,235,0.18)',
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                UG CGPA (Normalized)
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontWeight: 800, fontSize: '1.45rem', color: '#2563EB' }}>
                  {education.undergraduate?.normalized_cgpa ?? profile?.cgpa ?? '—'}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>/ 10.0</span>
              </div>
            </div>

            {/* Active Backlogs Card */}
            <div
              style={{
                background: (eligibility.current_backlogs || profile?.active_backlogs) ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)',
                border: `1px solid ${(eligibility.current_backlogs || profile?.active_backlogs) ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                borderRadius: 12,
                padding: '14px 16px',
              }}
            >
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active Backlogs
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontWeight: 800, fontSize: '1.45rem', color: (eligibility.current_backlogs || profile?.active_backlogs) ? '#EF4444' : '#10B981' }}>
                  {eligibility.current_backlogs ?? profile?.active_backlogs ?? 0}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: (eligibility.current_backlogs || profile?.active_backlogs) ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                    color: (eligibility.current_backlogs || profile?.active_backlogs) ? '#EF4444' : '#059669',
                  }}
                >
                  {(eligibility.current_backlogs || profile?.active_backlogs) ? '⚠ Attention Required' : '✓ All Clear'}
                </span>
              </div>
            </div>

            {/* 10th & 12th Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div
                style={{
                  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  10th Score (%)
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', marginTop: 4 }}>
                  {education.secondary?.normalized_percentage ? `${education.secondary.normalized_percentage}%` : '—'}
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  12th / Diploma (%)
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', marginTop: 4 }}>
                  {education.higher_secondary_or_diploma?.normalized_percentage ? `${education.higher_secondary_or_diploma.normalized_percentage}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Backlog History Toggle */}
          {backlogHistory.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <button
                onClick={() => setShowBacklogHistory(prev => !prev)}
                style={{
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  color: '#60A5FA',
                  padding: '6px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                📋 {showBacklogHistory ? 'Hide' : 'View'} Backlog History ({backlogHistory.length} subject{backlogHistory.length !== 1 ? 's' : ''})
              </button>

              {showBacklogHistory && (
                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-main)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>Subject</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>Sem</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backlogHistory.map((bl: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{bl.subject_name || bl.subject_code || '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>Sem {bl.semester || '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ background: bl.status === 'ACTIVE' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', color: bl.status === 'ACTIVE' ? '#F87171' : '#34D399', padding: '2px 6px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700 }}>
                              {bl.status === 'ACTIVE' ? 'Active' : 'Cleared'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              setCorrCurrentVal(String(education.undergraduate?.normalized_cgpa ?? profile?.cgpa ?? ''));
              setShowCorrectionModal(true);
            }}
            style={{
              marginTop: 'auto',
              width: '100%',
              background: 'rgba(99,102,241,0.08)',
              border: '1px dashed rgba(99,102,241,0.4)',
              color: '#4F46E5',
              padding: '10px 14px',
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.2s',
            }}
          >
            <ClockIcon size={14} color="#4F46E5" />
            <span>Request Faculty Academic Correction</span>
          </button>
        </div>

        {/* ── SECTION 2: IN-PORTAL RESUME & DOCUMENTS VIEWER (SPACIOUS) ─────── */}
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minWidth: 0,
          }}
        >
          {/* Header & Status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileTextIcon size={18} color="#2563EB" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Resume & Documents Viewer
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Official verified documents synced across placement applications
                </div>
              </div>
            </div>
            <span
              style={{
                background: 'rgba(34,197,94,0.12)',
                color: '#16A34A',
                border: '1px solid rgba(34,197,94,0.3)',
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A' }} />
              ACTIVE ON PORTAL
            </span>
          </div>

          {/* Subtabs for Documents */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary, rgba(0,0,0,0.03))', padding: 4, borderRadius: 12, border: '1px solid var(--border-color)', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={() => setDocSubTab('resume')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: docSubTab === 'resume' ? '#2563EB' : 'transparent',
                color: docSubTab === 'resume' ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: docSubTab === 'resume' ? 700 : 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📄 Resume / PDF</span>
              {resumeDoc.hasUrl && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>●</span>}
            </button>
            <button
              onClick={() => setDocSubTab('tech_certs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: docSubTab === 'tech_certs' ? '#2563EB' : 'transparent',
                color: docSubTab === 'tech_certs' ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: docSubTab === 'tech_certs' ? 700 : 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📜 Technical Certs</span>
              {techCertsDoc.hasUrl && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>●</span>}
            </button>
            <button
              onClick={() => setDocSubTab('achieve_certs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 8,
                border: 'none',
                background: docSubTab === 'achieve_certs' ? '#2563EB' : 'transparent',
                color: docSubTab === 'achieve_certs' ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: docSubTab === 'achieve_certs' ? 700 : 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🏆 Achievements</span>
              {achieveCertsDoc.hasUrl && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>●</span>}
            </button>
          </div>

          {/* Document Preview & Actions */}
          {currentActiveDoc.hasUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Action Toolbar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setPreviewDoc({ title: `${currentDocLabel} - ${profile?.name || 'Student'}`, doc: currentActiveDoc })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '6px 14px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <FileTextIcon size={14} color="#FFFFFF" />
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
                      gap: 6,
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#059669',
                      padding: '6px 14px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <UploadIcon size={13} style={{ transform: 'rotate(180deg)' }} />
                    <span>Download</span>
                  </a>
                  <a
                    href={currentActiveDoc.directUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '6px 14px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <span>Open in New Tab ↗</span>
                  </a>
                </div>

                <button
                  onClick={() => setShowDirectUploadModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#0B192C',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '7px 16px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                  }}
                >
                  <UploadIcon size={14} color="#FFFFFF" />
                  <span>{`Re-upload ${docSubTab === 'resume' ? 'Resume' : 'Certificate'}`}</span>
                </button>
              </div>

              {/* Drive link advice if applicable */}
              {currentActiveDoc.isDrive && (
                <div
                  style={{
                    background: 'rgba(59,130,246,0.06)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)' }}>
                    💡 <strong>Tip:</strong> If Google Drive asks for login or permissions, ensure sharing is set to <em>"Anyone with the link can view"</em>.
                  </div>
                  <a
                    href={currentActiveDoc.directUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#2563EB', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Open Drive ↗
                  </a>
                </div>
              )}

              {/* Spacious Embedded Frame */}
              <iframe
                src={currentActiveDoc.previewUrl}
                title={currentDocLabel}
                style={{
                  width: '100%',
                  height: 520,
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  background: '#F8FAFC',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: 14,
                padding: '40px 24px',
                textAlign: 'center',
                background: 'var(--input-bg)',
              }}
            >
              <FileTextIcon size={36} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                No {currentDocLabel} uploaded yet.
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, marginBottom: 16 }}>
                Upload your document to ensure recruiters have full access during placement drives.
              </div>
              <button
                onClick={() => setShowDirectUploadModal(true)}
                style={{
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: 8,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <UploadIcon size={14} />
                <span>Upload Document</span>
              </button>
            </div>
          )}

          {/* AI Scan Option (Analyses already uploaded resume) */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 14, marginTop: 4 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid rgba(139,92,246,0.3)',
                borderRadius: 12,
                padding: '12px 18px',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(99,102,241,0.04) 100%)',
                boxShadow: '0 2px 8px rgba(139,92,246,0.06)',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(124,58,237,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SparklesIcon size={20} color="#7C3AED" />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{scanningResume ? 'Analysing Active Resume with AI...' : 'Scan Resume to Auto-Extract Skills'}</span>
                    {resumeDoc.hasUrl && (
                      <span style={{ fontSize: '0.7rem', color: '#059669', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                        Active Resume Loaded ✓
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    AI reads your current uploaded resume and extracts technical skills, tools, and projects into your profile
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleScanExistingResume}
                disabled={scanningResume}
                style={{
                  background: scanningResume ? '#9CA3AF' : '#7C3AED',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: scanningResume ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                }}
              >
                <SparklesIcon size={14} color="#FFFFFF" />
                <span>{scanningResume ? 'Analysing...' : 'Analyse Current Resume'}</span>
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ── SKILLS & PREFERENCES TAB CONTENT ────────────────────────────────── */}
      {activeProfileTab === 'skills' && (
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
      )}

      {/* ── DIRECT RESUME / CERTIFICATE RE-UPLOAD MODAL ── */}
      {showDirectUploadModal && ReactDOM.createPortal(
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
            if (e.target === e.currentTarget) setShowDirectUploadModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              maxWidth: 520,
              width: '100%',
              padding: 28,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UploadIcon size={20} color="#2563EB" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {docSubTab === 'resume'
                      ? 'Upload / Replace Resume'
                      : docSubTab === 'tech_certs'
                      ? 'Upload / Replace Technical Certificates'
                      : 'Upload / Replace Achievement Certificates'}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Update your official document file or cloud link on the portal
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowDirectUploadModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* File Upload Option */}
            <div
              style={{
                border: '2px dashed var(--border-color)',
                borderRadius: 14,
                padding: '24px 18px',
                textAlign: 'center',
                background: 'var(--input-bg, #F9FAFB)',
                cursor: 'pointer',
              }}
              onClick={() => document.getElementById('student-profile-doc-input')?.click()}
            >
              <input
                id="student-profile-doc-input"
                type="file"
                accept={docSubTab === 'resume' ? '.pdf,.docx' : '.pdf,.png,.jpg,.jpeg'}
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setDirectUploadFile(e.target.files[0]);
                    setDirectInputUrl('');
                  }
                }}
              />
              <FileTextIcon size={34} color="#3B82F6" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                {directUploadFile ? directUploadFile.name : `Click to Browse ${docSubTab === 'resume' ? 'PDF or DOCX Resume' : 'PDF Document'}`}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                {directUploadFile ? `${(directUploadFile.size / 1024).toFixed(1)} KB` : 'Maximum file size: 15MB'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.04em' }}>OR PASTE CLOUD / DRIVE LINK</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Google Drive or Document Link
              </label>
              <input
                type="url"
                placeholder="https://drive.google.com/open?id=... or https://.../document.pdf"
                value={directInputUrl}
                onChange={(e) => {
                  setDirectInputUrl(e.target.value);
                  if (e.target.value) setDirectUploadFile(null);
                }}
                style={{
                  width: '100%',
                  height: 40,
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setShowDirectUploadModal(false)}
                disabled={isDirectUploading}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  padding: '9px 18px',
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
                  padding: '9px 22px',
                  borderRadius: 8,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: isDirectUploading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                }}
              >
                {isDirectUploading ? <RefreshIcon size={14} /> : <CheckIcon size={14} color="#FFFFFF" />}
                <span>{isDirectUploading ? 'Updating...' : 'Save & Update'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── AI RESUME SUGGESTIONS DIFF MODAL ─────────────────────────────── */}
      {showScanModal && scanResult && ReactDOM.createPortal(
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
            if (e.target === e.currentTarget) setShowScanModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: 20,
              maxWidth: 620,
              width: '100%',
              padding: 28,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              border: '1px solid var(--border-color)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
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
        </div>,
        document.body
      )}

      {/* ── ACADEMIC CORRECTION REQUEST MODAL ─────────────────────────────── */}
      {showCorrectionModal && ReactDOM.createPortal(
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
            if (e.target === e.currentTarget) setShowCorrectionModal(false);
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: 20,
              maxWidth: 480,
              width: '100%',
              padding: 26,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              border: '1px solid var(--border-color)',
            }}
            onClick={(e) => e.stopPropagation()}
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
        </div>,
        document.body
      )}
      {/* ── FULL SCREEN DOCUMENT VIEWER OVERLAY ── */}
      {previewDoc && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(5, 12, 22, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000000,
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
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '14px 22px',
                background: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                color: '#0F172A',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileTextIcon size={20} color="#2563EB" />
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
        </div>,
        document.body
      )}
    </div>
  );
};
