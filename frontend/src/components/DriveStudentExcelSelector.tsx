import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  FileSpreadsheetIcon,
  FilterIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon,
  RefreshIcon,
  GraduationCapIcon,
  BuildingIcon,
  ClassIcon,
  AlertIcon
} from './Icons';

export interface CandidateStudent {
  student_id: string;
  name: string;
  roll_number: string;
  email: string;
  mobile: string;
  department_id: string;
  department_name: string;
  class_id: string;
  class_name: string;
  current_study_year?: number;
  study_year_label?: string;
  passout_year?: number | string;
  cgpa: number;
  active_backlogs: number;
  total_backlogs?: number;
  tenth_percentage?: number | null;
  twelfth_percentage?: number | null;
  gender?: string;
  resume_url?: string;
  is_eligible?: boolean;
  eligibility_reasons?: string[];
  eligibility_breakdown?: Array<{ criterion: string; status: string; detail: string }>;
  application_status?: string;
  application_id?: string | null;
}

interface DriveStudentExcelSelectorProps {
  token: string;
  drive: any;
  isOpen: boolean;
  onClose: () => void;
  onSelectionComplete: (selectedCount: number) => void;
  hierarchy?: any[];
}

const API_BASE = 'http://localhost:8000/api';

export const DriveStudentExcelSelector: React.FC<DriveStudentExcelSelectorProps> = ({
  token,
  drive,
  isOpen,
  onClose,
  onSelectionComplete,
  hierarchy = [],
}) => {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateStudent[]>([]);
  const [driveDetails, setDriveDetails] = useState<any>(drive || {});
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Branch, Year, Section Selectors ──
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');

  // ── Eligibility Criteria Filter Controls (Pre-filled from Drive) ──
  const [filterOnlyEligible, setFilterOnlyEligible] = useState<boolean>(true);
  const [minCgpaFilter, setMinCgpaFilter] = useState<number>(drive?.min_cgpa ?? 0);
  const [maxBacklogsFilter, setMaxBacklogsFilter] = useState<number>(drive?.max_backlogs ?? 99);
  const [minTenthFilter, setMinTenthFilter] = useState<number>(drive?.min_tenth_percentage ?? 0);
  const [minTwelfthFilter, setMinTwelfthFilter] = useState<number>(drive?.min_twelfth_percentage ?? 0);
  const [genderFilter, setGenderFilter] = useState<string>(drive?.gender_filter || 'All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ── Selected Student IDs (Checkboxes) ──
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [selectionStatus, setSelectionStatus] = useState<'Selected' | 'Shortlisted'>('Selected');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (text: string, ok: boolean = true) => {
    setToastMessage({ text, ok });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ── Fetch candidates from backend ──
  const loadCandidates = useCallback(async () => {
    if (!drive?.id) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/tpo/drives/${drive.id}/candidate-pool`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setCandidates(data.candidates || []);
      if (data.drive) {
        setDriveDetails(data.drive);
        // Sync defaults if not modified
        setMinCgpaFilter(data.drive.min_cgpa ?? 0);
        setMaxBacklogsFilter(data.drive.max_backlogs ?? 99);
        setMinTenthFilter(data.drive.min_tenth_percentage ?? 0);
        setMinTwelfthFilter(data.drive.min_twelfth_percentage ?? 0);
        setGenderFilter(data.drive.gender_filter || 'All');
      }
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load candidate students.');
    } finally {
      setLoading(false);
    }
  }, [drive?.id, token]);

  useEffect(() => {
    if (isOpen) {
      setCheckedIds(new Set());
      loadCandidates();
    }
  }, [isOpen, loadCandidates]);

  // Reset filters to Drive defaults
  const handleResetToDriveCriteria = () => {
    setMinCgpaFilter(driveDetails?.min_cgpa ?? 0);
    setMaxBacklogsFilter(driveDetails?.max_backlogs ?? 99);
    setMinTenthFilter(driveDetails?.min_tenth_percentage ?? 0);
    setMinTwelfthFilter(driveDetails?.min_twelfth_percentage ?? 0);
    setGenderFilter(driveDetails?.gender_filter || 'All');
    setFilterOnlyEligible(true);
    setSearchQuery('');
    showToast('Filters reset to official drive requirements');
  };

  // ── Unique Branches (Departments) derived from candidates + hierarchy ──
  const branchOptions = useMemo(() => {
    const map = new Map<string, string>();
    // Add allowed departments from drive
    candidates.forEach(c => {
      if (c.department_name) {
        map.set(c.department_name.trim(), c.department_name.trim());
      }
    });
    // From hierarchy
    if (Array.isArray(hierarchy)) {
      hierarchy.forEach((prog: any) => {
        (prog.departments || []).forEach((dept: any) => {
          if (dept.name) map.set(dept.name.trim(), dept.name.trim());
        });
      });
    }
    return Array.from(map.values()).sort();
  }, [candidates, hierarchy]);

  // ── Unique Years derived from candidates ──
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    candidates.forEach(c => {
      if (c.study_year_label) years.add(c.study_year_label);
      else if (c.current_study_year) years.add(`${c.current_study_year} Year`);
      if (c.passout_year) years.add(`Batch of ${c.passout_year}`);
    });
    return Array.from(years).sort();
  }, [candidates]);

  // ── Unique Sections derived for selected branch ──
  const sectionOptions = useMemo(() => {
    const sections = new Set<string>();
    candidates.forEach(c => {
      if (selectedBranch === 'ALL' || c.department_name === selectedBranch) {
        if (c.class_name) sections.add(c.class_name.trim());
      }
    });
    return Array.from(sections).sort();
  }, [candidates, selectedBranch]);

  // ── Compute Eligibility dynamically based on current filter values ──
  const evaluateStudentCustom = useCallback((s: CandidateStudent) => {
    const reasons: string[] = [];

    // CGPA
    if (minCgpaFilter > 0 && s.cgpa < minCgpaFilter) {
      reasons.push(`CGPA ${s.cgpa.toFixed(2)} < ${minCgpaFilter}`);
    }

    // Active Backlogs
    if (s.active_backlogs > maxBacklogsFilter) {
      reasons.push(`Backlogs ${s.active_backlogs} > ${maxBacklogsFilter}`);
    }

    // 10th %
    if (minTenthFilter > 0) {
      const tenth = s.tenth_percentage ?? 0;
      if (tenth < minTenthFilter) reasons.push(`10th ${tenth}% < ${minTenthFilter}%`);
    }

    // 12th %
    if (minTwelfthFilter > 0) {
      const twelfth = s.twelfth_percentage ?? 0;
      if (twelfth < minTwelfthFilter) reasons.push(`12th ${twelfth}% < ${minTwelfthFilter}%`);
    }

    // Gender Filter
    if (genderFilter !== 'All') {
      const g = (s.gender || '').toLowerCase();
      if (g && g !== genderFilter.toLowerCase() && g !== 'not specified') {
        reasons.push(`Gender is ${s.gender}, required ${genderFilter}`);
      }
    }

    // Drive Allowed Departments (if specified)
    const allowedDepts = driveDetails?.allowed_departments || [];
    if (allowedDepts.length > 0) {
      const deptMatches = allowedDepts.some((ad: string) =>
        ad.toLowerCase() === s.department_id?.toLowerCase() ||
        ad.toLowerCase() === s.department_name?.toLowerCase() ||
        s.department_name?.toLowerCase().includes(ad.toLowerCase())
      );
      if (!deptMatches) {
        reasons.push(`Branch '${s.department_name}' not in drive allowed departments`);
      }
    }

    // Passout Year check (if drive specifies)
    const drivePassout = driveDetails?.passout_year;
    if (drivePassout && s.passout_year && String(drivePassout) !== String(s.passout_year)) {
      reasons.push(`Passout year ${s.passout_year} != ${drivePassout}`);
    }

    return {
      isEligible: reasons.length === 0,
      reasons,
    };
  }, [minCgpaFilter, maxBacklogsFilter, minTenthFilter, minTwelfthFilter, genderFilter, driveDetails]);

  // ── Filtered Students List ──
  const filteredCandidates = useMemo(() => {
    return candidates.filter(student => {
      // 1. Branch filter
      if (selectedBranch !== 'ALL' && student.department_name !== selectedBranch) {
        return false;
      }

      // 2. Year filter
      if (selectedYear !== 'ALL') {
        const stYearLabel = student.study_year_label || `${student.current_study_year} Year`;
        const stBatchLabel = `Batch of ${student.passout_year}`;
        if (selectedYear !== stYearLabel && selectedYear !== stBatchLabel) {
          return false;
        }
      }

      // 3. Section filter
      if (selectedSection !== 'ALL' && student.class_name !== selectedSection) {
        return false;
      }

      // 4. Search query (Name or Roll Number)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = student.name.toLowerCase().includes(q);
        const matchesRoll = student.roll_number.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll) return false;
      }

      // 5. Eligibility criteria filter
      const { isEligible } = evaluateStudentCustom(student);
      if (filterOnlyEligible && !isEligible) {
        return false;
      }

      return true;
    });
  }, [candidates, selectedBranch, selectedYear, selectedSection, searchQuery, filterOnlyEligible, evaluateStudentCustom]);

  // Statistics
  const stats = useMemo(() => {
    let eligibleCount = 0;
    candidates.forEach(c => {
      if (evaluateStudentCustom(c).isEligible) eligibleCount++;
    });

    let filteredEligibleCount = 0;
    filteredCandidates.forEach(c => {
      if (evaluateStudentCustom(c).isEligible) filteredEligibleCount++;
    });

    return {
      totalCandidates: candidates.length,
      filteredTotal: filteredCandidates.length,
      eligibleTotal: eligibleCount,
      filteredEligibleTotal: filteredEligibleCount,
      checkedCount: checkedIds.size,
    };
  }, [candidates, filteredCandidates, evaluateStudentCustom, checkedIds]);

  // ── Checkbox Handlers ──
  const toggleStudent = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const checkAllFiltered = () => {
    const next = new Set(checkedIds);
    filteredCandidates.forEach(c => next.add(c.student_id));
    setCheckedIds(next);
    showToast(`Checked all ${filteredCandidates.length} filtered students`);
  };

  const checkAllEligible = () => {
    const next = new Set(checkedIds);
    let newlyChecked = 0;
    filteredCandidates.forEach(c => {
      if (evaluateStudentCustom(c).isEligible) {
        next.add(c.student_id);
        newlyChecked++;
      }
    });
    setCheckedIds(next);
    showToast(`Auto-checked ${newlyChecked} eligible students`);
  };

  const clearAllChecks = () => {
    setCheckedIds(new Set());
    showToast('Cleared all checked students');
  };

  // Master header checkbox state
  const isAllFilteredChecked = filteredCandidates.length > 0 && filteredCandidates.every(c => checkedIds.has(c.student_id));
  const isPartiallyChecked = filteredCandidates.some(c => checkedIds.has(c.student_id)) && !isAllFilteredChecked;

  const handleMasterCheckboxChange = () => {
    if (isAllFilteredChecked) {
      // Uncheck all in current filtered view
      setCheckedIds(prev => {
        const next = new Set(prev);
        filteredCandidates.forEach(c => next.delete(c.student_id));
        return next;
      });
    } else {
      // Check all in current filtered view
      checkAllFiltered();
    }
  };

  // ── Export Current View to CSV / Excel File ──
  const handleExportCsv = () => {
    if (filteredCandidates.length === 0) {
      showToast('No students to export', false);
      return;
    }

    const headers = [
      'Roll Number',
      'Student Name',
      'Email',
      'Mobile',
      'Branch',
      'Year',
      'Section',
      'CGPA',
      'Active Backlogs',
      '10th %',
      '12th %',
      'Gender',
      'Eligible For Drive',
      'Eligibility Reasons',
      'Current Status in Drive'
    ];

    const rows = filteredCandidates.map(c => {
      const { isEligible, reasons } = evaluateStudentCustom(c);
      return [
        `"${c.roll_number}"`,
        `"${c.name}"`,
        `"${c.email}"`,
        `"${c.mobile}"`,
        `"${c.department_name}"`,
        `"${c.study_year_label || `${c.current_study_year} Year`}"`,
        `"${c.class_name}"`,
        `"${c.cgpa}"`,
        `"${c.active_backlogs}"`,
        `"${c.tenth_percentage ?? ''}"`,
        `"${c.twelfth_percentage ?? ''}"`,
        `"${c.gender || ''}"`,
        `"${isEligible ? 'YES' : 'NO'}"`,
        `"${reasons.join('; ')}"`,
        `"${c.application_status || 'Not Applied'}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const companyName = (driveDetails?.company_name || 'Placement_Drive').replace(/\s+/g, '_');
    link.setAttribute('download', `${companyName}_Student_Candidates_${selectedBranch}_${selectedSection}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported candidate sheet to CSV/Excel format');
  };

  // ── Submit Selection to Backend ──
  const handleSubmitSelection = async () => {
    if (checkedIds.size === 0) {
      showToast('Please check at least one student before clicking Select.', false);
      return;
    }

    const confirmMsg = `Are you sure you want to mark ${checkedIds.size} checked student(s) as '${selectionStatus}' for ${driveDetails.company_name} (${driveDetails.job_role})?`;
    if (!window.confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      const payload = {
        student_ids: Array.from(checkedIds),
        status: selectionStatus,
      };

      const res = await fetch(`${API_BASE}/tpo/drives/${drive.id}/select-students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to select students');
      }

      const data = await res.json();
      showToast(data.message || `Successfully marked ${checkedIds.size} students as ${selectionStatus}!`, true);
      onSelectionComplete(checkedIds.size);
      
      // Refresh candidates list
      await loadCandidates();
      setCheckedIds(new Set());
    } catch (err: any) {
      showToast(err.message || 'Error selecting students.', false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(11, 25, 44, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: 18,
          width: '98%',
          maxWidth: 1380,
          height: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 70px -15px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          fontFamily: 'inherit',
        }}
      >
        {/* ── TOP TITLE & DRIVE INFO BAR ── */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #107C41 0%, #0F6334 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 124, 65, 0.3)',
              }}
            >
              <FileSpreadsheetIcon size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Select Students for Drive: {driveDetails.company_name}
                </h2>
                <span
                  style={{
                    background: 'rgba(16, 124, 65, 0.12)',
                    color: '#107C41',
                    border: '1px solid rgba(16, 124, 65, 0.3)',
                    padding: '2px 10px',
                    borderRadius: 20,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <FileSpreadsheetIcon size={12} /> Excel Grid View
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Role: <strong style={{ color: 'var(--text-primary)' }}>{driveDetails.job_role}</strong> • Package: <strong>{driveDetails.package || 'N/A'}</strong> • 
                Cutoffs: CGPA ≥ <strong>{driveDetails.min_cgpa ?? 0}</strong>, Backlogs ≤ <strong>{driveDetails.max_backlogs ?? 0}</strong>, Batch: <strong>{driveDetails.passout_year || 'Any'}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={loadCandidates}
              disabled={loading}
              title="Refresh student records"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <RefreshIcon size={14} /> Refresh
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* ── TOAST NOTIFICATION ── */}
        {toastMessage && (
          <div
            style={{
              padding: '10px 24px',
              background: toastMessage.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: toastMessage.ok ? '#10B981' : '#EF4444',
              borderBottom: `1px solid ${toastMessage.ok ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 800 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── RIBBON: 1. CHOOSE BRANCH, YEAR & SECTION ── */}
        <div
          style={{
            padding: '14px 24px',
            background: 'var(--card-bg)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {/* Branch / Department Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <BuildingIcon size={13} color="#3B82F6" /> 1. CHOOSE BRANCH (DEPARTMENT)
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setSelectedSection('ALL'); // Reset section on branch change
              }}
              style={{
                background: 'var(--bg-main)',
                border: '1.5px solid #3B82F6',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="ALL">🏢 All Branches (Entire College)</option>
              {branchOptions.map(branch => {
                const isAllowed = driveDetails.allowed_departments?.some((ad: string) =>
                  ad.toLowerCase() === branch.toLowerCase() || branch.toLowerCase().includes(ad.toLowerCase())
                );
                return (
                  <option key={branch} value={branch}>
                    {branch} {isAllowed ? '✓ (Eligible)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Year Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <GraduationCapIcon size={13} color="#10B981" /> 2. CHOOSE YEAR / BATCH
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{
                background: 'var(--bg-main)',
                border: '1.5px solid #10B981',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="ALL">🎓 All Years</option>
              {yearOptions.map(yr => (
                <option key={yr} value={yr}>
                  {yr} {driveDetails.passout_year && yr.includes(String(driveDetails.passout_year)) ? '⭐ (Drive Batch)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Section Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 170 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ClassIcon size={13} color="#8B5CF6" /> 3. CHOOSE SECTION
            </label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              style={{
                background: 'var(--bg-main)',
                border: '1.5px solid #8B5CF6',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="ALL">📚 All Sections</option>
              {sectionOptions.map(sec => (
                <option key={sec} value={sec}>
                  Section: {sec}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              QUICK SEARCH
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search by student name or roll no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '8px 12px 8px 34px',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-secondary)' }}>
                <SearchIcon size={16} />
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── RIBBON: 2. ELIGIBILITY CRITERIA FILTERS ── */}
        <div
          style={{
            padding: '12px 24px',
            background: 'var(--bg-main)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#3B82F6', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FilterIcon size={15} /> ELIGIBILITY FILTERS:
            </span>

            {/* Toggle: Show Only Eligible */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: filterOnlyEligible ? 'rgba(16, 185, 129, 0.12)' : 'var(--card-bg)',
                border: `1px solid ${filterOnlyEligible ? '#10B981' : 'var(--border-color)'}`,
                color: filterOnlyEligible ? '#10B981' : 'var(--text-secondary)',
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={filterOnlyEligible}
                onChange={(e) => setFilterOnlyEligible(e.target.checked)}
                style={{ accentColor: '#10B981', cursor: 'pointer' }}
              />
              ✓ Show Only Eligible Students
            </label>

            {/* Min CGPA */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600 }}>Min CGPA:</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={minCgpaFilter}
                onChange={(e) => setMinCgpaFilter(parseFloat(e.target.value) || 0)}
                style={{
                  width: 65,
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              />
            </div>

            {/* Max Backlogs */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600 }}>Max Backlogs:</span>
              <select
                value={maxBacklogsFilter}
                onChange={(e) => setMaxBacklogsFilter(parseInt(e.target.value) || 0)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                <option value={0}>0 Backlogs Only</option>
                <option value={1}>Up to 1 Backlog</option>
                <option value={2}>Up to 2 Backlogs</option>
                <option value={99}>Any Backlogs</option>
              </select>
            </div>

            {/* Min 10th % */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600 }}>10th % ≥</span>
              <input
                type="number"
                min="0"
                max="100"
                value={minTenthFilter}
                onChange={(e) => setMinTenthFilter(parseFloat(e.target.value) || 0)}
                style={{
                  width: 55,
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              />
            </div>

            {/* Min 12th % */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600 }}>12th % ≥</span>
              <input
                type="number"
                min="0"
                max="100"
                value={minTwelfthFilter}
                onChange={(e) => setMinTwelfthFilter(parseFloat(e.target.value) || 0)}
                style={{
                  width: 55,
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              />
            </div>

            {/* Gender */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600 }}>Gender:</span>
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                <option value="All">All</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleResetToDriveCriteria}
              style={{
                background: 'transparent',
                border: '1px dashed var(--border-color)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset to Drive Rules
            </button>
          </div>
        </div>

        {/* ── EXCEL ACTION BAR (QUICK SELECTION ACTIONS & COUNTERS) ── */}
        <div
          style={{
            padding: '10px 24px',
            background: 'var(--card-bg)',
            borderBottom: '2px solid rgba(16, 124, 65, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Showing: <span style={{ color: '#3B82F6' }}>{stats.filteredTotal}</span> of {stats.totalCandidates} students
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10B981' }}>
              • {stats.filteredEligibleTotal} Eligible
            </span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: checkedIds.size > 0 ? '#10B981' : 'var(--text-secondary)',
                background: checkedIds.size > 0 ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-main)',
                padding: '3px 10px',
                borderRadius: 12,
              }}
            >
              ☑ {checkedIds.size} Checked for Selection
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={checkAllEligible}
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#10B981',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <CheckIcon size={14} /> Check All Eligible
            </button>

            <button
              onClick={checkAllFiltered}
              style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Check All Filtered
            </button>

            <button
              onClick={clearAllChecks}
              style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Clear Checks
            </button>

            <button
              onClick={handleExportCsv}
              style={{
                background: 'linear-gradient(135deg, #107C41 0%, #0F6334 100%)',
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
                boxShadow: '0 2px 6px rgba(16, 124, 65, 0.25)',
              }}
            >
              <FileSpreadsheetIcon size={15} /> Export Sheet (.csv)
            </button>
          </div>
        </div>

        {/* ── EXCEL SPREADSHEET TABLE ── */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-main)' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: '3px solid rgba(59, 130, 246, 0.2)',
                  borderTopColor: '#3B82F6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Loading candidate students and computing real-time eligibility...</p>
            </div>
          ) : fetchError ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#EF4444' }}>
              <AlertIcon size={32} />
              <p style={{ fontWeight: 700, marginTop: 12 }}>{fetchError}</p>
              <button
                onClick={loadCandidates}
                style={{
                  marginTop: 12,
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  padding: '8px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                }}
              >
                Retry
              </button>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <FileSpreadsheetIcon size={40} color="#9CA3AF" />
              <p style={{ fontSize: '1rem', fontWeight: 700, margin: '14px 0 4px', color: 'var(--text-primary)' }}>
                No students match the current filters.
              </p>
              <p style={{ fontSize: '0.85rem', margin: 0 }}>
                Try relaxing the branch, section, or eligibility criteria cutoffs above.
              </p>
              <button
                onClick={handleResetToDriveCriteria}
                style={{
                  marginTop: 16,
                  background: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.84rem',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    background: '#107C41',
                    color: '#FFFFFF',
                    borderBottom: '2px solid #0D5A30',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}
                >
                  <th style={{ width: 40, padding: '10px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>
                    #
                  </th>
                  <th style={{ width: 44, padding: '10px 8px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' }}>
                    <input
                      type="checkbox"
                      checked={isAllFilteredChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = isPartiallyChecked;
                      }}
                      onChange={handleMasterCheckboxChange}
                      title="Select / Deselect All Filtered"
                      style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#10B981' }}
                    />
                  </th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Roll No</th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Student Name</th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Branch / Dept</th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Year & Section</th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>CGPA</th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Backlogs</th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>10th / 12th %</th>
                  <th style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Criteria Status</th>
                  <th style={{ padding: '10px 12px' }}>Drive Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((student, idx) => {
                  const isChecked = checkedIds.has(student.student_id);
                  const { isEligible, reasons } = evaluateStudentCustom(student);
                  const isSelectedInDrive = student.application_status === 'Selected';
                  const isAppliedInDrive = student.application_status === 'Applied';

                  return (
                    <tr
                      key={student.student_id}
                      onClick={() => toggleStudent(student.student_id)}
                      style={{
                        background: isChecked
                          ? 'rgba(16, 185, 129, 0.12)'
                          : idx % 2 === 0
                          ? 'var(--card-bg)'
                          : 'var(--bg-main)',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isChecked) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isChecked) {
                          e.currentTarget.style.background = idx % 2 === 0 ? 'var(--card-bg)' : 'var(--bg-main)';
                        }
                      }}
                    >
                      {/* Row index # */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          borderRight: '1px solid var(--border-color)',
                        }}
                      >
                        {idx + 1}
                      </td>

                      {/* Row Checkbox */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          borderRight: '1px solid var(--border-color)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleStudent(student.student_id)}
                          style={{
                            cursor: 'pointer',
                            width: 17,
                            height: 17,
                            accentColor: '#10B981',
                          }}
                        />
                      </td>

                      {/* Roll Number */}
                      <td
                        style={{
                          padding: '10px 12px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: 'var(--text-primary)',
                          borderRight: '1px solid var(--border-color)',
                        }}
                      >
                        {student.roll_number || 'N/A'}
                      </td>

                      {/* Student Name & Email */}
                      <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{student.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {student.email || student.mobile || ''}
                        </div>
                      </td>

                      {/* Branch / Dept */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', borderRight: '1px solid var(--border-color)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {student.department_name}
                        </span>
                      </td>

                      {/* Year & Section */}
                      <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {student.study_year_label || `${student.current_study_year} Year`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#8B5CF6', fontWeight: 600 }}>
                          Sec: {student.class_name}
                        </div>
                      </td>

                      {/* CGPA */}
                      <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)' }}>
                        <span
                          style={{
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: student.cgpa >= minCgpaFilter ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.12)',
                            color: student.cgpa >= minCgpaFilter ? '#10B981' : '#EF4444',
                          }}
                        >
                          {student.cgpa.toFixed(2)}
                        </span>
                      </td>

                      {/* Active Backlogs */}
                      <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: student.active_backlogs === 0 ? '#10B981' : '#EF4444',
                          }}
                        >
                          {student.active_backlogs === 0 ? '0 (Clean)' : `${student.active_backlogs} Active`}
                        </span>
                      </td>

                      {/* 10th / 12th % */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', borderRight: '1px solid var(--border-color)' }}>
                        <div>10th: <strong>{student.tenth_percentage ? `${student.tenth_percentage}%` : 'N/A'}</strong></div>
                        <div>12th: <strong>{student.twelfth_percentage ? `${student.twelfth_percentage}%` : 'N/A'}</strong></div>
                      </td>

                      {/* Eligibility Status */}
                      <td style={{ padding: '10px 12px', borderRight: '1px solid var(--border-color)' }}>
                        {isEligible ? (
                          <span
                            style={{
                              background: 'rgba(16, 185, 129, 0.18)',
                              color: '#10B981',
                              padding: '3px 10px',
                              borderRadius: 12,
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            ✓ Eligible
                          </span>
                        ) : (
                          <span
                            title={reasons.join('\n')}
                            style={{
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#EF4444',
                              padding: '3px 10px',
                              borderRadius: 12,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'inline-block',
                              maxWidth: 160,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              cursor: 'help',
                            }}
                          >
                            ✕ {reasons[0] || 'Ineligible'}
                          </span>
                        )}
                      </td>

                      {/* Drive Status */}
                      <td style={{ padding: '10px 12px' }}>
                        {isSelectedInDrive ? (
                          <span style={{ color: '#10B981', fontWeight: 800, fontSize: '0.78rem' }}>
                            ★ Selected
                          </span>
                        ) : isAppliedInDrive ? (
                          <span style={{ color: '#3B82F6', fontWeight: 700, fontSize: '0.78rem' }}>
                            Applied
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            Not Enrolled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── STICKY BOTTOM ACTION BAR: CLICK SELECT ── */}
        <div
          style={{
            padding: '16px 24px',
            background: 'var(--card-bg)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                fontSize: '0.95rem',
                fontWeight: 800,
                color: checkedIds.size > 0 ? '#10B981' : 'var(--text-secondary)',
              }}
            >
              {checkedIds.size} student(s) checked
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Selection Action:
              </span>
              <select
                value={selectionStatus}
                onChange={(e) => setSelectionStatus(e.target.value as any)}
                style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                }}
              >
                <option value="Selected">✓ Mark as Selected</option>
                <option value="Shortlisted">★ Mark as Shortlisted</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '10px 20px',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmitSelection}
              disabled={submitting || checkedIds.size === 0}
              style={{
                background: checkedIds.size > 0
                  ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                  : 'var(--border-color)',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 26px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: '0.92rem',
                cursor: checkedIds.size > 0 && !submitting ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: checkedIds.size > 0 ? '0 4px 14px rgba(16, 185, 129, 0.4)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <CheckIcon size={18} />
              {submitting
                ? 'Processing...'
                : `Select ${checkedIds.size > 0 ? checkedIds.size : ''} Students for Drive`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
