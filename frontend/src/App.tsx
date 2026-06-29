import React, { useState, useEffect } from 'react';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { DeanDashboard } from './pages/DeanDashboard';
import { TpoDashboard } from './pages/TpoDashboard';
import { FacultyDashboard } from './pages/FacultyDashboard';
import { StudentProfile } from './pages/StudentProfile';
import { StudentDrives } from './pages/StudentDrives';
import { UserProfile } from './pages/UserProfile';
import { NotificationsPanel } from './components/NotificationsPanel';

interface AuthState {
  token: string;
  role: string;
  institutionId: string;
  userId: string;
  userName: string;
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [view, setView] = useState<'login' | 'onboard' | 'dashboard' | 'profile'>('login');
  const [studentTab, setStudentTab] = useState<'profile' | 'drives'>('profile');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const r = localStorage.getItem('role');
    const i = localStorage.getItem('institutionId');
    const u = localStorage.getItem('userId');
    const n = localStorage.getItem('userName');
    if (t && r && i && u && n) setAuth({ token: t, role: r, institutionId: i, userId: u, userName: n });
  }, []);

  const handleLoginSuccess = (authData: AuthState) => {
    localStorage.setItem('token', authData.token);
    localStorage.setItem('role', authData.role);
    localStorage.setItem('institutionId', authData.institutionId);
    localStorage.setItem('userId', authData.userId);
    localStorage.setItem('userName', authData.userName);
    setAuth(authData);
    setView('dashboard');
  };

  const handleLogout = () => {
    ['token','role','institutionId','userId','userName'].forEach(k => localStorage.removeItem(k));
    setAuth(null);
    setView('login');
  };

  const handleOnboardSuccess = () => {
    alert("Institution successfully onboarded! You can now log in using the Dean's email.");
    setView('login');
  };

  const roleBadgeColor = (role: string) =>
    role === 'Dean' ? '#7C3AED' : role === 'TPO' ? '#3B82F6' : role === 'Faculty' ? '#10B981' : '#F59E0B';

  if (!auth) {
    return (
      <div style={styles.appContainer}>
        {view === 'login' ? (
          <>
            <Login onLoginSuccess={handleLoginSuccess} />
            <div style={styles.switchViewLink}>
              Don't have an institution registered?{' '}
              <button onClick={() => setView('onboard')} style={styles.linkButton}>Register Institution Here</button>
            </div>
          </>
        ) : (
          <>
            <Onboarding onSuccess={handleOnboardSuccess} />
            <div style={styles.switchViewLink}>
              Already registered?{' '}
              <button onClick={() => setView('login')} style={styles.linkButton}>Back to Login</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Auto-switch to dashboard when auth is present and view is login/onboard
  if (view === 'login' || view === 'onboard') {
    setView('dashboard');
  }

  return (
    <div style={styles.dashboardContainer}>
      <header style={styles.dashboardHeader}>
        <div style={styles.navBrand}>
          <img src="/logo.png" alt="PlacementHub Logo" style={{ height: '55px', objectFit: 'contain' }} />
        </div>

        {auth.role === 'Student' && (
          <div style={styles.studentPills}>
            <button onClick={() => setStudentTab('profile')} style={{ ...styles.pill, ...(studentTab === 'profile' ? styles.pillActive : {}) }}>
              👤 Profile
            </button>
            <button onClick={() => setStudentTab('drives')} style={{ ...styles.pill, ...(studentTab === 'drives' ? styles.pillActive : {}) }}>
              💼 Drives
            </button>
          </div>
        )}

        <div style={styles.userInfo}>
          {auth.role === 'Student' && <NotificationsPanel token={auth.token} />}
          <button 
            onClick={() => setView(view === 'profile' ? 'dashboard' : 'profile')} 
            style={{...styles.pill, background: view === 'profile' ? 'var(--primary-glow)' : 'transparent', color: view === 'profile' ? 'var(--primary)' : 'var(--text-secondary)'}}
          >
            {view === 'profile' ? 'Dashboard' : 'Profile'}
          </button>
          <span style={styles.userName}>{auth.userName}</span>
          <span style={{ ...styles.roleBadge, backgroundColor: roleBadgeColor(auth.role) }}>{auth.role}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      <main style={styles.mainContent}>
        {view === 'profile' ? (
          <div className="animate-fade-in">
            <UserProfile token={auth.token} />
          </div>
        ) : (
          <>
            {auth.role === 'Dean' && (
              <div className="animate-fade-in">
                <DeanDashboard token={auth.token} institutionId={auth.institutionId} userName={auth.userName} />
              </div>
            )}
            {auth.role === 'TPO' && (
              <div className="animate-fade-in">
                <TpoDashboard token={auth.token} institutionId={auth.institutionId} />
              </div>
            )}
            {auth.role === 'Faculty' && (
              <div className="animate-fade-in">
                <FacultyDashboard token={auth.token} />
              </div>
            )}
            {auth.role === 'Student' && (
              <div className="animate-fade-in">
                {studentTab === 'profile' ? <StudentProfile token={auth.token} /> : <StudentDrives token={auth.token} />}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appContainer: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' },
  switchViewLink: { marginTop: 24, color: 'var(--text-secondary)', fontSize: '0.95rem', zIndex: 3, fontWeight: 500 },
  linkButton: { background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', marginLeft: '4px', transition: 'all 0.2s' },
  dashboardContainer: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  dashboardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 48px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-color)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    position: 'sticky', top: 0, zIndex: 100,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: 14, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' },
  miniLogo: { background: 'linear-gradient(135deg, var(--primary), #9333EA)', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem', fontWeight: 800, boxShadow: '0 2px 10px rgba(79, 70, 229, 0.4)' },
  studentPills: { display: 'flex', gap: 6, background: 'rgba(15, 23, 42, 0.04)', padding: 6, borderRadius: 12 },
  pill: { background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, transition: 'var(--transition-fast)' },
  pillActive: { background: '#FFFFFF', color: 'var(--primary)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' },
  userInfo: { display: 'flex', alignItems: 'center', gap: 16 },
  userName: { fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 700 },
  roleBadge: { padding: '4px 12px', borderRadius: 24, fontSize: '0.75rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' },
  logoutBtn: { background: 'var(--error-glow)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--error)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'var(--transition-fast)' },
  mainContent: { flex: 1, padding: '40px 48px', overflowY: 'auto' },
};
