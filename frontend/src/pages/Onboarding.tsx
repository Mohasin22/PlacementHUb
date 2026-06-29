import React, { useState } from 'react';

const API_BASE = 'http://localhost:8000/api';

interface Department {
  name: string;
  classes: string[];
}

interface Program {
  name: string;
  departments: Department[];
}

interface OnboardingProps {
  onSuccess: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onSuccess }) => {
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
        { name: 'CSE', classes: ['CSE-A', 'CSE-B'] },
        { name: 'ECE', classes: ['ECE-A'] },
      ],
    },
    {
      name: 'MBA',
      departments: [
        { name: 'Finance', classes: ['MBA-Fin'] },
      ],
    },
  ]);

  // Temporary inputs for Step 2
  const [newProgName, setNewProgName] = useState('');
  const [activeProgIdx, setActiveProgIdx] = useState<number>(0);
  const [newDeptName, setNewDeptName] = useState('');
  const [activeDeptIdx, setActiveDeptIdx] = useState<number>(0);
  const [newClassName, setNewClassName] = useState('');

  // Step 3: Dean (Super Admin)
  const [deanName, setDeanName] = useState('');
  const [deanEmail, setDeanEmail] = useState('');
  const [deanPassword, setDeanPassword] = useState('');
  const [deanPhone, setDeanPhone] = useState('');

  // Hierarchy Helpers
  const addProgram = () => {
    if (!newProgName.trim()) return;
    setPrograms([...programs, { name: newProgName.trim(), departments: [] }]);
    setNewProgName('');
    setActiveProgIdx(programs.length); // Focus new program
  };

  const addDepartment = () => {
    if (!newDeptName.trim() || activeProgIdx === -1) return;
    const updated = [...programs];
    updated[activeProgIdx].departments.push({ name: newDeptName.trim(), classes: [] });
    setPrograms(updated);
    setNewDeptName('');
    setActiveDeptIdx(updated[activeProgIdx].departments.length - 1);
  };

  const addClass = () => {
    if (!newClassName.trim() || activeProgIdx === -1 || activeDeptIdx === -1) return;
    const updated = [...programs];
    updated[activeProgIdx].departments[activeDeptIdx].classes.push(newClassName.trim());
    setPrograms(updated);
    setNewClassName('');
  };

  const removeProgram = (pIdx: number) => {
    const updated = programs.filter((_, idx) => idx !== pIdx);
    setPrograms(updated);
    setActiveProgIdx(updated.length - 1);
    setActiveDeptIdx(0);
  };

  const removeDepartment = (pIdx: number, dIdx: number) => {
    const updated = [...programs];
    updated[pIdx].departments = updated[pIdx].departments.filter((_, idx) => idx !== dIdx);
    setPrograms(updated);
    setActiveDeptIdx(0);
  };

  const removeClass = (pIdx: number, dIdx: number, cIdx: number) => {
    const updated = [...programs];
    updated[pIdx].departments[dIdx].classes = updated[pIdx].departments[dIdx].classes.filter(
      (_, idx) => idx !== cIdx
    );
    setPrograms(updated);
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
          classes: d.classes
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
      <div className="glass-card animate-slide-up" style={styles.card}>
        {/* Step Indicator */}
        <div style={styles.stepsIndicator}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={styles.stepDotContainer}>
              <div style={{
                ...styles.stepDot,
                backgroundColor: step === s ? '#2563EB' : step > s ? '#10B981' : '#E5E7EB',
                boxShadow: step === s ? '0 0 10px #2563EB' : 'none',
              }}>
                {step > s ? '✓' : s}
              </div>
              <span style={{
                ...styles.stepLabel,
                color: step === s ? '#2563EB' : '#6B7280'
              }}>
                {s === 1 ? 'Details' : s === 2 ? 'Structure' : s === 3 ? 'Admin' : 'Confirm'}
              </span>
            </div>
          ))}
        </div>

        <h2 style={styles.title}>
          {step === 1 && 'Register Institution'}
          {step === 2 && 'Setup Academic Hierarchy'}
          {step === 3 && 'Dean Account Details'}
          {step === 4 && 'Confirm & Onboard'}
        </h2>

        {error && <div style={styles.errorAlert}>{error}</div>}

        {/* Step 1: Details */}
        {step === 1 && (
          <div style={styles.form}>
            <div style={styles.inputGroup}>
              <label>Institution Name *</label>
              <input type="text" placeholder="e.g. National Institute of Technology" value={instName} onChange={e => setInstName(e.target.value)} required />
            </div>
            <div style={styles.inputGroup}>
              <label>Address *</label>
              <input type="text" placeholder="e.g. New Delhi, India" value={instAddress} onChange={e => setInstAddress(e.target.value)} required />
            </div>
            <div style={styles.row}>
              <div style={{ ...styles.inputGroup, flex: 1 }}>
                <label>Website *</label>
                <input type="url" placeholder="https://nit.edu" value={instWebsite} onChange={e => setInstWebsite(e.target.value)} required />
              </div>
              <div style={{ ...styles.inputGroup, flex: 1 }}>
                <label>Code (Unique ID) *</label>
                <input type="text" placeholder="e.g. NITD" value={instCode} onChange={e => setInstCode(e.target.value)} required />
              </div>
            </div>
            <div style={styles.inputGroup}>
              <label>Logo URL (Optional)</label>
              <input type="url" placeholder="https://example.com/logo.png" value={instLogo} onChange={e => setInstLogo(e.target.value)} />
            </div>
            <div style={styles.actions}>
              <button 
                className="btn-primary" 
                style={styles.nextBtn}
                onClick={() => setStep(2)}
                disabled={!instName || !instAddress || !instWebsite || !instCode}
              >
                Continue Setup
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Academic Structure */}
        {step === 2 && (
          <div style={styles.form}>
            <div style={styles.builderLayout}>
              {/* Programs Column */}
              <div style={styles.builderCol}>
                <label>1. Programs (Degree)</label>
                <div style={styles.addItemRow}>
                  <input type="text" placeholder="e.g. B.Tech" value={newProgName} onChange={e => setNewProgName(e.target.value)} />
                  <button type="button" className="btn-primary" onClick={addProgram}>Add</button>
                </div>
                <div style={styles.builderList}>
                  {programs.map((prog, idx) => (
                    <div 
                      key={idx} 
                      style={{
                        ...styles.builderItem,
                        borderColor: activeProgIdx === idx ? '#2563EB' : 'rgba(255, 255, 255, 0.05)',
                        background: activeProgIdx === idx ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
                      }}
                      onClick={() => { setActiveProgIdx(idx); setActiveDeptIdx(0); }}
                    >
                      <span>{prog.name}</span>
                      <button type="button" style={styles.deleteMiniBtn} onClick={(e) => { e.stopPropagation(); removeProgram(idx); }}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Departments Column */}
              <div style={styles.builderCol}>
                <label>2. Departments</label>
                <div style={styles.addItemRow}>
                  <input type="text" placeholder="e.g. CSE" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} disabled={programs.length === 0} />
                  <button type="button" className="btn-primary" onClick={addDepartment} disabled={programs.length === 0}>Add</button>
                </div>
                <div style={styles.builderList}>
                  {programs[activeProgIdx]?.departments.map((dept, idx) => (
                    <div 
                      key={idx} 
                      style={{
                        ...styles.builderItem,
                        borderColor: activeDeptIdx === idx ? '#2563EB' : 'rgba(255, 255, 255, 0.05)',
                        background: activeDeptIdx === idx ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
                      }}
                      onClick={() => setActiveDeptIdx(idx)}
                    >
                      <span>{dept.name}</span>
                      <button type="button" style={styles.deleteMiniBtn} onClick={(e) => { e.stopPropagation(); removeDepartment(activeProgIdx, idx); }}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Classes Column */}
              <div style={styles.builderCol}>
                <label>3. Classes</label>
                <div style={styles.addItemRow}>
                  <input 
                    type="text" 
                    placeholder="e.g. CSE-A" 
                    value={newClassName} 
                    onChange={e => setNewClassName(e.target.value)} 
                    disabled={programs.length === 0 || !programs[activeProgIdx]?.departments[activeDeptIdx]} 
                  />
                  <button 
                    type="button" 
                    className="btn-primary" 
                    onClick={addClass} 
                    disabled={programs.length === 0 || !programs[activeProgIdx]?.departments[activeDeptIdx]}
                  >
                    Add
                  </button>
                </div>
                <div style={styles.builderList}>
                  {programs[activeProgIdx]?.departments[activeDeptIdx]?.classes.map((cls, idx) => (
                    <div key={idx} style={styles.builderItem}>
                      <span>{cls}</span>
                      <button type="button" style={styles.deleteMiniBtn} onClick={() => removeClass(activeProgIdx, activeDeptIdx, idx)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.actions}>
              <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button 
                className="btn-primary" 
                onClick={() => setStep(3)}
                disabled={programs.length === 0 || programs.some(p => p.departments.length === 0)}
              >
                Define Administrator
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Dean Account */}
        {step === 3 && (
          <div style={styles.form}>
            <div style={styles.inputGroup}>
              <label>Dean's Full Name *</label>
              <input type="text" placeholder="e.g. Dr. Ramesh Kumar" value={deanName} onChange={e => setDeanName(e.target.value)} required />
            </div>
            <div style={styles.inputGroup}>
              <label>Official Email *</label>
              <input type="email" placeholder="dean@nitd.edu" value={deanEmail} onChange={e => setDeanEmail(e.target.value)} required />
            </div>
            <div style={styles.inputGroup}>
              <label>Password *</label>
              <input type="password" placeholder="Create a strong password" value={deanPassword} onChange={e => setDeanPassword(e.target.value)} required />
            </div>
            <div style={styles.inputGroup}>
              <label>Phone Number (Optional)</label>
              <input type="tel" placeholder="e.g. +91 9876543210" value={deanPhone} onChange={e => setDeanPhone(e.target.value)} />
            </div>
            <div style={styles.actions}>
              <button className="btn-secondary" onClick={() => setStep(2)}>Back</button>
              <button className="btn-primary" onClick={() => setStep(4)} disabled={!deanName || !deanEmail || !deanPassword}>Review Summary</button>
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
                          <span style={styles.hierarchyClassList}>
                            ({d.classes.join(', ') || 'No Classes'})
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={styles.actions}>
              <button className="btn-secondary" onClick={() => setStep(3)} disabled={isLoading}>Back</button>
              <button className="btn-primary" onClick={handleOnboard} disabled={isLoading}>
                {isLoading ? 'Onboarding...' : 'Onboard & Generate System'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100%',
    padding: '40px 24px',
  },
  card: {
    width: '100%',
    maxWidth: '850px',
    padding: '40px 48px',
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: '700',
    marginBottom: '28px',
    color: '#111827',
  },
  stepsIndicator: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '40px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
    paddingBottom: '20px',
  },
  stepDotContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  stepDot: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#fff',
    transition: 'all 0.3s ease',
  },
  stepLabel: {
    marginTop: '8px',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
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
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '20px',
    minHeight: '280px',
  },
  builderCol: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    borderRadius: '10px',
    padding: '16px',
  },
  addItemRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  builderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    maxHeight: '200px',
  },
  builderItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    fontSize: '0.88rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
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
