import React, { useState, useRef } from 'react';
import {
  FileSpreadsheetIcon,
  UploadIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  FolderIcon,
  ListIcon,
  RefreshIcon,
} from './Icons';

interface BulkStudentUploadProps {
  onSuccess?: () => void;
  onUploadSuccess?: () => void;
  institutionId?: string;
  token?: string;
  apiUrl?: string;
}

export const BulkStudentUpload: React.FC<BulkStudentUploadProps> = ({
  onSuccess,
  onUploadSuccess,
  token = localStorage.getItem('token') || '',
  apiUrl = 'http://127.0.0.1:8000/api',
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [commitResult, setCommitResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(`${apiUrl}/bulk-students/template`, { headers });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${apiUrl}/students/import/template`, { headers });
      }
      if (!res.ok) {
        let errorMsg = 'Failed to download template';
        try {
          const errJson = await res.json();
          if (errJson.detail) errorMsg = errJson.detail;
        } catch (_) {}
        throw new Error(errorMsg);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Placement_Portal_Standard_Student_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(err.message || 'Template download error');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    setPreviewData(null);
    setCommitResult(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', selected);

    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res = await fetch(`${apiUrl}/bulk-students/preview`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${apiUrl}/students/import/preview`, {
          method: 'POST',
          headers,
          body: formData,
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Validation preview failed');
      setPreviewData(data);
    } catch (err: any) {
      setError(err.message || 'Upload validation failed');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData?.temp_file_id && !file) return;
    setConfirming(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res: Response | null = null;
      if (previewData?.temp_file_id) {
        res = await fetch(`${apiUrl}/bulk-students/commit`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            temp_file_id: previewData.temp_file_id,
            override_existing: true,
          }),
        });
        if (!res.ok && res.status === 404) {
          res = await fetch(`${apiUrl}/students/import/confirm`, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              temp_file_id: previewData.temp_file_id,
              override_existing: true,
            }),
          });
        }
      } else if (file) {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch(`${apiUrl}/bulk-students/confirm`, {
          method: 'POST',
          headers,
          body: formData,
        });
        if (!res.ok && res.status === 404) {
          res = await fetch(`${apiUrl}/students/import/confirm`, {
            method: 'POST',
            headers,
            body: formData,
          });
        }
      }

      if (!res) throw new Error('Could not execute import');
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Commit execution failed');
      setCommitResult(data);
      if (onSuccess) onSuccess();
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      setError(err.message || 'Import commit failed');
    } finally {
      setConfirming(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewData(null);
    setCommitResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      style={{
        background: 'var(--card-bg, #FFFFFF)',
        border: '1px solid var(--border-color, rgba(0,0,0,0.1))',
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg,#2563EB,#6366F1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <FileSpreadsheetIcon size={22} color="#FFFFFF" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
              Standard Student Master Upload & Validation
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Standard 46-column schema with automatic Score Normalization, Board Conversions, and Faculty Assignment.
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadTemplate}
          style={{
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.3)',
            color: '#2563EB',
            padding: '8px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.84rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <UploadIcon size={15} color="#2563EB" />
          <span>Download Standard Template (.xlsx)</span>
        </button>
      </div>

      {!previewData && !commitResult && (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed var(--border-color)',
            borderRadius: 12,
            padding: '36px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: 'var(--input-bg)',
            transition: 'border-color 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          <div style={{ color: '#3B82F6', opacity: 0.85 }}>
            <FolderIcon size={44} color="#3B82F6" />
          </div>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
            {uploading ? 'Analyzing and Validating Spreadsheet...' : 'Click or Drag to Upload Student Master Excel'}
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Supports standard template or legacy placement response sheets.
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#DC2626',
            borderRadius: 8,
            fontSize: '0.86rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertCircleIcon size={16} color="#DC2626" />
          <span>{error}</span>
        </div>
      )}

      {/* ── PREVIEW SUMMARY & VALIDATION REPORT ───────────────────────────── */}
      {previewData && !commitResult && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div style={{ background: 'var(--input-bg)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {previewData.summary?.total_rows}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Rows</div>
            </div>
            <div style={{ background: 'rgba(16,185,129,0.1)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>
                {previewData.summary?.valid_rows}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#059669' }}>Valid Rows</div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.1)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#D97706' }}>
                {previewData.summary?.duplicate_rows}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#D97706' }}>Duplicates</div>
            </div>
            <div style={{ background: 'rgba(99,102,241,0.1)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#6366F1' }}>
                {previewData.summary?.requires_manual_review_count}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6366F1' }}>Requires Review</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px' }}>
            <ListIcon size={16} color="var(--text-primary)" />
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Import Sample Preview (First {previewData.sample_preview?.length} Rows)
            </h4>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8, maxHeight: 240 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '8px 10px' }}>Roll Number</th>
                  <th style={{ padding: '8px 10px' }}>Name</th>
                  <th style={{ padding: '8px 10px' }}>Program / Dept</th>
                  <th style={{ padding: '8px 10px' }}>Assigned Faculty</th>
                  <th style={{ padding: '8px 10px' }}>UG CGPA</th>
                  <th style={{ padding: '8px 10px' }}>10th %</th>
                  <th style={{ padding: '8px 10px' }}>12th %</th>
                </tr>
              </thead>
              <tbody>
                {previewData.sample_preview?.map((s: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.student_id}</td>
                    <td style={{ padding: '8px 10px' }}>{s.full_name}</td>
                    <td style={{ padding: '8px 10px' }}>{s.department || s.program}</td>
                    <td style={{ padding: '8px 10px', color: '#2563EB' }}>{s.assigned_faculty}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>{s.ug_cgpa ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{s.tenth_percentage ? `${s.tenth_percentage}%` : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{s.twelfth_percentage ? `${s.twelfth_percentage}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewData.validation_issues?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px' }}>
                <AlertCircleIcon size={14} color="#D97706" />
                <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#D97706' }}>
                  Validation Warnings ({previewData.validation_issues.length})
                </h4>
              </div>
              <div style={{ maxHeight: 120, overflowY: 'auto', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 10, fontSize: '0.78rem' }}>
                {previewData.validation_issues.map((iss: any, i: number) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <strong>Row {iss.row_number} ({iss.roll_number || 'N/A'}):</strong> {iss.issues.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 18, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              onClick={handleReset}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '9px 18px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              Cancel / Re-upload
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={confirming}
              style={{
                background: confirming ? '#9CA3AF' : '#10B981',
                border: 'none',
                color: '#fff',
                padding: '9px 22px',
                borderRadius: 8,
                cursor: confirming ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {confirming ? (
                <>
                  <RefreshIcon size={16} />
                  <span>Importing & Assigning...</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon size={16} color="#FFFFFF" />
                  <span>Confirm & Execute Import</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── COMMIT SUCCESS ────────────────────────────────────────────────── */}
      {commitResult && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.25)',
            color: '#059669',
            borderRadius: 12,
            fontSize: '0.88rem',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircleIcon size={18} color="#059669" />
            <span>Import Completed Successfully!</span>
          </div>
          <div>
            Processed <strong>{commitResult.summary?.total_rows}</strong> records ({commitResult.summary?.inserted_count} new insertions, {commitResult.summary?.updated_count} updates).
            All students are automatically routed to their respective Faculty Coordinators for review.
          </div>
          <button
            onClick={handleReset}
            style={{
              marginTop: 12,
              background: '#059669',
              border: 'none',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
            }}
          >
            Upload Another Spreadsheet
          </button>
        </div>
      )}
    </div>
  );
};
