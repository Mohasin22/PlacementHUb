import React, { useState, useMemo, useEffect } from 'react';
import { StudentDetailModal } from './StudentDetailModal';
import { StudentAvatar } from './StudentAvatar';
import {
  BuildingIcon,
  SearchIcon,
  RefreshIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  GridIcon,
  ListIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  IdCardIcon,
  ChevronDownIcon,
  FileSpreadsheetIcon,
  GraduationCapIcon,
  SchoolIcon,
} from './Icons';

interface DeanStudentHierarchyViewProps {
  students: any[];
  hierarchy: any[];
  onRefresh?: () => void;
}

// Color palettes for departments and branches
const DEPT_COLORS = [
  { bg: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', text: '#2563EB', soft: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)' },
  { bg: 'linear-gradient(135deg, #10B981 0%, #047857 100%)', text: '#059669', soft: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)' },
  { bg: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)', text: '#7C3AED', soft: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.25)' },
  { bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', text: '#D97706', soft: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)' },
  { bg: 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)', text: '#DB2777', soft: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.25)' },
  { bg: 'linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)', text: '#0284C7', soft: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.25)' },
];

const BRANCH_COLORS = [
  { bg: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', text: '#4F46E5', soft: 'rgba(79, 70, 229, 0.08)', border: 'rgba(79, 70, 229, 0.2)' },
  { bg: 'linear-gradient(135deg, #0284C7 0%, #06B6D4 100%)', text: '#0284C7', soft: 'rgba(2, 132, 199, 0.08)', border: 'rgba(2, 132, 199, 0.2)' },
  { bg: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', text: '#059669', soft: 'rgba(5, 150, 105, 0.08)', border: 'rgba(5, 150, 105, 0.2)' },
  { bg: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', text: '#D97706', soft: 'rgba(217, 119, 6, 0.08)', border: 'rgba(217, 119, 6, 0.2)' },
  { bg: 'linear-gradient(135deg, #DC2626 0%, #EA580C 100%)', text: '#DC2626', soft: 'rgba(220, 38, 38, 0.08)', border: 'rgba(220, 38, 38, 0.2)' },
  { bg: 'linear-gradient(135deg, #9333EA 0%, #C026D3 100%)', text: '#9333EA', soft: 'rgba(147, 51, 234, 0.08)', border: 'rgba(147, 51, 234, 0.2)' },
];

export const DeanStudentHierarchyView: React.FC<DeanStudentHierarchyViewProps> = ({
  students,
  hierarchy,
  onRefresh,
}) => {
  const [localStudents, setLocalStudents] = useState<any[]>(students || []);

  useEffect(() => {
    setLocalStudents(students || []);
  }, [students]);

  // 3-Level Navigation State:
  // Level 1: selectedDeptId = null (Departments / Programs)
  // Level 2: selectedDeptId set, selectedBranchId = null (Branches inside Department)
  // Level 3: selectedBranchId set (Students inside Branch)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Selected Student for Profile Modal
  const [activeStudentModal, setActiveStudentModal] = useState<any | null>(null);

  // Search and Filters (applicable for students level or global filter)
  const [searchQuery, setSearchQuery] = useState('');
  const [cgpaFilter, setCgpaFilter] = useState<'all' | 'high' | 'med' | 'low'>('all');
  const [resumeFilter, setResumeFilter] = useState<'all' | 'uploaded' | 'missing'>('all');
  const [backlogFilter, setBacklogFilter] = useState<'all' | 'clean' | 'backlogs'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // ── 1. AGGREGATE & NORMALIZE 3-TIER HIERARCHY TREE ─────────────────────────
  const { departmentList, totalStats } = useMemo(() => {
    // Map to gather top-level departments (programs)
    const progMap = new Map<string, {
      id: string;
      name: string;
      code?: string;
      duration_years?: number;
      branchesMap: Map<string, {
        id: string;
        name: string;
        students: any[];
      }>;
      students: any[];
    }>();

    // 1. Populate from hierarchy endpoint
    if (Array.isArray(hierarchy)) {
      hierarchy.forEach((prog: any) => {
        const pId = String(prog.id || prog.name).trim();
        const pName = prog.name || 'General Department';
        if (!progMap.has(pId)) {
          progMap.set(pId, {
            id: pId,
            name: pName,
            code: prog.code,
            duration_years: prog.duration_years,
            branchesMap: new Map(),
            students: [],
          });
        }
        const pObj = progMap.get(pId)!;

        (prog.departments || []).forEach((dept: any) => {
          const bId = String(dept.id || dept.name).trim();
          const bName = dept.name || 'General Branch';
          if (!pObj.branchesMap.has(bId)) {
            pObj.branchesMap.set(bId, {
              id: bId,
              name: bName,
              students: [],
            });
          }
        });
      });
    }

    // 2. Assign all students to appropriate department ➔ branch
    localStudents.forEach((st: any) => {
      const pName = st.program_name || st.academic_identity?.program_name || 'General Department';
      const pId = String(st.program_id || st.academic_identity?.program_id || pName).trim();
      const bName = st.department_name || st.academic_identity?.department_name || 'General Branch';
      const bId = String(st.department_id || st.academic_identity?.department_id || bName).trim();

      // Find or create Program/Department
      let pObj = progMap.get(pId);
      if (!pObj) {
        for (const val of progMap.values()) {
          if (val.name.toLowerCase() === pName.toLowerCase()) {
            pObj = val;
            break;
          }
        }
      }
      if (!pObj) {
        pObj = {
          id: pId,
          name: pName,
          branchesMap: new Map(),
          students: [],
        };
        progMap.set(pId, pObj);
      }
      pObj.students.push(st);

      // Find or create Branch
      let bObj = pObj.branchesMap.get(bId);
      if (!bObj) {
        for (const val of pObj.branchesMap.values()) {
          if (val.name.toLowerCase() === bName.toLowerCase()) {
            bObj = val;
            break;
          }
        }
      }
      if (!bObj) {
        bObj = {
          id: bId,
          name: bName,
          students: [],
        };
        pObj.branchesMap.set(bId, bObj);
      }
      bObj.students.push(st);
    });

    // 3. Transform into rich hierarchical structures with computed stats
    let totalOverallStudents = 0;
    let totalOverallBranches = 0;
    let totalOverallResumes = 0;
    let totalOverallCgpaSum = 0;
    let totalOverallCgpaValid = 0;

    const list = Array.from(progMap.values()).map((p, pIndex) => {
      let deptStudentsCount = p.students.length;
      let deptResumesCount = 0;
      let deptCgpaSum = 0;
      let deptCgpaValid = 0;

      const branchesList = Array.from(p.branchesMap.values()).map((b, bIndex) => {
        const bStudents = b.students;
        const bValidCgpas = bStudents.filter((s) => Number(s.cgpa) > 0);
        const bAvgCgpa = bValidCgpas.length > 0
          ? bValidCgpas.reduce((acc, s) => acc + Number(s.cgpa), 0) / bValidCgpas.length
          : 0;
        const bResumes = bStudents.filter((s) => Boolean(s.resume_url || s.documents?.resume)).length;
        const bBacklogs = bStudents.filter((s) => (s.active_backlogs || 0) > 0).length;

        const firstSt = bStudents[0];
        const batch = firstSt?.batch_label || '2023–2027';
        const studyYear = firstSt?.study_year_label || `${firstSt?.current_study_year || 4}th Year`;
        const semester = firstSt?.semester_label || `${firstSt?.current_semester || 7}th Sem`;

        deptResumesCount += bResumes;
        bValidCgpas.forEach((s) => {
          deptCgpaSum += Number(s.cgpa);
          deptCgpaValid++;
        });

        const branchColorScheme = BRANCH_COLORS[bIndex % BRANCH_COLORS.length];

        return {
          id: b.id,
          name: b.name,
          students: bStudents,
          studentCount: bStudents.length,
          avgCgpa: bAvgCgpa,
          resumesUploaded: bResumes,
          missingResumes: bStudents.length - bResumes,
          activeBacklogsCount: bBacklogs,
          batchLabel: batch,
          studyYearLabel: studyYear,
          semesterLabel: semester,
          colorScheme: branchColorScheme,
        };
      });

      totalOverallStudents += deptStudentsCount;
      totalOverallBranches += branchesList.length;
      totalOverallResumes += deptResumesCount;
      totalOverallCgpaSum += deptCgpaSum;
      totalOverallCgpaValid += deptCgpaValid;

      const deptAvgCgpa = deptCgpaValid > 0 ? deptCgpaSum / deptCgpaValid : 0;
      const deptColorScheme = DEPT_COLORS[pIndex % DEPT_COLORS.length];

      branchesList.sort((a, b) => b.studentCount - a.studentCount || a.name.localeCompare(b.name));

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        duration_years: p.duration_years,
        branches: branchesList,
        students: p.students,
        studentCount: deptStudentsCount,
        branchCount: branchesList.length,
        avgCgpa: deptAvgCgpa,
        resumesUploaded: deptResumesCount,
        missingResumes: deptStudentsCount - deptResumesCount,
        colorScheme: deptColorScheme,
      };
    });

    list.sort((a, b) => b.studentCount - a.studentCount || a.name.localeCompare(b.name));

    const overallAvgCgpa = totalOverallCgpaValid > 0 ? totalOverallCgpaSum / totalOverallCgpaValid : 0;

    return {
      departmentList: list,
      totalStats: {
        totalDepartments: list.length,
        totalBranches: totalOverallBranches,
        totalStudents: totalOverallStudents,
        totalResumes: totalOverallResumes,
        missingResumes: totalOverallStudents - totalOverallResumes,
        overallAvgCgpa,
      },
    };
  }, [localStudents, hierarchy]);

  // Current selected objects
  const selectedDepartment = useMemo(() => {
    if (!selectedDeptId) return null;
    return departmentList.find((d) => d.id === selectedDeptId) || null;
  }, [selectedDeptId, departmentList]);

  const selectedBranch = useMemo(() => {
    if (!selectedDepartment || !selectedBranchId) return null;
    return selectedDepartment.branches.find((b) => b.id === selectedBranchId) || null;
  }, [selectedDepartment, selectedBranchId]);

  // Filtered students for selected branch
  const branchStudentsFiltered = useMemo(() => {
    if (!selectedBranch) return [];
    return selectedBranch.students.filter((st: any) => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (st.name || st.identity?.full_name || '').toLowerCase();
        const roll = (st.roll_number || st.student_id || '').toLowerCase();
        const email = (st.emails?.institute || st.emails?.personal || '').toLowerCase();
        const skillsStr = (Array.isArray(st.skills) ? st.skills.join(' ') : '').toLowerCase();
        if (!name.includes(q) && !roll.includes(q) && !email.includes(q) && !skillsStr.includes(q)) {
          return false;
        }
      }

      // CGPA Filter
      const cgpa = Number(st.cgpa || 0);
      if (cgpaFilter === 'high' && cgpa < 8.0) return false;
      if (cgpaFilter === 'med' && (cgpa < 6.0 || cgpa >= 8.0)) return false;
      if (cgpaFilter === 'low' && cgpa >= 6.0) return false;

      // Resume Filter
      const hasRes = Boolean(st.resume_url || st.documents?.resume);
      if (resumeFilter === 'uploaded' && !hasRes) return false;
      if (resumeFilter === 'missing' && hasRes) return false;

      // Backlog Filter
      const bl = st.active_backlogs ?? 0;
      if (backlogFilter === 'clean' && bl > 0) return false;
      if (backlogFilter === 'backlogs' && bl === 0) return false;

      return true;
    });
  }, [selectedBranch, searchQuery, cgpaFilter, resumeFilter, backlogFilter]);

  // Back step navigation
  const handleGoBack = () => {
    if (selectedBranchId) {
      setSelectedBranchId(null);
      setSearchQuery('');
    } else if (selectedDeptId) {
      setSelectedDeptId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── TOP HEADER & BREADCRUMB ROW ── */}
      <div
        style={{
          background: 'var(--card-bg, #FFFFFF)',
          border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
          borderRadius: 16,
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Breadcrumb Trail */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setSelectedDeptId(null);
                setSelectedBranchId(null);
                setSearchQuery('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: !selectedDeptId ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                border: 'none',
                color: !selectedDeptId ? '#2563EB' : 'var(--text-secondary, #64748B)',
                fontWeight: !selectedDeptId ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                padding: '5px 12px',
                borderRadius: 8,
                transition: 'all 0.2s',
              }}
            >
              <SchoolIcon size={16} color={!selectedDeptId ? '#2563EB' : 'currentColor'} />
              <span>All Departments</span>
            </button>

            {selectedDepartment && (
              <>
                <ChevronRightIcon size={14} color="var(--text-secondary, #94A3B8)" />
                <button
                  onClick={() => {
                    setSelectedBranchId(null);
                    setSearchQuery('');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: selectedDeptId && !selectedBranchId ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                    border: 'none',
                    color: selectedDeptId && !selectedBranchId ? '#2563EB' : 'var(--text-secondary, #64748B)',
                    fontWeight: selectedDeptId && !selectedBranchId ? 700 : 500,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    padding: '5px 12px',
                    borderRadius: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  <GraduationCapIcon size={16} color={selectedDeptId && !selectedBranchId ? '#2563EB' : 'currentColor'} />
                  <span>{selectedDepartment.name}</span>
                </button>
              </>
            )}

            {selectedBranch && (
              <>
                <ChevronRightIcon size={14} color="var(--text-secondary, #94A3B8)" />
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: '#2563EB',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    padding: '5px 12px',
                    borderRadius: 8,
                  }}
                >
                  <BuildingIcon size={16} color="#2563EB" />
                  <span>{selectedBranch.name}</span>
                </span>
              </>
            )}
          </div>

          {/* Subtitle helper description */}
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #64748B)', paddingLeft: 4 }}>
            {!selectedDepartment && (
              <span>Select a department to explore its branches, cohorts, and student records.</span>
            )}
            {selectedDepartment && !selectedBranch && (
              <span>Showing branches under <strong>{selectedDepartment.name}</strong>. Select a branch to view enrolled students.</span>
            )}
            {selectedBranch && (
              <span>Viewing students enrolled in <strong>{selectedDepartment?.name} &bull; {selectedBranch.name}</strong></span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {(selectedDeptId || selectedBranchId) && (
            <button
              onClick={handleGoBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 38,
                background: 'var(--bg-main, #F8FAFC)',
                border: '1px solid var(--border-color, #E2E8F0)',
                color: 'var(--text-primary, #0F172A)',
                padding: '0 14px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxSizing: 'border-box',
                transition: 'all 0.15s',
              }}
            >
              <ArrowLeftIcon size={14} color="currentColor" />
              <span>Back</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Registry Data"
              style={{
                height: 38,
                width: 38,
                background: 'var(--bg-main, #F8FAFC)',
                border: '1px solid var(--border-color, #E2E8F0)',
                color: 'var(--text-primary, #0F172A)',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
              }}
            >
              <RefreshIcon size={16} />
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch('http://localhost:8000/api/bulk-students/template', {
                  headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
                });
                if (!res.ok) throw new Error('Failed to download template');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Placement_Portal_Standard_Student_Template.xlsx';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => window.URL.revokeObjectURL(url), 1000);
              } catch (err) {
                console.error('Template download error:', err);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              background: 'rgba(59,130,246,0.08)',
              color: '#2563EB',
              border: '1px solid rgba(59,130,246,0.25)',
              padding: '0 16px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
            title="Download the official student excel template"
          >
            <FileSpreadsheetIcon size={16} color="#2563EB" />
            <span>Download Template</span>
          </button>
        </div>
      </div>

      {/* ── LEVEL 1: DEPARTMENTS (TOP INSTITUTION PROGRAMS) ───────────────── */}
      {!selectedDepartment && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Overall Institution KPI Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              color: '#FFFFFF',
              borderRadius: 16,
              padding: '24px 28px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 20,
              boxShadow: '0 4px 20px rgba(15, 23, 42, 0.15)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ background: 'rgba(255,255,255,0.12)', padding: '6px', borderRadius: 8, display: 'inline-flex' }}>
                  <SchoolIcon size={20} color="#60A5FA" />
                </span>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Institution Departments Overview
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#94A3B8', maxWidth: 520 }}>
                High-level academic registry overview across all degree departments, professional programs, and active student cohorts.
              </p>
            </div>

            {/* Quick Metrics */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Departments</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>{totalStats.totalDepartments}</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Branches</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60A5FA', marginTop: 2 }}>{totalStats.totalBranches}</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Students</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34D399', marginTop: 2 }}>{totalStats.totalStudents}</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg CGPA</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FBBF24', marginTop: 2 }}>
                  {totalStats.overallAvgCgpa > 0 ? totalStats.overallAvgCgpa.toFixed(2) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Department Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 20,
            }}
          >
            {departmentList.map((dept) => {
              const resRate = dept.studentCount > 0 ? Math.round((dept.resumesUploaded / dept.studentCount) * 100) : 0;

              return (
                <div
                  key={dept.id}
                  onClick={() => setSelectedDeptId(dept.id)}
                  style={{
                    background: 'var(--card-bg, #FFFFFF)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 18,
                    padding: 22,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)';
                    e.currentTarget.style.borderColor = dept.colorScheme.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.03)';
                    e.currentTarget.style.borderColor = 'var(--border-color, rgba(0,0,0,0.08))';
                  }}
                >
                  {/* Top Header of Department Card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          background: dept.colorScheme.bg,
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          flexShrink: 0,
                        }}
                      >
                        <GraduationCapIcon size={24} color="#FFFFFF" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)' }}>
                          {dept.name}
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748B)', fontWeight: 500 }}>
                          {dept.code ? `${dept.code} Degree` : 'Academic Department'} &bull; {dept.duration_years ? `${dept.duration_years} Years` : '4 Years'}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        background: dept.colorScheme.soft,
                        color: dept.colorScheme.text,
                        border: `1px solid ${dept.colorScheme.border}`,
                        padding: '4px 10px',
                        borderRadius: 10,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dept.studentCount} Students
                    </span>
                  </div>

                  {/* Department Stats Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      background: 'var(--bg-main, #F8FAFC)',
                      padding: '12px 14px',
                      borderRadius: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Branches</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)', marginTop: 2 }}>
                        {dept.branchCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Students</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)', marginTop: 2 }}>
                        {dept.studentCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Avg CGPA</div>
                      <div
                        style={{
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          color: dept.avgCgpa >= 8.0 ? '#16A34A' : dept.avgCgpa >= 6.0 ? '#D97706' : '#DC2626',
                          marginTop: 2,
                        }}
                      >
                        {dept.avgCgpa > 0 ? dept.avgCgpa.toFixed(2) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Resumes Progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-secondary, #64748B)', fontWeight: 500 }}>Resume Coverage</span>
                      <strong style={{ color: resRate >= 80 ? '#16A34A' : '#D97706' }}>
                        {resRate}% ({dept.resumesUploaded}/{dept.studentCount})
                      </strong>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: 'rgba(0,0,0,0.06)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${resRate}%`,
                          background: resRate >= 80 ? '#16A34A' : '#F59E0B',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>

                  {/* Action Link Footer */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: 8,
                      borderTop: '1px solid var(--border-color, rgba(0,0,0,0.06))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748B)' }}>
                      {dept.branchCount} Active Branches
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: dept.colorScheme.text,
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}
                    >
                      <span>Explore Branches</span>
                      <ChevronRightIcon size={14} color="currentColor" />
                    </span>
                  </div>
                </div>
              );
            })}

            {departmentList.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: 60,
                  background: 'var(--card-bg, #FFFFFF)',
                  borderRadius: 16,
                  color: 'var(--text-secondary, #64748B)',
                }}
              >
                No departments or programs found in this institution hierarchy.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LEVEL 2: BRANCHES (INSIDE SELECTED DEPARTMENT) ────────────────── */}
      {selectedDepartment && !selectedBranch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Department Header Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              color: '#FFFFFF',
              borderRadius: 16,
              padding: '24px 28px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 20,
              boxShadow: '0 4px 20px rgba(15, 23, 42, 0.15)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ background: 'rgba(255,255,255,0.12)', padding: '6px', borderRadius: 8, display: 'inline-flex' }}>
                  <GraduationCapIcon size={20} color="#60A5FA" />
                </span>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {selectedDepartment.name} Branches
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#94A3B8', maxWidth: 520 }}>
                Showing all engineering & discipline branches under {selectedDepartment.name}. Click on a branch to view enrolled students.
              </p>
            </div>

            {/* Quick Metrics in Department */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Branches</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60A5FA', marginTop: 2 }}>{selectedDepartment.branchCount}</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Students</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34D399', marginTop: 2 }}>{selectedDepartment.studentCount}</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg CGPA</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FBBF24', marginTop: 2 }}>
                  {selectedDepartment.avgCgpa > 0 ? selectedDepartment.avgCgpa.toFixed(2) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Branch Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 20,
            }}
          >
            {selectedDepartment.branches.map((branch) => {
              const resRate = branch.studentCount > 0 ? Math.round((branch.resumesUploaded / branch.studentCount) * 100) : 0;

              return (
                <div
                  key={branch.id}
                  onClick={() => setSelectedBranchId(branch.id)}
                  style={{
                    background: 'var(--card-bg, #FFFFFF)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 18,
                    padding: 22,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)';
                    e.currentTarget.style.borderColor = branch.colorScheme.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.03)';
                    e.currentTarget.style.borderColor = 'var(--border-color, rgba(0,0,0,0.08))';
                  }}
                >
                  {/* Branch Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          background: branch.colorScheme.bg,
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          flexShrink: 0,
                        }}
                      >
                        <BuildingIcon size={22} color="#FFFFFF" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)' }}>
                          {branch.name}
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748B)' }}>
                          {branch.batchLabel}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        background: branch.colorScheme.soft,
                        color: branch.colorScheme.text,
                        border: `1px solid ${branch.colorScheme.border}`,
                        padding: '4px 10px',
                        borderRadius: 10,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {branch.studentCount} Students
                    </span>
                  </div>

                  {/* Branch Metrics */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      background: 'var(--bg-main, #F8FAFC)',
                      padding: '10px 12px',
                      borderRadius: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Students</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)', marginTop: 2 }}>
                        {branch.studentCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Avg CGPA</div>
                      <div
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 800,
                          color: branch.avgCgpa >= 8.0 ? '#16A34A' : branch.avgCgpa >= 6.0 ? '#D97706' : '#DC2626',
                          marginTop: 2,
                        }}
                      >
                        {branch.avgCgpa > 0 ? branch.avgCgpa.toFixed(2) : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Backlogs</div>
                      <div
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 800,
                          color: branch.activeBacklogsCount === 0 ? '#16A34A' : '#DC2626',
                          marginTop: 2,
                        }}
                      >
                        {branch.activeBacklogsCount}
                      </div>
                    </div>
                  </div>

                  {/* Resumes Progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginBottom: 5 }}>
                      <span style={{ color: 'var(--text-secondary, #64748B)' }}>Resumes</span>
                      <strong style={{ color: resRate >= 80 ? '#16A34A' : '#D97706' }}>
                        {resRate}% ({branch.resumesUploaded}/{branch.studentCount})
                      </strong>
                    </div>
                    <div
                      style={{
                        height: 5,
                        background: 'rgba(0,0,0,0.06)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${resRate}%`,
                          background: resRate >= 80 ? '#16A34A' : '#F59E0B',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>

                  {/* Action Link Footer */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: 8,
                      borderTop: '1px solid var(--border-color, rgba(0,0,0,0.06))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748B)' }}>
                      {branch.studentCount} Enrolled Students
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: branch.colorScheme.text,
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}
                    >
                      <span>View Students</span>
                      <ChevronRightIcon size={14} color="currentColor" />
                    </span>
                  </div>
                </div>
              );
            })}

            {selectedDepartment.branches.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: 60,
                  background: 'var(--card-bg, #FFFFFF)',
                  borderRadius: 16,
                  color: 'var(--text-secondary, #64748B)',
                }}
              >
                No branches registered under {selectedDepartment.name} yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LEVEL 3: STUDENTS (INSIDE SELECTED BRANCH) ─────────────────────── */}
      {selectedDepartment && selectedBranch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Branch Header Banner */}
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color, #E2E8F0)',
              borderRadius: 16,
              padding: '18px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)' }}>
                  {selectedDepartment.name} &bull; {selectedBranch.name}
                </h2>
                <span
                  style={{
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: '#2563EB',
                    padding: '3px 12px',
                    borderRadius: 12,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                >
                  {selectedBranch.studentCount} Students
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748B)' }}>
                {selectedBranch.batchLabel} &bull; {selectedBranch.studyYearLabel} &bull; {selectedBranch.semesterLabel}
              </p>
            </div>

            {/* Quick Metrics in Branch */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--bg-main, #F8FAFC)', padding: '6px 14px', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border-color, #E2E8F0)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)' }}>Branch Avg CGPA</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  {selectedBranch.avgCgpa > 0 ? selectedBranch.avgCgpa.toFixed(2) : '—'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-main, #F8FAFC)', padding: '6px 14px', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border-color, #E2E8F0)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)' }}>Resumes</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {selectedBranch.resumesUploaded} / {selectedBranch.studentCount}
                </div>
              </div>
              <div style={{ background: 'var(--bg-main, #F8FAFC)', padding: '6px 14px', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border-color, #E2E8F0)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)' }}>Active Backlogs</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: selectedBranch.activeBacklogsCount === 0 ? '#16A34A' : '#DC2626', marginTop: 2 }}>
                  {selectedBranch.activeBacklogsCount}
                </div>
              </div>
            </div>
          </div>

          {/* Search, Filters, and View Switcher Row */}
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color, #E2E8F0)',
              borderRadius: 14,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
              <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary, #94A3B8)', display: 'flex', alignItems: 'center' }}>
                <SearchIcon size={16} />
              </div>
              <input
                type="text"
                placeholder="Search student by name, roll, or skill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 12px 0 36px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color, #CBD5E1)',
                  background: 'var(--input-bg, #FFFFFF)',
                  color: 'var(--text-primary, #0F172A)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Quick Filter Selectors & View Switcher */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* CGPA Filter */}
              <div style={{ position: 'relative' }}>
                <select
                  value={cgpaFilter}
                  onChange={(e) => setCgpaFilter(e.target.value as any)}
                  style={{
                    height: 38,
                    padding: '0 28px 0 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #CBD5E1)',
                    background: 'var(--bg-main, #F8FAFC)',
                    color: 'var(--text-primary, #0F172A)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="all">All CGPA</option>
                  <option value="high">CGPA ≥ 8.0</option>
                  <option value="med">CGPA 6.0 – 8.0</option>
                  <option value="low">CGPA &lt; 6.0</option>
                </select>
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary, #94A3B8)' }}>
                  <ChevronDownIcon size={14} />
                </div>
              </div>

              {/* Resume Filter */}
              <div style={{ position: 'relative' }}>
                <select
                  value={resumeFilter}
                  onChange={(e) => setResumeFilter(e.target.value as any)}
                  style={{
                    height: 38,
                    padding: '0 28px 0 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #CBD5E1)',
                    background: 'var(--bg-main, #F8FAFC)',
                    color: 'var(--text-primary, #0F172A)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="all">All Resumes</option>
                  <option value="uploaded">Uploaded</option>
                  <option value="missing">Missing</option>
                </select>
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary, #94A3B8)' }}>
                  <ChevronDownIcon size={14} />
                </div>
              </div>

              {/* Backlog Filter */}
              <div style={{ position: 'relative' }}>
                <select
                  value={backlogFilter}
                  onChange={(e) => setBacklogFilter(e.target.value as any)}
                  style={{
                    height: 38,
                    padding: '0 28px 0 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #CBD5E1)',
                    background: 'var(--bg-main, #F8FAFC)',
                    color: 'var(--text-primary, #0F172A)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="all">All Backlogs</option>
                  <option value="clean">0 Backlogs (Clean)</option>
                  <option value="backlogs">Has Active Backlogs</option>
                </select>
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary, #94A3B8)' }}>
                  <ChevronDownIcon size={14} />
                </div>
              </div>

              {/* View Mode Switcher */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-main, #F8FAFC)',
                  border: '1px solid var(--border-color, #CBD5E1)',
                  borderRadius: 8,
                  height: 38,
                  padding: 2,
                  boxSizing: 'border-box',
                }}
              >
                <button
                  onClick={() => setViewMode('cards')}
                  title="Card Grid View"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 32,
                    padding: '0 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: viewMode === 'cards' ? '#3B82F6' : 'transparent',
                    color: viewMode === 'cards' ? '#FFFFFF' : 'var(--text-secondary, #64748B)',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <GridIcon size={14} color="currentColor" />
                  <span>Cards</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  title="Table View"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 32,
                    padding: '0 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: viewMode === 'table' ? '#3B82F6' : 'transparent',
                    color: viewMode === 'table' ? '#FFFFFF' : 'var(--text-secondary, #64748B)',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <ListIcon size={14} color="currentColor" />
                  <span>Table</span>
                </button>
              </div>
            </div>
          </div>

          {/* Students Display (Cards or Table) */}
          {branchStudentsFiltered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 24px',
                background: 'var(--card-bg, #FFFFFF)',
                borderRadius: 16,
                border: '1px solid var(--border-color, #E2E8F0)',
                color: 'var(--text-secondary, #64748B)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ color: 'var(--text-secondary, #94A3B8)', opacity: 0.6 }}>
                <SearchIcon size={36} />
              </div>
              <h3 style={{ margin: '4px 0 0 0', color: 'var(--text-primary, #0F172A)', fontSize: '1.1rem' }}>
                No students match the current filters
              </h3>
              <p style={{ fontSize: '0.85rem', margin: 0 }}>
                Try adjusting your search terms or clearing filters.
              </p>
              {(searchQuery || cgpaFilter !== 'all' || resumeFilter !== 'all' || backlogFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCgpaFilter('all');
                    setResumeFilter('all');
                    setBacklogFilter('all');
                  }}
                  style={{
                    marginTop: 10,
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#2563EB',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : viewMode === 'cards' ? (
            /* ── CARDS GRID ── */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                gap: 18,
              }}
            >
              {branchStudentsFiltered.map((st) => {
                const sName = st.name || st.identity?.full_name || 'Student';
                const sRoll = st.roll_number || st.student_id || 'N/A';
                const sCgpa = Number(st.cgpa || 0).toFixed(2);
                const sHasResume = Boolean(st.resume_url || st.documents?.resume);
                const sBacklogs = st.active_backlogs ?? 0;
                const sSkills = Array.isArray(st.skills) ? st.skills.slice(0, 3) : [];

                return (
                  <div
                    key={st.id}
                    onClick={() => setActiveStudentModal(st)}
                    style={{
                      background: 'var(--card-bg, #FFFFFF)',
                      border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                      borderRadius: 16,
                      padding: 18,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      height: '100%',
                      boxSizing: 'border-box',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = '0 8px 18px rgba(0,0,0,0.08)';
                      e.currentTarget.style.borderColor = '#3B82F6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)';
                      e.currentTarget.style.borderColor = 'var(--border-color, rgba(0,0,0,0.08))';
                    }}
                  >
                    {/* Header with Avatar & Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <StudentAvatar
                        photoUrl={st.photo_url || st.documents?.profile_photo}
                        name={sName}
                        size={44}
                        fontSize="0.95rem"
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: 'var(--text-primary, #0F172A)',
                            fontSize: '0.95rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {sName}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748B)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <IdCardIcon size={12} color="var(--text-secondary, #64748B)" />
                          <span>{sRoll}</span>
                        </div>
                      </div>
                    </div>

                    {/* Academic Badges Row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        background: 'var(--bg-main, #F8FAFC)',
                        padding: '8px 10px',
                        borderRadius: 10,
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748B)' }}>CGPA</span>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: '1rem',
                            color: Number(sCgpa) >= 8.0 ? '#16A34A' : Number(sCgpa) >= 6.0 ? '#D97706' : '#DC2626',
                          }}
                        >
                          {sCgpa}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748B)' }}>Backlogs</span>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: sBacklogs === 0 ? '#16A34A' : '#DC2626',
                          }}
                        >
                          {sBacklogs === 0 ? '0 (Clear)' : `${sBacklogs} Active`}
                        </div>
                      </div>
                    </div>

                    {/* Skills preview */}
                    {sSkills.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {sSkills.map((sk: string, i: number) => (
                          <span
                            key={i}
                            style={{
                              background: 'rgba(59, 130, 246, 0.08)',
                              color: '#2563EB',
                              fontSize: '0.72rem',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer Row with Resume & View Detail button */}
                    <div
                      style={{
                        marginTop: 'auto',
                        paddingTop: 8,
                        borderTop: '1px solid var(--border-color, rgba(0,0,0,0.06))',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      {sHasResume ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#16A34A',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          <CheckCircleIcon size={13} color="#16A34A" />
                          <span>Resume Ready</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#DC2626',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          <AlertCircleIcon size={13} color="#DC2626" />
                          <span>Missing Resume</span>
                        </span>
                      )}

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#2563EB',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                        }}
                      >
                        <span>View Details</span>
                        <ChevronRightIcon size={13} color="#2563EB" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── COMPACT TABLE VIEW ── */
            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border-color, #E2E8F0)',
                borderRadius: 16,
                overflowX: 'auto',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-color, #E2E8F0)',
                      color: 'var(--text-secondary, #64748B)',
                      fontSize: '0.82rem',
                      textAlign: 'left',
                      background: 'var(--bg-main, #F8FAFC)',
                    }}
                  >
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Student</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Roll Number</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>CGPA</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Active Backlogs</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Resume</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {branchStudentsFiltered.map((st) => {
                    const sName = st.name || st.identity?.full_name || 'Student';
                    const sRoll = st.roll_number || st.student_id || 'N/A';
                    const sCgpa = Number(st.cgpa || 0).toFixed(2);
                    const sHasResume = Boolean(st.resume_url || st.documents?.resume);
                    const sBacklogs = st.active_backlogs ?? 0;
                    const sEmail = st.emails?.institute || st.emails?.personal || '—';

                    return (
                      <tr
                        key={st.id}
                        onClick={() => setActiveStudentModal(st)}
                        style={{
                          borderBottom: '1px solid var(--border-color, #E2E8F0)',
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-main, #F8FAFC)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary, #0F172A)', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <StudentAvatar
                              photoUrl={st.photo_url || st.documents?.profile_photo}
                              name={sName}
                              size={32}
                              fontSize="0.75rem"
                            />
                            <span>{sName}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #64748B)', fontWeight: 600, verticalAlign: 'middle' }}>
                          {sRoll}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            fontWeight: 800,
                            color: Number(sCgpa) >= 8.0 ? '#16A34A' : Number(sCgpa) >= 6.0 ? '#D97706' : '#DC2626',
                            verticalAlign: 'middle',
                          }}
                        >
                          {sCgpa}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            fontWeight: 600,
                            color: sBacklogs === 0 ? '#16A34A' : '#DC2626',
                            verticalAlign: 'middle',
                          }}
                        >
                          {sBacklogs}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #64748B)', fontSize: '0.82rem', verticalAlign: 'middle' }}>
                          {sEmail}
                        </td>
                        <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                          {sHasResume ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: '#16A34A',
                                background: 'rgba(34, 197, 94, 0.1)',
                                padding: '3px 8px',
                                borderRadius: 12,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                              }}
                            >
                              <CheckCircleIcon size={12} color="#16A34A" />
                              <span>Uploaded</span>
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: '#DC2626',
                                background: 'rgba(239, 68, 68, 0.1)',
                                padding: '3px 8px',
                                borderRadius: 12,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              <AlertCircleIcon size={12} color="#DC2626" />
                              <span>Missing</span>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveStudentModal(st);
                            }}
                            style={{
                              background: '#3B82F6',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            View Profile
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FULL STUDENT PROFILE MODAL ── */}
      {activeStudentModal && (
        <StudentDetailModal
          student={activeStudentModal}
          isOpen={Boolean(activeStudentModal)}
          onClose={() => setActiveStudentModal(null)}
        />
      )}
    </div>
  );
};
