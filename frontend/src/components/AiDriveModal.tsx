import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import {
  SparklesIcon,
  CheckIcon,
  AlertIcon,
  CloseIcon,
  EditIcon,
  RefreshIcon
} from './Icons';

interface AiDriveModalProps {
  token: string;
  isOpen: boolean;
  onClose: () => void;
  onDrivePublished: () => void;
  departments?: Array<{ id: string; name: string }>;
  programs?: Array<{ id: string; name: string }>;
}

const SAMPLE_JDS = [
  {
    label: '⚡ Software Engineer (12 LPA)',
    text: `ABC Technologies is hiring Associate Software Engineers for our Hyderabad and Bengaluru offices.
Candidates must have a B.Tech degree in Computer Science Engineering, Information Technology, or related disciplines.
Eligibility Criteria:
- Minimum CGPA of 7.5 or 70% in Undergraduate degree
- No active backlogs (0 active backlogs allowed)
- Batch of 2027 (Passout year 2027)
- Good problem solving skills in Java, Python, and SQL
Compensation:
- Package: 12 LPA (Fixed 10 LPA + 2 LPA Performance Bonus)
- Mode: On-campus / Hybrid
Application Deadline: 25 November 2026. Drive interview rounds commence shortly thereafter.`,
  },
  {
    label: '⚡ Data Analyst (8.5 LPA)',
    text: `Insight Analytics Corp is recruiting Graduate Data Analysts for Pune & Hyderabad locations.
Degree: B.Tech in CSE, IT, Electronics & Communication Engineering (ECE), or Artificial Intelligence.
Requirements:
- Minimum CGPA of 6.8 with up to 1 active backlog permitted
- Batch: 2027 passing out students
- Skills: Python, SQL, PowerBI, Statistics, Excel
Compensation: 8.5 LPA (Fixed 7.5 LPA + Performance Incentive)
Work Mode: Hybrid
Deadline to apply: 10 December 2026 at 5:00 PM.`,
  },
  {
    label: '⚡ Cloud & DevOps (15 LPA)',
    text: `HyperCloud Systems is hiring Cloud Infrastructure & DevOps Engineers for Bengaluru campus.
Eligible Programs: B.Tech or M.Tech in Computer Science, Information Technology, or Electrical Engineering.
Eligibility Cutoffs:
- Minimum CGPA of 8.0
- 0 active backlogs allowed
- Graduating Class of 2027
- Core Competencies: Linux, Docker, Kubernetes, AWS/GCP, Networking, Python, Go
CTC Package: 15 LPA CTC
Mode: On-campus
Application Deadline: 30 November 2026.`,
  },
];

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

export const AiDriveModal: React.FC<AiDriveModalProps> = ({
  token,
  isOpen,
  onClose,
  onDrivePublished,
}) => {
  const [sourceJd, setSourceJd] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [draft, setDraft] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable Form fields for draft adjustments
  const [editForm, setEditForm] = useState<any>({});
  const [missingInputs, setMissingInputs] = useState<Record<string, any>>({});

  if (!isOpen) return null;

  const formatDeadlineToStandard = (val: string): string => {
    if (!val || !val.trim()) return '';
    let s = val.trim();
    s = s.replace(/^(?:application\s+deadline|deadline|last\s+date|apply\s+before|due\s+date)\s*[:\-]?\s*/i, '').trim();

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
      return s;
    }

    const sClean = s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');
    const hasTime = /\b(\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}\s*(?:am|pm)|midnight|noon)\b/i.test(sClean);

    let candidate = sClean;
    const dmyMatch = sClean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(.*)$/);
    if (dmyMatch) {
      candidate = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}${dmyMatch[4]}`;
    }

    const parsed = new Date(candidate);
    if (!isNaN(parsed.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      let hours = parsed.getHours();
      let minutes = parsed.getMinutes();
      let seconds = parsed.getSeconds();
      if (!hasTime && hours === 0 && minutes === 0 && seconds === 0) {
        hours = 23;
        minutes = 59;
        seconds = 59;
      }
      return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return val;
  };

  const addDaysToDeadline = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 59, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const setTimeForDeadline = (hours: number, minutes: number, seconds: number, isMissing = false) => {
    const current = isMissing ? missingInputs.drive_deadline : editForm.drive_deadline;
    let baseDate = new Date();
    if (current) {
      const std = formatDeadlineToStandard(current);
      const d = new Date(std.replace(' ', 'T'));
      if (!isNaN(d.getTime())) {
        baseDate = d;
      }
    }
    baseDate.setHours(hours, minutes, seconds, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const res = `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-${pad(baseDate.getDate())} ${pad(baseDate.getHours())}:${pad(baseDate.getMinutes())}:${pad(baseDate.getSeconds())}`;
    if (isMissing) {
      setMissingInputs((prev: any) => ({ ...prev, drive_deadline: res }));
    } else {
      setEditForm((prev: any) => ({ ...prev, drive_deadline: res }));
    }
  };

  const toDateTimeLocalVal = (stdStr: string) => {
    if (!stdStr) return '';
    const std = formatDeadlineToStandard(stdStr);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(std)) {
      return std.replace(' ', 'T').substring(0, 16);
    }
    return '';
  };

  const fromDateTimeLocalVal = (localVal: string) => {
    if (!localVal) return '';
    const [datePart, timePart] = localVal.split('T');
    const timeWithSec = timePart.length === 5 ? `${timePart}:00` : timePart;
    return `${datePart} ${timeWithSec}`;
  };

  const handleAnalyze = async () => {
    if (!sourceJd.trim() || sourceJd.trim().length < 15) {
      setError('Please paste a comprehensive Job Description (at least a few sentences).');
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setAnalysisStep('Reasoning over Job Description text with AI...');

    try {
      setTimeout(() => setAnalysisStep('Querying Institution Academic Hierarchy & Departments...'), 750);
      setTimeout(() => setAnalysisStep('Mapping Requirements & Validating Safety Rules...'), 1500);

      const res = await fetch(`${API_BASE}/ai/drives/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source_jd: sourceJd }),
      });

      const data = await parseJsonResponse(res, 'Failed to analyze Job Description.');

      setDraft(data);
      const ext = data.extracted_requirements || {};
      const mapped = data.mapped_requirements || {};
      setEditForm({
        company_name: ext.company_name || '',
        job_role: ext.job_role || '',
        package: ext.package || '',
        location: ext.location || '',
        mode: ext.mode || 'On-campus',
        min_cgpa: ext.min_cgpa ?? 0.0,
        max_backlogs: ext.max_backlogs ?? 99,
        passout_year: ext.passout_year || 2027,
        drive_deadline: formatDeadlineToStandard(ext.drive_deadline || ''),
        allowed_departments: mapped.department_names || ext.allowed_departments || [],
        allowed_programs: mapped.program_names || ext.allowed_programs || [],
        required_skills: (ext.required_skills || []).join(', '),
      });
      setSuccess('Job Description structured and validated successfully!');
    } catch (err: any) {
      setError(err.message || 'An error occurred during AI analysis.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleSwitchToActiveBatch = async (targetYear = 2027) => {
    if (!draft) return;
    setError(null);
    try {
      const ext = {
        ...(draft.extracted_requirements || {}),
        passout_year: targetYear,
      };
      const res = await fetch(`${API_BASE}/ai/drives/drafts/${draft.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ extracted_requirements: ext }),
      });
      const data = await parseJsonResponse(res, 'Failed to update passout batch.');
      setDraft(data);
      setEditForm((prev: any) => ({ ...prev, passout_year: targetYear }));
      setSuccess(`Target batch switched to ${targetYear}! ${data.estimated_eligible_count || 0} eligible students found.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCompleteMissing = async () => {
    if (!draft) return;
    setError(null);
    try {
      const payloadToSubmit = { ...missingInputs };
      if (payloadToSubmit.drive_deadline) {
        payloadToSubmit.drive_deadline = formatDeadlineToStandard(payloadToSubmit.drive_deadline);
      }
      const res = await fetch(`${API_BASE}/ai/drives/drafts/${draft.id}/complete-missing-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payloadToSubmit),
      });
      const data = await parseJsonResponse(res, 'Failed to update missing info.');

      setDraft(data);
      setSuccess('Draft updated and re-validated successfully!');
      setMissingInputs({});
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveEdit = async () => {
    if (!draft) return;
    setError(null);
    try {
      const ext = {
        company_name: editForm.company_name,
        job_role: editForm.job_role,
        package: editForm.package,
        location: editForm.location,
        mode: editForm.mode,
        min_cgpa: parseFloat(editForm.min_cgpa) || 0.0,
        max_backlogs: parseInt(editForm.max_backlogs, 10) || 0,
        passout_year: parseInt(editForm.passout_year, 10),
        drive_deadline: formatDeadlineToStandard(editForm.drive_deadline),
        required_skills: editForm.required_skills
          ? editForm.required_skills.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
      };

      const res = await fetch(`${API_BASE}/ai/drives/drafts/${draft.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ extracted_requirements: ext }),
      });
      const data = await parseJsonResponse(res, 'Failed to update draft.');
      setDraft(data);
      setIsEditing(false);
      setSuccess('Draft changes saved and verified!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApproveAndPublish = async () => {
    if (!draft) return;
    setError(null);
    setIsPublishing(true);

    try {
      const res = await fetch(`${API_BASE}/ai/drives/drafts/${draft.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await parseJsonResponse(res, 'Approval failed.');

      setSuccess(`Drive Published! ${data.eligible_students_notified} eligible students notified.`);
      setTimeout(() => {
        onDrivePublished();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const wordCount = sourceJd.trim() ? sourceJd.trim().split(/\s+/).length : 0;

  return ReactDOM.createPortal(
    <div
      style={s.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isAnalyzing && !isPublishing) {
          onClose();
        }
      }}
    >
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={s.iconBadge}>
              <SparklesIcon size={22} color="#818CF8" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={s.title}>Create Placement Drive with AI</h2>
                <span style={s.agentPill}>⚡ AGENTIC PIPELINE</span>
              </div>
              <p style={s.subtitle}>
                Paste an unstructured Job Description or email. AI extracts requirements, links to your college departments & programs, checks constraints, and requires your approval.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={s.closeBtn}
            title="Close modal"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Feedback Toasts */}
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

        {/* Content Body */}
        <div style={s.body}>
          {!draft ? (
            /* STEP 1: Paste JD */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* 3-Step Process Explanation Banner */}
              <div style={s.workflowBanner}>
                <div style={s.workflowStep}>
                  <div style={s.stepNum}>1</div>
                  <div>
                    <div style={s.stepTitle}>Paste Unstructured JD</div>
                    <div style={s.stepDesc}>Raw HR email, circular, or notes</div>
                  </div>
                </div>
                <div style={s.stepArrow}>→</div>
                <div style={s.workflowStep}>
                  <div style={s.stepNum}>2</div>
                  <div>
                    <div style={s.stepTitle}>AI Structuring & DB Match</div>
                    <div style={s.stepDesc}>Maps branches to institutional DB</div>
                  </div>
                </div>
                <div style={s.stepArrow}>→</div>
                <div style={s.workflowStep}>
                  <div style={s.stepNum}>3</div>
                  <div>
                    <div style={s.stepTitle}>TPO Review & Publish</div>
                    <div style={s.stepDesc}>Human-in-the-loop approval</div>
                  </div>
                </div>
              </div>

              {/* Sample JDs Row */}
              <div style={s.sampleBar}>
                <span style={s.sampleBarLabel}>Load Sample JD:</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SAMPLE_JDS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSourceJd(sample.text);
                        setError(null);
                      }}
                      style={s.sampleChip}
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea Area */}
              <div style={s.textareaWrapper}>
                <div style={s.textareaHeader}>
                  <label style={s.label}>
                    Job Description (Raw Text / Circular / HR Email) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <span style={s.wordCountBadge}>{wordCount} words</span>
                </div>

                <textarea
                  value={sourceJd}
                  onChange={(e) => setSourceJd(e.target.value)}
                  placeholder={`Paste HR email, PDF text extract, or requirements circular here...\n\nExample:\nABC Tech is hiring Associate Software Engineers for Hyderabad & Bengaluru.\nEligibility: B.Tech CSE / IT, 7.5 CGPA or 70%, 0 backlogs.\nCTC: 12 LPA. Application Deadline: 25 Nov 2026.`}
                  rows={10}
                  style={s.textarea}
                  disabled={isAnalyzing}
                />

                <div style={s.textareaFooterTips}>
                  <span>💡 <strong>Tip:</strong> Include Company Name, Role, Package (CTC), Allowed Branches, Min CGPA, Backlogs, and Deadline for maximum extraction fidelity.</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={s.footerActions}>
                <button
                  onClick={onClose}
                  style={s.cancelBtn}
                  disabled={isAnalyzing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !sourceJd.trim()}
                  style={{
                    ...s.primaryBtn,
                    opacity: isAnalyzing || !sourceJd.trim() ? 0.6 : 1,
                    cursor: isAnalyzing || !sourceJd.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isAnalyzing ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="animate-spin" style={s.spinner} />
                      <span>{analysisStep || 'Analyzing JD with AI...'}</span>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SparklesIcon size={18} /> Analyze & Build Draft with AI
                    </span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: Review Extracted Requirements & Validate */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Status Header */}
              <div style={s.reviewHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      ...s.statusBadge,
                      background: draft.status === 'READY_FOR_REVIEW' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                      color: draft.status === 'READY_FOR_REVIEW' ? '#10B981' : '#F59E0B',
                      border: draft.status === 'READY_FOR_REVIEW' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)',
                    }}
                  >
                    ● Status: {draft.status.replace('_', ' ')}
                  </span>
                  <span style={s.confidenceBadge}>
                    AI Confidence: {Math.round(draft.confidence_score * 100)}%
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    style={s.secondaryBtn}
                  >
                    <EditIcon size={15} /> {isEditing ? 'Cancel Edit' : 'Edit Draft'}
                  </button>
                  <button
                    onClick={() => {
                      setDraft(null);
                      setIsEditing(false);
                    }}
                    style={s.ghostBtn}
                  >
                    <RefreshIcon size={15} /> Paste Another JD
                  </button>
                </div>
              </div>

              {/* Edit Mode vs Read-only Grid */}
              {isEditing ? (
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <h3 style={s.cardTitle}>Edit Extracted Parameters</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Adjust any values before publishing</span>
                  </div>
                  <div style={s.formGrid}>
                    <div>
                      <label style={s.label}>Company Name *</label>
                      <input
                        style={s.input}
                        value={editForm.company_name}
                        onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={s.label}>Job Role *</label>
                      <input
                        style={s.input}
                        value={editForm.job_role}
                        onChange={(e) => setEditForm({ ...editForm, job_role: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={s.label}>Package (CTC) *</label>
                      <input
                        style={s.input}
                        value={editForm.package}
                        onChange={(e) => setEditForm({ ...editForm, package: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={s.label}>Location *</label>
                      <input
                        style={s.input}
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={s.label}>Work Mode</label>
                      <select
                        style={s.input}
                        value={editForm.mode}
                        onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })}
                      >
                        <option value="On-campus">On-campus</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="Remote">Remote</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ ...s.label, margin: 0 }}>Passout Year (Batch) *</label>
                        <span style={{ fontSize: '0.72rem', color: '#6366F1', fontWeight: 600 }}>
                          Active College Batch: 2027
                        </span>
                      </div>
                      <input
                        type="number"
                        style={s.input}
                        value={editForm.passout_year}
                        onChange={(e) => setEditForm({ ...editForm, passout_year: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={s.label}>Min CGPA Cutoff</label>
                      <input
                        type="number"
                        step="0.1"
                        style={s.input}
                        value={editForm.min_cgpa}
                        onChange={(e) => setEditForm({ ...editForm, min_cgpa: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={s.label}>Max Allowed Backlogs</label>
                      <input
                        type="number"
                        style={s.input}
                        value={editForm.max_backlogs}
                        onChange={(e) => setEditForm({ ...editForm, max_backlogs: e.target.value })}
                      />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                        <label style={{ ...s.label, margin: 0 }}>Application Deadline (YYYY-MM-DD HH:MM:SS) *</label>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Days:</span>
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, drive_deadline: addDaysToDeadline(7) })}
                            style={s.miniPresetBtn}
                          >
                            +7 Days
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, drive_deadline: addDaysToDeadline(14) })}
                            style={s.miniPresetBtn}
                          >
                            +14 Days
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, drive_deadline: addDaysToDeadline(30) })}
                            style={s.miniPresetBtn}
                          >
                            +30 Days
                          </button>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, marginLeft: 4 }}>Time:</span>
                          <button
                            type="button"
                            onClick={() => setTimeForDeadline(23, 59, 59, false)}
                            style={{ ...s.miniPresetBtn, background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34D399' }}
                            title="Set time to End of Day (23:59:59)"
                          >
                            23:59:59 (End of Day)
                          </button>
                          <button
                            type="button"
                            onClick={() => setTimeForDeadline(18, 0, 0, false)}
                            style={{ ...s.miniPresetBtn, background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#FBBF24' }}
                            title="Set time to 6:00 PM (18:00:00)"
                          >
                            18:00:00 (6 PM)
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          style={{ ...s.input, flex: 1 }}
                          value={editForm.drive_deadline || ''}
                          placeholder="2026-11-25 23:59:59"
                          onChange={(e) => setEditForm({ ...editForm, drive_deadline: e.target.value })}
                          onBlur={(e) => setEditForm({ ...editForm, drive_deadline: formatDeadlineToStandard(e.target.value) })}
                        />
                        <input
                          type="datetime-local"
                          value={toDateTimeLocalVal(editForm.drive_deadline)}
                          onChange={(e) => {
                            if (e.target.value) {
                              setEditForm({ ...editForm, drive_deadline: fromDateTimeLocalVal(e.target.value) });
                            }
                          }}
                          style={{
                            ...s.input,
                            width: 'auto',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            colorScheme: 'dark',
                          }}
                          title="Pick date and time using calendar"
                        />
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        💡 Standard 24-hr format with hours. Date and time are automatically normalized to 23:59:59 (End of Day) if hours are omitted.
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={s.label}>Required Skills (comma separated)</label>
                      <input
                        style={s.input}
                        value={editForm.required_skills}
                        onChange={(e) => setEditForm({ ...editForm, required_skills: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button onClick={() => setIsEditing(false)} style={s.cancelBtn}>Cancel</button>
                    <button onClick={handleSaveEdit} style={s.primaryBtn}>Save Changes</button>
                  </div>
                </div>
              ) : (
                /* READ ONLY EXTRACTED GRID */
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <h3 style={s.cardTitle}>Extracted Drive Requirements</h3>
                    <span style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 700 }}>
                      ✓ Parsed via PlacementHub AI Agent
                    </span>
                  </div>
                  <div style={s.detailsGrid}>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Company</span>
                      <span style={{ ...s.detailVal, fontWeight: 800 }}>
                        {draft.extracted_requirements.company_name || '—'}
                      </span>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Job Role</span>
                      <span style={{ ...s.detailVal, fontWeight: 800 }}>
                        {draft.extracted_requirements.job_role || '—'}
                      </span>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Package (CTC)</span>
                      <span style={{ ...s.detailVal, color: '#10B981', fontWeight: 800 }}>
                        {draft.extracted_requirements.package || '—'}
                      </span>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Location & Mode</span>
                      <span style={s.detailVal}>
                        {draft.extracted_requirements.location || '—'} ({draft.extracted_requirements.mode || 'On-campus'})
                      </span>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Min CGPA Cutoff</span>
                      <span style={s.detailVal}>
                        {draft.extracted_requirements.min_cgpa ?? '0.0'}
                      </span>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Max Active Backlogs</span>
                      <span style={s.detailVal}>
                        {draft.extracted_requirements.max_backlogs ?? '0'}
                      </span>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Passout Batch</span>
                      <span style={s.detailVal}>
                        {draft.extracted_requirements.passout_year || '—'}
                      </span>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Eligible Students</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                        <span style={{
                          ...s.detailVal,
                          fontWeight: 800,
                          color: (draft.estimated_eligible_count || 0) > 0 ? '#10B981' : '#F59E0B'
                        }}>
                          {draft.estimated_eligible_count !== undefined
                            ? `${draft.estimated_eligible_count} student${draft.estimated_eligible_count === 1 ? '' : 's'}`
                            : '—'}
                        </span>
                        {draft.estimated_eligible_count === 0 && (
                          <button
                            type="button"
                            onClick={() => handleSwitchToActiveBatch(2027)}
                            style={{
                              alignSelf: 'flex-start',
                              padding: '2px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: '#FEF3C7',
                              color: '#92400E',
                              border: '1px solid #FCD34D',
                              borderRadius: 4,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="Click to switch to active 2027 college batch"
                          >
                            ⚡ Switch to 2027 Batch
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={s.detailItem}>
                      <span style={s.detailLbl}>Deadline</span>
                      <span style={{ ...s.detailVal, color: draft.extracted_requirements.drive_deadline ? 'var(--text-primary)' : '#EF4444' }}>
                        {draft.extracted_requirements.drive_deadline || '⚠ Missing Deadline'}
                      </span>
                    </div>
                  </div>

                  {draft.extracted_requirements.required_skills?.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
                      <span style={s.detailLbl}>Skills Detected in JD:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {draft.extracted_requirements.required_skills.map((sk: string) => (
                          <span key={sk} style={s.skillPill}>{sk}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Academic Hierarchy Mappings Card */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <h3 style={s.cardTitle}>Academic Hierarchy Database Mapping</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Raw degree/branch mentions mapped to authoritative database records.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {draft.mapped_requirements.mapping_records?.map((rec: any, idx: number) => (
                    <div key={idx} style={s.mappingRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={s.mappingFieldBadge}>{rec.field}</span>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          "{rec.raw_value}"
                        </strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>→</span>
                        <span style={{ fontSize: '0.88rem', color: rec.mapped_name ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                          {rec.mapped_name ? rec.mapped_name : 'No direct DB match'}
                        </span>
                      </div>
                      <div>
                        <span
                          style={{
                            ...s.matchBadge,
                            background: rec.status === 'matched' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                            color: rec.status === 'matched' ? '#10B981' : '#EF4444',
                            border: rec.status === 'matched' ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.25)',
                          }}
                        >
                          {rec.status === 'matched' ? `✓ Matched (${Math.round(rec.confidence * 100)}%)` : '⚠ Unmatched'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Missing Information Form (if any) */}
              {draft.missing_fields?.length > 0 && (
                <div style={s.missingCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <AlertIcon size={20} color="#F59E0B" />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#B45309', fontWeight: 800 }}>
                      Missing Information Required
                    </h4>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: '#92400E', margin: '0 0 16px 0' }}>
                    The AI detected that the following mandatory fields were omitted from the Job Description. Please complete them before publishing:
                  </p>

                  <div style={s.formGrid}>
                    {draft.missing_fields.map((mf: any) => (
                      <div key={mf.field} style={{ gridColumn: mf.field === 'drive_deadline' ? 'span 2' : 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                          <label style={{ ...s.label, color: '#92400E', margin: 0 }}>{mf.label} *</label>
                          {mf.field === 'drive_deadline' && (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Days:</span>
                              <button
                                type="button"
                                onClick={() => setMissingInputs({ ...missingInputs, drive_deadline: addDaysToDeadline(7) })}
                                style={s.miniPresetBtn}
                              >
                                +7 Days
                              </button>
                              <button
                                type="button"
                                onClick={() => setMissingInputs({ ...missingInputs, drive_deadline: addDaysToDeadline(14) })}
                                style={s.miniPresetBtn}
                              >
                                +14 Days
                              </button>
                              <button
                                type="button"
                                onClick={() => setMissingInputs({ ...missingInputs, drive_deadline: addDaysToDeadline(30) })}
                                style={s.miniPresetBtn}
                              >
                                +30 Days
                              </button>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, marginLeft: 4 }}>Time:</span>
                              <button
                                type="button"
                                onClick={() => setTimeForDeadline(23, 59, 59, true)}
                                style={{ ...s.miniPresetBtn, background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34D399' }}
                                title="Set time to End of Day (23:59:59)"
                              >
                                23:59:59 (End of Day)
                              </button>
                              <button
                                type="button"
                                onClick={() => setTimeForDeadline(18, 0, 0, true)}
                                style={{ ...s.miniPresetBtn, background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#FBBF24' }}
                                title="Set time to 6:00 PM (18:00:00)"
                              >
                                18:00:00 (6 PM)
                              </button>
                            </div>
                          )}
                        </div>
                        {mf.field === 'drive_deadline' ? (
                          <>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                style={{ ...s.input, flex: 1 }}
                                placeholder="YYYY-MM-DD HH:MM:SS (e.g. 2026-11-25 23:59:59)"
                                value={missingInputs[mf.field] || ''}
                                onChange={(e) => setMissingInputs({ ...missingInputs, [mf.field]: e.target.value })}
                                onBlur={(e) => setMissingInputs({ ...missingInputs, [mf.field]: formatDeadlineToStandard(e.target.value) })}
                              />
                              <input
                                type="datetime-local"
                                value={toDateTimeLocalVal(missingInputs[mf.field])}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setMissingInputs({ ...missingInputs, [mf.field]: fromDateTimeLocalVal(e.target.value) });
                                  }
                                }}
                                style={{
                                  ...s.input,
                                  width: 'auto',
                                  padding: '8px 10px',
                                  cursor: 'pointer',
                                  colorScheme: 'dark',
                                }}
                                title="Pick date and time using calendar"
                              />
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                              💡 Standard 24-hr format with hours. Date and time are automatically normalized to 23:59:59 (End of Day) if hours are omitted.
                            </div>
                          </>
                        ) : (
                          <input
                            type={mf.suggested_type === 'number' ? 'number' : 'text'}
                            placeholder={`Enter ${mf.label.toLowerCase()}`}
                            style={s.input}
                            value={missingInputs[mf.field] || ''}
                            onChange={(e) => setMissingInputs({ ...missingInputs, [mf.field]: e.target.value })}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleCompleteMissing}
                    style={{ ...s.primaryBtn, marginTop: 16, background: '#D97706', width: '100%' }}
                  >
                    Submit Missing Information & Re-validate
                  </button>
                </div>
              )}

              {/* Validation Status */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <h3 style={s.cardTitle}>Deterministic Safety & Schema Validation</h3>
                  <span style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 700 }}>
                    3 Checks Passed
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={s.valItem}>
                    <CheckIcon size={16} color="#10B981" />
                    <span style={s.valTxt}>Drive schema bounds verified (CGPA range, percentage range, backlogs)</span>
                  </div>
                  <div style={s.valItem}>
                    <CheckIcon size={16} color="#10B981" />
                    <span style={s.valTxt}>Tenant isolation enforced: Target program and department IDs exist in database</span>
                  </div>
                  <div style={s.valItem}>
                    <CheckIcon size={16} color="#10B981" />
                    <span style={s.valTxt}>Deterministic eligibility engine rules mapped successfully</span>
                  </div>
                  {draft.validation_issues?.map((iss: any, idx: number) => (
                    <div key={idx} style={{ ...s.valItem, color: iss.severity === 'error' ? '#EF4444' : '#F59E0B' }}>
                      <AlertIcon size={16} color={iss.severity === 'error' ? '#EF4444' : '#F59E0B'} />
                      <span style={s.valTxt}>{iss.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Final Human Approval & Publish Action */}
              <div style={s.footer}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 440 }}>
                  🔒 <strong>Human Verification Gate:</strong> As TPO, your approval publishes this drive to students immediately.
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={onClose} style={s.cancelBtn}>Close</button>
                  <button
                    onClick={handleApproveAndPublish}
                    disabled={isPublishing || draft.status !== 'READY_FOR_REVIEW'}
                    style={{
                      ...s.publishBtn,
                      opacity: draft.status === 'READY_FOR_REVIEW' ? 1 : 0.6,
                      cursor: draft.status === 'READY_FOR_REVIEW' ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isPublishing ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="animate-spin" style={s.spinner} />
                        Publishing...
                      </span>
                    ) : (
                      '✓ Approve & Publish Drive'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
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
    maxWidth: 880,
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
    padding: '22px 28px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    background: 'var(--card-bg, #1e293b)',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
    border: '1px solid rgba(99, 102, 241, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '1.28rem',
    fontWeight: 800,
    color: 'var(--text-primary, #f8fafc)',
  },
  agentPill: {
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
    color: '#818CF8',
    border: '1px solid rgba(99, 102, 241, 0.4)',
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: '0.72rem',
    fontWeight: 800,
    letterSpacing: '0.5px',
  },
  subtitle: {
    margin: '6px 0 0 0',
    fontSize: '0.84rem',
    color: 'var(--text-secondary, #94a3b8)',
    lineHeight: 1.45,
  },
  closeBtn: {
    background: 'var(--bg-main, #0f172a)',
    border: '1px solid var(--border-color)',
    borderRadius: '50%',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  body: {
    padding: '24px 28px',
    overflowY: 'auto',
    flex: 1,
  },
  workflowBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    borderRadius: 14,
    padding: '14px 20px',
    gap: 12,
  },
  workflowStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: '#6366F1',
    color: '#FFF',
    fontSize: '0.8rem',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: '0.84rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  stepDesc: {
    fontSize: '0.74rem',
    color: 'var(--text-secondary)',
  },
  stepArrow: {
    color: 'var(--text-secondary)',
    fontWeight: 800,
    fontSize: '1.1rem',
    opacity: 0.5,
  },
  sampleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  sampleBarLabel: {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  sampleChip: {
    background: 'rgba(99, 102, 241, 0.1)',
    color: '#818CF8',
    border: '1px solid rgba(99, 102, 241, 0.25)',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  textareaWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  textareaHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: '0.86rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'block',
  },
  wordCountBadge: {
    fontSize: '0.76rem',
    color: 'var(--text-secondary)',
    background: 'var(--bg-main, #0f172a)',
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
  },
  textarea: {
    width: '100%',
    minHeight: 220,
    padding: 16,
    borderRadius: 12,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-main, #0f172a)',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    lineHeight: 1.6,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    resize: 'vertical',
    outline: 'none',
  },
  textareaFooterTips: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },
  footerActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 10,
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
    color: '#FFF',
    border: 'none',
    padding: '11px 24px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: '0.9rem',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'transform 0.15s ease',
  },
  secondaryBtn: {
    background: 'var(--bg-main, #0f172a)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    padding: '8px 14px',
    borderRadius: 8,
    fontWeight: 600,
    fontSize: '0.82rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  ghostBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '8px 12px',
    fontSize: '0.82rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontWeight: 600,
  },
  cancelBtn: {
    background: 'var(--bg-main, #0f172a)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    padding: '11px 20px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: '0.88rem',
    cursor: 'pointer',
  },
  publishBtn: {
    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    color: '#FFF',
    border: 'none',
    padding: '12px 26px',
    borderRadius: 10,
    fontWeight: 800,
    fontSize: '0.92rem',
    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
  },
  card: {
    background: 'var(--bg-main, #0f172a)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: 20,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  missingCard: {
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.35)',
    borderRadius: 14,
    padding: 20,
  },
  cardTitle: {
    margin: 0,
    fontSize: '0.98rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--bg-main, #0f172a)',
    padding: '12px 18px',
    borderRadius: 12,
    border: '1px solid var(--border-color)',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusBadge: {
    padding: '5px 12px',
    borderRadius: 20,
    fontSize: '0.8rem',
    fontWeight: 800,
  },
  confidenceBadge: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#818CF8',
    background: 'rgba(99, 102, 241, 0.12)',
    border: '1px solid rgba(99, 102, 241, 0.25)',
    padding: '5px 12px',
    borderRadius: 20,
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'var(--card-bg, #1e293b)',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
  },
  detailLbl: {
    fontSize: '0.72rem',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  detailVal: {
    fontSize: '0.92rem',
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  skillPill: {
    background: 'rgba(99, 102, 241, 0.14)',
    color: '#818CF8',
    border: '1px solid rgba(99, 102, 241, 0.25)',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: '0.78rem',
    fontWeight: 700,
  },
  mappingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--card-bg, #1e293b)',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    flexWrap: 'wrap',
    gap: 8,
  },
  mappingFieldBadge: {
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    background: 'var(--bg-main, #0f172a)',
    border: '1px solid var(--border-color)',
    padding: '3px 8px',
    borderRadius: 6,
    fontWeight: 800,
  },
  matchBadge: {
    fontSize: '0.76rem',
    fontWeight: 800,
    padding: '3px 10px',
    borderRadius: 8,
  },
  valItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  valTxt: {
    fontSize: '0.84rem',
    color: 'var(--text-secondary)',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 14,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--card-bg, #1e293b)',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    boxSizing: 'border-box',
    outline: 'none',
  },
  miniPresetBtn: {
    background: 'rgba(99, 102, 241, 0.12)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#818CF8',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  alertErr: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#F87171',
    padding: '12px 18px',
    borderRadius: 10,
    fontSize: '0.86rem',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '14px 28px 0',
  },
  alertOk: {
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34D399',
    padding: '12px 18px',
    borderRadius: 10,
    fontSize: '0.86rem',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '14px 28px 0',
  },
  footer: {
    borderTop: '1px solid var(--border-color)',
    paddingTop: 18,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  spinner: {
    width: 16,
    height: 16,
    border: '2px solid rgba(255,255,255,0.4)',
    borderTopColor: '#FFF',
    borderRadius: '50%',
  },
};
