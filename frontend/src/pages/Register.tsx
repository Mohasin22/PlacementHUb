import React, { useState, useEffect } from 'react';

const API_BASE = 'http://127.0.0.1:8000/api';

interface RegisterProps {
  onBackToLogin: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onBackToLogin }) => {
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHierarchy, setIsFetchingHierarchy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const response = await fetch(`${API_BASE}/institutions/public/hierarchy`);
        if (!response.ok) throw new Error('Failed to fetch institution details');
        const data = await response.json();
        setInstitutionId(data.institution_id);
        setHierarchy(data.hierarchy);
      } catch (err: any) {
        setError(err.message || 'Error loading departments');
      } finally {
        setIsFetchingHierarchy(false);
      }
    };
    fetchHierarchy();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const payload = {
        name,
        roll_number: rollNumber,
        institute_email: email,
        mobile,
        department_id: selectedDepartment,
        class_id: selectedClass,
        institution_id: institutionId
      };

      const response = await fetch(`${API_BASE}/auth/register-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to register');
      }
      
      setSuccessMsg(data.message || 'Registration submitted successfully!');
      // clear form
      setName('');
      setRollNumber('');
      setEmail('');
      setMobile('');
      setSelectedProgram('');
      setSelectedDepartment('');
      setSelectedClass('');
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  const currentProgram = hierarchy.find(p => p.id === selectedProgram);
  const currentDepartment = currentProgram?.departments.find((d: any) => d.id === selectedDepartment);

  if (isFetchingHierarchy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-main p-4">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-main p-4 md:p-8 animate-fade-in relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-[30vw] h-[30vw] bg-tertiary/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md glass-panel p-xl rounded-2xl clerk-shadow border border-outline-variant relative z-10">
        
        <div className="text-center mb-xl">
          <div className="flex justify-center mb-md">
            <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/30">
              P
            </div>
          </div>
          <h1 className="font-display-sm text-display-sm font-bold text-on-surface mb-xs tracking-tight">Student Registration</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Create an account to track your placements</p>
        </div>

        {error && (
          <div className="mb-lg p-sm bg-error/10 border border-error/20 rounded-lg flex items-start gap-sm">
            <span className="material-symbols-outlined mr-2 align-middle text-[1.1em]">warning</span>
            <p className="font-body-sm text-body-sm text-error">{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-lg p-sm bg-success/10 border border-success/20 rounded-lg flex items-start gap-sm text-success">
            <span className="material-symbols-outlined mr-2 align-middle text-[1.1em]">check_circle</span>
            <div className="font-body-sm text-body-sm">
              {successMsg}
              <div className="mt-2">
                <button onClick={onBackToLogin} className="underline font-semibold hover:text-success/80">Go back to Login</button>
              </div>
            </div>
          </div>
        )}

        {!successMsg && (
          <form onSubmit={handleSubmit} className="space-y-lg">
            <div className="space-y-md">
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="name">Full Name</label>
                <div className="relative group input-halo transition-all duration-200 rounded-lg">
                  <input 
                    className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary focus:ring-0 transition-colors outline-none" 
                    id="name" 
                    placeholder="Enter your full name" 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                    required 
                  />
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="rollNumber">Roll Number</label>
                <div className="relative group input-halo transition-all duration-200 rounded-lg">
                  <input 
                    className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary focus:ring-0 transition-colors outline-none" 
                    id="rollNumber" 
                    placeholder="e.g. 21B01A0501" 
                    type="text"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                    disabled={isLoading}
                    required 
                  />
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="email">Institute Email</label>
                <div className="relative group input-halo transition-all duration-200 rounded-lg">
                  <input 
                    className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary focus:ring-0 transition-colors outline-none" 
                    id="email" 
                    placeholder="name@gvpcdpgc.edu.in" 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required 
                  />
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="mobile">Mobile Number</label>
                <div className="relative group input-halo transition-all duration-200 rounded-lg">
                  <input 
                    className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary focus:ring-0 transition-colors outline-none" 
                    id="mobile" 
                    placeholder="10-digit mobile number" 
                    type="text"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    disabled={isLoading}
                    required 
                  />
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface">Program</label>
                <select
                  value={selectedProgram}
                  onChange={(e) => {
                    setSelectedProgram(e.target.value);
                    setSelectedDepartment('');
                    setSelectedClass('');
                  }}
                  className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none"
                  required
                  disabled={isLoading}
                >
                  <option value="">Select Program</option>
                  {hierarchy.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface">Department</label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => {
                    setSelectedDepartment(e.target.value);
                    setSelectedClass('');
                  }}
                  className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none"
                  required
                  disabled={isLoading || !selectedProgram}
                >
                  <option value="">Select Department</option>
                  {currentProgram?.departments.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface">Class</label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none"
                  required
                  disabled={isLoading || !selectedDepartment}
                >
                  <option value="">Select Class</option>
                  {currentDepartment?.classes.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button 
              className="w-full h-11 bg-primary text-on-primary rounded-lg font-label-md text-label-md font-semibold btn-hover clerk-shadow disabled:opacity-50" 
              type="submit"
              disabled={isLoading || !email || !selectedClass}
            >
              {isLoading ? 'Submitting...' : 'Register'}
            </button>
            
            <div className="text-center mt-4">
              <button 
                type="button" 
                onClick={onBackToLogin}
                className="text-sm font-semibold text-primary hover:underline disabled:opacity-50" 
                disabled={isLoading}
              >
                Already have an account? Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
