import { getSafeUrl } from '../utils/safeUrl';
import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderIcon,
  GoogleDriveIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  SparklesIcon,
  RefreshIcon,
  UploadIcon,
  CloseIcon,
  ExternalLinkIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
} from './Icons';

const API_BASE = 'http://127.0.0.1:8000/api';

export interface ChecklistItem {
  key: string;
  label: string;
  category: string;
  required: boolean;
  status: 'VERIFIED_MATCH' | 'MISMATCH' | 'MISSING' | 'PENDING_REVIEW';
  is_checked: boolean;
  matched_file_id?: string | null;
  matched_file_name?: string | null;
  profile_value?: string;
  extracted_value?: string;
  discrepancy_note?: string;
  verified_by?: string;
  verified_at?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  doc_type: string;
  drive_url: string;
  file_size: string;
  mime_type: string;
  uploaded_at: string;
  extracted_text_snippet?: string;
}

export interface VerificationReport {
  status: string;
  overall_result: 'ALL_VERIFIED' | 'DISCREPANCIES_FOUND' | 'MISSING_DOCUMENTS' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';
  verified_at?: string | null;
  summary: string;
  total_items: number;
  verified_count: number;
  mismatch_count: number;
  missing_count: number;
  checklist: ChecklistItem[];
}

export interface GDriveVaultData {
  folder_name: string;
  folder_url: string;
  folder_id: string;
  is_connected: boolean;
  last_synced_at?: string | null;
  share_status: string;
  embedded_url?: string;
  direct_url?: string;
  files: DriveFileItem[];
  verification_report?: VerificationReport | null;
}

interface StudentGDriveVaultProps {
  token: string;
  studentId?: string;
  isStaffMode?: boolean;
  studentProfile?: any;
}

const CHECKLIST_SUBDIVISIONS = [
  { value: 'ALL', label: 'All Subdivisions' },
  { value: 'Academic', label: 'Academic Credentials (10th, 12th, UG)' },
  { value: 'Experience', label: 'Work Experience & Internships' },
  { value: 'Skills', label: 'Technical Skills & Courses' },
  { value: 'Documents', label: 'Official Resume & Identity' },
];

const FILE_TYPE_OPTIONS = [
  { value: 'ALL', label: 'All Document Types' },
  { value: '10th_marksheet', label: '10th / Secondary Marksheet' },
  { value: '12th_marksheet', label: '12th / Diploma Marksheet' },
  { value: 'ug_marksheet', label: 'UG Semester Transcripts' },
  { value: 'internship_cert', label: 'Internship Certificates' },
  { value: 'technical_cert', label: 'Technical Certifications' },
  { value: 'resume', label: 'Placement Resume / CV' },
  { value: 'other', label: 'Other Supporting Documents' },
];

export const StudentGDriveVault: React.FC<StudentGDriveVaultProps> = ({
  token,
  studentId,
  isStaffMode = false,
  studentProfile,
}) => {
  const [vault, setVault] = useState<GDriveVaultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPopulatingDemo, setIsPopulatingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Collapsible Subdivisions State
  const [openSubdivisions, setOpenSubdivisions] = useState<Record<string, boolean>>({
    folder: true,
    verification: true,
    checklist: true,
    files: true,
  });

  const toggleSubdivision = (key: string) => {
    setOpenSubdivisions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allOpen = Object.values(openSubdivisions).every(Boolean);
  const toggleAllSubdivisions = () => {
    const nextState = !allOpen;
    setOpenSubdivisions({
      folder: nextState,
      verification: nextState,
      checklist: nextState,
      files: nextState,
    });
  };

  // Sub-division filter for checklist & files
  const [checklistSubdivision, setChecklistSubdivision] = useState<string>('ALL');
  const [fileSubdivision, setFileSubdivision] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'VERIFIED' | 'MISMATCH' | 'MISSING'>('ALL');

  // Modals state
  const [folderInputUrl, setFolderInputUrl] = useState('');
  const [folderNameInput, setFolderNameInput] = useState('PLACEMENT');
  const [showConnectModal, setShowConnectModal] = useState(false);

  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newDocType, setNewDocType] = useState('10th_marksheet');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [newFileSize] = useState('1.5 MB');

  const [previewFile, setPreviewFile] = useState<DriveFileItem | null>(null);
  const [showEmbeddedBrowser, setShowEmbeddedBrowser] = useState(false);

  const fetchEndpoint = studentId
    ? `${API_BASE}/students/gdrive-vault/${studentId}`
    : `${API_BASE}/students/gdrive-vault`;

  const fetchVault = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(fetchEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to fetch Google Drive Vault data.');
      }
      const data: GDriveVaultData = await res.json();
      setVault(data);
      if (data.folder_url) {
        setFolderInputUrl(data.folder_url);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchEndpoint, token]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  // Connect Folder
  const handleConnectFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderInputUrl.trim()) {
      setError('Please provide your Google Drive PLACEMENT folder URL.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE}/students/gdrive-vault/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          folder_url: folderInputUrl.trim(),
          folder_name: folderNameInput.trim() || 'PLACEMENT',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not connect Google Drive folder.');
      setVault(data.vault);
      setShowConnectModal(false);
      setSuccessMsg('Google Drive folder connected successfully!');
      handleRunAiVerification();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // Load Demo Folder
  const handleLoadDemoFolder = async () => {
    setIsPopulatingDemo(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE}/students/gdrive-vault/demo-populate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load demo folder.');
      setVault(data.vault);
      setSuccessMsg('Demo PLACEMENT folder loaded and verified!');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsPopulatingDemo(false);
    }
  };

  // Run AI Verification
  const handleRunAiVerification = async () => {
    setIsVerifying(true);
    setError(null);
    setSuccessMsg(null);
    const verifyEndpoint = studentId
      ? `${API_BASE}/students/gdrive-vault/${studentId}/verify-ai`
      : `${API_BASE}/students/gdrive-vault/verify-ai`;

    try {
      const res = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'AI Verification failed.');
      setVault(data.vault);
      setSuccessMsg('AI Verification completed!');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Toggle Checklist Checkbox
  const handleToggleChecklist = async (item: ChecklistItem) => {
    const newChecked = !item.is_checked;
    const checklistEndpoint = studentId
      ? `${API_BASE}/students/gdrive-vault/${studentId}/checklist-item`
      : `${API_BASE}/students/gdrive-vault/checklist-item`;

    try {
      setVault((prev) => {
        if (!prev || !prev.verification_report) return prev;
        const updatedList = prev.verification_report.checklist.map((it) =>
          it.key === item.key
            ? {
                ...it,
                is_checked: newChecked,
                status: (newChecked ? 'VERIFIED_MATCH' : 'PENDING_REVIEW') as any,
                verified_by: isStaffMode ? 'FACULTY_COORDINATOR' : 'MANUAL_OVERRIDE',
              }
            : it
        );
        return {
          ...prev,
          verification_report: {
            ...prev.verification_report,
            checklist: updatedList,
            verified_count: updatedList.filter((it) => it.is_checked).length,
          },
        };
      });

      const res = await fetch(checklistEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          item_key: item.key,
          is_checked: newChecked,
          status_override: newChecked ? 'VERIFIED_MATCH' : 'PENDING_REVIEW',
          note: isStaffMode ? 'Approved by Placement Coordinator' : 'Verified by Student',
        }),
      });
      const data = await res.json();
      if (res.ok && data.vault) {
        setVault(data.vault);
      }
    } catch (e: any) {
      setError('Could not update checklist item status.');
      fetchVault();
    }
  };

  // Add File
  const handleAddFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/students/gdrive-vault/add-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newFileName.trim(),
          doc_type: newDocType,
          drive_url: newFileUrl.trim(),
          file_size: newFileSize.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to add file.');
      setVault(data.vault);
      setShowAddFileModal(false);
      setNewFileName('');
      setNewFileUrl('');
      setSuccessMsg('Document registered successfully.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Remove File
  const handleRemoveFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to remove this document?')) return;
    try {
      const res = await fetch(`${API_BASE}/students/gdrive-vault/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to remove file.');
      setVault(data.vault);
      setSuccessMsg('Document removed from vault.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const report = vault?.verification_report;
  const checklist = report?.checklist || [];

  // Filter Checklist items by Status & Category Subdivision
  const filteredChecklist = checklist.filter((item) => {
    if (filterStatus === 'VERIFIED' && item.status !== 'VERIFIED_MATCH') return false;
    if (filterStatus === 'MISMATCH' && item.status !== 'MISMATCH') return false;
    if (filterStatus === 'MISSING' && item.status !== 'MISSING') return false;

    if (checklistSubdivision !== 'ALL') {
      const cat = (item.category || '').toLowerCase();
      const target = checklistSubdivision.toLowerCase();
      if (!cat.includes(target) && !target.includes(cat)) {
        return false;
      }
    }
    return true;
  });

  // Filter Files by Document Type Subdivision
  const files = vault?.files || [];
  const filteredFiles = files.filter((file) => {
    if (fileSubdivision === 'ALL') return true;
    return file.doc_type === fileSubdivision;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED_MATCH':
        return (
          <span
            style={{
              background: 'rgba(34,197,94,0.12)',
              color: '#16A34A',
              border: '1px solid rgba(34,197,94,0.25)',
              padding: '3px 8px',
              borderRadius: 14,
              fontSize: '0.74rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <CheckCircleIcon size={12} color="#16A34A" />
            Verified
          </span>
        );
      case 'MISMATCH':
        return (
          <span
            style={{
              background: 'rgba(245,158,11,0.12)',
              color: '#D97706',
              border: '1px solid rgba(245,158,11,0.25)',
              padding: '3px 8px',
              borderRadius: 14,
              fontSize: '0.74rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <AlertCircleIcon size={12} color="#D97706" />
            Mismatch
          </span>
        );
      case 'MISSING':
        return (
          <span
            style={{
              background: 'rgba(239,68,68,0.12)',
              color: '#DC2626',
              border: '1px solid rgba(239,68,68,0.25)',
              padding: '3px 8px',
              borderRadius: 14,
              fontSize: '0.74rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <CloseIcon size={11} color="#DC2626" />
            Missing
          </span>
        );
      default:
        return (
          <span
            style={{
              background: 'rgba(100,116,139,0.12)',
              color: '#64748B',
              border: '1px solid rgba(100,116,139,0.25)',
              padding: '3px 8px',
              borderRadius: 14,
              fontSize: '0.74rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <ClockIcon size={12} color="#64748B" />
            Pending
          </span>
        );
    }
  };

  const verifiedPercent =
    report && report.total_items > 0
      ? Math.round((report.verified_count / report.total_items) * 100)
      : 0;

  if (isLoading && !vault) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshIcon size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: 12, fontWeight: 600 }}>Loading Google Drive Vault...</div>
      </div>
    );
  }

  return (
    <div className="gdrive-vault-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toast Alerts */}
      {successMsg && (
        <div
          style={{
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 10,
            padding: '10px 16px',
            color: '#059669',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleIcon size={16} color="#059669" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#059669' }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            padding: '10px 16px',
            color: '#DC2626',
            fontSize: '0.84rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircleIcon size={16} color="#DC2626" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#DC2626' }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {/* ── TOP HEADER / ACTION BAR ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 14,
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(37,99,235,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GoogleDriveIcon size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Google Drive Vault
              </h2>
              <span
                style={{
                  background: vault?.is_connected ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                  color: vault?.is_connected ? '#16A34A' : '#D97706',
                  border: `1px solid ${vault?.is_connected ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                {vault?.is_connected ? 'Connected' : 'Setup Required'}
              </span>
              {studentProfile && (studentProfile.name || studentProfile.roll_number) && (
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ({studentProfile.roll_number || studentProfile.student_id})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!isStaffMode && !vault?.is_connected && (
            <button
              type="button"
              onClick={handleLoadDemoFolder}
              disabled={isPopulatingDemo}
              style={{
                background: 'var(--bg-secondary, rgba(0,0,0,0.04))',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: isPopulatingDemo ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SparklesIcon size={14} color="#D97706" />
              <span>{isPopulatingDemo ? 'Loading...' : 'Demo Folder'}</span>
            </button>
          )}

          {!isStaffMode && (
            <button
              type="button"
              onClick={() => setShowConnectModal(true)}
              style={{
                background: '#2563EB',
                border: 'none',
                color: '#FFFFFF',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FolderIcon size={14} color="#FFFFFF" />
              <span>{vault?.is_connected ? 'Re-link Folder' : 'Connect Folder'}</span>
            </button>
          )}

          {vault?.is_connected && (
            <button
              type="button"
              onClick={handleRunAiVerification}
              disabled={isVerifying}
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
                border: 'none',
                color: '#FFFFFF',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: isVerifying ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SparklesIcon size={14} color="#FFFFFF" />
              <span>{isVerifying ? 'Scanning...' : 'Run Scan'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleAllSubdivisions}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{allOpen ? 'Collapse All' : 'Expand All'}</span>
            {allOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
          </button>
        </div>
      </div>

      {/* ── SUBDIVISION 1: FOLDER CONNECTION & ACCESS (COLLAPSIBLE DROPDOWN) ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 14,
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        <div
          onClick={() => toggleSubdivision('folder')}
          style={{
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            background: openSubdivisions.folder ? 'var(--bg-secondary, rgba(0,0,0,0.02))' : 'var(--card-bg, #FFFFFF)',
            borderBottom: openSubdivisions.folder ? '1px solid var(--border-color, rgba(0,0,0,0.08))' : 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderIcon size={18} color="#2563EB" />
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Folder Connection & Access
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: vault?.is_connected ? '#16A34A' : '#D97706',
                background: vault?.is_connected ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {vault?.is_connected ? `Linked: "${vault.folder_name || 'PLACEMENT'}"` : 'Not Linked'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {vault?.folder_url && (
              <a
                href={getSafeUrl(vault.folder_url) || "#"}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.76rem',
                  color: '#2563EB',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                <span>Drive</span>
                <ExternalLinkIcon size={12} />
              </a>
            )}
            <span style={{ color: 'var(--text-secondary)' }}>
              {openSubdivisions.folder ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </span>
          </div>
        </div>

        {openSubdivisions.folder && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
              }}
            >
              <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>FOLDER NAME</span>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, marginTop: 2, color: 'var(--text-primary)' }}>
                  {vault?.folder_name || 'PLACEMENT'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>STATUS</span>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, marginTop: 2, color: vault?.is_connected ? '#16A34A' : '#D97706' }}>
                  {vault?.is_connected ? 'Connected & Viewer Verified' : 'Not Connected'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>LAST SYNC</span>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, marginTop: 2, color: 'var(--text-primary)' }}>
                  {vault?.last_synced_at ? new Date(vault.last_synced_at).toLocaleTimeString() : 'Never'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>EMBEDDED VIEW</span>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, marginTop: 2, color: 'var(--text-primary)' }}>
                    {showEmbeddedBrowser ? 'Visible' : 'Hidden'}
                  </div>
                </div>
                {vault?.embedded_url && (
                  <button
                    type="button"
                    onClick={() => setShowEmbeddedBrowser((prev) => !prev)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {showEmbeddedBrowser ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
            </div>

            {/* Embedded Drive iframe if toggled */}
            {showEmbeddedBrowser && vault?.embedded_url && (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
                <iframe
                  src={vault.embedded_url}
                  title="Google Drive Folder"
                  style={{ width: '100%', height: 360, border: 'none' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SUBDIVISION 2: AI VERIFICATION & INSIGHTS (COLLAPSIBLE DROPDOWN) ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 14,
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        <div
          onClick={() => toggleSubdivision('verification')}
          style={{
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            background: openSubdivisions.verification ? 'var(--bg-secondary, rgba(0,0,0,0.02))' : 'var(--card-bg, #FFFFFF)',
            borderBottom: openSubdivisions.verification ? '1px solid var(--border-color, rgba(0,0,0,0.08))' : 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SparklesIcon size={18} color="#7C3AED" />
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              AI Verification Overview
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: verifiedPercent === 100 ? '#16A34A' : '#7C3AED',
                background: verifiedPercent === 100 ? 'rgba(34,197,94,0.1)' : 'rgba(124,58,237,0.1)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {verifiedPercent}% Verified
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {report?.verified_at && (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {new Date(report.verified_at).toLocaleDateString()}
              </span>
            )}
            <span style={{ color: 'var(--text-secondary)' }}>
              {openSubdivisions.verification ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </span>
          </div>
        </div>

        {openSubdivisions.verification && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* KPI Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10,
              }}
            >
              <div style={{ background: 'var(--bg-main)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>RATE</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {verifiedPercent}%
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>VERIFIED</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {report?.verified_count ?? 0}
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>MISMATCHES</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: report?.mismatch_count ? '#D97706' : 'var(--text-secondary)', marginTop: 2 }}>
                  {report?.mismatch_count ?? 0}
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>MISSING</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: report?.missing_count ? '#DC2626' : 'var(--text-secondary)', marginTop: 2 }}>
                  {report?.missing_count ?? 0}
                </div>
              </div>
            </div>

            {/* Concise Summary Note */}
            {report?.summary && (
              <div
                style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>🤖</span>
                <span>{report.summary}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SUBDIVISION 3: VERIFICATION CHECKLIST (COLLAPSIBLE DROPDOWN) ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 14,
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        <div
          onClick={() => toggleSubdivision('checklist')}
          style={{
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            background: openSubdivisions.checklist ? 'var(--bg-secondary, rgba(0,0,0,0.02))' : 'var(--card-bg, #FFFFFF)',
            borderBottom: openSubdivisions.checklist ? '1px solid var(--border-color, rgba(0,0,0,0.08))' : 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircleIcon size={18} color="#16A34A" />
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Document Checklist
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#2563EB',
                background: 'rgba(37,99,235,0.1)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {report?.verified_count ?? 0} of {report?.total_items ?? 0} Checked
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {openSubdivisions.checklist ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </span>
          </div>
        </div>

        {openSubdivisions.checklist && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Filter & Subdivision Selector Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Subdivision:
                </span>
                <select
                  value={checklistSubdivision}
                  onChange={(e) => setChecklistSubdivision(e.target.value)}
                  style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '5px 10px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {CHECKLIST_SUBDIVISIONS.map((sub) => (
                    <option key={sub.value} value={sub.value}>
                      {sub.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter Pills */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-main)', padding: 3, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                {(['ALL', 'VERIFIED', 'MISMATCH', 'MISSING'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    style={{
                      background: filterStatus === st ? '#2563EB' : 'transparent',
                      color: filterStatus === st ? '#FFFFFF' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {st === 'ALL' ? 'All' : st === 'VERIFIED' ? 'Verified' : st === 'MISMATCH' ? 'Mismatches' : 'Missing'}
                  </button>
                ))}
              </div>
            </div>

            {/* Checklist Items Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredChecklist.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  No checklist items match the selected filter.
                </div>
              ) : (
                filteredChecklist.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      background: item.is_checked ? 'rgba(34,197,94,0.02)' : 'var(--bg-main)',
                      border: `1px solid ${item.is_checked ? 'rgba(34,197,94,0.2)' : 'var(--border-color)'}`,
                      borderRadius: 10,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
                      <input
                        type="checkbox"
                        checked={item.is_checked}
                        onChange={() => handleToggleChecklist(item)}
                        style={{ width: 17, height: 17, accentColor: '#16A34A', cursor: 'pointer' }}
                        title="Toggle verification sign-off"
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.label}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-secondary, rgba(0,0,0,0.05))',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {item.category}
                          </span>
                        </div>

                        {item.discrepancy_note && (
                          <div style={{ fontSize: '0.74rem', color: '#D97706', marginTop: 2, fontWeight: 500 }}>
                            ⚠️ {item.discrepancy_note}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {item.profile_value && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          Profile: <strong>{item.profile_value}</strong>
                        </span>
                      )}

                      {getStatusBadge(item.status)}

                      {item.matched_file_id && (
                        <button
                          type="button"
                          onClick={() => {
                            const found = vault?.files.find((f) => f.id === item.matched_file_id);
                            if (found) setPreviewFile(found);
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: '#2563EB',
                          }}
                        >
                          View File
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── SUBDIVISION 4: DRIVE FILES REPOSITORY (COLLAPSIBLE DROPDOWN) ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 14,
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        <div
          onClick={() => toggleSubdivision('files')}
          style={{
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            background: openSubdivisions.files ? 'var(--bg-secondary, rgba(0,0,0,0.02))' : 'var(--card-bg, #FFFFFF)',
            borderBottom: openSubdivisions.files ? '1px solid var(--border-color, rgba(0,0,0,0.08))' : 'none',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileTextIcon size={18} color="#2563EB" />
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Drive Files Repository
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#2563EB',
                background: 'rgba(37,99,235,0.1)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {vault?.files?.length || 0} Files
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isStaffMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddFileModal(true);
                }}
                style={{
                  background: '#2563EB',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <UploadIcon size={12} color="#FFFFFF" />
                <span>+ Register</span>
              </button>
            )}
            <span style={{ color: 'var(--text-secondary)' }}>
              {openSubdivisions.files ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
            </span>
          </div>
        </div>

        {openSubdivisions.files && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Document Type Subdivision Selector */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Document Type:
                </span>
                <select
                  value={fileSubdivision}
                  onChange={(e) => setFileSubdivision(e.target.value)}
                  style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '5px 10px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {FILE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Showing {filteredFiles.length} of {files.length} files
              </span>
            </div>

            {/* Files Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {filteredFiles.length === 0 ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-main)',
                    borderRadius: 10,
                    border: '1px dashed var(--border-color)',
                    fontSize: '0.82rem',
                  }}
                >
                  No files found in this category.
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    style={{
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            background: 'rgba(37,99,235,0.1)',
                            color: '#2563EB',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {file.doc_type.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          {file.file_size}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginTop: 6,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={file.name}
                      >
                        📄 {file.name}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          style={{
                            background: '#2563EB',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: 5,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Preview
                        </button>
                        {file.drive_url && (
                          <a
                            href={getSafeUrl(file.drive_url) || "#"}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              padding: '4px 8px',
                              borderRadius: 5,
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span>Drive</span>
                            <ExternalLinkIcon size={10} />
                          </a>
                        )}
                      </div>

                      {!isStaffMode && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(file.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#DC2626',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: CONNECT GOOGLE DRIVE FOLDER ── */}
      {showConnectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              color: 'var(--text-primary, #0F172A)',
              borderRadius: 14,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GoogleDriveIcon size={20} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Connect PLACEMENT Folder</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleConnectFolder}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  Folder Name
                </label>
                <input
                  type="text"
                  value={folderNameInput}
                  onChange={(e) => setFolderNameInput(e.target.value)}
                  placeholder="PLACEMENT"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  Folder Share Link
                </label>
                <input
                  type="url"
                  value={folderInputUrl}
                  onChange={(e) => setFolderInputUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    padding: '7px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConnecting}
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '7px 18px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: isConnecting ? 'wait' : 'pointer',
                  }}
                >
                  {isConnecting ? 'Connecting...' : 'Connect & Scan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTER / ADD DRIVE FILE ── */}
      {showAddFileModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              color: 'var(--text-primary, #0F172A)',
              borderRadius: 14,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Register Drive Document</h3>
              <button
                type="button"
                onClick={() => setShowAddFileModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleAddFile}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  File Name
                </label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. 10th_Marksheet.pdf"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  Document Type
                </label>
                <select
                  value={newDocType}
                  onChange={(e) => setNewDocType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                >
                  <option value="10th_marksheet">10th / Secondary Marksheet</option>
                  <option value="12th_marksheet">12th / Diploma Marksheet</option>
                  <option value="ug_marksheet">UG Semester Transcripts</option>
                  <option value="internship_cert">Internship Certificate</option>
                  <option value="technical_cert">Technical Certification</option>
                  <option value="resume">Placement Resume / CV</option>
                  <option value="other">Other Document</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                  Direct File Link (Optional)
                </label>
                <input
                  type="url"
                  value={newFileUrl}
                  onChange={(e) => setNewFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowAddFileModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    padding: '7px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '7px 18px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Add Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PREVIEW FILE ── */}
      {previewFile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              color: 'var(--text-primary, #0F172A)',
              borderRadius: 14,
              maxWidth: 640,
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>📄 {previewFile.name}</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {previewFile.doc_type.replace('_', ' ').toUpperCase()} • {previewFile.file_size}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div style={{ padding: 18, maxHeight: 340, overflowY: 'auto' }}>
              <div
                style={{
                  background: 'var(--bg-main, #F8FAFC)',
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                }}
              >
                {previewFile.extracted_text_snippet || 'Document text indexed by verification engine.'}
              </div>
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              {previewFile.drive_url && (
                <a
                  href={getSafeUrl(previewFile.drive_url) || "#"}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    padding: '6px 14px',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>Open in Drive</span>
                  <ExternalLinkIcon size={12} />
                </a>
              )}
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
