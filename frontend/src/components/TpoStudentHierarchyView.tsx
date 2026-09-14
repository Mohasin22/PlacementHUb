import React, { useState, useMemo, useEffect } from 'react';
import { StudentDetailModal } from './StudentDetailModal';
import { StudentAvatar } from './StudentAvatar';
import {
  BuildingIcon,
  ClassIcon,
  SearchIcon,
  UploadIcon,
  RefreshIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  GridIcon,
  ListIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  AnalyticsIcon,
  IdCardIcon,
  ChevronDownIcon,
} from './Icons';

interface TpoStudentHierarchyViewProps {
  students: any[];
  hierarchy: any[];
  programName?: string;
  onRefresh?: () => void;
  onShowBulkUpload?: () => void;
  showBulkUpload?: boolean;
}

// Color palette generator for departments
const DEPT_COLORS = [
  { bg: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', text: '#4F46E5', soft: 'rgba(79, 70, 229, 0.08)', border: 'rgba(79, 70, 229, 0.2)' },
  { bg: 'linear-gradient(135deg, #0284C7 0%, #06B6D4 100%)', text: '#0284C7', soft: 'rgba(2, 132, 199, 0.08)', border: 'rgba(2, 132, 199, 0.2)' },
  { bg: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', text: '#059669', soft: 'rgba(5, 150, 105, 0.08)', border: 'rgba(5, 150, 105, 0.2)' },
  { bg: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', text: '#D97706', soft: 'rgba(217, 119, 6, 0.08)', border: 'rgba(217, 119, 6, 0.2)' },
  { bg: 'linear-gradient(135deg, #DC2626 0%, #EA580C 100%)', text: '#DC2626', soft: 'rgba(220, 38, 38, 0.08)', border: 'rgba(220, 38, 38, 0.2)' },
  { bg: 'linear-gradient(135deg, #9333EA 0%, #C026D3 100%)', text: '#9333EA', soft: 'rgba(147, 51, 234, 0.08)', border: 'rgba(147, 51, 234, 0.2)' },
];

export const TpoStudentHierarchyView: React.FC<TpoStudentHierarchyViewProps> = ({
  students,
  hierarchy,
  programName = 'All Programs',
  onRefresh,
  onShowBulkUpload,
  showBulkUpload,
}) => {
  const [localStudents, setLocalStudents] = useState<any[]>(students || []);

  useEffect(() => {
    setLocalStudents(students || []);
  }, [students]);

  // Navigation State
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Selected Student for Modal
  const [activeStudentModal, setActiveStudentModal] = useState<any | null>(null);

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [cgpaFilter, setCgpaFilter] = useState<'all' | 'high' | 'med' | 'low'>('all');
  const [resumeFilter, setResumeFilter] = useState<'all' | 'uploaded' | 'missing'>('all');
  const [backlogFilter, setBacklogFilter] = useState<'all' | 'clean' | 'backlogs'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // ── 1. AGGREGATE & NORMALIZE HIERARCHY TREE ───────────────────────────────
  const { departmentList, totalStats } = useMemo(() => {
    // Map to gather departments
    const deptMap = new Map<string, {
      id: string;
      name: string;
      classesMap: Map<string, { id: string; name: string; students: any[] }>;
      students: any[];
    }>();

    // First populate from hierarchy endpoint
    if (Array.isArray(hierarchy)) {
      hierarchy.forEach((prog: any) => {
        const depts = prog.departments || [];
        depts.forEach((dept: any) => {
          const dId = String(dept.id || dept.name).trim();
          const dName = dept.name || 'General Department';
          if (!deptMap.has(dId)) {
            deptMap.set(dId, {
              id: dId,
              name: dName,
              classesMap: new Map(),
              students: [],
            });
          }
          const dObj = deptMap.get(dId)!;
          (dept.classes || []).forEach((c: any) => {
            const cId = String(c.id || c.name).trim();
            const cName = c.name || 'Section A';
            if (!dObj.classesMap.has(cId)) {
              dObj.classesMap.set(cId, { id: cId, name: cName, students: [] });
            }
          });
        });
      });
    }

    // Next, assign all students to departments and classes
    localStudents.forEach((st: any) => {
      const dName = st.department_name || st.academic_identity?.department_name || 'General Department';
      const dId = String(st.department_id || st.academic_identity?.department_id || dName).trim();
      const cName = st.class_name || st.academic_identity?.class_name || 'Section A';
      const cId = String(st.class_id || st.academic_identity?.class_id || cName).trim();

      // Find or create dept
      let dObj = deptMap.get(dId);
      if (!dObj) {
        for (const val of deptMap.values()) {
          if (val.name.toLowerCase() === dName.toLowerCase()) {
            dObj = val;
            break;
          }
        }
      }
      if (!dObj) {
        dObj = {
          id: dId,
          name: dName,
          classesMap: new Map(),
          students: [],
        };
        deptMap.set(dId, dObj);
      }

      dObj.students.push(st);

      // Find or create class
      let cObj = dObj.classesMap.get(cId);
      if (!cObj) {
        for (const cVal of dObj.classesMap.values()) {
          if (cVal.name.toLowerCase() === cName.toLowerCase()) {
            cObj = cVal;
            break;
          }
        }
      }
      if (!cObj) {
        cObj = { id: cId, name: cName, students: [] };
        dObj.classesMap.set(cId, cObj);
      }

      cObj.students.push(st);
    });

    // Format list of departments
    let totalStudentsCount = 0;
    let totalClassesCount = 0;
    let totalResumesCount = 0;
    let totalCgpaSum = 0;
    let totalCgpaValidStudents = 0;

    const list = Array.from(deptMap.values()).map((d, index) => {
      const classesList = Array.from(d.classesMap.values()).map((c) => {
        const cStudents = c.students;
        const validCgpas = cStudents.filter((s) => Number(s.cgpa) > 0);
        const cAvgCgpa = validCgpas.length > 0
          ? validCgpas.reduce((acc, s) => acc + Number(s.cgpa), 0) / validCgpas.length
          : 0;
        const cResumes = cStudents.filter((s) => Boolean(s.resume_url || s.documents?.resume)).length;
        const cBacklogs = cStudents.filter((s) => (s.active_backlogs || 0) > 0).length;

        const firstSt = cStudents[0];
        const batch = firstSt?.batch_label || '2023–2027';
        const studyYear = firstSt?.study_year_label || `${firstSt?.current_study_year || 4}th Year`;
        const semester = firstSt?.semester_label || `${firstSt?.current_semester || 7}th Sem`;

        return {
          id: c.id,
          name: c.name,
          students: cStudents,
          studentCount: cStudents.length,
          avgCgpa: cAvgCgpa,
          resumesUploaded: cResumes,
          missingResumes: cStudents.length - cResumes,
          activeBacklogsCount: cBacklogs,
          batchLabel: batch,
          studyYearLabel: studyYear,
          semesterLabel: semester,
        };
      });

      const dStudents = d.students;
      const dValidCgpas = dStudents.filter((s) => Number(s.cgpa) > 0);
      const dAvgCgpa = dValidCgpas.length > 0
        ? dValidCgpas.reduce((acc, s) => acc + Number(s.cgpa), 0) / dValidCgpas.length
        : 0;
      const dResumes = dStudents.filter((s) => Boolean(s.resume_url || s.documents?.resume)).length;
      const dBacklogs = dStudents.filter((s) => (s.active_backlogs || 0) > 0).length;

      totalStudentsCount += dStudents.length;
      totalClassesCount += classesList.length;
      totalResumesCount += dResumes;
      dValidCgpas.forEach((s) => {
        totalCgpaSum += Number(s.cgpa);
        totalCgpaValidStudents++;
      });

      const colorScheme = DEPT_COLORS[index % DEPT_COLORS.length];

      return {
        id: d.id,
        name: d.name,
        classes: classesList,
        students: dStudents,
        studentCount: dStudents.length,
        avgCgpa: dAvgCgpa,
        resumesUploaded: dResumes,
        missingResumes: dStudents.length - dResumes,
        activeBacklogsCount: dBacklogs,
        colorScheme,
      };
    });

    list.sort((a, b) => b.studentCount - a.studentCount || a.name.localeCompare(b.name));

    const overallAvgCgpa = totalCgpaValidStudents > 0 ? totalCgpaSum / totalCgpaValidStudents : 0;

    return {
      departmentList: list,
      totalStats: {
        totalDepartments: list.length,
        totalClasses: totalClassesCount,
        totalStudents: totalStudentsCount,
        totalResumes: totalResumesCount,
        missingResumes: totalStudentsCount - totalResumesCount,
        overallAvgCgpa,
      },
    };
  }, [students, hierarchy]);

  // Current selected department and class objects
  const selectedDepartment = useMemo(() => {
    if (!selectedDeptId) return null;
    return departmentList.find((d) => d.id === selectedDeptId) || null;
  }, [selectedDeptId, departmentList]);

  const selectedClass = useMemo(() => {
    if (!selectedDepartment || !selectedClassId) return null;
    return selectedDepartment.classes.find((c) => c.id === selectedClassId) || null;
  }, [selectedDepartment, selectedClassId]);

  // Filtered students for Level 3
  const classStudentsFiltered = useMemo(() => {
    if (!selectedClass) return [];
    return selectedClass.students.filter((st: any) => {
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
  }, [selectedClass, searchQuery, cgpaFilter, resumeFilter, backlogFilter]);

  // Handler to navigate back
  const handleGoBack = () => {
    if (selectedClassId) {
      setSelectedClassId(null);
      setSearchQuery('');
    } else if (selectedDeptId) {
      setSelectedDeptId(null);
      setSearchQuery('');
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Breadcrumb Trail */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setSelectedDeptId(null);
                setSelectedClassId(null);
                setSearchQuery('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: !selectedDeptId ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                border: 'none',
                color: !selectedDeptId ? '#2563EB' : 'var(--text-secondary)',
                fontWeight: !selectedDeptId ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: 8,
                transition: 'all 0.2s',
              }}
            >
              <BuildingIcon size={16} color={!selectedDeptId ? '#2563EB' : 'currentColor'} />
              <span>All Departments</span>
            </button>

            {selectedDepartment && (
              <>
                <ChevronRightIcon size={14} color="var(--text-secondary)" />
                <button
                  onClick={() => {
                    setSelectedClassId(null);
                    setSearchQuery('');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: selectedDeptId && !selectedClassId ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                    border: 'none',
                    color: selectedDeptId && !selectedClassId ? '#2563EB' : 'var(--text-secondary)',
                    fontWeight: selectedDeptId && !selectedClassId ? 700 : 500,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  <span>{selectedDepartment.name}</span>
                </button>
              </>
            )}

            {selectedClass && (
              <>
                <ChevronRightIcon size={14} color="var(--text-secondary)" />
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: '#2563EB',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    padding: '4px 10px',
                    borderRadius: 8,
                  }}
                >
                  <ClassIcon size={16} color="#2563EB" />
                  <span>Class {selectedClass.name}</span>
                </span>
              </>
            )}
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: 4 }}>
            {!selectedDepartment && (
              <span>Select a department to view enrolled classes & student cohorts.</span>
            )}
            {selectedDepartment && !selectedClass && (
              <span>Showing classes under <strong>{selectedDepartment.name}</strong>. Select a class to view student profiles.</span>
            )}
            {selectedClass && (
              <span>Viewing students enrolled in <strong>{selectedDepartment?.name} • Class {selectedClass.name}</strong></span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(selectedDeptId || selectedClassId) && (
            <button
              onClick={handleGoBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 38,
                background: 'var(--bg-main, #F8FAFC)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '0 14px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <ArrowLeftIcon size={14} color="currentColor" />
              <span>Back</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Students & Hierarchy"
              style={{
                height: 38,
                width: 38,
                background: 'var(--bg-main, #F8FAFC)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
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

          {onShowBulkUpload && (
            <button
              onClick={onShowBulkUpload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 38,
                background: '#0B192C',
                color: '#FFFFFF',
                border: 'none',
                padding: '0 16px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <UploadIcon size={16} />
              <span>{showBulkUpload ? 'Hide Bulk Upload' : 'Bulk Upload'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── LEVEL 1: DEPARTMENT CARDS ──────────────────────────────────────── */}
      {!selectedDeptId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary Metric Stats Banner */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
            }}
          >
            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border-color)',
                borderRadius: 14,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Total Departments
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4F46E5', marginTop: 4 }}>
                {totalStats.totalDepartments}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Program: {programName}
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border-color)',
                borderRadius: 14,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Total Classes & Sections
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0284C7', marginTop: 4 }}>
                {totalStats.totalClasses}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Across all departments
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border-color)',
                borderRadius: 14,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Total Enrolled Students
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#059669', marginTop: 4 }}>
                {totalStats.totalStudents}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Scoped to your institution
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border-color)',
                borderRadius: 14,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Average CGPA
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#D97706', marginTop: 4 }}>
                {totalStats.overallAvgCgpa > 0 ? totalStats.overallAvgCgpa.toFixed(2) : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Institution Academic Avg
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                border: '1px solid var(--border-color)',
                borderRadius: 14,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Resume Readiness
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
                {totalStats.totalStudents > 0
                  ? `${Math.round((totalStats.totalResumes / totalStats.totalStudents) * 100)}%`
                  : '0%'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                {totalStats.totalResumes} / {totalStats.totalStudents} uploaded
              </div>
            </div>
          </div>

          {/* Department Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 20,
            }}
          >
            {departmentList.map((dept) => {
              const deptInitials = dept.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 3);

              const resumeRate = dept.studentCount > 0
                ? Math.round((dept.resumesUploaded / dept.studentCount) * 100)
                : 0;

              return (
                <div
                  key={dept.id}
                  onClick={() => {
                    setSelectedDeptId(dept.id);
                    setSelectedClassId(null);
                    setSearchQuery('');
                  }}
                  style={{
                    background: 'var(--card-bg, #FFFFFF)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 18,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                    transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.08)';
                    e.currentTarget.style.borderColor = dept.colorScheme.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
                    e.currentTarget.style.borderColor = 'var(--border-color, rgba(0,0,0,0.08))';
                  }}
                >
                  {/* Department Card Header Banner */}
                  <div
                    style={{
                      background: dept.colorScheme.bg,
                      padding: '20px 22px',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          background: 'rgba(255, 255, 255, 0.2)',
                          backdropFilter: 'blur(4px)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1.05rem',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        {deptInitials}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                          {dept.name}
                        </h3>
                        <span style={{ fontSize: '0.78rem', opacity: 0.85 }}>
                          Department Code: {deptInitials}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
                    {/* Stats Row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 10,
                        background: 'var(--bg-main, #F8FAFC)',
                        padding: 12,
                        borderRadius: 12,
                        textAlign: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Classes
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                          {dept.classes.length}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Students
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#4F46E5', marginTop: 2 }}>
                          {dept.studentCount}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Avg CGPA
                        </div>
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

                    {/* Classes Preview Tags */}
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                        Enrolled Classes & Sections:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {dept.classes.slice(0, 4).map((c) => (
                          <span
                            key={c.id}
                            style={{
                              background: dept.colorScheme.soft,
                              color: dept.colorScheme.text,
                              border: `1px solid ${dept.colorScheme.border}`,
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            Class {c.name} ({c.studentCount})
                          </span>
                        ))}
                        {dept.classes.length > 4 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '3px 4px' }}>
                            +{dept.classes.length - 4} more
                          </span>
                        )}
                        {dept.classes.length === 0 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            No active classes
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Resume Upload Status Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Resume Uploads</span>
                        <span style={{ color: '#16A34A', fontWeight: 700 }}>{resumeRate}% ({dept.resumesUploaded}/{dept.studentCount})</span>
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
                            width: `${resumeRate}%`,
                            background: 'linear-gradient(90deg, #10B981, #22C55E)',
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>

                    {/* Card Footer Button */}
                    <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          color: dept.colorScheme.text,
                          fontWeight: 700,
                          fontSize: '0.85rem',
                        }}
                      >
                        <span>Explore {dept.classes.length} Classes</span>
                        <ChevronRightIcon size={14} color="currentColor" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LEVEL 2: CLASS CARDS (UNDER SELECTED DEPARTMENT) ───────────────── */}
      {selectedDepartment && !selectedClassId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Department Banner Card */}
          <div
            style={{
              background: selectedDepartment.colorScheme.bg,
              padding: '24px 28px',
              borderRadius: 16,
              color: '#FFFFFF',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>
                  {selectedDepartment.name}
                </h2>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    padding: '3px 10px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  {selectedDepartment.classes.length} Classes
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '0.88rem' }}>
                Total {selectedDepartment.studentCount} enrolled students across all sections
              </p>
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Department Avg CGPA</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                  {selectedDepartment.avgCgpa > 0 ? selectedDepartment.avgCgpa.toFixed(2) : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Resumes Ready</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                  {selectedDepartment.resumesUploaded} / {selectedDepartment.studentCount}
                </div>
              </div>
            </div>
          </div>

          {/* Classes Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 18,
            }}
          >
            {selectedDepartment.classes.map((cls) => {
              const resRate = cls.studentCount > 0 ? Math.round((cls.resumesUploaded / cls.studentCount) * 100) : 0;

              return (
                <div
                  key={cls.id}
                  onClick={() => {
                    setSelectedClassId(cls.id);
                    setSearchQuery('');
                  }}
                  style={{
                    background: 'var(--card-bg, #FFFFFF)',
                    border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                    borderRadius: 16,
                    padding: 20,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 14,
                    height: '100%',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.08)';
                    e.currentTarget.style.borderColor = '#3B82F6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                    e.currentTarget.style.borderColor = 'var(--border-color, rgba(0,0,0,0.08))';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: '#2563EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ClassIcon size={20} color="#2563EB" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Class {cls.name}
                        </h3>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {cls.batchLabel}
                        </span>
                      </div>
                    </div>

                    <span
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#2563EB',
                        padding: '3px 8px',
                        borderRadius: 8,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {cls.studentCount} Students
                    </span>
                  </div>

                  {/* Class Timeline Chips */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'var(--bg-main, #F8FAFC)',
                        border: '1px solid var(--border-color)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <ClockIcon size={12} color="var(--text-secondary)" />
                      <span>{cls.studyYearLabel} • {cls.semesterLabel}</span>
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: 'var(--bg-main, #F8FAFC)',
                        border: '1px solid var(--border-color)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <AnalyticsIcon size={12} color="var(--text-secondary)" />
                      <span>Avg CGPA: <strong style={{ color: 'var(--text-primary)' }}>{cls.avgCgpa > 0 ? cls.avgCgpa.toFixed(2) : '—'}</strong></span>
                    </span>
                  </div>

                  {/* Resumes Progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Resume Status</span>
                      <strong style={{ color: resRate >= 80 ? '#16A34A' : '#D97706' }}>
                        {resRate}% ({cls.resumesUploaded}/{cls.studentCount})
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

                  <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontWeight: 700, fontSize: '0.85rem' }}>
                      <span>View {cls.studentCount} Students</span>
                      <ChevronRightIcon size={14} color="#2563EB" />
                    </span>
                  </div>
                </div>
              );
            })}

            {selectedDepartment.classes.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: 40,
                  background: 'var(--card-bg)',
                  borderRadius: 16,
                  color: 'var(--text-secondary)',
                }}
              >
                No classes registered under this department yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LEVEL 3: STUDENTS IN SELECTED CLASS ────────────────────────────── */}
      {selectedDepartment && selectedClass && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Class Header Banner */}
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color)',
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
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedDepartment.name} • Class {selectedClass.name}
                </h2>
                <span
                  style={{
                    background: 'rgba(37, 99, 235, 0.1)',
                    color: '#2563EB',
                    padding: '2px 10px',
                    borderRadius: 12,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  {selectedClass.studentCount} Students
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selectedClass.batchLabel} &bull; {selectedClass.studyYearLabel} &bull; {selectedClass.semesterLabel}
              </p>
            </div>

            {/* Quick Metrics in Class */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ background: 'var(--bg-main)', padding: '6px 14px', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Class Avg CGPA</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  {selectedClass.avgCgpa > 0 ? selectedClass.avgCgpa.toFixed(2) : '—'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '6px 14px', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Resumes</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {selectedClass.resumesUploaded} / {selectedClass.studentCount}
                </div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '6px 14px', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Active Backlogs</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: selectedClass.activeBacklogsCount === 0 ? '#16A34A' : '#DC2626', marginTop: 2 }}>
                  {selectedClass.activeBacklogsCount}
                </div>
              </div>
            </div>
          </div>

          {/* Search, Filters, and View Switcher Row */}
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--border-color)',
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
              <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
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
                  border: '1px solid var(--border-color)',
                  background: 'var(--input-bg, #F9FAFB)',
                  color: 'var(--text-primary)',
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
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main, #F8FAFC)',
                    color: 'var(--text-primary)',
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
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }}>
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
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main, #F8FAFC)',
                    color: 'var(--text-primary)',
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
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }}>
                  <ChevronDownIcon size={14} />
                </div>
              </div>

              {/* View Mode Switcher */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-main, #F8FAFC)',
                  border: '1px solid var(--border-color)',
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
                    color: viewMode === 'cards' ? '#FFFFFF' : 'var(--text-secondary)',
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
                    color: viewMode === 'table' ? '#FFFFFF' : 'var(--text-secondary)',
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
          {classStudentsFiltered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 24px',
                background: 'var(--card-bg, #FFFFFF)',
                borderRadius: 16,
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                <SearchIcon size={36} />
              </div>
              <h3 style={{ margin: '4px 0 0 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>
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
              {classStudentsFiltered.map((st) => {
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
                            color: 'var(--text-primary)',
                            fontSize: '0.95rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {sName}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <IdCardIcon size={12} color="var(--text-secondary)" />
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
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>CGPA</span>
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
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Backlogs</span>
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
                        borderTop: '1px solid var(--border-color)',
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
                border: '1px solid var(--border-color)',
                borderRadius: 16,
                overflowX: 'auto',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.82rem',
                      textAlign: 'left',
                      background: 'var(--bg-main)',
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
                  {classStudentsFiltered.map((st) => {
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
                          borderBottom: '1px solid var(--border-color)',
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-main)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', verticalAlign: 'middle' }}>
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
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, verticalAlign: 'middle' }}>
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
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.82rem', verticalAlign: 'middle' }}>
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
