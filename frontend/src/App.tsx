import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { DeanDashboard } from './pages/DeanDashboard';
import { TpoDashboard } from './pages/TpoDashboard';
import { FacultyDashboard } from './pages/FacultyDashboard';
import { StudentProfile } from './pages/StudentProfile';
import { StudentDrives } from './pages/StudentDrives';
import { UserProfile } from './pages/UserProfile';
import { Sidebar } from './components/Sidebar';
import { NotificationsPanel } from './components/NotificationsPanel';
import { SunIcon, MoonIcon, LogoutIcon, UserIcon } from './components/Icons';

interface AuthState {
  token: string;
  role: 'Dean' | 'TPO' | 'Faculty' | 'Student';
  institutionId: string;
  userId: string;
  userName: string;
}

const TIMEOUT_MINUTES = 30;
const WARNING_SECONDS = 120;

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [view, setView] = useState<'login' | 'onboard' | 'dashboard' | 'profile'>('login');
  const [currentTab, setCurrentTab] = useState<string>('drives');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [sessionWarning, setSessionWarning] = useState<number | null>(null);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number>(WARNING_SECONDS);

  // Dark mode effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
    if (darkMode) {
      document.documentElement.style.setProperty('--bg-main', '#0F172A');
      document.documentElement.style.setProperty('--bg-surface', '#1E293B');
      document.documentElement.style.setProperty('--text-primary', '#F1F5F9');
      document.documentElement.style.setProperty('--text-secondary', '#94A3B8');
      document.documentElement.style.setProperty('--border-color', 'rgba(255,255,255,0.08)');
    } else {
      document.documentElement.style.setProperty('--bg-main', '#F8FAFC');
      document.documentElement.style.setProperty('--bg-surface', '#FFFFFF');
      document.documentElement.style.setProperty('--text-primary', '#0F172A');
      document.documentElement.style.setProperty('--text-secondary', '#64748B');
      document.documentElement.style.setProperty('--border-color', 'rgba(0,0,0,0.08)');
    }
  }, [darkMode]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearInterval(warningRef.current);
    setSessionWarning(null);
    countdownRef.current = WARNING_SECONDS;
  }, []);

  const handleLogout = useCallback(() => {
    clearTimers();
    localStorage.removeItem('auth');
    setAuth(null);
    setView('login');
  }, [clearTimers]);

  const startWarningCountdown = useCallback(() => {
    countdownRef.current = WARNING_SECONDS;
    setSessionWarning(WARNING_SECONDS);
    warningRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setSessionWarning(countdownRef.current);
      if (countdownRef.current <= 0) {
        handleLogout();
      }
    }, 1000);
  }, [handleLogout]);

  const resetTimeout = useCallback(() => {
    if (!auth) return;
    clearTimers();
    timeoutRef.current = setTimeout(startWarningCountdown, (TIMEOUT_MINUTES - WARNING_SECONDS / 60) * 60 * 1000);
  }, [auth, clearTimers, startWarningCountdown]);

  // Restore auth from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAuth(parsed);
        setView('dashboard');
        if (parsed.role === 'Dean') setCurrentTab('overview');
        else if (parsed.role === 'TPO') setCurrentTab('drives');
        else if (parsed.role === 'Faculty') setCurrentTab('reviews');
        else if (parsed.role === 'Student') setCurrentTab('profile');
      } catch {
        localStorage.removeItem('auth');
      }
    }
  }, []);

  useEffect(() => {
    if (!auth) { clearTimers(); return; }
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
    const handler = () => { if (sessionWarning === null) resetTimeout(); };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimeout();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearTimers();
    };
  }, [auth, resetTimeout, clearTimers, sessionWarning]);

  const handleLoginSuccess = (data: { token: string; role: string; institutionId: string; userId: string; userName: string }) => {
    const state: AuthState = {
      token: data.token,
      role: data.role as any,
      institutionId: data.institutionId,
      userId: data.userId,
      userName: data.userName
    };
    setAuth(state);
    localStorage.setItem('auth', JSON.stringify(state));
    setView('dashboard');
    if (state.role === 'Dean') setCurrentTab('overview');
    else if (state.role === 'TPO') setCurrentTab('drives');
    else if (state.role === 'Faculty') setCurrentTab('reviews');
    else if (state.role === 'Student') setCurrentTab('profile');
  };

  if (!auth) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', transition: 'background 0.3s' }}>
        {view === 'login' && (
          <Login
            onLoginSuccess={handleLoginSuccess}
            onNavigateOnboard={() => setView('onboard')}
          />
        )}
        {view === 'onboard' && (
          <>
            <Onboarding onSuccess={() => setView('login')} />
            <div style={styles.switchViewLink}>
              Already registered?{' '}
              <button onClick={() => setView('login')} style={styles.linkButton}>Back to Login</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-main)', transition: 'background 0.3s' }}>
      {/* ── LEFT SIDEBAR NAVIGATION (MATCHING IMAGE 0) ── */}
      <Sidebar
        role={auth.role}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        currentView={view === 'profile' ? 'profile' : 'dashboard'}
        onViewChange={v => setView(v === 'profile' ? 'profile' : 'dashboard')}
        userName={auth.userName}
      />

      {/* ── RIGHT MAIN CANVAS & HEADER BAR ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: '100vh' }}>
        {/* Upper Top Header Bar */}
        <header
          style={{
            height: 64,
            background: 'var(--card-bg)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 32px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          {/* Right: Notifications, Dark Mode, Profile Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Notifications Panel */}
            <NotificationsPanel token={auth.token} />

            {/* User Profile Dropdown Pill (Matching Image 0) */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  background: 'var(--bg-main)',
                  padding: '4px 14px 4px 6px',
                  borderRadius: 24,
                  border: '1px solid var(--border-color)',
                  outline: 'none',
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#0B192C',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                  }}
                >
                  {auth.userName ? auth.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                </div>
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {auth.userName || 'User'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {auth.role}
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: 4 }}>
                  {isProfileDropdownOpen ? '▲' : '▼'}
                </span>
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileDropdownOpen && (
                <>
                  <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                    onClick={() => setIsProfileDropdownOpen(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: 240,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 14,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                      zIndex: 999,
                      padding: '8px 0',
                    }}
                  >
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {auth.userName}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        Role: {auth.role}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setView('profile');
                        setIsProfileDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-main)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <UserIcon size={16} color="var(--text-secondary)" />
                      Account Profile
                    </button>

                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-main)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {darkMode ? <SunIcon size={16} /> : <MoonIcon size={16} />}
                      {darkMode ? 'Light Mode' : 'Dark Mode'}
                    </button>

                    <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                    <button
                      onClick={() => {
                        setIsProfileDropdownOpen(false);
                        handleLogout();
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'none',
                        border: 'none',
                        color: '#EF4444',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <LogoutIcon size={16} color="#EF4444" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Session Warning Toast */}
        {sessionWarning !== null && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#0B192C',
              color: '#fff',
              padding: '14px 24px',
              borderRadius: 12,
              zIndex: 9999,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            <span>Session expires in <strong>{sessionWarning}s</strong> due to inactivity.</span>
            <button
              onClick={resetTimeout}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Stay Logged In
            </button>
          </div>
        )}

        {/* Dashboard Content Area */}
        <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            {view === 'profile' ? (
              <div className="animate-fade-in">
                <UserProfile token={auth.token} />
              </div>
            ) : (
              <>
                {auth.role === 'Dean' && (
                  <div className="animate-fade-in">
                    <DeanDashboard token={auth.token} institutionId={auth.institutionId} userName={auth.userName} activeTab={currentTab} setActiveTab={setCurrentTab} />
                  </div>
                )}
                {auth.role === 'TPO' && (
                  <div className="animate-fade-in">
                    <TpoDashboard token={auth.token} institutionId={auth.institutionId} activeTab={currentTab} setActiveTab={setCurrentTab} />
                  </div>
                )}
                {auth.role === 'Faculty' && (
                  <div className="animate-fade-in">
                    <FacultyDashboard token={auth.token} activeTab={currentTab} setActiveTab={setCurrentTab} />
                  </div>
                )}
                {auth.role === 'Student' && (
                  <div className="animate-fade-in">
                    {currentTab === 'profile' && <StudentProfile token={auth.token} />}
                    {currentTab === 'drives' && <StudentDrives token={auth.token} activeTab="drives" />}
                    {currentTab === 'events' && <StudentDrives token={auth.token} activeTab="events" />}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Footer Line (Matching Image 0) */}
        <footer
          style={{
            textAlign: 'center',
            padding: '16px 24px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--card-bg)',
          }}
        >
          Developed by: Md. Mohasin, M. Mihir Vijhval, N. Sairam Suraj, N. Pravallika Ratna Priya
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  switchViewLink: { marginTop: 24, color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500, textAlign: 'center' },
  linkButton: { background: 'none', border: 'none', color: '#4F46E5', fontWeight: 600, cursor: 'pointer', marginLeft: 4 },
};
