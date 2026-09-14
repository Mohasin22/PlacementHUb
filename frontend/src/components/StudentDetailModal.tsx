import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  CloseIcon,
  IdCardIcon,
  CopyIcon,
  CheckIcon,
  GraduationCapIcon,
  SchoolIcon,
  BriefcaseIcon,
  FileTextIcon,
  MailIcon,
  PhoneIcon,
  CodeIcon,
  AwardMedalIcon,
  ExternalLinkIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  AnalyticsIcon,
  UserIcon,
  UploadIcon,
  SparklesIcon,
} from './Icons';
import { StudentAvatar } from './StudentAvatar';

interface StudentDetailModalProps {
  student: any;
  isOpen: boolean;
  onClose: () => void;
}

export function formatDocumentUrl(rawUrl?: string | null): {
  isDrive: boolean;
  previewUrl: string;
  downloadUrl: string;
  directUrl: string;
  hasUrl: boolean;
} {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { isDrive: false, previewUrl: '', downloadUrl: '', directUrl: '', hasUrl: false };
  }
  const clean = rawUrl.trim();
  
  // Guard against non-URLs (numbers, text like 'None', '0.0', 'Udemy', etc.)
  const isUrl = clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/api/') || clean.includes('drive.google.com') || clean.includes('docs.google.com');
  if (!isUrl) {
    return { isDrive: false, previewUrl: '', downloadUrl: '', directUrl: '', hasUrl: false };
  }

  // Google Drive link patterns
  const driveMatch = clean.match(/(?:drive\.google\.com\/(?:open\?id=|file\/d\/|uc\?(?:export=download&)?id=)|docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/)([a-zA-Z0-9_-]+)/i);
  
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    return {
      isDrive: true,
      previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      directUrl: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
      hasUrl: true,
    };
  }
  
  return {
    isDrive: false,
    previewUrl: clean,
    downloadUrl: clean,
    directUrl: clean,
    hasUrl: true,
  };
}

// ── FULL SCREEN DOCUMENT VIEWER MODAL ─────────────────────────────────────────
interface FullScreenDocModalProps {
  title: string;
  doc: {
    previewUrl: string;
    downloadUrl: string;
    directUrl: string;
    isDrive: boolean;
    hasUrl: boolean;
  };
  isOpen: boolean;
  onClose: () => void;
}

const FullScreenDocModal: React.FC<FullScreenDocModalProps> = ({
  title,
  doc,
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !doc.hasUrl) return null;

  return ReactDOM.createPortal(
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
        if (e.target === e.currentTarget) onClose();
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
          animation: 'fadeInUp 0.2s ease-out',
        }}
      >
        {/* Modal Top Bar */}
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
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileTextIcon size={20} color="#93C5FD" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                {title}
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#93C5FD', opacity: 0.9 }}>
                {doc.isDrive ? 'Google Drive Cloud Document' : 'PDF Document Viewer'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Download Button */}
            <a
              href={doc.downloadUrl}
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
                boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
              }}
            >
              <UploadIcon size={14} style={{ transform: 'rotate(180deg)' }} />
              <span>Download</span>
            </a>

            {/* Open in New Tab Button */}
            <a
              href={doc.directUrl}
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
              <span>Open in New Tab</span>
              <ExternalLinkIcon size={13} color="#FFFFFF" />
            </a>

            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="Close Viewer"
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

        {/* Full-size Iframe Preview */}
        <div style={{ flex: 1, position: 'relative', background: '#F8FAFC' }}>
          <iframe
            src={doc.previewUrl}
            title={title}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              background: '#FFFFFF',
            }}
            allow="autoplay"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'academics' | 'education' | 'skills' | 'contact'>('academics');
  const [copied, setCopied] = useState(false);

  // Full Screen Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<{ title: string; doc: any } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewDoc) setPreviewDoc(null);
        else onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose, previewDoc]);

  if (!isOpen || !student) return null;

  const copyRoll = () => {
    if (student.roll_number) {
      navigator.clipboard.writeText(student.roll_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const name = student.name || student.identity?.full_name || 'Student';
  const rollNumber = student.roll_number || student.student_id || 'N/A';
  const deptName = student.department_name || student.academic_identity?.department_name || 'Department';
  const className = student.class_name || student.academic_identity?.class_name || 'Section A';
  const batchLabel = student.batch_label || student.academic_identity?.batch_label || '2023–2027';
  const studyYearLabel = student.study_year_label || `${student.current_study_year || 4}th Year`;
  const semesterLabel = student.semester_label || `${student.current_semester || 7}th Sem`;
  const progName = student.program_name || student.academic_identity?.program_name || 'UG';
  const cgpa = Number(student.cgpa || student.education?.undergraduate?.normalized_cgpa || 0).toFixed(2);
  const activeBacklogs = student.active_backlogs ?? student.eligibility_data?.current_backlogs ?? 0;
  const totalBacklogs = student.total_backlogs ?? student.eligibility_data?.backlog_count ?? 0;
  const eduGap = student.eligibility_data?.education_gap || 'No';
  const firstAttempt = student.eligibility_data?.first_attempt_status || 'Yes';
  
  // Document URLs & formatting
  const rawResumeUrl = student.resume_url || student.documents?.resume || student.documents?.combined_documents;
  const rawTechCertsUrl = student.documents?.technical_certificates;
  const rawAchieveCertsUrl = student.documents?.achievement_certificates;
  const photoUrl = student.photo_url || student.documents?.profile_photo;

  const resumeDoc = formatDocumentUrl(rawResumeUrl);
  const techCertsDoc = formatDocumentUrl(rawTechCertsUrl);
  const achieveCertsDoc = formatDocumentUrl(rawAchieveCertsUrl);

  const instEmail = student.emails?.institute || student.contact?.institutional_email || '';
  const persEmail = student.emails?.personal || student.contact?.personal_email || '';
  const mobile = student.mobile || student.contact?.mobile || '';

  // SGPAs from undergraduate record or semesters array
  const rawSgpaMap = student.education?.undergraduate?.semester_sgpa || {};
  const semestersData = [
    { sem: 1, key: '1-1', label: 'Semester 1', sgpa: rawSgpaMap['1-1'] ?? student.education?.undergraduate?.raw_sgpas?.['1-1'] },
    { sem: 2, key: '1-2', label: 'Semester 2', sgpa: rawSgpaMap['1-2'] ?? student.education?.undergraduate?.raw_sgpas?.['1-2'] },
    { sem: 3, key: '2-1', label: 'Semester 3', sgpa: rawSgpaMap['2-1'] ?? student.education?.undergraduate?.raw_sgpas?.['2-1'] },
    { sem: 4, key: '2-2', label: 'Semester 4', sgpa: rawSgpaMap['2-2'] ?? student.education?.undergraduate?.raw_sgpas?.['2-2'] },
    { sem: 5, key: '3-1', label: 'Semester 5', sgpa: rawSgpaMap['3-1'] ?? student.education?.undergraduate?.raw_sgpas?.['3-1'] },
    { sem: 6, key: '3-2', label: 'Semester 6', sgpa: rawSgpaMap['3-2'] ?? student.education?.undergraduate?.raw_sgpas?.['3-2'] },
    { sem: 7, key: '4-1', label: 'Semester 7', sgpa: rawSgpaMap['4-1'] ?? student.education?.undergraduate?.raw_sgpas?.['4-1'] },
    { sem: 8, key: '4-2', label: 'Semester 8', sgpa: rawSgpaMap['4-2'] ?? student.education?.undergraduate?.raw_sgpas?.['4-2'] },
  ];

  // Secondary (10th) & Higher Secondary (12th)
  const tenth = student.education?.secondary || {};
  const twelfth = student.education?.higher_secondary_or_diploma || {};
  const ugEdu = student.education?.undergraduate || {};
  const entranceExams = student.entrance_exams || [];
  const skillsList = Array.isArray(student.skills) ? student.skills : [];
  const projectsList = Array.isArray(student.projects) ? student.projects : [];
  const certsList = Array.isArray(student.certifications) ? student.certifications : [];
  const internshipsList = Array.isArray(student.internships) ? student.internships : [];
  const achievementsList = Array.isArray(student.achievements) ? student.achievements : [];
  const links = student.links || {};

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(11, 25, 44, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px 20px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !previewDoc) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.1))',
          borderRadius: 20,
          width: '100%',
          maxWidth: 960,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          animation: 'fadeInUp 0.25s ease-out',
        }}
      >
        {/* ── HEADER BANNER ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0B192C 0%, #1E3E62 100%)',
            padding: '22px 28px',
            color: '#FFFFFF',
            position: 'relative',
          }}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          >
            <CloseIcon size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {/* Avatar / Photo */}
            <StudentAvatar
              photoUrl={photoUrl}
              name={name}
              size={68}
              fontSize="1.45rem"
              border="3px solid rgba(255, 255, 255, 0.3)"
              style={{ boxShadow: '0 8px 16px rgba(0,0,0,0.2)' }}
            />

            {/* Main Info */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                  {name}
                </h2>
                <span
                  style={{
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#86EFAC',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    padding: '2px 10px',
                    borderRadius: 12,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <CheckCircleIcon size={12} color="#86EFAC" />
                  {student.status || 'Active Student'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <div
                  onClick={copyRoll}
                  title="Click to copy Roll Number"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: '#E2E8F0',
                  }}
                >
                  <IdCardIcon size={14} color="#93C5FD" />
                  <span>{rollNumber}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 2, fontSize: '0.75rem', color: copied ? '#86EFAC' : '#E2E8F0' }}>
                    {copied ? <CheckIcon size={13} color="#86EFAC" /> : <CopyIcon size={13} color="#CBD5E1" />}
                  </span>
                </div>

                <span style={{ opacity: 0.6 }}>•</span>
                <span style={{ fontSize: '0.85rem', color: '#93C5FD', fontWeight: 600 }}>
                  {deptName} ({className})
                </span>
                <span style={{ opacity: 0.6 }}>•</span>
                <span style={{ fontSize: '0.85rem', color: '#C4B5FD', fontWeight: 600 }}>
                  {batchLabel}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(255,255,255,0.08)',
                    padding: '3px 9px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    color: '#E2E8F0',
                  }}
                >
                  <ClockIcon size={12} color="#C4B5FD" />
                  {studyYearLabel} • {semesterLabel}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(255,255,255,0.08)',
                    padding: '3px 9px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    color: '#E2E8F0',
                  }}
                >
                  <GraduationCapIcon size={13} color="#93C5FD" />
                  {progName}
                </span>
              </div>
            </div>

            {/* Header Document & View Actions (See & Download Only for TPO) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {resumeDoc.hasUrl ? (
                  <>
                    <button
                      onClick={() => setPreviewDoc({ title: `Resume & Consolidated PDF - ${name}`, doc: resumeDoc })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '7px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                      }}
                    >
                      <FileTextIcon size={14} color="#FFFFFF" />
                      <span>View Resume</span>
                    </button>

                    <a
                      href={resumeDoc.downloadUrl}
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
                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
                      }}
                    >
                      <UploadIcon size={13} style={{ transform: 'rotate(180deg)' }} />
                      <span>Download</span>
                    </a>
                  </>
                ) : (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#FCA5A5',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    <AlertCircleIcon size={14} color="#FCA5A5" />
                    <span>No Resume Uploaded</span>
                  </div>
                )}
              </div>

              {instEmail && (
                <a
                  href={`mailto:${instEmail}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#FFFFFF',
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <MailIcon size={13} color="#FFFFFF" />
                  <span>{instEmail}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── 4 CLEAN TABS ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color, rgba(0,0,0,0.08))',
            background: 'var(--bg-main, #F8FAFC)',
            padding: '0 24px',
            overflowX: 'auto',
            gap: 4,
          }}
        >
          {[
            { id: 'academics', label: 'Academics & SGPAs', icon: <AnalyticsIcon size={16} color="currentColor" /> },
            { id: 'education', label: 'Education History', icon: <GraduationCapIcon size={16} color="currentColor" /> },
            { id: 'skills', label: 'Skills & Projects', icon: <CodeIcon size={16} color="currentColor" />, highlight: resumeDoc.hasUrl || techCertsDoc.hasUrl },
            { id: 'contact', label: 'Personal & Contact', icon: <UserIcon size={16} color="currentColor" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '13px 18px',
                border: 'none',
                background: 'transparent',
                fontSize: '0.88rem',
                fontWeight: activeTab === t.id ? 700 : 500,
                color: activeTab === t.id ? '#2563EB' : 'var(--text-secondary, #64748B)',
                borderBottom: activeTab === t.id ? '3px solid #2563EB' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.id === 'skills' && resumeDoc.hasUrl && (
                <span
                  style={{
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#16A34A',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 10,
                  }}
                >
                  Resume
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div
          style={{
            padding: 24,
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* 1. ACADEMICS & SGPAs TAB */}
          {activeTab === 'academics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Metric Highlight Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 16,
                }}
              >
                {/* CGPA */}
                <div
                  style={{
                    background: 'var(--bg-main, #F8FAFC)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Cumulative CGPA
                  </div>
                  <div
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: Number(cgpa) >= 8.0 ? '#16A34A' : Number(cgpa) >= 6.0 ? '#D97706' : '#DC2626',
                      marginTop: 4,
                    }}
                  >
                    {cgpa} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>/ 10</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Normalized UG Score
                  </div>
                </div>

                {/* Active Backlogs */}
                <div
                  style={{
                    background: 'var(--bg-main, #F8FAFC)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Active Backlogs
                  </div>
                  <div
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      color: activeBacklogs === 0 ? '#16A34A' : '#DC2626',
                      marginTop: 4,
                    }}
                  >
                    {activeBacklogs}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {activeBacklogs === 0 ? (
                      <>
                        <CheckCircleIcon size={13} color="#16A34A" />
                        <span>No Active Arrears</span>
                      </>
                    ) : (
                      <>
                        <AlertCircleIcon size={13} color="#DC2626" />
                        <span>Pending Arrears</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Total Backlogs */}
                <div
                  style={{
                    background: 'var(--bg-main, #F8FAFC)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Total Backlog History
                  </div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                    {totalBacklogs}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Historic Backlog Count
                  </div>
                </div>

                {/* Education Gap & First Attempt */}
                <div
                  style={{
                    background: 'var(--bg-main, #F8FAFC)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Education Gap
                  </div>
                  <div
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      color: eduGap.toLowerCase() === 'no' ? '#16A34A' : '#D97706',
                      marginTop: 6,
                    }}
                  >
                    {eduGap}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                    First Attempt: <strong style={{ color: 'var(--text-primary)' }}>{firstAttempt}</strong>
                  </div>
                </div>
              </div>

              {/* Semester Breakdown Grid */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 16,
                  padding: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      Semester-wise SGPA Performance
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Breakdown of semester grade points across the degree timeline
                    </p>
                  </div>
                  <span
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#2563EB',
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                    }}
                  >
                    Current: {semesterLabel}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 12,
                  }}
                >
                  {semestersData.map((s) => {
                    const hasVal = s.sgpa !== undefined && s.sgpa !== null && s.sgpa !== '' && s.sgpa !== '0' && s.sgpa !== 0;
                    const numVal = hasVal ? Number(s.sgpa) : null;
                    const isPassed = numVal && numVal >= 6.0;

                    return (
                      <div
                        key={s.key}
                        style={{
                          background: 'var(--bg-main, #F8FAFC)',
                          border: hasVal ? '1px solid rgba(59, 130, 246, 0.2)' : '1px dashed var(--border-color)',
                          borderRadius: 12,
                          padding: '12px 14px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {s.label}
                        </div>
                        <div
                          style={{
                            fontSize: '1.3rem',
                            fontWeight: 800,
                            color: hasVal
                              ? numVal && numVal >= 8.0
                                ? '#16A34A'
                                : numVal && numVal >= 6.0
                                ? '#2563EB'
                                : '#DC2626'
                              : 'var(--text-secondary)',
                            marginTop: 4,
                          }}
                        >
                          {hasVal ? (numVal ? numVal.toFixed(2) : s.sgpa) : '—'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: hasVal ? (isPassed ? '#16A34A' : '#DC2626') : 'var(--text-secondary)',
                            marginTop: 4,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          {hasVal ? (
                            <>
                              <CheckIcon size={11} color={isPassed ? '#16A34A' : '#DC2626'} />
                              <span>Recorded</span>
                            </>
                          ) : (
                            'Pending'
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 2. EDUCATION HISTORY TAB */}
          {activeTab === 'education' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Secondary (10th) */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SchoolIcon size={18} color="#3B82F6" />
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      10th Standard (Secondary Education)
                    </h4>
                  </div>
                  <span
                    style={{
                      background: 'rgba(34, 197, 94, 0.1)',
                      color: '#16A34A',
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {tenth.verification_status || 'Verified'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Board / Curriculum</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {tenth.board || 'State Board / CBSE'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>School / Institution</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {tenth.institution || 'High School'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Passing Year</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {tenth.passing_year || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Percentage / Score</span>
                    <div style={{ fontWeight: 700, color: '#2563EB', marginTop: 2 }}>
                      {tenth.normalized_percentage ? `${tenth.normalized_percentage}%` : tenth.raw_score || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Higher Secondary / Diploma (12th) */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SchoolIcon size={18} color="#8B5CF6" />
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      12th Standard / Diploma (Higher Secondary)
                    </h4>
                  </div>
                  <span
                    style={{
                      background: 'rgba(34, 197, 94, 0.1)',
                      color: '#16A34A',
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {twelfth.verification_status || 'Verified'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Board / Stream</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {twelfth.board || 'State Board / CBSE / Diploma'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Junior College / Institution</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {twelfth.institution || 'Junior College'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Passing Year</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {twelfth.passing_year || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Percentage / Score</span>
                    <div style={{ fontWeight: 700, color: '#2563EB', marginTop: 2 }}>
                      {twelfth.normalized_percentage ? `${twelfth.normalized_percentage}%` : twelfth.raw_score || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Undergraduate Degree */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <GraduationCapIcon size={18} color="#10B981" />
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Undergraduate Degree ({progName})
                  </h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Institution / College</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {ugEdu.institution || 'Engineering & Technology Campus'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Department & Class</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {deptName} - {className}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Academic Batch</span>
                    <div style={{ fontWeight: 600, color: '#4F46E5', marginTop: 2 }}>
                      {batchLabel}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cumulative CGPA</span>
                    <div style={{ fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                      {cgpa} / 10.0
                    </div>
                  </div>
                </div>
              </div>

              {/* Entrance Exams */}
              {entranceExams.length > 0 && (
                <div
                  style={{
                    background: 'var(--bg-surface, #FFFFFF)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 14,
                    padding: 18,
                  }}
                >
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                    Entrance Exam Details
                  </h4>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {entranceExams.map((ex: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--bg-main, #F8FAFC)',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ex.exam_name || 'Entrance'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Rank: <strong>{ex.rank || 'N/A'}</strong> {ex.score ? `• Score: ${ex.score}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. SKILLS & PROJECTS (With Resume, Technical Certificates & Achievements) */}
          {activeTab === 'skills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* ── CARD A: RESUME & ACADEMIC DOCUMENTS ── */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileTextIcon size={18} color="#2563EB" />
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Resume & Consolidated Academic PDF
                    </h4>
                  </div>
                  {resumeDoc.hasUrl ? (
                    <span
                      style={{
                        background: 'rgba(34, 197, 94, 0.12)',
                        color: '#16A34A',
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <CheckCircleIcon size={12} color="#16A34A" />
                      Document Ready
                    </span>
                  ) : (
                    <span
                      style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#DC2626',
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      Missing
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                  Student's single consolidated academic PDF containing Resume, 10th & 12th certificates, and B.Tech semester transcripts.
                </p>

                {resumeDoc.hasUrl ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setPreviewDoc({ title: `Resume & Academic Documents - ${name}`, doc: resumeDoc })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                      }}
                    >
                      <FileTextIcon size={15} color="#FFFFFF" />
                      <span>View Resume</span>
                    </button>

                    <a
                      href={resumeDoc.downloadUrl}
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
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      <UploadIcon size={14} style={{ transform: 'rotate(180deg)' }} />
                      <span>Download PDF</span>
                    </a>

                    <a
                      href={resumeDoc.directUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'var(--bg-main, #F8FAFC)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '8px 14px',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span>Open in Browser Tab</span>
                      <ExternalLinkIcon size={13} />
                    </a>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Student has not submitted their resume or document link yet.
                  </div>
                )}
              </div>

              {/* ── CARD B: TECHNICAL CERTIFICATIONS & COURSES ── */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AwardMedalIcon size={18} color="#D97706" />
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Technical Certificates & Courses
                    </h4>
                  </div>
                  {techCertsDoc.hasUrl ? (
                    <span
                      style={{
                        background: 'rgba(34, 197, 94, 0.12)',
                        color: '#16A34A',
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <CheckCircleIcon size={12} color="#16A34A" />
                      Certificates Uploaded
                    </span>
                  ) : null}
                </div>

                {/* Technical Certificate Document Link / Fullscreen Action */}
                {techCertsDoc.hasUrl && (
                  <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setPreviewDoc({ title: `Technical Certificates - ${name}`, doc: techCertsDoc })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#D97706',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '7px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(217, 119, 6, 0.25)',
                      }}
                    >
                      <FileTextIcon size={14} color="#FFFFFF" />
                      <span>View Technical Certificates</span>
                    </button>

                    <a
                      href={techCertsDoc.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--bg-main, #F8FAFC)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '7px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <UploadIcon size={13} style={{ transform: 'rotate(180deg)' }} />
                      <span>Download Certificates</span>
                    </a>
                  </div>
                )}

                {/* Listed Certifications */}
                {certsList.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {certsList.map((c: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: '0.86rem',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-main, #F8FAFC)',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <AwardMedalIcon size={15} color="#D97706" />
                        <span>{typeof c === 'string' ? c : c.name || c.title}</span>
                      </div>
                    ))}
                  </div>
                ) : !techCertsDoc.hasUrl ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                    No technical certificate documents registered.
                  </p>
                ) : null}
              </div>

              {/* ── CARD C: ACHIEVEMENTS & CO-CURRICULAR AWARDS ── */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SparklesIcon size={18} color="#8B5CF6" />
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Achievements, Medals & Hackathons
                    </h4>
                  </div>
                  {achieveCertsDoc.hasUrl ? (
                    <span
                      style={{
                        background: 'rgba(139, 92, 246, 0.12)',
                        color: '#8B5CF6',
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <CheckCircleIcon size={12} color="#8B5CF6" />
                      Documents Ready
                    </span>
                  ) : null}
                </div>

                {/* Achievement Document Link / Fullscreen Action */}
                {achieveCertsDoc.hasUrl && (
                  <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setPreviewDoc({ title: `Achievement Certificates - ${name}`, doc: achieveCertsDoc })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#8B5CF6',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '7px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(139, 92, 246, 0.25)',
                      }}
                    >
                      <FileTextIcon size={14} color="#FFFFFF" />
                      <span>View Achievement Certificates</span>
                    </button>

                    <a
                      href={achieveCertsDoc.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--bg-main, #F8FAFC)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '7px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <UploadIcon size={13} style={{ transform: 'rotate(180deg)' }} />
                      <span>Download</span>
                    </a>
                  </div>
                )}

                {/* Listed Achievements */}
                {achievementsList.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {achievementsList.map((ach: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: '0.86rem',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-main, #F8FAFC)',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <SparklesIcon size={15} color="#8B5CF6" />
                        <span>{typeof ach === 'string' ? ach : ach.title}</span>
                      </div>
                    ))}
                  </div>
                ) : !achieveCertsDoc.hasUrl ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                    No specific achievements listed.
                  </p>
                ) : null}
              </div>

              {/* ── CARD D: TECHNICAL SKILLS ── */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <CodeIcon size={18} color="#2563EB" />
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Technical Skills & Competencies ({skillsList.length})
                  </h4>
                </div>
                {skillsList.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {skillsList.map((sk: string, i: number) => (
                      <span
                        key={i}
                        style={{
                          background: 'rgba(59, 130, 246, 0.08)',
                          color: '#2563EB',
                          border: '1px solid rgba(59, 130, 246, 0.2)',
                          padding: '5px 12px',
                          borderRadius: 16,
                          fontSize: '0.82rem',
                          fontWeight: 600,
                        }}
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                    No specific skills tagged yet.
                  </p>
                )}
              </div>

              {/* ── CARD E: ACADEMIC & PERSONAL PROJECTS ── */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <BriefcaseIcon size={18} color="#4F46E5" />
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Academic & Key Projects ({projectsList.length})
                  </h4>
                </div>
                {projectsList.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {projectsList.map((p: any, i: number) => {
                      const pTitle = typeof p === 'string' ? p : p.title || p.name || 'Project';
                      const pDesc = typeof p === 'object' ? p.description || p.tech_stack : null;
                      return (
                        <div
                          key={i}
                          style={{
                            background: 'var(--bg-main, #F8FAFC)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 10,
                            padding: '12px 16px',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                            {pTitle}
                          </div>
                          {pDesc && (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 4 }}>
                              {pDesc}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                    No projects listed yet.
                  </p>
                )}
              </div>

              {/* ── CARD F: INTERNSHIPS COMPLETED ── */}
              {internshipsList.length > 0 && (
                <div
                  style={{
                    background: 'var(--bg-surface, #FFFFFF)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 16,
                    padding: 20,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <BriefcaseIcon size={18} color="#0284C7" />
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Internships Completed
                    </h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {internshipsList.map((ins: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: '0.86rem',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-main, #F8FAFC)',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <BriefcaseIcon size={15} color="#0284C7" />
                        <span>{typeof ins === 'string' ? ins : `${ins.company || ''} - ${ins.role || ''}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. PERSONAL & CONTACT TAB */}
          {activeTab === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Contact Information */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MailIcon size={18} color="#2563EB" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Contact Information
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Institutional Email</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MailIcon size={14} color="#64748B" />
                      {instEmail ? <a href={`mailto:${instEmail}`} style={{ color: '#2563EB' }}>{instEmail}</a> : 'Not Set'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Personal Email</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MailIcon size={14} color="#64748B" />
                      {persEmail ? <a href={`mailto:${persEmail}`} style={{ color: '#2563EB' }}>{persEmail}</a> : 'Not Set'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Mobile Phone</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PhoneIcon size={14} color="#64748B" />
                      {mobile ? <a href={`tel:${mobile}`} style={{ color: '#2563EB' }}>{mobile}</a> : 'Not Set'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Personal Details */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <UserIcon size={18} color="#8B5CF6" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Demographics & Identity
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Date of Birth</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {student.dob || student.identity?.date_of_birth || 'Not Specified'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Gender</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {student.gender || student.identity?.gender || 'Not Specified'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Nationality</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                      {student.nationality || student.identity?.nationality || 'Indian'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Professional Links */}
              <div
                style={{
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <ExternalLinkIcon size={18} color="#059669" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Professional & Portfolio Links
                  </h4>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {links.linkedin ? (
                    <a
                      href={links.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#0A66C2',
                        color: '#FFFFFF',
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span>LinkedIn Profile</span>
                      <ExternalLinkIcon size={13} color="#FFFFFF" />
                    </a>
                  ) : null}

                  {links.github ? (
                    <a
                      href={links.github}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#24292E',
                        color: '#FFFFFF',
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span>GitHub Profile</span>
                      <ExternalLinkIcon size={13} color="#FFFFFF" />
                    </a>
                  ) : null}

                  {links.portfolio ? (
                    <a
                      href={links.portfolio}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#4F46E5',
                        color: '#FFFFFF',
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span>Personal Portfolio</span>
                      <ExternalLinkIcon size={13} color="#FFFFFF" />
                    </a>
                  ) : null}

                  {!links.linkedin && !links.github && !links.portfolio && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                      No external links provided.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL FOOTER ── */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-color, rgba(0,0,0,0.08))',
            background: 'var(--bg-main, #F8FAFC)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IdCardIcon size={14} color="var(--text-secondary)" />
              Student Profile • Roll Number: {rollNumber}
            </span>
            {resumeDoc.hasUrl && (
              <span style={{ fontSize: '0.75rem', color: '#16A34A', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                Resume Ready
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#0B192C',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 22px',
              borderRadius: 8,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* ── FULL SCREEN DOCUMENT VIEWER OVERLAY ── */}
      {previewDoc && (
        <FullScreenDocModal
          title={previewDoc.title}
          doc={previewDoc.doc}
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>,
    document.body
  );
};
