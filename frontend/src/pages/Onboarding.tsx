import React, { useState } from 'react';
import campusBg from '../assets/campus-bg.png';

const API_BASE = 'http://127.0.0.1:8000/api';

interface Department {
  name: string;
  classes?: string[];
}

interface Program {
  name: string;
  departments: Department[];
}

interface OnboardingProps {
  onSuccess: () => void;
  onBackToLogin?: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onSuccess, onBackToLogin }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Institution Details
  const [instName, setInstName] = useState('');
  const [instAddress, setInstAddress] = useState('');
  const [instWebsite, setInstWebsite] = useState('');
  const [instCode, setInstCode] = useState('');
  const [instLogo, setInstLogo] = useState('');

  // Step 2: Academic Structure
  const [programs, setPrograms] = useState<Program[]>([
    {
      name: 'B.Tech',
      departments: [
        { name: 'Computer Science & Engineering', classes: [] },
        { name: 'Electronics & Communication', classes: [] },
      ],
    },
    {
      name: 'MBA',
      departments: [
        { name: 'Finance', classes: [] },
      ],
    },
  ]);

  // Temporary inputs for Step 2
  const [newProgName, setNewProgName] = useState('');
  const [activeProgIdx, setActiveProgIdx] = useState<number>(0);
  const [newDeptName, setNewDeptName] = useState('');
  const [activeDeptIdx, setActiveDeptIdx] = useState<number>(0);

  // Step 3: Dean (Super Admin)
  const [deanName, setDeanName] = useState('');
  const [deanEmail, setDeanEmail] = useState('');
  const [deanPassword, setDeanPassword] = useState('');
  const [deanPhone, setDeanPhone] = useState('');

  // Derived helper references
  const currentProgram = programs[activeProgIdx];

  // Hierarchy Helpers
  const addProgram = () => {
    const name = newProgName.trim();
    if (!name) return;
    const newProgList = [...programs, { name, departments: [] }];
    setPrograms(newProgList);
    setNewProgName('');
    setActiveProgIdx(newProgList.length - 1);
    setActiveDeptIdx(0);
  };

  const addDepartment = () => {
    const name = newDeptName.trim();
    if (!name || activeProgIdx < 0 || activeProgIdx >= programs.length) return;
    const updated = [...programs];
    updated[activeProgIdx].departments.push({ name, classes: [] });
    setPrograms(updated);
    setNewDeptName('');
    setActiveDeptIdx(updated[activeProgIdx].departments.length - 1);
  };

  const removeProgram = (pIdx: number) => {
    const updated = programs.filter((_, idx) => idx !== pIdx);
    setPrograms(updated);
    if (activeProgIdx >= updated.length) {
      setActiveProgIdx(Math.max(0, updated.length - 1));
    }
    setActiveDeptIdx(0);
  };

  const removeDepartment = (pIdx: number, dIdx: number) => {
    const updated = [...programs];
    updated[pIdx].departments = updated[pIdx].departments.filter((_, idx) => idx !== dIdx);
    setPrograms(updated);
    if (activeDeptIdx >= updated[pIdx].departments.length) {
      setActiveDeptIdx(Math.max(0, updated[pIdx].departments.length - 1));
    }
  };

  const handleOnboard = async () => {
    setIsLoading(true);
    setError(null);

    const payload = {
      name: instName,
      address: instAddress,
      website: instWebsite,
      institution_code: instCode,
      logo_url: instLogo || null,
      programs: programs.map(p => ({
        name: p.name,
        departments: p.departments.map(d => ({
          name: d.name,
          classes: []
        }))
      })),
      dean: {
        name: deanName,
        email: deanEmail,
        password: deanPassword,
        phone: deanPhone || null
      }
    };

    try {
      const response = await fetch(`${API_BASE}/institutions/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Onboarding failed');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Onboarding failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Brand Header on top of the registration box */}
      <div className="mb-6 text-center select-none animate-fade-in">
        <div className="inline-flex items-center gap-2.5 mb-1.5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-[22px]">school</span>
          </div>
          <span className="text-3xl font-extrabold tracking-tight text-slate-900">
            Placement<span className="text-indigo-600">Hub</span>
          </span>
        </div>
        <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          Campus Recruitment & Career Portal
        </p>
      </div>

      <div className="glass-card animate-slide-up" style={styles.card}>
        {/* Step Indicator with subtle line-like moving progress structure */}
        <div style={styles.stepsIndicatorWrapper}>
          {/* Subtle background track line */}
          <div style={styles.progressTrackBackground}>
            {/* Moving active progress line */}
            <div
              style={{
                ...styles.progressTrackFill,
                width: `${((step - 1) / 3) * 100}%`,
              }}
            />
          </div>

          {/* Steps dot container */}
          <div style={styles.stepsContainer}>
            {[
              { id: 1, name: 'Details' },
              { id: 2, name: 'Structure' },
              { id: 3, name: 'Admin' },
              { id: 4, name: 'Confirm' },
            ].map(s => {
              const isCurrent = step === s.id;
              const isCompleted = step > s.id;
              return (
                <div
                  key={s.id}
                  style={styles.stepDotContainer}
                  onClick={() => {
                    if (s.id < step) setStep(s.id as any);
                  }}
                >
                  <div
                    style={{
                      ...styles.stepDot,
                      backgroundColor: isCurrent ? '#4F46E5' : isCompleted ? '#10B981' : '#FFFFFF',
                      color: isCurrent || isCompleted ? '#FFFFFF' : '#94A3B8',
                      borderColor: isCurrent ? '#4F46E5' : isCompleted ? '#10B981' : '#E2E8F0',
                      boxShadow: isCurrent ? '0 0 0 4px rgba(79, 70, 229, 0.15)' : 'none',
                      cursor: s.id < step ? 'pointer' : 'default',
                    }}
                  >
                    {isCompleted ? '✓' : s.id}
                  </div>
                  <span
                    style={{
                      ...styles.stepLabel,
                      color: isCurrent ? '#4F46E5' : isCompleted ? '#334155' : '#94A3B8',
                      fontWeight: isCurrent ? 700 : isCompleted ? 600 : 500,
                    }}
                  >
                    {s.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pb-4 mb-6 border-b border-slate-200">
          <h2 style={styles.title}>
            {step === 1 && 'Register Institution'}
            {step === 2 && 'Setup Academic Hierarchy'}
            {step === 3 && 'Dean Account Details'}
            {step === 4 && 'Confirm & Onboard'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {step === 1 && 'Enter the core information and branding for your campus placement portal.'}
            {step === 2 && 'Define degrees and academic departments / branches.'}
            {step === 3 && 'Configure the primary institution administrator credentials.'}
            {step === 4 && 'Verify all details before initializing the platform.'}
          </p>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}

        {/* Step 1: Details */}
        {step === 1 && (
          <div style={styles.form}>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Institution Name <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                type="text"
                placeholder="e.g. National Institute of Technology"
                value={instName}
                onChange={e => setInstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                type="text"
                placeholder="e.g. New Delhi, India"
                value={instAddress}
                onChange={e => setInstAddress(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Website <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                  type="url"
                  placeholder="https://nit.edu"
                  value={instWebsite}
                  onChange={e => setInstWebsite(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Code (Unique ID) <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                  type="text"
                  placeholder="e.g. NITD"
                  value={instCode}
                  onChange={e => setInstCode(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Logo URL <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                type="url"
                placeholder="https://example.com/logo.png"
                value={instLogo}
                onChange={e => setInstLogo(e.target.value)}
              />
            </div>
            <div style={styles.actions}>
              <button 
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                onClick={() => setStep(2)}
                disabled={!instName || !instAddress || !instWebsite || !instCode}
              >
                Continue Setup →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Academic Structure */}
        {step === 2 && (
          <div style={styles.form}>
            <p style={{ fontSize: '0.88rem', color: '#4B5563', margin: '0 0 12px 0' }}>
              Build your institution's hierarchy: Add <strong>Programs</strong> (e.g. B.Tech) and <strong>Departments / Branches</strong> (e.g. CSE). Students will be mapped directly to their respective branch.
            </p>

            <div style={styles.builderLayout}>
              {/* Programs Column */}
              <div style={styles.builderCol}>
                <label style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1F2937', marginBottom: '8px', display: 'block' }}>
                  1. Programs ({programs.length})
                </label>
                <div style={styles.addItemRow}>
                  <input 
                    type="text" 
                    placeholder="e.g. B.Tech" 
                    value={newProgName} 
                    onChange={e => setNewProgName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProgram(); } }}
                    style={{ flex: 1, minWidth: 0, width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', outline: 'none', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                  <button 
                    type="button" 
                    className="btn-primary" 
                    onClick={addProgram}
                    disabled={!newProgName.trim()}
                    style={{ padding: '8px 12px', borderRadius: '6px', flexShrink: 0, fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                  >
                    + Add
                  </button>
                </div>
                <div style={styles.builderList}>
                  {programs.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem' }}>
                      No programs added yet.
                    </div>
                  ) : (
                    programs.map((prog, idx) => {
                      const isActive = activeProgIdx === idx;
                      return (
                        <div 
                          key={idx} 
                          style={{
                            ...styles.builderItem,
                            borderColor: isActive ? '#2563EB' : '#E5E7EB',
                            background: isActive ? '#EFF6FF' : '#FFFFFF',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#1D4ED8' : '#374151',
                            boxShadow: isActive ? '0 0 0 1px #2563EB' : 'none'
                          }}
                          onClick={() => { setActiveProgIdx(idx); setActiveDeptIdx(0); }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📂 {prog.name}</span>
                            <span style={{ fontSize: '0.72rem', background: isActive ? '#DBEAFE' : '#F3F4F6', color: isActive ? '#1E40AF' : '#6B7280', padding: '2px 6px', borderRadius: '10px', flexShrink: 0 }}>
                              {prog.departments.length} depts
                            </span>
                          </span>
                          <button 
                            type="button" 
                            style={styles.deleteMiniBtn} 
                            onClick={(e) => { e.stopPropagation(); removeProgram(idx); }}
                            title="Remove Program"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Departments Column */}
              <div style={styles.builderCol}>
                <label style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1F2937', marginBottom: '8px', display: 'block' }}>
                  2. Departments {currentProgram ? `(${currentProgram.departments.length})` : ''}
                </label>
                <div style={styles.addItemRow}>
                  <input 
                    type="text" 
                    placeholder={currentProgram ? `Add to ${currentProgram.name}...` : "Select a Program"} 
                    value={newDeptName} 
                    onChange={e => setNewDeptName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDepartment(); } }}
                    disabled={!currentProgram}
                    style={{ flex: 1, minWidth: 0, width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', outline: 'none', fontSize: '0.82rem', boxSizing: 'border-box' }}
                  />
                  <button 
                    type="button" 
                    className="btn-primary" 
                    onClick={addDepartment} 
                    disabled={!currentProgram || !newDeptName.trim()}
                    style={{ padding: '8px 12px', borderRadius: '6px', flexShrink: 0, fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                  >
                    + Add
                  </button>
                </div>
                <div style={styles.builderList}>
                  {!currentProgram ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem' }}>
                      Select a program on the left to manage departments.
                    </div>
                  ) : currentProgram.departments.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem' }}>
                      No departments in <strong>{currentProgram.name}</strong>. Add one above!
                    </div>
                  ) : (
                    currentProgram.departments.map((dept, idx) => {
                      const isActive = activeDeptIdx === idx;
                      return (
                        <div 
                          key={idx} 
                          style={{
                            ...styles.builderItem,
                            borderColor: isActive ? '#2563EB' : '#E5E7EB',
                            background: isActive ? '#EFF6FF' : '#FFFFFF',
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? '#1D4ED8' : '#374151',
                            boxShadow: isActive ? '0 0 0 1px #2563EB' : 'none'
                          }}
                          onClick={() => setActiveDeptIdx(idx)}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📁 {dept.name}</span>
                          </span>
                          <button 
                            type="button" 
                            style={styles.deleteMiniBtn} 
                            onClick={(e) => { e.stopPropagation(); removeDepartment(activeProgIdx, idx); }}
                            title="Remove Department"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Validation tip banner if disabled */}
            {programs.length === 0 ? (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                <strong>Tip:</strong> Add at least one program (degree) to begin setting up your institution's departments and classes.
              </div>
            ) : programs.some(p => p.departments.length === 0) ? (
              <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                <strong>Note:</strong> Every program must have at least one department defined to proceed. (Program missing departments: <strong>{programs.filter(p => p.departments.length === 0).map(p => p.name).join(', ')}</strong>)
              </div>
            ) : null}

            <div style={styles.actions}>
              <button 
                className="h-11 px-5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-all"
                onClick={() => setStep(1)}
              >
                ← Back
              </button>
              <button 
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed" 
                onClick={() => setStep(3)}
                disabled={programs.length === 0 || programs.some(p => p.departments.length === 0)}
              >
                Define Administrator →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Dean Account */}
        {step === 3 && (
          <div style={styles.form}>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Dean's Full Name <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                type="text"
                placeholder="e.g. Dr. Ramesh Kumar"
                value={deanName}
                onChange={e => setDeanName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Official Email <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                type="email"
                placeholder="dean@nitd.edu"
                value={deanEmail}
                onChange={e => setDeanEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                type="password"
                placeholder="Create a strong password"
                value={deanPassword}
                onChange={e => setDeanPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Phone Number <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <input
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400 shadow-sm"
                type="tel"
                placeholder="e.g. +91 9876543210"
                value={deanPhone}
                onChange={e => setDeanPhone(e.target.value)}
              />
            </div>
            <div style={styles.actions}>
              <button 
                className="h-11 px-5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-all"
                onClick={() => setStep(2)}
              >
                ← Back
              </button>
              <button 
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setStep(4)} 
                disabled={!deanName || !deanEmail || !deanPassword}
              >
                Review Summary →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Summary & Confirm */}
        {step === 4 && (
          <div style={styles.form}>
            <div style={styles.summaryBox}>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Institution Name:</span>
                <span style={styles.summaryValue}>{instName} ({instCode})</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Website:</span>
                <span style={styles.summaryValue}>{instWebsite}</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Dean Admin Email:</span>
                <span style={styles.summaryValue}>{deanEmail}</span>
              </div>
              <div style={{ ...styles.summaryItem, flexDirection: 'column', alignItems: 'flex-start', borderBottom: 'none' }}>
                <span style={styles.summaryLabel}>Academic Hierarchy:</span>
                <div style={styles.hierarchyPreview}>
                  {programs.map((p, pIdx) => (
                    <div key={pIdx} style={styles.hierarchyProg}>
                      <strong>📂 {p.name}</strong>
                      {p.departments.map((d, dIdx) => (
                        <div key={dIdx} style={styles.hierarchyDept}>
                          <span>├─ 📁 {d.name}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={styles.actions}>
              <button 
                className="h-11 px-5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-all"
                onClick={() => setStep(3)} 
                disabled={isLoading}
              >
                ← Back
              </button>
              <button 
                className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleOnboard} 
                disabled={isLoading}
              >
                {isLoading ? 'Onboarding...' : 'Onboard & Generate System'}
              </button>
            </div>
          </div>
        )}

        {onBackToLogin && (
          <footer style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(226, 232, 240, 0.8)', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>
              Already registered?{' '}
              <button
                type="button"
                onClick={onBackToLogin}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4F46E5',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Back to Sign In
              </button>
            </p>
          </footer>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100%',
    padding: '40px 20px',
    backgroundImage: `url(${campusBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    position: 'relative',
  },
  card: {
    width: '100%',
    maxWidth: '1000px',
    padding: '36px 36px',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(226, 232, 240, 0.9)',
    borderRadius: '20px',
    boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
    position: 'relative',
    zIndex: 10,
    boxSizing: 'border-box',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
    marginBottom: '24px',
    color: '#0F172A',
    letterSpacing: '-0.02em',
  },
  stepsIndicatorWrapper: {
    position: 'relative',
    marginBottom: '32px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
  },
  progressTrackBackground: {
    position: 'absolute',
    top: '16px',
    left: '12.5%',
    right: '12.5%',
    height: '3px',
    backgroundColor: '#E2E8F0',
    borderRadius: '99px',
    zIndex: 1,
    overflow: 'hidden',
  },
  progressTrackFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
    backgroundImage: 'linear-gradient(90deg, #4F46E5, #6366F1)',
    borderRadius: '99px',
    transition: 'width 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  stepsContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 2,
  },
  stepDotContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    position: 'relative',
    userSelect: 'none',
  },
  stepDot: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '2px solid #E2E8F0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: '700',
    transition: 'all 0.35s ease',
  },
  stepLabel: {
    marginTop: '8px',
    fontSize: '0.72rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    transition: 'color 0.3s ease',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    gap: '20px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '16px',
  },
  nextBtn: {
    marginLeft: 'auto',
  },
  builderLayout: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
    minHeight: '280px',
    width: '100%',
    boxSizing: 'border-box',
  },
  builderCol: {
    display: 'flex',
    flexDirection: 'column',
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '12px',
    padding: '14px',
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  addItemRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '14px',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  builderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    maxHeight: '220px',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  builderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '0.84rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  deleteMiniBtn: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    fontSize: '1.2rem',
    lineHeight: '1',
    cursor: 'pointer',
  },
  summaryBox: {
    background: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '24px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
  },
  summaryLabel: {
    fontSize: '0.9rem',
    color: '#6B7280',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: '0.9rem',
    color: '#111827',
    fontWeight: '600',
  },
  hierarchyPreview: {
    marginTop: '12px',
    width: '100%',
    background: '#F9FAFB',
    padding: '16px',
    borderRadius: '8px',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  hierarchyProg: {
    marginBottom: '12px',
    fontSize: '0.85rem',
  },
  hierarchyDept: {
    marginLeft: '16px',
    marginTop: '4px',
    color: '#6B7280',
  },
  hierarchyClassList: {
    color: '#2563EB',
    marginLeft: '8px',
    fontSize: '0.8rem',
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#F87171',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.85rem',
  },
};
