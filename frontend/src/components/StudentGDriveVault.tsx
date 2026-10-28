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
  studentId?: string; // If provided, fetches for specific student (Staff Mode)
  isStaffMode?: boolean; // If true, enabled for TPO/Faculty
  studentProfile?: any;
}

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

  // Connection form state
  const [folderInputUrl, setFolderInputUrl] = useState('');
  const [folderNameInput, setFolderNameInput] = useState('PLACEMENT');
  const [showConnectModal, setShowConnectModal] = useState(false);

  // Add document modal state
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newDocType, setNewDocType] = useState('10th_marksheet');
  const [newFileUrl, setNewFileUrl] = useState('');
  const [newFileSize, setNewFileSize] = useState('1.5 MB');

  // Preview modal
  const [previewFile, setPreviewFile] = useState<DriveFileItem | null>(null);
  const [showEmbeddedBrowser, setShowEmbeddedBrowser] = useState(false);

  // Checklist filter
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'VERIFIED' | 'MISMATCH' | 'MISSING'>('ALL');

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
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to load Google Drive PLACEMENT Vault.');
      }
      const data = await res.json();
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

  // Handle Connect Folder
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
      setSuccessMsg('Google Drive "PLACEMENT" folder connected successfully! Running AI verification...');
      // Trigger AI verification right away
      handleRunAiVerification();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // One-click Demo Population
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
      setSuccessMsg('Demo "PLACEMENT" folder loaded with realistic certificates and cross-verified by AI!');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsPopulatingDemo(false);
    }
  };

  // Run AI Cross-Verification
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
      if (!res.ok) throw new Error(data.detail || 'AI Cross-Verification failed.');
      setVault(data.vault);
      setSuccessMsg('AI Cross-Verification completed! Discrepancies and matches updated below.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Toggle Checkbox
  const handleToggleChecklist = async (item: ChecklistItem) => {
    const newChecked = !item.is_checked;
    const checklistEndpoint = studentId
      ? `${API_BASE}/students/gdrive-vault/${studentId}/checklist-item`
      : `${API_BASE}/students/gdrive-vault/checklist-item`;

    try {
      // Optimistic update
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

  // Add File manually to vault registry
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
      setSuccessMsg('Document successfully added to PLACEMENT folder vault.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Remove File
  const handleRemoveFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to remove this document from the portal vault?')) return;
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

  const filteredChecklist = checklist.filter((item) => {
    if (filterStatus === 'VERIFIED') return item.status === 'VERIFIED_MATCH';
    if (filterStatus === 'MISMATCH') return item.status === 'MISMATCH';
    if (filterStatus === 'MISSING') return item.status === 'MISSING';
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED_MATCH':
        return (
          <span
            style={{
              background: 'rgba(34,197,94,0.15)',
              color: '#16A34A',
              border: '1px solid rgba(34,197,94,0.3)',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <CheckCircleIcon size={13} color="#16A34A" />
            Verified & Matches Profile
          </span>
        );
      case 'MISMATCH':
        return (
          <span
            style={{
              background: 'rgba(245,158,11,0.15)',
              color: '#D97706',
              border: '1px solid rgba(245,158,11,0.3)',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <AlertCircleIcon size={13} color="#D97706" />
            Mismatch Detected
          </span>
        );
      case 'MISSING':
        return (
          <span
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: '#DC2626',
              border: '1px solid rgba(239,68,68,0.3)',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <CloseIcon size={12} color="#DC2626" />
            Missing from Drive
          </span>
        );
      default:
        return (
          <span
            style={{
              background: 'rgba(100,116,139,0.15)',
              color: '#64748B',
              border: '1px solid rgba(100,116,139,0.3)',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <ClockIcon size={13} color="#64748B" />
            Pending Review
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
        <div style={{ marginTop: 12, fontWeight: 600 }}>Loading Google Drive PLACEMENT Vault...</div>
      </div>
    );
  }

  return (
    <div className="gdrive-vault-container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── TOP NOTIFICATION BANNERS ── */}
      {successMsg && (
        <div
          style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 12,
            padding: '12px 18px',
            color: '#059669',
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircleIcon size={18} color="#059669" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#059669' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            padding: '12px 18px',
            color: '#DC2626',
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircleIcon size={18} color="#DC2626" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#DC2626' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* ── SECTION 1: HERO HEADER & SETUP INSTRUCTIONS ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0B192C 0%, #1E3E62 100%)',
          borderRadius: 20,
          padding: '28px 32px',
          color: '#FFFFFF',
          boxShadow: '0 8px 24px rgba(11,25,44,0.25)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              <GoogleDriveIcon size={36} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>
                  Google Drive "PLACEMENT" Folder Vault
                </h2>
                <span
                  style={{
                    background: vault?.is_connected ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)',
                    color: vault?.is_connected ? '#86EFAC' : '#FDE68A',
                    border: `1px solid ${vault?.is_connected ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: vault?.is_connected ? '#22C55E' : '#F59E0B',
                    }}
                  />
                  {vault?.is_connected ? 'FOLDER CONNECTED & ACCESSIBLE' : 'NOT CONNECTED'}
                </span>
                {studentProfile && (studentProfile.name || studentProfile.roll_number) && (
                  <span
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      color: '#E0F2FE',
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                    }}
                  >
                    👤 {studentProfile.name || 'Student'} ({studentProfile.roll_number || studentProfile.student_id})
                  </span>
                )}
              </div>
              <p style={{ margin: '6px 0 0', opacity: 0.88, fontSize: '0.85rem' }}>
                Students upload marksheets, certificates, and resumes to their Google Drive folder named{' '}
                <strong style={{ color: '#93C5FD' }}>PLACEMENT</strong>. Portal AI scans & cross-verifies details with student profile.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!isStaffMode && !vault?.is_connected && (
              <button
                type="button"
                onClick={handleLoadDemoFolder}
                disabled={isPopulatingDemo}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: '#FFFFFF',
                  padding: '9px 18px',
                  borderRadius: 10,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: isPopulatingDemo ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                <SparklesIcon size={15} color="#FDE047" />
                <span>{isPopulatingDemo ? 'Loading Sample...' : 'Try Demo "PLACEMENT" Folder'}</span>
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
                  padding: '9px 20px',
                  borderRadius: 10,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                }}
              >
                <FolderIcon size={16} color="#FFFFFF" />
                <span>{vault?.is_connected ? 'Change / Re-link Folder' : 'Connect PLACEMENT Folder'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 4-Step Instructions Strip */}
        <div
          style={{
            marginTop: 22,
            background: 'rgba(0,0,0,0.22)',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
          }}
        >
          <div>
            <div style={{ color: '#93C5FD', fontSize: '0.75rem', fontWeight: 800 }}>STEP 1 • CREATE FOLDER</div>
            <div style={{ fontSize: '0.82rem', marginTop: 3, opacity: 0.9 }}>
              In your personal Google Drive, create a folder named <strong>"PLACEMENT"</strong>.
            </div>
          </div>
          <div>
            <div style={{ color: '#93C5FD', fontSize: '0.75rem', fontWeight: 800 }}>STEP 2 • UPLOAD CERTIFICATES</div>
            <div style={{ fontSize: '0.82rem', marginTop: 3, opacity: 0.9 }}>
              Upload 10th & Inter marksheets, UG transcripts, internship & course certificates.
            </div>
          </div>
          <div>
            <div style={{ color: '#93C5FD', fontSize: '0.75rem', fontWeight: 800 }}>STEP 3 • SHARING PERMISSION</div>
            <div style={{ fontSize: '0.82rem', marginTop: 3, opacity: 0.9 }}>
              Set folder sharing to <strong>"Anyone with the link can view"</strong> (Viewer).
            </div>
          </div>
          <div>
            <div style={{ color: '#93C5FD', fontSize: '0.75rem', fontWeight: 800 }}>STEP 4 • AI CROSS-CHECK</div>
            <div style={{ fontSize: '0.82rem', marginTop: 3, opacity: 0.9 }}>
              Click <strong>"Run AI Cross-Verification"</strong> to compare certificates with your profile.
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: AI VERIFICATION OVERVIEW & KPI DASHBOARD ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 18,
          padding: 24,
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(124,58,237,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SparklesIcon size={22} color="#7C3AED" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                AI Cross-Verification Engine
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {report?.verified_at
                  ? `Last verified on ${new Date(report.verified_at).toLocaleString()}`
                  : 'Ready to run cross-verification against student profile.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleRunAiVerification}
              disabled={isVerifying || !vault?.is_connected}
              style={{
                background: isVerifying ? '#9CA3AF' : 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 22px',
                borderRadius: 10,
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: isVerifying || !vault?.is_connected ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(124,58,237,0.25)',
              }}
            >
              <SparklesIcon size={16} color="#FFFFFF" />
              <span>{isVerifying ? 'AI Scanning Documents...' : 'Run AI Cross-Verification'}</span>
            </button>
          </div>
        </div>

        {/* AI Audit Summary Card */}
        {report && (
          <div
            style={{
              marginTop: 18,
              background: 'rgba(124,58,237,0.05)',
              border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: 14,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
            }}
          >
            <div style={{ fontSize: '1.2rem', marginTop: 1 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                {report.overall_result === 'ALL_VERIFIED'
                  ? 'All Academic & Placement Credentials Verified & Matching'
                  : report.overall_result === 'DISCREPANCIES_FOUND'
                  ? 'Attention: Discrepancies Detected Between Drive & Profile'
                  : 'Document Verification Status'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                {report.summary}
              </div>
            </div>
          </div>
        )}

        {/* Progress & Stat Cards */}
        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
          }}
        >
          {/* Progress bar card */}
          <div
            style={{
              background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
              border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                VERIFICATION PROGRESS
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#16A34A' }}>
                {verifiedPercent}%
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 8,
                background: 'rgba(0,0,0,0.08)',
                borderRadius: 4,
                marginTop: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${verifiedPercent}%`,
                  height: '100%',
                  background: verifiedPercent === 100 ? '#16A34A' : '#3B82F6',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 6 }}>
              {report?.verified_count ?? 0} of {report?.total_items ?? 6} requirements confirmed
            </div>
          </div>

          {/* Verified Items */}
          <div
            style={{
              background: 'rgba(34,197,94,0.05)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#16A34A' }}>VERIFIED & MATCHING</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
              {report?.verified_count ?? 0}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Credentials fully validated
            </div>
          </div>

          {/* Mismatches */}
          <div
            style={{
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#D97706' }}>DISCREPANCIES</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#D97706', marginTop: 4 }}>
              {report?.mismatch_count ?? 0}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Profile vs marksheets conflicts
            </div>
          </div>

          {/* Missing in Drive */}
          <div
            style={{
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#DC2626' }}>MISSING IN DRIVE</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
              {report?.missing_count ?? 0}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Required files not uploaded
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: INTERACTIVE CHECKBOX SYSTEM & VERIFICATION TABLE ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 18,
          padding: 24,
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Document Verification Checklist
            </h3>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Interactive checkbox system cross-referencing college profile claims with Drive evidence
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg-secondary, rgba(0,0,0,0.03))', padding: 4, borderRadius: 10 }}>
            {(['ALL', 'VERIFIED', 'MISMATCH', 'MISSING'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                style={{
                  background: filterStatus === st ? '#2563EB' : 'transparent',
                  color: filterStatus === st ? '#FFFFFF' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 7,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {st === 'ALL' ? 'All Items' : st === 'VERIFIED' ? 'Verified' : st === 'MISMATCH' ? 'Discrepancies' : 'Missing'}
              </button>
            ))}
          </div>
        </div>

        {/* Checklist Rows */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredChecklist.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              No checklist items match the selected filter.
            </div>
          ) : (
            filteredChecklist.map((item) => (
              <div
                key={item.key}
                style={{
                  background: item.is_checked ? 'rgba(34,197,94,0.02)' : 'var(--bg-main, #F8FAFC)',
                  border: `1px solid ${item.is_checked ? 'rgba(34,197,94,0.25)' : 'var(--border-color, rgba(0,0,0,0.08))'}`,
                  borderRadius: 14,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Checkbox Input */}
                <div style={{ marginTop: 2 }}>
                  <input
                    type="checkbox"
                    id={`check_${item.key}`}
                    checked={item.is_checked}
                    onChange={() => handleToggleChecklist(item)}
                    title={isStaffMode ? 'Click to sign-off or toggle verification' : 'Toggle verified state'}
                    style={{
                      width: 20,
                      height: 20,
                      accentColor: '#16A34A',
                      cursor: 'pointer',
                      borderRadius: 4,
                    }}
                  />
                </div>

                {/* Content details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label
                        htmlFor={`check_${item.key}`}
                        style={{
                          fontSize: '0.92rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        {item.label}
                      </label>
                      <span
                        style={{
                          background: item.required ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)',
                          color: item.required ? '#DC2626' : '#64748B',
                          padding: '1px 7px',
                          borderRadius: 6,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                        }}
                      >
                        {item.required ? 'MANDATORY' : 'OPTIONAL'}
                      </span>
                    </div>

                    <div>{getStatusBadge(item.status)}</div>
                  </div>

                  {/* Comparisons Grid */}
                  <div
                    style={{
                      marginTop: 10,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 10,
                      background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                      padding: '10px 14px',
                      borderRadius: 10,
                      fontSize: '0.8rem',
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700 }}>
                        COLLEGE PROFILE VALUE
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {item.profile_value || '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700 }}>
                        EXTRACTED FROM DRIVE DOCUMENT
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {item.extracted_value || '—'}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700 }}>
                        MATCHED DRIVE FILE
                      </div>
                      <div style={{ fontWeight: 600, color: '#2563EB', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {item.matched_file_name ? (
                          <span title={item.matched_file_name}>📄 {item.matched_file_name}</span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>None detected</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Note */}
                  {item.discrepancy_note && (
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      💡 <em>{item.discrepancy_note}</em>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── SECTION 4: GOOGLE DRIVE FILES BROWSER IN THE 'PLACEMENT' FOLDER ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 18,
          padding: 24,
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderIcon size={22} color="#2563EB" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Files in "PLACEMENT" Folder ({vault?.files?.length || 0})
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Synchronized documents currently accessible through PlacementHub
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {vault?.folder_url && (
              <a
                href={vault.folder_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--bg-secondary, rgba(0,0,0,0.04))',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.1))',
                  color: 'var(--text-primary)',
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <span>Open Folder in Google Drive</span>
                <ExternalLinkIcon size={13} />
              </a>
            )}

            {vault?.embedded_url && (
              <button
                type="button"
                onClick={() => setShowEmbeddedBrowser((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: showEmbeddedBrowser ? '#0B192C' : 'var(--bg-secondary, rgba(0,0,0,0.04))',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.1))',
                  color: showEmbeddedBrowser ? '#FFFFFF' : 'var(--text-primary)',
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>{showEmbeddedBrowser ? 'Hide Embedded Drive' : 'Show Embedded Drive'}</span>
              </button>
            )}

            {!isStaffMode && (
              <button
                type="button"
                onClick={() => setShowAddFileModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#2563EB',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <UploadIcon size={14} color="#FFFFFF" />
                <span>+ Register Drive File</span>
              </button>
            )}
          </div>
        </div>

        {/* Optional Embedded Google Drive Browser iframe */}
        {showEmbeddedBrowser && vault?.embedded_url && (
          <div style={{ marginTop: 18, border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
            <iframe
              src={vault.embedded_url}
              title="Google Drive Embedded PLACEMENT Folder"
              style={{ width: '100%', height: 420, border: 'none' }}
            />
          </div>
        )}

        {/* Files Grid */}
        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 14,
          }}
        >
          {(!vault?.files || vault.files.length === 0) ? (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                borderRadius: 14,
                border: '1px dashed var(--border-color)',
              }}
            >
              <FolderIcon size={38} color="#94A3B8" />
              <div style={{ marginTop: 10, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                No files registered in "PLACEMENT" folder yet
              </div>
              <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                Connect your folder or click "Try Demo 'PLACEMENT' Folder" above to auto-load sample marksheets.
              </div>
            </div>
          ) : (
            vault.files.map((file) => (
              <div
                key={file.id}
                style={{
                  background: 'var(--bg-main, #F8FAFC)',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span
                      style={{
                        background: 'rgba(37,99,235,0.1)',
                        color: '#2563EB',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {file.doc_type.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{file.file_size}</span>
                  </div>

                  <div
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      marginTop: 8,
                      wordBreak: 'break-word',
                    }}
                  >
                    📄 {file.name}
                  </div>

                  {file.extracted_text_snippet && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: '0.74rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                        maxHeight: 40,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {file.extracted_text_snippet}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid var(--border-color, rgba(0,0,0,0.06))',
                    paddingTop: 10,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      style={{
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '5px 12px',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Preview
                    </button>
                    {file.drive_url && (
                      <a
                        href={file.drive_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          padding: '5px 10px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span>Drive</span>
                        <ExternalLinkIcon size={12} />
                      </a>
                    )}
                  </div>

                  {!isStaffMode && (
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      title="Remove file"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#DC2626',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
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
              borderRadius: 20,
              padding: 28,
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GoogleDriveIcon size={24} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Connect "PLACEMENT" Folder</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleConnectFolder}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                  Folder Name in Google Drive
                </label>
                <input
                  type="text"
                  value={folderNameInput}
                  onChange={(e) => setFolderNameInput(e.target.value)}
                  placeholder="PLACEMENT"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 3, display: 'block' }}>
                  Must match the name of the folder created in your Google Drive.
                </span>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                  Google Drive Folder Share Link
                </label>
                <input
                  type="url"
                  value={folderInputUrl}
                  onChange={(e) => setFolderInputUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/1abc...xyz"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 3, display: 'block' }}>
                  Right-click folder in Drive → Share → Anyone with the link can view → Copy Link.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    padding: '8px 16px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
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
                    padding: '8px 20px',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: isConnecting ? 'wait' : 'pointer',
                  }}
                >
                  {isConnecting ? 'Validating...' : 'Connect & Scan'}
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
              borderRadius: 20,
              padding: 28,
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Register File from PLACEMENT Folder</h3>
              <button
                type="button"
                onClick={() => setShowAddFileModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleAddFile}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                  File Name
                </label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. 10th_CBSE_Marksheet.pdf"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                  Document Type / Category
                </label>
                <select
                  value={newDocType}
                  onChange={(e) => setNewDocType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                >
                  <option value="10th_marksheet">10th / Secondary Marksheet</option>
                  <option value="12th_marksheet">12th / Inter / Diploma Marksheet</option>
                  <option value="ug_marksheet">UG Semester Transcripts / Grade Card</option>
                  <option value="internship_cert">Internship Certificate</option>
                  <option value="technical_cert">Technical Certification</option>
                  <option value="resume">Placement Resume / CV</option>
                  <option value="other">Other Supporting Document</option>
                </select>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                  Google Drive Direct File Link (Optional)
                </label>
                <input
                  type="url"
                  value={newFileUrl}
                  onChange={(e) => setNewFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/.../view"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
                  File Size (e.g. 1.2 MB)
                </label>
                <input
                  type="text"
                  value={newFileSize}
                  onChange={(e) => setNewFileSize(e.target.value)}
                  placeholder="1.5 MB"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg, #FFFFFF)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddFileModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    padding: '8px 16px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
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
                    padding: '8px 20px',
                    borderRadius: 8,
                    fontWeight: 700,
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
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface, #FFFFFF)',
              color: 'var(--text-primary, #0F172A)',
              borderRadius: 20,
              maxWidth: 720,
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>📄 {previewFile.name}</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {previewFile.doc_type.replace('_', ' ').toUpperCase()} • {previewFile.file_size}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div style={{ padding: 24, maxHeight: 400, overflowY: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 8, color: 'var(--text-secondary)' }}>
                EXTRACTED OCR / TEXT PREVIEW
              </div>
              <div
                style={{
                  background: 'var(--bg-main, #F8FAFC)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border-color)',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                }}
              >
                {previewFile.extracted_text_snippet || 'Document text extracted and indexed by placement OCR engine.'}
              </div>
            </div>

            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              {previewFile.drive_url && (
                <a
                  href={previewFile.drive_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    padding: '8px 18px',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>Open in Google Drive</span>
                  <ExternalLinkIcon size={14} />
                </a>
              )}
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: '0.82rem',
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
