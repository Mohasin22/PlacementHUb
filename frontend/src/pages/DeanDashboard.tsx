import React, { useState, useEffect, useCallback } from 'react';

const API = 'http://127.0.0.1:8000/api';

interface DeanDashboardProps {
  token: string;
  institutionId: string;
  userName: string;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

type Tab = 'overview' | 'drives' | 'students' | 'staff' | 'analytics';

export const DeanDashboard: React.FC<DeanDashboardProps> = ({ token, institutionId, activeTab, setActiveTab }) => {
  const [tab, setTabState] = useState<Tab>('overview');

  const setTab = (t: Tab) => {
    setTabState(t);
    if (setActiveTab) setActiveTab(t);
  };

  useEffect(() => {
    if (activeTab && activeTab !== tab) {
      setTabState(activeTab as Tab);
    }
  }, [activeTab]);
  const [stats, setStats] = useState<any>(null);
  const [deptStats, setDeptStats] = useState<any[]>([]);
  const [progStats, setProgStats] = useState<any[]>([]);
  const [drives, setDrives] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilters, setStudentFilters] = useState<any>({});
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'ALL' | 'TPO' | 'Faculty'>('ALL');
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ role: 'TPO' as 'TPO' | 'Faculty', name: '', email: '', password: '', phone: '', program_id: '', department_id: '', class_id: '' });
  const [staffError, setStaffError] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsR, deptR, progR, drivesR, studentsR, staffR, hierR] = await Promise.all([
        fetch(`${API}/dean/stats`, { headers }),
        fetch(`${API}/dean/stats/by-department`, { headers }),
        fetch(`${API}/dean/stats/by-program`, { headers }),
        fetch(`${API}/dean/drives`, { headers }),
        fetch(`${API}/dean/students`, { headers }),
        fetch(`${API}/dean/users`, { headers }),
        fetch(`${API}/institutions/${institutionId}/hierarchy`),
      ]);
      if (statsR.ok) setStats(await statsR.json());
      if (deptR.ok) setDeptStats(await deptR.json());
      if (progR.ok) setProgStats(await progR.json());
      if (drivesR.ok) setDrives(await drivesR.json());
      if (studentsR.ok) setStudents(await studentsR.json());
      if (staffR.ok) setStaff(await staffR.json());
      if (hierR.ok) setHierarchy((await hierR.json()).hierarchy || []);
    } finally {
      setLoading(false);
    }
  }, [token, institutionId]);

  useEffect(() => { load(); }, [load]);

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase();
    const matchesSearch = !q || s.name?.toLowerCase().includes(q) ||
      s.roll_number?.toLowerCase().includes(q) ||
      s.department_name?.toLowerCase().includes(q) ||
      s.emails?.institute?.toLowerCase().includes(q) ||
      s.emails?.personal?.toLowerCase().includes(q);
    const matchesDept = !studentFilters.dept || s.department_name === studentFilters.dept;
    const matchesProg = !studentFilters.program || s.program_name === studentFilters.program;
    const matchesStatus = !studentFilters.status || s.status === studentFilters.status;
    const matchesCgpa = !studentFilters.cgpa || (
      studentFilters.cgpa === '9+' ? s.cgpa >= 9 :
        studentFilters.cgpa === '8+' ? s.cgpa >= 8 :
          studentFilters.cgpa === '7+' ? s.cgpa >= 7 :
            studentFilters.cgpa === '6+' ? s.cgpa >= 6 :
              studentFilters.cgpa === '<6' ? s.cgpa < 6 : true
    );
    return matchesSearch && matchesDept && matchesProg && matchesStatus && matchesCgpa;
  });

  const getProgramName = (progId?: string) => {
    if (!progId) return null;
    const found = hierarchy.find(h => h.id === progId);
    return found ? found.name : null;
  };

  const getClassInfo = (classId?: string) => {
    if (!classId) return null;
    for (const prog of hierarchy) {
      for (const dept of prog.departments || []) {
        for (const cls of dept.classes || []) {
          if (cls.id === classId) {
            return `${prog.name} → ${dept.name} (${cls.name})`;
          }
        }
      }
    }
    return null;
  };

  const selectedDeptClasses = (() => {
    if (!staffForm.department_id) return [];
    for (const p of hierarchy) {
      for (const d of p.departments || []) {
        if (d.id === staffForm.department_id) {
          return d.classes || [];
        }
      }
    }
    return [];
  })();

  const filteredStaff = staff.filter(u => {
    const q = staffSearch.toLowerCase();
    const matchesSearch = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    const matchesRole = staffRoleFilter === 'ALL' || u.role === staffRoleFilter;
    return matchesSearch && matchesRole;
  });

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    setStaffLoading(true);
    try {
      if (staffForm.role === 'TPO') {
        if (!staffForm.program_id) throw new Error('Please select a program for the TPO.');
        const res = await fetch(`${API}/institutions/tpo`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: staffForm.name,
            email: staffForm.email,
            password: staffForm.password,
            phone: staffForm.phone || null,
            program_id: staffForm.program_id
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to appoint TPO');
      } else {
        if (!staffForm.class_id) throw new Error('Please select a class for the Faculty Coordinator.');
        const res = await fetch(`${API}/faculty/register`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: staffForm.name,
            email: staffForm.email,
            password: staffForm.password,
            phone: staffForm.phone || null,
            class_id: staffForm.class_id
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to appoint Faculty Coordinator');
      }
      setShowStaffModal(false);
      setStaffForm({ role: 'TPO', name: '', email: '', password: '', phone: '', program_id: '', department_id: '', class_id: '' });
      load();
    } catch (err: any) {
      setStaffError(err.message || 'Operation failed');
    } finally {
      setStaffLoading(false);
    }
  };

  const handleDeactivateStaff = async (userId: string, name: string, role: string) => {
    if (!window.confirm(`Are you sure you want to deactivate ${role} account for "${name}"?`)) return;
    try {
      const res = await fetch(`${API}/dean/users/${userId}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to deactivate user');
      load();
    } catch (err: any) {
      alert(err.message || 'Error deactivating user');
    }
  };

  return (
    <div className="bg-background text-on-surface min-h-screen font-body-md">
      <main className="py-md">
        <div className="max-w-container-max mx-auto">

          <div className="flex justify-between items-end mb-xl">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Dean's Dashboard</h1>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">Campus Placement Overview & Strategic Analytics</p>
            </div>
            <div className="flex gap-sm">
              <button onClick={load} className="flex items-center gap-xs px-md py-sm bg-surface-container-lowest border border-outline-variant text-label-md font-semibold rounded-lg hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-primary mr-2">autorenew</span>
              Loading analytics...
            </div>
          ) : (
            <>
              {tab === 'overview' && stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-lg mb-2xl">
                    <KpiCard title="Total Students" value={stats.students.total} sub={`${stats.students.verified} verified`} />
                    <KpiCard title="Placed Students" value={stats.applications.placed} sub="Batch 2024" />
                    <KpiCard title="Placement %" value={`${stats.placement_rate_percent}%`} highlight={true} progress={stats.placement_rate_percent} />
                    <KpiCard title="Placement Drives" value={stats.drives.total} sub={`${stats.drives.active} active`} />
                    <KpiCard title="Staff Members" value={stats.staff.tpos + stats.staff.faculty} sub="TPOs & Faculty" />
                    <KpiCard title="Total Applicants" value={stats.applications.total} sub="Across all drives" />
                  </div>

                  <div className="bento-grid mb-2xl">
                    {/* Department Breakdown */}
                    <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest p-xl rounded-xl card-shadow">
                      <div className="mb-lg">
                        <h2 className="text-headline-sm font-headline-sm text-on-surface">Department-wise Breakdown</h2>
                        <p className="text-body-sm text-on-surface-variant">Placement Rate by Department</p>
                      </div>
                      <div className="space-y-lg">
                        {deptStats.length === 0 ? <p className="text-body-sm text-on-surface-variant">No data.</p> : deptStats.map(d => (
                          <div key={d.department_id} className="space-y-xs">
                            <div className="flex justify-between items-center text-label-md">
                              <span className="font-bold text-on-surface">{d.department_name}</span>
                              <span className="text-primary font-semibold">{d.placement_rate}% ({d.placed}/{d.total_students})</span>
                            </div>
                            <div className="h-2 w-full bg-surface-container-high rounded-full flex overflow-hidden">
                              <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${d.placement_rate}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Program Breakdown */}
                    <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest p-xl rounded-xl card-shadow overflow-x-auto">
                      <div className="mb-lg">
                        <h2 className="text-headline-sm font-headline-sm text-on-surface">Program Summary</h2>
                      </div>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-outline-variant text-label-md text-on-surface-variant uppercase">
                            <th className="pb-sm font-medium">Program</th>
                            <th className="pb-sm font-medium text-center">Students</th>
                            <th className="pb-sm font-medium text-center">Placed</th>
                            <th className="pb-sm font-medium text-center">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant">
                          {progStats.map(p => (
                            <tr key={p.program_id} className="text-body-sm">
                              <td className="py-sm font-semibold">{p.program_name}</td>
                              <td className="py-sm text-center">{p.total_students}</td>
                              <td className="py-sm text-center text-green-600 font-bold">{p.placed}</td>
                              <td className="py-sm text-center">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${p.placement_rate > 50 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {p.placement_rate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-lg">
                    {/* Recent Drives */}
                    <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-xl card-shadow overflow-hidden">
                      <div className="px-xl py-lg border-b border-outline-variant flex justify-between items-center">
                        <h2 className="text-headline-sm font-headline-sm text-on-surface">Recent Placement Drives</h2>
                        <button onClick={() => setTab('drives')} className="text-label-sm font-bold text-primary px-md py-xs rounded-full hover:bg-primary-container/10 transition-colors">View All</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-surface-container-low/50">
                              <th className="px-xl py-md text-label-md text-on-surface-variant border-b border-outline-variant">Company</th>
                              <th className="px-xl py-md text-label-md text-on-surface-variant border-b border-outline-variant">Role</th>
                              <th className="px-xl py-md text-label-md text-on-surface-variant border-b border-outline-variant">Deadline</th>
                              <th className="px-xl py-md text-label-md text-on-surface-variant border-b border-outline-variant">Applicants</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant">
                            {drives.slice(0, 5).map(d => (
                              <tr key={d.id} className="hover:bg-surface-container-low/30 transition-colors">
                                <td className="px-xl py-md font-medium text-body-sm">{d.company_name}</td>
                                <td className="px-xl py-md text-body-sm">{d.job_role}</td>
                                <td className="px-xl py-md text-body-sm text-on-surface-variant">{new Date(d.deadline).toLocaleDateString()}</td>
                                <td className="px-xl py-md text-body-sm font-semibold">{d.applicants}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {tab === 'students' && (
                <div className="bg-surface-container-lowest rounded-xl card-shadow overflow-hidden">
                  {/* Filter Bar */}
                  <div className="px-xl py-lg border-b border-outline-variant bg-surface-container-low/50">
                    <div className="flex justify-between items-center mb-md">
                      <h2 className="text-headline-sm font-headline-sm text-on-surface">Student Registry</h2>
                      <span style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>{filteredStudents.length} / {students.length} students</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                      <input
                        className="bg-white border border-outline-variant rounded-lg px-md py-sm text-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="🔍 Name, roll, email..."
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                      />
                      <select
                        className="bg-white border border-outline-variant rounded-lg px-md py-sm text-body-sm outline-none focus:border-primary"
                        value={(studentFilters as any)?.dept || ''}
                        onChange={e => setStudentFilters((f: any) => ({ ...f, dept: e.target.value }))}
                      >
                        <option value="">All Departments</option>
                        {[...new Set(students.map(s => s.department_name).filter(Boolean))].map((d: any) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <select
                        className="bg-white border border-outline-variant rounded-lg px-md py-sm text-body-sm outline-none focus:border-primary"
                        value={(studentFilters as any)?.program || ''}
                        onChange={e => setStudentFilters((f: any) => ({ ...f, program: e.target.value }))}
                      >
                        <option value="">All Programs</option>
                        {[...new Set(students.map(s => s.program_name).filter(Boolean))].map((p: any) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <select
                        className="bg-white border border-outline-variant rounded-lg px-md py-sm text-body-sm outline-none focus:border-primary"
                        value={(studentFilters as any)?.status || ''}
                        onChange={e => setStudentFilters((f: any) => ({ ...f, status: e.target.value }))}
                      >
                        <option value="">All Statuses</option>
                        <option value="verified">Verified</option>
                        <option value="pending">Pending</option>
                      </select>
                      <select
                        className="bg-white border border-outline-variant rounded-lg px-md py-sm text-body-sm outline-none focus:border-primary"
                        value={(studentFilters as any)?.cgpa || ''}
                        onChange={e => setStudentFilters((f: any) => ({ ...f, cgpa: e.target.value }))}
                      >
                        <option value="">All CGPAs</option>
                        <option value="9+">9.0+</option>
                        <option value="8+">8.0+</option>
                        <option value="7+">7.0+</option>
                        <option value="6+">6.0+</option>
                        <option value="<6">Below 6.0</option>
                      </select>
                      {((studentFilters as any)?.dept || (studentFilters as any)?.program || (studentFilters as any)?.status || (studentFilters as any)?.cgpa) && (
                        <button
                          className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-md py-sm text-body-sm font-semibold hover:bg-red-100"
                          onClick={() => setStudentFilters({})}
                        >
                          ✕ Clear Filters
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-surface-container-low/50">
                          {['Name', 'Roll No.', 'Program', 'Department', 'CGPA', 'Backlogs', 'Status'].map(h => <th key={h} className="px-xl py-md text-label-md text-on-surface-variant border-b border-outline-variant">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {filteredStudents.map(st => (
                          <tr key={st.id} className="hover:bg-surface-container-low/30 transition-colors">
                            <td className="px-xl py-md font-medium text-body-sm">{st.name}</td>
                            <td className="px-xl py-md text-body-sm text-primary font-mono text-xs">{st.roll_number}</td>
                            <td className="px-xl py-md text-body-sm">{st.program_name}</td>
                            <td className="px-xl py-md text-body-sm">{st.department_name}</td>
                            <td className="px-xl py-md text-body-sm font-bold">
                              <span style={{ color: st.cgpa >= 8 ? '#10B981' : st.cgpa >= 6 ? '#F59E0B' : '#EF4444' }}>
                                {st.cgpa?.toFixed(1)}
                              </span>
                            </td>
                            <td className="px-xl py-md text-body-sm">{st.active_backlogs ?? '—'}</td>
                            <td className="px-xl py-md">
                              <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${st.status === 'verified' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {st.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredStudents.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>No students match the selected filters.</div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'staff' && (
                <div className="space-y-lg">
                  {/* Staff Header Toolbar */}
                  <div className="bg-surface-container-lowest p-md rounded-xl card-shadow flex flex-wrap gap-md justify-between items-center">
                    <div className="flex flex-wrap items-center gap-md flex-1">
                      <div className="relative min-w-[240px] flex-1">
                        <input
                          type="text"
                          placeholder="Search staff by name or email..."
                          className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-md pr-md py-sm text-body-sm outline-none focus:border-primary"
                          value={staffSearch}
                          onChange={e => setStaffSearch(e.target.value)}
                        />
                      </div>
                      <select
                        className="bg-surface-container-low border border-outline-variant rounded-lg px-md py-sm text-body-sm outline-none focus:border-primary"
                        value={staffRoleFilter}
                        onChange={e => setStaffRoleFilter(e.target.value as any)}
                      >
                        <option value="ALL">All Roles ({staff.length})</option>
                        <option value="TPO">TPOs Only ({staff.filter(s => s.role === 'TPO').length})</option>
                        <option value="Faculty">Faculty Coordinators Only ({staff.filter(s => s.role === 'Faculty').length})</option>
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        setStaffError('');
                        setStaffForm({ role: 'TPO', name: '', email: '', password: '', phone: '', program_id: '', department_id: '', class_id: '' });
                        setShowStaffModal(true);
                      }}
                      className="px-md py-sm bg-primary text-on-primary font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-xs text-body-sm"
                    >
                      <span className="material-symbols-outlined text-[18px]">person_add</span>
                      Appoint Staff Member
                    </button>
                  </div>

                  {/* Staff Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
                    {filteredStaff.map(u => {
                      const progName = getProgramName(u.program_id);
                      const classInfo = getClassInfo(u.class_id);
                      return (
                        <div key={u.id} className="bg-surface-container-lowest rounded-xl card-shadow p-lg flex flex-col justify-between border border-outline-variant/40 hover:border-primary/40 transition-colors">
                          <div className="flex items-start gap-md">
                            <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${u.role === 'TPO' ? 'bg-primary' : 'bg-green-600'}`}>
                              {u.name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-body-sm text-on-surface truncate">{u.name}</div>
                              <div className="text-xs text-on-surface-variant truncate mt-0.5">{u.email}</div>
                              {u.phone && <div className="text-xs text-on-surface-variant/80 mt-0.5">📞 {u.phone}</div>}
                              <div className={`text-[10px] font-bold uppercase mt-2 w-max px-2 py-0.5 rounded ${u.role === 'TPO' ? 'bg-primary/10 text-primary' : 'bg-green-100 text-green-700'}`}>
                                {u.role === 'TPO' ? 'Training & Placement Officer' : 'Faculty Coordinator'}
                              </div>
                            </div>
                          </div>

                          <div className="mt-md pt-md border-t border-outline-variant/40 flex justify-between items-center text-xs text-on-surface-variant">
                            <div className="truncate flex-1 pr-2">
                              {u.role === 'TPO' && (
                                <span>Program: <strong>{progName || 'All Programs'}</strong></span>
                              )}
                              {u.role === 'Faculty' && (
                                <span>Class: <strong>{classInfo || 'Assigned Class'}</strong></span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeactivateStaff(u.id, u.name, u.role)}
                              className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex items-center gap-0.5 text-xs font-semibold"
                              title="Deactivate Staff Account"
                            >
                              <span className="material-symbols-outlined text-[16px]">person_remove</span>
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredStaff.length === 0 && (
                    <div className="bg-surface-container-lowest rounded-xl p-xl text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-4xl text-outline mb-2">badge</span>
                      <p className="font-medium">No staff members found matching your search or filters.</p>
                      <button
                        onClick={() => {
                          setStaffError('');
                          setStaffForm({ role: 'TPO', name: '', email: '', password: '', phone: '', program_id: '', department_id: '', class_id: '' });
                          setShowStaffModal(true);
                        }}
                        className="mt-4 px-md py-sm bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary/20 text-sm"
                      >
                        + Appoint New Staff Member
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === 'drives' && (
                <div className="bg-surface-container-lowest rounded-xl card-shadow overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-surface-container-low/50">
                        {['Company', 'Role', 'Package', 'Location', 'Deadline', 'Applicants'].map(h => <th key={h} className="px-xl py-md text-label-md text-on-surface-variant border-b border-outline-variant">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {drives.map(d => (
                        <tr key={d.id} className="hover:bg-surface-container-low/30 transition-colors">
                          <td className="px-xl py-md font-medium text-body-sm">{d.company_name}</td>
                          <td className="px-xl py-md text-body-sm">{d.job_role}</td>
                          <td className="px-xl py-md text-body-sm text-green-600 font-bold">{d.package}</td>
                          <td className="px-xl py-md text-body-sm text-on-surface-variant">{d.location}</td>
                          <td className="px-xl py-md text-body-sm text-on-surface-variant">{new Date(d.deadline).toLocaleDateString()}</td>
                          <td className="px-xl py-md text-body-sm font-semibold">{d.applicants}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Staff Appointment Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-md">
          <div className="bg-white p-xl rounded-xl w-full max-w-[440px] shadow-2xl animate-fade-in">
            <h3 className="font-headline-sm text-headline-sm mb-md text-on-surface">Appoint Staff Member</h3>
            <p className="text-xs text-on-surface-variant mb-lg">Assign a new TPO or Faculty Coordinator to manage placements.</p>

            {/* Role Selection Tabs */}
            <div className="flex bg-surface-container-low p-1 rounded-lg mb-lg">
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${staffForm.role === 'TPO' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setStaffForm({ ...staffForm, role: 'TPO' })}
              >
                Appoint TPO
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${staffForm.role === 'Faculty' ? 'bg-white text-green-700 shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setStaffForm({ ...staffForm, role: 'Faculty' })}
              >
                Appoint Faculty
              </button>
            </div>

            {staffError && <div className="text-red-600 bg-red-50 border border-red-200 p-sm rounded-lg mb-md text-xs font-medium">{staffError}</div>}

            <form onSubmit={handleCreateStaff} className="space-y-md">
              <div>
                <label className="text-xs font-semibold text-on-surface-variant block mb-1">Full Name *</label>
                <input
                  required
                  placeholder="e.g. Dr. Sarah Jenkins"
                  value={staffForm.name}
                  onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm text-body-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-on-surface-variant block mb-1">Email Address *</label>
                <input
                  required
                  type="email"
                  placeholder="name@institution.edu"
                  value={staffForm.email}
                  onChange={e => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm text-body-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-on-surface-variant block mb-1">Account Password *</label>
                <input
                  required
                  type="password"
                  placeholder="Set initial password"
                  value={staffForm.password}
                  onChange={e => setStaffForm({ ...staffForm, password: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm text-body-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-on-surface-variant block mb-1">Phone Number (Optional)</label>
                <input
                  placeholder="e.g. +91 9876543210"
                  value={staffForm.phone}
                  onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm text-body-sm outline-none focus:border-primary"
                />
              </div>

              {staffForm.role === 'TPO' ? (
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1">Assigned Program *</label>
                  <select
                    required
                    value={staffForm.program_id}
                    onChange={e => setStaffForm({ ...staffForm, program_id: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm text-body-sm outline-none focus:border-primary"
                  >
                    <option value="">Select Program to Assign</option>
                    {hierarchy.map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-md">
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant block mb-1">Department *</label>
                    <select
                      required
                      value={staffForm.department_id}
                      onChange={e => setStaffForm({ ...staffForm, department_id: e.target.value, class_id: '' })}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm text-body-sm outline-none focus:border-primary"
                    >
                      <option value="">-- Select Department --</option>
                      {hierarchy.map(p => (
                        <optgroup key={p.id} label={`Program: ${p.name}`}>
                          {p.departments?.map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant block mb-1">Assigned Class *</label>
                    <select
                      required
                      disabled={!staffForm.department_id}
                      value={staffForm.class_id}
                      onChange={e => setStaffForm({ ...staffForm, class_id: e.target.value })}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-sm text-body-sm outline-none focus:border-primary disabled:opacity-50"
                    >
                      <option value="">
                        {staffForm.department_id ? '-- Select Class --' : '-- Select Department First --'}
                      </option>
                      {selectedDeptClasses.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-sm mt-lg pt-sm border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-md py-sm rounded-lg hover:bg-surface-container-low font-semibold text-body-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffLoading}
                  className="px-md py-sm bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary/90 text-body-sm disabled:opacity-50"
                >
                  {staffLoading ? 'Appointing...' : `Appoint ${staffForm.role}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};



const KpiCard = ({ title, value, sub, highlight, progress }: { title: string, value: string | number, sub?: string, highlight?: boolean, progress?: number }) => (
  <div className={`bg-surface-container-lowest p-lg rounded-xl card-shadow flex flex-col justify-between ${highlight ? 'border-l-4 border-l-primary' : ''}`}>
    <span className="text-label-md font-label-md text-on-surface-variant">{title}</span>
    <div className="mt-md">
      <span className={`text-headline-md font-headline-md ${highlight ? 'text-primary' : ''}`}>{value}</span>
      {progress !== undefined && (
        <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2 overflow-hidden">
          <div className="bg-primary h-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
        </div>
      )}
      {sub && <div className="text-label-sm text-on-surface-variant mt-1">{sub}</div>}
    </div>
  </div>
);
