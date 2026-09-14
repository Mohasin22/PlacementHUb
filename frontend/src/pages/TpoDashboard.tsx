import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { BulkStudentUpload } from '../components/BulkStudentUpload';
import { TpoStudentHierarchyView } from '../components/TpoStudentHierarchyView';
import {
  AnalyticsIcon,
  CalendarIcon,
  UsersIcon,
  UploadIcon,
  PlusIcon,
  CheckIcon,
  AlertIcon,
  StarIcon,
  AwardIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  FileSpreadsheetIcon,
  BuildingIcon,
  CloseIcon,
  PhoneIcon,
} from '../components/Icons';

const API = 'http://localhost:8000/api';

interface TpoDashboardProps {
  token: string;
  institutionId: string;
  userId?: string;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

type Tab = 'drives' | 'analytics' | 'events' | 'create' | 'applicants' | 'export' | 'upload' | 'faculty' | 'students';

const STATUS_OPTS = ['Applied', 'Shortlisted', 'On-Hold', 'Rejected', 'Placed'];
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Applied: { bg: 'rgba(59,130,246,0.15)', color: '#60A5FA' },
  Shortlisted: { bg: 'rgba(245,158,11,0.15)', color: '#FBBF24' },
  Placed: { bg: 'rgba(16,185,129,0.15)', color: '#34D399' },
  Rejected: { bg: 'rgba(239,68,68,0.12)', color: '#F87171' },
  'On-Hold': { bg: 'rgba(156,163,175,0.1)', color: '#6B7280' },
};
const ALL_EXPORT_FIELDS = [
  'Student ID / Roll Number', 'Full Name', 'Institutional Email', 'Personal Email', 'Mobile Number',
  'Program', 'Department', 'Class / Section', 'Year of Passing',
  '10th Percentage', '12th / Diploma Percentage', 'UG CGPA', 'UG Percentage',
  'Current Backlogs', 'Skills', 'Projects', 'Internships', 'Certifications',
  'LinkedIn', 'GitHub', 'Portfolio', 'Resume URL', 'Application Status'
];

const EMPTY_FORM = {
  companyName: '', jobRole: '', package: '', location: '', mode: 'On-campus',
  minCgpa: 6.0, maxBacklogs: 0, genderFilter: 'All',
  passoutYear: new Date().getFullYear(), externalLink: '', deadline: '',
  allowedDepts: [] as string[], allowedProgs: [] as string[],
};

export const TpoDashboard: React.FC<TpoDashboardProps> = ({ token, institutionId, activeTab, setActiveTab }) => {
  const [tab, setTabState] = useState<Tab>('drives');
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [driveFilter, setDriveFilter] = useState<'active' | 'closed'>('active');

  const setTab = (t: Tab) => {
    setTabState(t);
    if (setActiveTab) setActiveTab(t);
  };

  useEffect(() => {
    if (activeTab === 'create') {
      setTabState('drives');
      setIsDriveModalOpen(true);
      if (setActiveTab) setActiveTab('drives');
    } else if (activeTab === 'upload') {
      setTabState('students');
      setShowBulkUpload(true);
      if (setActiveTab) setActiveTab('students');
    } else if (activeTab && activeTab !== tab) {
      setTabState(activeTab as Tab);
    }
  }, [activeTab]);

  const [drives, setDrives] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<any | null>(null);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [appsLoading, setAppsLoading] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingDriveId, setEditingDriveId] = useState<string | null>(null);
  const [facultyForm, setFacultyForm] = useState({ name: '', email: '', password: '', phone: '', class_id: '' });
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [facultyLoading, setFacultyLoading] = useState(false);
  const [facultySearch, setFacultySearch] = useState('');
  const [isFacultyModalOpen, setIsFacultyModalOpen] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [exportDriveId, setExportDriveId] = useState('');
  const [exportStatus, setExportStatus] = useState('Shortlisted');
  const [exportFields, setExportFields] = useState<string[]>(['Name', 'Roll Number', 'Institute Email', 'CGPA', 'Mobile', 'Skills', 'Resume Link', 'Status']);
  const [_tpoProgramName, setTpoProgramName] = useState<string>('');
  const [facultyDeptId, setFacultyDeptId] = useState<string>('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── HR Analytics State ───────────────────────────────────────────────────
  const [hrExcelFile, setHrExcelFile] = useState<File | null>(null);
  const [analyticsTitle, setAnalyticsTitle] = useState('');
  const [analyticsType, setAnalyticsType] = useState('Placement Drive');
  const [analyticsReport, setAnalyticsReport] = useState<any | null>(null);
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Seminar Events State ──────────────────────────────────────────────────
  const [eventForm, setEventForm] = useState({
    title: '', speaker: '', dateTime: '', venue: '', description: '', targetType: 'All', targetId: ''
  });
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  };

  const loadDrives = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/tpo/drives`, { headers: h });
      if (res.ok) setDrives(await res.json());
    } finally { setLoading(false); }
  }, [token]);

  const loadHierarchy = useCallback(async () => {
    try {
      const res = await fetch(`${API}/tpo/hierarchy`, { headers: h });
      if (res.ok) {
        const data = await res.json();
        setHierarchy(data.hierarchy || []);
        setTpoProgramName(data.program_name || '');
      } else {
        const fallbackRes = await fetch(`${API}/institutions/${institutionId}/hierarchy`);
        if (fallbackRes.ok) setHierarchy((await fallbackRes.json()).hierarchy || []);
      }
    } catch (e) { }
  }, [institutionId, token]);

  const loadFaculty = useCallback(async () => {
    setFacultyLoading(true);
    try {
      const res = await fetch(`${API}/tpo/faculty`, { headers: h });
      if (res.ok) setFacultyList(await res.json());
    } catch (e) { } finally { setFacultyLoading(false); }
  }, [token]);

  const loadAnalyticsReports = useCallback(async () => {
    try {
      const res = await fetch(`${API}/tpo/analytics/reports`, { headers: h });
      if (res.ok) setSavedReports(await res.json());
    } catch (e) { }
  }, [token]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/tpo/events`, { headers: h });
      if (res.ok) setEventsList(await res.json());
    } catch (e) { }
  }, [token]);

  useEffect(() => {
    loadDrives();
    loadHierarchy();
    loadAnalyticsReports();
    loadEvents();
  }, [loadDrives, loadHierarchy, loadAnalyticsReports, loadEvents]);

  useEffect(() => { if (tab === 'faculty') loadFaculty(); }, [tab, loadFaculty]);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const res = await fetch(`${API}/tpo/students`, { headers: h });
      if (res.ok) setStudents(await res.json());
    } finally { setStudentsLoading(false); }
  }, [token]);

  useEffect(() => { if (tab === 'students') loadStudents(); }, [tab, loadStudents]);


  const loadApplicants = async (driveId: string) => {
    setAppsLoading(true);
    setSelected([]);
    try {
      const res = await fetch(`${API}/tpo/drives/${driveId}/applications`, { headers: h });
      if (res.ok) setApplicants(await res.json());
    } finally { setAppsLoading(false); }
  };

  const openApplicants = (drive: any) => {
    setSelectedDrive(drive);
    setTab('applicants');
    loadApplicants(drive.id);
  };

  const updateStatus = async (appId: string, status: string) => {
    const res = await fetch(`${API}/tpo/applications/${appId}/status`, {
      method: 'POST', headers: h, body: JSON.stringify({ status }),
    });
    if (res.ok) { flash(`Status updated to ${status}`); loadApplicants(selectedDrive.id); }
    else flash('Update failed.', false);
  };

  const bulkUpdate = async (status: string) => {
    if (!selected.length) return;
    const res = await fetch(`${API}/tpo/drives/${selectedDrive.id}/bulk-status`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ application_ids: selected, status }),
    });
    if (res.ok) {
      flash(`Updated ${selected.length} application(s) → ${status}`);
      loadApplicants(selectedDrive.id);
      setSelected([]);
    } else flash('Bulk update failed.', false);
  };

  const createDrive = async () => {
    if (!form.companyName || !form.jobRole || !form.deadline) {
      flash('Company name, job role and deadline are required.', false); return;
    }
    const body = {
      company_name: form.companyName, job_role: form.jobRole, package: form.package,
      location: form.location, mode: form.mode, min_cgpa: form.minCgpa,
      max_backlogs: form.maxBacklogs, gender_filter: form.genderFilter,
      passout_year: form.passoutYear,
      external_apply_link: form.externalLink || null,
      drive_deadline: new Date(form.deadline).toISOString(),
      allowed_departments: form.allowedDepts, allowed_programs: form.allowedProgs,
    };
    const isEdit = !!editingDriveId;
    const url = isEdit ? `${API}/drives/${editingDriveId}` : `${API}/drives/create`;
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: h, body: JSON.stringify(body) });
    if (res.ok) {
      const d = await res.json();
      flash(isEdit ? `Drive updated successfully!` : `Drive published! ${d.eligible_students_notified || 0} student(s) notified.`);
      setForm({ ...EMPTY_FORM });
      setEditingDriveId(null);
      setIsDriveModalOpen(false);
      setTab('drives');
      loadDrives();
    } else {
      const d = await res.json();
      flash(d.detail || (isEdit ? 'Failed to update drive.' : 'Failed to create drive.'), false);
    }
  };

  const startEdit = (drive: any) => {
    setForm({
      companyName: drive.company_name,
      jobRole: drive.job_role,
      package: drive.package,
      location: drive.location,
      mode: drive.mode,
      minCgpa: drive.min_cgpa,
      maxBacklogs: drive.max_backlogs,
      genderFilter: drive.gender_filter || 'All',
      passoutYear: drive.passout_year || new Date().getFullYear(),
      externalLink: drive.external_apply_link || '',
      deadline: new Date(drive.drive_deadline).toISOString().slice(0, 16),
      allowedDepts: drive.allowed_departments || [],
      allowedProgs: drive.allowed_programs || [],
    });
    setEditingDriveId(drive.id);
    setIsDriveModalOpen(true);
  };

  const deleteDrive = async (driveId: string) => {
    if (!window.confirm("Are you sure you want to delete this drive? All related applications will be deleted permanently.")) return;
    const res = await fetch(`${API}/drives/${driveId}`, { method: 'DELETE', headers: h });
    if (res.ok) { flash('Drive deleted successfully!'); loadDrives(); }
    else flash('Failed to delete drive.', false);
  };

  const tpoSelectedClasses = (() => {
    if (!facultyDeptId) return [];
    for (const p of hierarchy) {
      for (const d of p.departments || []) {
        if (d.id === facultyDeptId) {
          return d.classes || [];
        }
      }
    }
    return [];
  })();

  const getClassInfo = (classId?: string) => {
    if (!classId) return 'Assigned Class';
    for (const prog of hierarchy) {
      for (const dept of prog.departments || []) {
        for (const cls of dept.classes || []) {
          if (cls.id === classId) {
            return `${dept.name} (${cls.name})`;
          }
        }
      }
    }
    return 'Assigned Class';
  };

  const createFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/faculty/register`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(facultyForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to appoint Faculty Coordinator');
      flash(`Faculty Coordinator appointed successfully! They can now login.`);
      setFacultyForm({ name: '', email: '', password: '', phone: '', class_id: '' });
      setFacultyDeptId('');
      setIsFacultyModalOpen(false);
      loadFaculty();
    } catch (err: any) {
      flash(err.message, false);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateFaculty = async (userId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to deactivate Faculty Coordinator "${name}"?`)) return;
    try {
      const res = await fetch(`${API}/tpo/faculty/${userId}`, { method: 'DELETE', headers: h });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to deactivate faculty');
      flash(`Faculty Coordinator "${name}" deactivated.`);
      loadFaculty();
    } catch (err: any) {
      flash(err.message, false);
    }
  };


  // ── Analytics Upload Handler ──────────────────────────────────────────────
  const handleHrExcelUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrExcelFile) { flash('Please select an Excel or CSV file.', false); return; }
    setAnalyticsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', hrExcelFile);
      if (analyticsTitle) formData.append('title', analyticsTitle);
      formData.append('program_type', analyticsType);

      const res = await fetch(`${API}/tpo/analytics/upload-excel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to analyze HR Excel file');
      setAnalyticsReport(data);
      flash(`Analyzed ${data.total_evaluated} student records successfully!`);
      loadAnalyticsReports();
    } catch (err: any) {
      flash(err.message, false);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // ── Seminar Event Handler ─────────────────────────────────────────────────
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title || !eventForm.speaker || !eventForm.dateTime || !eventForm.venue) {
      flash('Title, Speaker, Date/Time, and Venue are required.', false);
      return;
    }
    setEventsLoading(true);
    try {
      const res = await fetch(`${API}/tpo/events/create`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          title: eventForm.title,
          speaker: eventForm.speaker,
          date_time: eventForm.dateTime,
          venue: eventForm.venue,
          description: eventForm.description,
          target_type: eventForm.targetType,
          target_id: eventForm.targetId || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to schedule seminar');
      flash(data.message);
      setEventForm({ title: '', speaker: '', dateTime: '', venue: '', description: '', targetType: 'All', targetId: '' });
      loadEvents();
    } catch (err: any) {
      flash(err.message, false);
    } finally {
      setEventsLoading(false);
    }
  };

  const exportExcel = async () => {
    if (!exportDriveId) { flash('Select a drive.', false); return; }
    const res = await fetch(`${API}/tpo/drives/${exportDriveId}/export`, {
      method: 'POST', headers: h, body: JSON.stringify({ fields: exportFields, status_filter: exportStatus || null }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const drive = drives.find(d => d.id === exportDriveId);
      a.download = drive ? `${drive.company_name}_HR_Report.xlsx` : 'PlacementHub_Export.xlsx';
      a.click(); URL.revokeObjectURL(url);
      flash('Excel report downloaded!');
    } else flash('Export failed.', false);
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll = () =>
    setSelected(applicants.length === selected.length ? [] : applicants.map(a => a.application_id));

  const allDepts = hierarchy.flatMap((p: any) => p.departments);

  const toggleArr = (key: 'allowedDepts' | 'allowedProgs', id: string) =>
    setForm(f => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x: string) => x !== id) : [...f[key], id],
    }));

  return (
    <div style={s.wrap}>
      {msg && (
        <div style={msg.ok ? s.toastOk : s.toastErr}>
          {msg.ok ? <CheckIcon size={18} /> : <AlertIcon size={18} />} {msg.text}
        </div>
      )}

      {/* ── DRIVES LIST (MATCHING IMAGE 1) ── */}
      {tab === 'drives' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Bar matching Image 1 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Recruitment Drives
                </h2>
                <span
                  style={{
                    background: 'rgba(99,102,241,0.12)',
                    color: '#4F46E5',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  Tpo
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
                Browse active and past recruitment drives.
              </p>
            </div>

            <button
              onClick={() => {
                setForm({ ...EMPTY_FORM });
                setEditingDriveId(null);
                setIsDriveModalOpen(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#0B192C',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(11,25,44,0.15)',
              }}
            >
              <PlusIcon size={16} color="#FFF" /> New drive
            </button>
          </div>

          {/* Segmented Filter Pills matching Image 1 */}
          <div
            style={{
              display: 'inline-flex',
              gap: 4,
              background: 'var(--bg-main)',
              padding: 4,
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              width: 'fit-content',
            }}
          >
            <button
              onClick={() => setDriveFilter('active')}
              style={{
                padding: '6px 18px',
                borderRadius: 7,
                border: 'none',
                background: driveFilter === 'active' ? 'var(--card-bg)' : 'transparent',
                color: driveFilter === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: driveFilter === 'active' ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: driveFilter === 'active' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Active drives
            </button>
            <button
              onClick={() => setDriveFilter('closed')}
              style={{
                padding: '6px 18px',
                borderRadius: 7,
                border: 'none',
                background: driveFilter === 'closed' ? 'var(--card-bg)' : 'transparent',
                color: driveFilter === 'closed' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: driveFilter === 'closed' ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: driveFilter === 'closed' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Closed
            </button>
          </div>

          {loading ? (
            <Loader color="#3B82F6" />
          ) : drives.filter(d => (driveFilter === 'active' ? d.is_active : !d.is_active)).length === 0 ? null : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 20 }}>
              {drives
                .filter(d => (driveFilter === 'active' ? d.is_active : !d.is_active))
                .map(d => {
                  const initials = d.company_name
                    ? d.company_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                    : 'CO';
                  const isOpen = d.is_active;

                  return (
                    <div
                      key={d.id}
                      style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 16,
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 14,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div>
                        {/* Top Row: Square initials box, Company Name, Job Role, open/closed badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              background: '#0B192C',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '1.05rem',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 800,
                                fontSize: '1.05rem',
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {d.company_name}
                            </div>
                            <div
                              style={{
                                fontSize: '0.84rem',
                                color: 'var(--text-secondary)',
                                marginTop: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {d.job_role}
                            </div>
                          </div>

                          <span
                            style={{
                              border: isOpen ? '1px solid #22C55E' : '1px solid #9CA3AF',
                              color: isOpen ? '#16A34A' : '#6B7280',
                              background: isOpen ? 'rgba(34,197,94,0.06)' : 'rgba(156,163,175,0.06)',
                              padding: '2px 10px',
                              borderRadius: 12,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {isOpen ? 'open' : 'closed'}
                          </span>
                        </div>

                        {/* Mid Info Grid matching Image 1 (No Emojis) */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 10,
                            fontSize: '0.84rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹</span>
                            <span>{d.package || 'N/A'}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>CGPA =</span>
                            <span>{d.min_cgpa ?? 0}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>Depts:</span>
                            <span>{d.allowed_departments?.length || 1}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>Deadline:</span>
                            <span>
                              {d.drive_deadline
                                ? new Date(d.drive_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                                : 'None'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Footer & Manage Button matching attached image */}
                      <div>
                        <div style={{ borderTop: '1px solid var(--border-color)', margin: '0 0 14px 0' }} />

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            {d.allowed_departments?.length || 1} eligible dept(s)
                          </span>

                          <button
                            onClick={() => openApplicants(d)}
                            style={{
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              padding: '6px 18px',
                              borderRadius: 8,
                              fontWeight: 600,
                              fontSize: '0.84rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Manage
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── HR ANALYTICS & ASSESSMENT INSIGHTS TAB ── */}
      {tab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header Card / Upload Box */}
          <div style={s.formCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>
                <AnalyticsIcon size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>HR Performance & Training Analytics</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Upload HR assessment Excel sheets to instantly identify top performers, struggling students, skill gaps, and actionable feedback.
                </p>
              </div>
            </div>

            <form onSubmit={handleHrExcelUpload} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'end' }}>
              <label style={s.label}>
                Assessment / Drive Title
                <input style={s.input} placeholder="e.g. TCS CodeVita Round 1 Assessment" value={analyticsTitle} onChange={e => setAnalyticsTitle(e.target.value)} />
              </label>

              <label style={s.label}>
                Program Category
                <select style={s.input} value={analyticsType} onChange={e => setAnalyticsType(e.target.value)}>
                  <option value="Placement Drive">Placement Drive Assessment</option>
                  <option value="Training Program">Training Program Evaluation</option>
                  <option value="Mock Interview">Mock Interview Feedback</option>
                  <option value="Aptitude Test">Aptitude Test Results</option>
                </select>
              </label>

              <label style={s.label}>
                Select HR Excel File (.xlsx, .csv)
                <input required type="file" accept=".xlsx, .xls, .csv" onChange={e => setHrExcelFile(e.target.files?.[0] || null)} style={{ ...s.input, padding: '8px 12px' }} />
              </label>

              <button type="submit" style={{ ...s.primaryBtn, height: 44 }} disabled={analyticsLoading}>
                <UploadIcon size={18} /> {analyticsLoading ? 'Analyzing File...' : 'Analyze HR Excel'}
              </button>
            </form>

            {/* Saved Reports History List */}
            {savedReports.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Previous Analyzed Reports ({savedReports.length})</h4>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {savedReports.map(rep => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => setAnalyticsReport({
                        total_evaluated: rep.total_evaluated,
                        average_score: rep.average_score,
                        pass_rate_percent: rep.pass_rate_percent,
                        top_performers: rep.students ? rep.students.filter((s: any) => ['Top Performer', 'Good'].includes(s.performance_status)) : [],
                        needing_improvement: rep.students ? rep.students.filter((s: any) => ['Needs Improvement', 'At Risk'].includes(s.performance_status)) : []
                      })}
                      style={{
                        background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 10,
                        padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer'
                      }}
                    >
                      {rep.title} ({rep.total_evaluated} Students)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Current Report Summary View */}
          {analyticsReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div style={{ ...s.statBox, padding: 20, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                  <UsersIcon size={24} color="#3B82F6" />
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>{analyticsReport.total_evaluated}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Evaluated Students</span>
                </div>
                <div style={{ ...s.statBox, padding: 20, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                  <TrendingUpIcon size={24} color="#10B981" />
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10B981', marginTop: 8 }}>{analyticsReport.average_score}%</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Average Score</span>
                </div>
                <div style={{ ...s.statBox, padding: 20, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                  <StarIcon size={24} color="#F59E0B" />
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#F59E0B', marginTop: 8 }}>{analyticsReport.top_performers ? analyticsReport.top_performers.length : 0}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Top Performers</span>
                </div>
                <div style={{ ...s.statBox, padding: 20, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                  <TrendingDownIcon size={24} color="#EF4444" />
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#EF4444', marginTop: 8 }}>{analyticsReport.needing_improvement ? analyticsReport.needing_improvement.length : 0}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Needing Attention</span>
                </div>
              </div>

              {/* Top Performers Leaderboard */}
              {analyticsReport.top_performers && analyticsReport.top_performers.length > 0 && (
                <div style={s.formCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <AwardIcon size={22} color="#F59E0B" />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Top Performers Spotlight</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                    {analyticsReport.top_performers.map((st: any, idx: number) => (
                      <div key={idx} style={{ background: 'var(--bg-main)', border: '1px solid rgba(245,158,11,0.2)', padding: 14, borderRadius: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{st.name}</span>
                          <span style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', padding: '2px 8px', borderRadius: 6, fontWeight: 800, fontSize: '0.85rem' }}>
                            {st.overall_score}%
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Roll: {st.roll_number || 'N/A'}</div>
                        <div style={{ fontSize: '0.82rem', color: '#10B981', marginTop: 8, fontWeight: 600 }}>Strengths: {st.strengths}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>HR Remark: "{st.hr_remarks}"</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Students Needing Improvement Section */}
              {analyticsReport.needing_improvement && analyticsReport.needing_improvement.length > 0 && (
                <div style={{ ...s.formCard, border: '1px solid rgba(239,68,68,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertIcon size={22} color="#EF4444" />
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Action Required: Students Lacking / Needing Mentorship</h3>
                    </div>
                    <span style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', padding: '4px 12px', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem' }}>
                      {analyticsReport.needing_improvement.length} Students
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Student Name</th>
                          <th style={s.th}>Roll No</th>
                          <th style={s.th}>Score</th>
                          <th style={s.th}>Status</th>
                          <th style={s.th}>Lacking / Weak Areas</th>
                          <th style={s.th}>HR Remarks & Action Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsReport.needing_improvement.map((st: any, idx: number) => (
                          <tr key={idx}>
                            <td style={{ ...s.td, fontWeight: 700 }}>{st.name}</td>
                            <td style={s.td}>{st.roll_number || 'N/A'}</td>
                            <td style={{ ...s.td, fontWeight: 800, color: st.overall_score < 45 ? '#EF4444' : '#F59E0B' }}>{st.overall_score}%</td>
                            <td style={s.td}>
                              <span style={{ ...s.pill, background: st.performance_status === 'At Risk' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: st.performance_status === 'At Risk' ? '#EF4444' : '#F59E0B' }}>
                                {st.performance_status}
                              </span>
                            </td>
                            <td style={{ ...s.td, color: '#EF4444', fontWeight: 600 }}>{st.lacking_areas}</td>
                            <td style={{ ...s.td, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{st.hr_remarks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SEMINAR / EVENT SCHEDULING TAB ── */}
      {tab === 'events' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Create Event Card */}
          <div style={s.formCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <CalendarIcon size={24} color="#3B82F6" />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Schedule Seminar or Training Event</h3>
            </div>

            <form onSubmit={handleCreateEvent}>
              <div style={s.formGrid}>
                <label style={s.label}>
                  Seminar / Workshop Title *
                  <input required style={s.input} placeholder="e.g. Masterclass on AI Engineering & Interview Prep" value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} />
                </label>

                <label style={s.label}>
                  Speaker / Conducted By *
                  <input required style={s.input} placeholder="e.g. Dr. Rajesh Sharma, Lead Architect at Microsoft" value={eventForm.speaker} onChange={e => setEventForm({ ...eventForm, speaker: e.target.value })} />
                </label>

                <label style={s.label}>
                  Date & Time *
                  <input required type="datetime-local" style={s.input} value={eventForm.dateTime} onChange={e => setEventForm({ ...eventForm, dateTime: e.target.value })} />
                </label>

                <label style={s.label}>
                  Venue / Online Link *
                  <input required style={s.input} placeholder="e.g. Main Auditorium / Zoom Link: https://zoom.us/j/..." value={eventForm.venue} onChange={e => setEventForm({ ...eventForm, venue: e.target.value })} />
                </label>

                <label style={{ ...s.label, gridColumn: 'span 2' }}>
                  Target Audience / Batch Notification *
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <select style={s.input} value={eventForm.targetType} onChange={e => setEventForm({ ...eventForm, targetType: e.target.value, targetId: '' })}>
                      <option value="All">All Students in Institution</option>
                      <option value="Program">Specific Program</option>
                      <option value="Department">Specific Department</option>
                      <option value="Class">Specific Class / Section</option>
                    </select>

                    {eventForm.targetType !== 'All' && (
                      <select style={s.input} value={eventForm.targetId} onChange={e => setEventForm({ ...eventForm, targetId: e.target.value })}>
                        <option value="">-- Select Target Batch --</option>
                        {eventForm.targetType === 'Program' && hierarchy.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        {eventForm.targetType === 'Department' && allDepts.map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                        {eventForm.targetType === 'Class' && allDepts.flatMap((d: any) => d.classes).map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>

                <label style={{ ...s.label, gridColumn: 'span 2' }}>
                  Agenda & Description
                  <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} placeholder="Provide seminar topics, prerequisites, and session goals..." value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} />
                </label>
              </div>

              <button type="submit" style={{ ...s.primaryBtn, width: '100%', marginTop: 16 }} disabled={eventsLoading}>
                <CalendarIcon size={18} /> {eventsLoading ? 'Scheduling...' : 'Publish Seminar & Notify Target Batch'}
              </button>
            </form>
          </div>

          {/* List of Scheduled Events */}
          <div style={s.formCard}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Scheduled Seminars & Events</h3>
            {eventsList.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No seminars scheduled yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                {eventsList.map(ev => (
                  <div key={ev.id} style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{ev.title}</span>
                      <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                        Target: {ev.target_type}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#10B981', fontWeight: 600, marginTop: 6 }}>Speaker: {ev.speaker}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Venue: {ev.venue}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>Scheduled: {new Date(ev.date_time).toLocaleString()}</div>
                    {ev.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginTop: 8 }}>{ev.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}



      {/* ── APPLICANTS VIEW TAB ── */}
      {tab === 'applicants' && (
        appsLoading ? <Loader color="#3B82F6" /> :
          !selectedDrive ? (
            <div style={s.empty}>
              <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>Select a placement drive to view its applicants.</p>
              <button onClick={() => setTab('drives')} style={{ ...s.primaryBtn, margin: '16px auto 0' }}>
                ← View Placement Drives
              </button>
            </div>
          ) : (
            <div style={s.formCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => setTab('drives')} style={s.ghostBtn}>
                    ← Back to Drives
                  </button>
                  <button onClick={() => startEdit(selectedDrive)} style={{ ...s.ghostBtn, background: 'var(--bg-main)' }}>
                    Edit Drive
                  </button>
                  <button onClick={() => { deleteDrive(selectedDrive.id); setTab('drives'); }} style={{ ...s.ghostBtn, color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}>
                    Delete Drive
                  </button>
                  <div>
                    <h3 style={s.formTitle}>{selectedDrive.company_name} — Applicants ({applicants.length})</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '2px 0 0' }}>{selectedDrive.job_role} • {selectedDrive.package}</p>
                  </div>
                </div>

                {/* Bulk actions */}
                {selected.length > 0 && (
                  <div style={s.bulkRow}>
                    <span style={{ fontSize: '0.85rem', color: '#60A5FA', fontWeight: 600 }}>{selected.length} selected</span>
                    {STATUS_OPTS.map(st => (
                      <button key={st} onClick={() => bulkUpdate(st)} style={s.bulkBtn}>{st}</button>
                    ))}
                  </div>
                )}
              </div>

              {applicants.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', padding: '24px 0' }}>No students have applied yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}><input type="checkbox" checked={selected.length === applicants.length} onChange={selectAll} /></th>
                        <th style={s.th}>Student Name</th>
                        <th style={s.th}>Roll No</th>
                        <th style={s.th}>CGPA</th>
                        <th style={s.th}>Mobile</th>
                        <th style={s.th}>Resume</th>
                        <th style={s.th}>Applied Date</th>
                        <th style={s.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicants.map(a => {
                        const stStyle = STATUS_STYLES[a.status] || STATUS_STYLES['Applied'];
                        return (
                          <tr key={a.application_id} style={{ background: selected.includes(a.application_id) ? 'rgba(59,130,246,0.06)' : 'transparent' }}>
                            <td style={s.td}><input type="checkbox" checked={selected.includes(a.application_id)} onChange={() => toggleSelect(a.application_id)} /></td>
                            <td style={{ ...s.td, fontWeight: 700, color: 'var(--text-primary)' }}>{a.name}</td>
                            <td style={s.td}>{a.roll_number}</td>
                            <td style={{ ...s.td, color: '#34D399', fontWeight: 700 }}>{a.cgpa}</td>
                            <td style={s.td}>{a.mobile}</td>
                            <td style={s.td}>
                              {a.resume_url ? <a href={a.resume_url} target="_blank" rel="noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline' }}>View Resume</a> : 'N/A'}
                            </td>
                            <td style={s.td}>{new Date(a.applied_at).toLocaleDateString()}</td>
                            <td style={s.td}>
                              <select value={a.status} onChange={e => updateStatus(a.application_id, e.target.value)}
                                style={{ ...s.selectPill, background: stStyle.bg, color: stStyle.color }}>
                                {STATUS_OPTS.map(opt => <option key={opt} value={opt} style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }}>{opt}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
      )}

      {/* ── EXPORT HR REPORT TAB ── */}
      {tab === 'export' && (
        <div style={s.formCard}>
          <h3 style={s.formTitle}>Export Recruitment Data to Excel</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16 }}>
            <label style={s.label}>
              Select Placement Drive *
              <select style={s.input} value={exportDriveId} onChange={e => setExportDriveId(e.target.value)}>
                <option value="">-- Choose Drive --</option>
                {drives.map(d => (
                  <option key={d.id} value={d.id}>{d.company_name} — {d.job_role}</option>
                ))}
              </select>
            </label>

            <label style={s.label}>
              Filter Status
              <select style={s.input} value={exportStatus} onChange={e => setExportStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {STATUS_OPTS.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 24 }}>
            <label style={s.sectionHeader}>Select Columns to Export</label>
            <div style={s.chipRow}>
              {ALL_EXPORT_FIELDS.map(f => (
                <button key={f} type="button" onClick={() => setExportFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                  style={{ ...s.chip, ...(exportFields.includes(f) ? s.chipSelected : {}), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {exportFields.includes(f) ? <CheckIcon size={13} color="#3B82F6" /> : <PlusIcon size={13} color="currentColor" />}
                  <span>{f}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={exportExcel} style={{ ...s.primaryBtn, width: '100%', marginTop: 28 }}>
            <FileSpreadsheetIcon size={18} /> Generate & Download Excel
          </button>
        </div>
      )}

      {/* ── FACULTY COORDINATORS TAB ── */}
      {tab === 'faculty' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={s.formCard}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Faculty Coordinators
                  </h2>
                  <span
                    style={{
                      background: 'rgba(99,102,241,0.12)',
                      color: '#4F46E5',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    Tpo
                  </span>
                  {_tpoProgramName && (
                    <span
                      style={{
                        background: 'rgba(16,185,129,0.12)',
                        color: '#059669',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {_tpoProgramName}
                    </span>
                  )}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
                  {facultyList.length} faculty coordinator(s) appointed for {_tpoProgramName || 'your program'}
                </p>
              </div>

              <button
                onClick={() => {
                  setFacultyForm({ name: '', email: '', password: '', phone: '', class_id: '' });
                  setFacultyDeptId('');
                  setIsFacultyModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#0B192C',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(11,25,44,0.15)',
                }}
              >
                <PlusIcon size={16} color="#FFF" /> Appoint
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: 20 }}>
              <input
                style={{
                  ...s.input,
                  width: '100%',
                  borderRadius: 10,
                  border: '1px solid var(--border-color)',
                }}
                placeholder="Search faculty by name or email..."
                value={facultySearch}
                onChange={e => setFacultySearch(e.target.value)}
              />
            </div>

            {/* Faculty List Grid */}
            {facultyLoading ? (
              <Loader color="#3B82F6" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {facultyList
                  .filter(f =>
                    !facultySearch ||
                    f.name?.toLowerCase().includes(facultySearch.toLowerCase()) ||
                    f.email?.toLowerCase().includes(facultySearch.toLowerCase())
                  )
                  .map(f => {
                    const initials = f.name
                      ? f.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                      : 'FC';
                    const classLabel = getClassInfo(f.class_id);

                    return (
                      <div
                        key={f.id}
                        style={{
                          background: 'var(--bg-main)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 14,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: '50%',
                              background: '#059669',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '1rem',
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.name}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                              {f.email}
                            </div>
                            {f.phone && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <PhoneIcon size={12} color="var(--text-secondary)" />
                                <span>{f.phone}</span>
                              </div>
                            )}
                            <span
                              style={{
                                display: 'inline-block',
                                background: 'rgba(16,185,129,0.12)',
                                color: '#059669',
                                padding: '2px 8px',
                                borderRadius: 10,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                marginTop: 6,
                              }}
                            >
                              Faculty Coordinator
                            </span>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Class: <strong style={{ color: 'var(--text-primary)' }}>{classLabel}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeactivateFaculty(f.id, f.name)}
                            style={{
                              background: 'rgba(239,68,68,0.08)',
                              border: 'none',
                              color: '#DC2626',
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {!facultyLoading && facultyList.length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
                <BuildingIcon size={36} color="var(--text-secondary)" />
                <p style={{ margin: '12px 0 16px 0', fontSize: '0.92rem', fontWeight: 600 }}>
                  No Faculty Coordinators appointed for {_tpoProgramName || 'this program'} yet.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFacultyForm({ name: '', email: '', password: '', phone: '', class_id: '' });
                    setFacultyDeptId('');
                    setIsFacultyModalOpen(true);
                  }}
                  style={{ ...s.primaryBtn, margin: '0 auto' }}
                >
                  <PlusIcon size={16} /> Appoint Faculty Coordinator
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── APPOINT FACULTY MODAL POPUP (PORTAL) ── */}
      {isFacultyModalOpen && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(11, 25, 44, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 24,
            boxSizing: 'border-box',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsFacultyModalOpen(false);
            }
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden',
              margin: 'auto',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px 24px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--card-bg)',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Appoint Faculty Coordinator
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Assign a new Faculty Coordinator for a class under {_tpoProgramName || 'your program'}.
                </p>
              </div>
              <button
                onClick={() => setIsFacultyModalOpen(false)}
                style={{
                  background: 'var(--bg-main)',
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

            {/* Modal Body / Form */}
            <form onSubmit={createFaculty} style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              <div style={s.formGrid}>
                <label style={s.label}>Full Name * <input required style={s.input} value={facultyForm.name} onChange={e => setFacultyForm({ ...facultyForm, name: e.target.value })} placeholder="Prof. Sharma" /></label>
                <label style={s.label}>Email Address * <input required type="email" style={s.input} value={facultyForm.email} onChange={e => setFacultyForm({ ...facultyForm, email: e.target.value })} placeholder="sharma@institute.edu" /></label>
                <label style={s.label}>Password * <input required type="password" style={s.input} value={facultyForm.password} onChange={e => setFacultyForm({ ...facultyForm, password: e.target.value })} placeholder="Set Password" /></label>
                <label style={s.label}>Phone Number <input style={s.input} value={facultyForm.phone} onChange={e => setFacultyForm({ ...facultyForm, phone: e.target.value })} placeholder="+91 9876543210" /></label>
                <label style={s.label}>
                  Department *
                  <select
                    required
                    style={s.input}
                    value={facultyDeptId}
                    onChange={e => {
                      setFacultyDeptId(e.target.value);
                      setFacultyForm({ ...facultyForm, class_id: '' });
                    }}
                  >
                    <option value="">-- Select Department --</option>
                    {hierarchy.flatMap((p: any) => p.departments || []).map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ ...s.label, opacity: facultyDeptId ? 1 : 0.6 }}>
                  Assigned Class *
                  <select
                    required
                    disabled={!facultyDeptId}
                    style={s.input}
                    value={facultyForm.class_id}
                    onChange={e => setFacultyForm({ ...facultyForm, class_id: e.target.value })}
                  >
                    <option value="">
                      {facultyDeptId ? '-- Select Class --' : '-- Select Department First --'}
                    </option>
                    {tpoSelectedClasses.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsFacultyModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    padding: '10px 20px',
                    borderRadius: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button type="submit" style={s.primaryBtn} disabled={loading}>
                  <BuildingIcon size={18} /> {loading ? 'Appointing...' : 'Appoint Faculty Coordinator'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      {/* ── STUDENTS DIRECTORY & HIERARCHICAL NAV ── */}
      {tab === 'students' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {showBulkUpload && (
            <div style={s.formCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Bulk Student Master Upload
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Upload Excel sheets conforming to the standard canonical template.
                  </p>
                </div>
                <button
                  onClick={() => setShowBulkUpload(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <CloseIcon size={14} />
                  <span>Close</span>
                </button>
              </div>
              <BulkStudentUpload
                token={token}
                institutionId={institutionId}
                apiUrl={API}
                onUploadSuccess={() => {
                  flash('Bulk student data uploaded successfully!');
                  loadStudents();
                  loadHierarchy();
                }}
              />
            </div>
          )}

          {studentsLoading ? (
            <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
              <Loader color="#3B82F6" />
            </div>
          ) : (
            <TpoStudentHierarchyView
              students={students}
              hierarchy={hierarchy}
              programName={_tpoProgramName || 'All Programs'}
              onRefresh={() => {
                loadStudents();
                loadHierarchy();
                flash('Students & hierarchy refreshed!');
              }}
              onShowBulkUpload={() => setShowBulkUpload(!showBulkUpload)}
              showBulkUpload={showBulkUpload}
            />
          )}
        </div>
      )}

      {/* ── CREATE / EDIT DRIVE MODAL POPUP (FULL-WINDOW PORTAL) ── */}
      {isDriveModalOpen && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(11, 25, 44, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 24,
            boxSizing: 'border-box',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsDriveModalOpen(false);
            }
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              width: '100%',
              maxWidth: 720,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden',
              margin: 'auto',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px 24px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--card-bg)',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {editingDriveId ? 'Edit Placement Drive' : 'Create New Placement Drive'}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  {editingDriveId
                    ? 'Update hiring drive parameters, cutoffs, and deadline.'
                    : 'Fill in job role and eligibility criteria. Eligible students will be notified.'}
                </p>
              </div>
              <button
                onClick={() => setIsDriveModalOpen(false)}
                style={{
                  background: 'var(--bg-main)',
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

            {/* Modal Body */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              <div style={s.formGrid}>
                {[
                  { label: 'Company Name *', key: 'companyName', placeholder: 'e.g. Google' },
                  { label: 'Job Role *', key: 'jobRole', placeholder: 'e.g. Software Engineer' },
                  { label: 'Package', key: 'package', placeholder: 'e.g. 18 LPA' },
                  { label: 'Location', key: 'location', placeholder: 'e.g. Pune, Hybrid' },
                ].map(f => (
                  <label key={f.key} style={s.label}>
                    {f.label}
                    <input
                      style={s.input}
                      placeholder={f.placeholder}
                      value={(form as any)[f.key]}
                      onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  </label>
                ))}

                <label style={s.label}>
                  Mode
                  <select style={s.input} value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                    <option>On-campus</option>
                    <option>Off-campus</option>
                    <option>Hybrid</option>
                    <option>Remote</option>
                  </select>
                </label>

                <label style={s.label}>
                  Gender Filter
                  <select style={s.input} value={form.genderFilter} onChange={e => setForm({ ...form, genderFilter: e.target.value })}>
                    <option>All</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </label>

                <label style={s.label}>
                  Min CGPA Cutoff
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    style={s.input}
                    value={form.minCgpa}
                    onChange={e => setForm({ ...form, minCgpa: parseFloat(e.target.value) || 0 })}
                  />
                </label>

                <label style={s.label}>
                  Max Backlogs Allowed
                  <input
                    type="number"
                    min="0"
                    style={s.input}
                    value={form.maxBacklogs}
                    onChange={e => setForm({ ...form, maxBacklogs: parseInt(e.target.value) || 0 })}
                  />
                </label>

                <label style={s.label}>
                  Passout Year
                  <input
                    type="number"
                    style={s.input}
                    value={form.passoutYear}
                    onChange={e => setForm({ ...form, passoutYear: parseInt(e.target.value) || new Date().getFullYear() })}
                  />
                </label>

                <label style={s.label}>
                  External Apply Link (Optional)
                  <input
                    style={s.input}
                    placeholder="https://careers.company.com/apply"
                    value={form.externalLink}
                    onChange={e => setForm({ ...form, externalLink: e.target.value })}
                  />
                </label>

                <label style={{ ...s.label, gridColumn: 'span 2' }}>
                  Drive Deadline *
                  <input
                    required
                    type="datetime-local"
                    style={s.input}
                    value={form.deadline}
                    onChange={e => setForm({ ...form, deadline: e.target.value })}
                  />
                </label>
              </div>

              {/* Allowed Programs */}
              <div style={{ marginTop: 20 }}>
                <label style={s.sectionHeader}>Allowed Programs</label>
                <div style={s.chipRow}>
                  {hierarchy.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleArr('allowedProgs', p.id)}
                      style={{ ...s.chip, ...(form.allowedProgs.includes(p.id) ? s.chipSelected : {}), display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {form.allowedProgs.includes(p.id) ? <CheckIcon size={13} color="#3B82F6" /> : <PlusIcon size={13} color="currentColor" />}
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Allowed Departments */}
              <div style={{ marginTop: 16 }}>
                <label style={s.sectionHeader}>Allowed Departments</label>
                <div style={s.chipRow}>
                  {allDepts.map((d: any) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleArr('allowedDepts', d.id)}
                      style={{ ...s.chip, ...(form.allowedDepts.includes(d.id) ? s.chipSelected : {}), display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {form.allowedDepts.includes(d.id) ? <CheckIcon size={13} color="#3B82F6" /> : <PlusIcon size={13} color="currentColor" />}
                      <span>{d.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                padding: '16px 24px',
                borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsDriveModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button onClick={createDrive} style={s.primaryBtn}>
                <PlusIcon size={18} /> {editingDriveId ? 'Update Drive' : 'Publish Drive & Notify Students'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const Loader = ({ color }: { color: string }) => (
  <div style={{ padding: 40, textAlign: 'center' }}>
    <div className="animate-spin" style={{ width: 32, height: 32, border: `3px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto' }} />
  </div>
);

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 24 },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  subtitle: { color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '0.9rem' },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  toastOk: { padding: '12px 18px', background: 'rgba(16,185,129,0.15)', color: '#34D399', borderRadius: 10, border: '1px solid rgba(16,185,129,0.3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 },
  toastErr: { padding: '12px 18px', background: 'rgba(239,68,68,0.15)', color: '#F87171', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 },
  tabNav: { display: 'flex', gap: 8, flexWrap: 'wrap', background: 'var(--card-bg)', padding: 8, borderRadius: 12, border: '1px solid var(--border-color)' },
  tabBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' },
  tabActive: { background: 'var(--bg-main)', color: '#3B82F6', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  driveGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 },
  driveCard: { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  cardDim: { opacity: 0.6 },
  driveTop: { display: 'flex', gap: 12, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 12, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontWeight: 800, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  company: { fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' },
  role: { color: 'var(--text-secondary)', fontSize: '0.85rem' },
  pill: { padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 },
  driveStats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'var(--bg-main)', padding: 12, borderRadius: 12 },
  statBox: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  statLabel: { fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 },
  driveFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  appsBtn: { background: '#3B82F6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' },
  empty: { textAlign: 'center', padding: 60, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 16 },
  primaryBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#3B82F6', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' },
  formCard: { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24 },
  formTitle: { fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' },
  input: { padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none', fontSize: '0.88rem', boxSizing: 'border-box' as const, minHeight: 40 },
  sectionHeader: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'block' },
  chipRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: { background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  chipSelected: { background: 'rgba(59,130,246,0.15)', borderColor: '#3B82F6', color: '#3B82F6' },
  applicantHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  bulkRow: { display: 'flex', alignItems: 'center', gap: 8 },
  bulkBtn: { background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 14px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700 },
  td: { padding: '12px 14px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' },
  selectPill: { padding: '4px 8px', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
};
