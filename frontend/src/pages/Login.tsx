import React, { useState, useRef, useEffect } from 'react';

const API_BASE = 'http://127.0.0.1:8000/api';

interface LoginProps {
  onLoginSuccess: (authData: {
    token: string;
    role: string;
    institutionId: string;
    userId: string;
    userName: string;
  }) => void;
  onNavigateOnboard?: () => void;
}

const PlacementHubLogo: React.FC<{ size?: 'lg' | 'sm' }> = ({ size = 'lg' }) => (
  <div className="relative inline-flex items-center justify-center select-none py-2">
    {/* Ambient light glow backdrop */}
    <div className="absolute -inset-3 bg-gradient-to-r from-blue-600/25 via-indigo-500/35 to-blue-400/25 rounded-full blur-2xl animate-pulse" />

    {/* Clean glowing PlacementHub text */}
    <span
      className={`relative font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 ${size === 'lg' ? 'text-4xl md:text-5xl lg:text-6xl' : 'text-3xl'
        }`}
      style={{
        filter: 'drop-shadow(0 0 18px rgba(59, 130, 246, 0.45)) drop-shadow(0 0 35px rgba(99, 102, 241, 0.35))'
      }}
    >
      Placement<span className="text-indigo-600 font-extrabold" style={{ filter: 'drop-shadow(0 0 22px rgba(99, 102, 241, 0.65))' }}>Hub</span>
    </span>
  </div>
);

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onNavigateOnboard }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [step, setStep] = useState<'login' | 'otp' | 'set_password'>('login');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'otp' && otpRefs.current[0]) {
      otpRefs.current[0]?.focus();
    }
  }, [step]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember_me: rememberMe }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.detail && data.detail.includes("Password not set")) {
          // Trigger OTP flow for first-time login
          setMessage("You don't have a password yet. Sending an OTP...");
          await handleRequestOtp(null, true);
          return;
        }
        throw new Error(data.detail || 'Login failed');
      }

      onLoginSuccess({
        token: data.access_token,
        role: data.role,
        institutionId: data.institution_id,
        userId: data.user_id,
        userName: data.user_name,
      });
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent | null, skipValidation = false) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail && !skipValidation) {
      setError('Please enter your email address first to receive an OTP.');
      document.getElementById('email')?.focus();
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);
    setDevOtp(null);

    try {
      const response = await fetch(`${API_BASE}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to request OTP');
      }

      setMessage(data.message || 'OTP sent successfully!');
      setStep('otp');

      // Check debug endpoint for dev/test environment
      try {
        const debugRes = await fetch(`${API_BASE}/auth/otp/debug/${encodeURIComponent(cleanEmail)}`);
        if (debugRes.ok) {
          const debugData = await debugRes.json();
          if (debugData?.otp) {
            setDevOtp(debugData.otp);
          }
        }
      } catch {
        // Debug API not available in production
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong while requesting OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    const cleanValue = value.replace(/\D/g, '');

    if (cleanValue.length > 1) {
      // User pasted or typed multiple digits
      const digits = cleanValue.slice(0, 6).split('');
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length - 1, 5);
      otpRefs.current[nextIndex]?.focus();
      const fullOtp = newOtp.join('');
      if (fullOtp.length === 6) handleVerifyOtp(fullOtp);
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = cleanValue.slice(-1);
    setOtp(newOtp);
    if (cleanValue && index < 5) otpRefs.current[index + 1]?.focus();
    const fullOtp = newOtp.join('');
    if (fullOtp.length === 6) handleVerifyOtp(fullOtp);
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').trim();
    if (pastedData) {
      const digits = pastedData.slice(0, 6).split('');
      const newOtp = Array(6).fill('');
      digits.forEach((d, i) => { newOtp[i] = d; });
      setOtp(newOtp);
      const focusIdx = Math.min(digits.length - 1, 5);
      otpRefs.current[focusIdx]?.focus();
      if (digits.length === 6) {
        handleVerifyOtp(digits.join(''));
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        otpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const [tempAuthData, setTempAuthData] = useState<any>(null);

  const handleVerifyOtp = async (otpCode: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.detail || 'Verification failed');

      // Check if password setup is required (first-time login for any role)
      if (data.requires_password_setup) {
        setTempAuthData(data);
        setStep('set_password');
        setMessage('Welcome! Please set a password for future logins.');
      } else {
        onLoginSuccess({
          token: data.access_token,
          role: data.role,
          institutionId: data.institution_id,
          userId: data.user_id,
          userName: data.user_name,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Invalid code.');
      setOtp(Array(6).fill(''));
      otpRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !tempAuthData) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempAuthData.access_token}` },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to set password');

      onLoginSuccess({
        token: tempAuthData.access_token,
        role: tempAuthData.role,
        institutionId: tempAuthData.institution_id,
        userId: tempAuthData.user_id,
        userName: tempAuthData.user_name,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to set password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-background font-body-md text-on-background selection:bg-primary-container/30">
      {/* Left Side: Clean Visual & Branding Section */}
      <section className="hidden md:flex md:w-1/2 lg:w-[55%] relative overflow-hidden bg-surface-container-lowest items-center justify-center p-xl">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_20%,#dbe1ff_0%,transparent_50%)]"></div>
          <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_70%_80%,#dae2fd_0%,transparent_50%)]"></div>
        </div>

        <div className="relative z-10 w-full max-w-xl text-center space-y-xl">
          <div className="flex justify-center items-center py-4 animate-fade-in">
            <PlacementHubLogo size="lg" />
          </div>

          <div className="space-y-md animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Empowering the next generation of talent.
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-lg mx-auto">
              The enterprise-grade platform for campus placements, student tracking, and corporate relations.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-md pt-lg border-t border-outline-variant/40 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="p-md rounded-xl bg-surface-container-low/60 border border-outline-variant/40 backdrop-blur-sm text-center">
              <span className="material-symbols-outlined text-primary text-2xl mb-1">school</span>
              <p className="font-label-md text-on-surface font-semibold">Campus Drive</p>
              <p className="font-body-sm text-on-surface-variant text-xs mt-0.5">Streamlined tracking</p>
            </div>
            <div className="p-md rounded-xl bg-surface-container-low/60 border border-outline-variant/40 backdrop-blur-sm text-center">
              <span className="material-symbols-outlined text-primary text-2xl mb-1">analytics</span>
              <p className="font-label-md text-on-surface font-semibold">Smart Analytics</p>
              <p className="font-body-sm text-on-surface-variant text-xs mt-0.5">Real-time reports</p>
            </div>
            <div className="p-md rounded-xl bg-surface-container-low/60 border border-outline-variant/40 backdrop-blur-sm text-center">
              <span className="material-symbols-outlined text-primary text-2xl mb-1">verified_user</span>
              <p className="font-label-md text-on-surface font-semibold">Verified Portal</p>
              <p className="font-body-sm text-on-surface-variant text-xs mt-0.5">Secure workflow</p>
            </div>
          </div>
        </div>
      </section>

      {/* Right Side: Login Section */}
      <section className="flex-1 flex flex-col justify-center items-center p-md md:p-2xl bg-background">
        <div className="md:hidden mb-xl flex items-center justify-center animate-fade-in">
          <PlacementHubLogo size="sm" />
        </div>

        <div className="w-full max-w-[420px] animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-clerk clerk-shadow p-xl space-y-xl">
            <header className="space-y-xs text-center">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Sign in to your account</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Enter your details to access the portal.</p>
            </header>

            {error && <div className="p-sm bg-error-container text-on-error-container rounded-lg text-sm text-center">{error}</div>}
            {message && <div className="p-sm bg-tertiary-fixed text-on-tertiary-fixed rounded-lg text-sm text-center">{message}</div>}

            {step === 'login' && (
              <form className="space-y-lg" onSubmit={handleLogin}>
                <div className="space-y-md">
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-on-surface" htmlFor="email">Domain Email or Personal Email</label>
                    <div className="relative group input-halo transition-all duration-200 rounded-lg">
                      <input
                        className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary focus:ring-0 transition-colors outline-none"
                        id="email"
                        placeholder="name@gtu.edu or student@gmail.com"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-xs">
                    <div className="flex justify-between items-center">
                      <label className="font-label-md text-label-md text-on-surface" htmlFor="password">Password</label>
                    </div>
                    <div className="relative group input-halo transition-all duration-200 rounded-lg">
                      <input
                        className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary focus:ring-0 transition-colors outline-none"
                        id="password"
                        placeholder="••••••••"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-sm">
                    <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4" />
                    <label htmlFor="rememberMe" className="text-body-sm text-on-surface-variant">Remember Me</label>
                  </div>
                </div>

                <button
                  className="w-full h-11 bg-primary text-on-primary rounded-lg font-label-md text-label-md font-semibold btn-hover clerk-shadow disabled:opacity-50"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>

                <div className="flex justify-center items-center mt-sm px-1">
                  <button type="button" onClick={(e) => handleRequestOtp(e, false)} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50" disabled={isLoading}>
                    Login with OTP
                  </button>
                </div>
              </form>
            )}

            {step === 'otp' && (
              <div className="space-y-lg">
                <div className="space-y-xs text-center">
                  <label className="font-label-md text-label-md text-on-surface">Enter Verification Code</label>
                  <p className="text-body-sm text-on-surface-variant">Sent to <span className="font-semibold text-on-surface">{email}</span></p>
                </div>

                {devOtp && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-center animate-fade-in space-y-2">
                    <p className="text-xs text-primary font-medium">Dev OTP Code: <strong className="text-sm font-mono tracking-widest bg-primary/20 px-2 py-0.5 rounded">{devOtp}</strong></p>
                    <button
                      type="button"
                      onClick={() => {
                        const digits = devOtp.split('');
                        setOtp(digits);
                        handleVerifyOtp(devOtp);
                      }}
                      className="text-xs bg-primary text-on-primary px-3 py-1 rounded hover:bg-primary/90 font-medium transition-all"
                    >
                      Auto-fill & Verify Code
                    </button>
                  </div>
                )}

                <div className="flex justify-between gap-sm mt-4" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      className="w-12 h-14 text-center text-xl font-bold rounded-lg border border-outline-variant focus:border-primary outline-none focus:ring-2 focus:ring-primary/20 bg-surface-container-lowest text-on-surface transition-all"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(e.target.value, i)}
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      disabled={isLoading}
                    />
                  ))}
                </div>

                <div className="flex justify-between items-center mt-6">
                  <button
                    type="button"
                    className="text-label-md text-on-surface-variant hover:text-on-surface font-medium"
                    onClick={() => { setStep('login'); setOtp(Array(6).fill('')); setError(null); setDevOtp(null); }}
                  >
                    ← Back to Sign In
                  </button>
                  <button
                    type="button"
                    className="text-label-md text-primary hover:underline font-semibold disabled:opacity-50"
                    onClick={(e) => handleRequestOtp(e, false)}
                    disabled={isLoading}
                  >
                    Resend Code
                  </button>
                </div>
              </div>
            )}

            {step === 'set_password' && (() => {
              const pwLen = newPassword.length;
              const hasNum = /[0-9]/.test(newPassword);
              const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
              let strength: 'weak' | 'fair' | 'strong' = 'weak';
              if (pwLen >= 10 && hasNum && hasSpecial) strength = 'strong';
              else if (pwLen >= 6) strength = 'fair';
              const strengthConfig = {
                weak: { color: '#EF4444', label: 'Weak', width: '33%' },
                fair: { color: '#F59E0B', label: 'Fair', width: '66%' },
                strong: { color: '#10B981', label: 'Strong', width: '100%' },
              };
              const sc = strengthConfig[strength];
              return (
                <form className="space-y-lg" onSubmit={handleSetPassword}>
                  <div className="space-y-md">
                    <div className="space-y-xs">
                      <label className="font-label-md text-label-md text-on-surface">New Password</label>
                      <div className="relative group input-halo transition-all duration-200 rounded-lg">
                        <input
                          className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary focus:ring-0 transition-colors outline-none"
                          placeholder="Set a strong password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          disabled={isLoading}
                          required
                        />
                      </div>
                      {newPassword.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ height: 6, background: 'rgba(0,0,0,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: sc.width, background: sc.color, borderRadius: 99, transition: 'all 0.35s ease' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            <span style={{ fontSize: '0.75rem', color: sc.color, fontWeight: 700 }}>{sc.label}</span>
                            <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                              {strength === 'weak' ? 'Use 6+ chars' : strength === 'fair' ? 'Add special char for Strong' : '✓ Great password!'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="w-full h-11 bg-primary text-on-primary font-label-md text-label-md rounded-lg flex items-center justify-center btn-hover disabled:opacity-50 disabled:cursor-not-allowed"
                    type="submit"
                    disabled={isLoading || newPassword.length < 6}
                  >
                    {isLoading ? 'Saving...' : 'Save & Continue'}
                  </button>
                </form>
              );
            })()}

            <footer className="pt-md border-t border-outline-variant flex flex-col items-center gap-2">
              <p className="font-body-sm text-body-sm text-on-surface-variant text-center">
                New to PlacementHub?{' '}
                <button
                  type="button"
                  onClick={onNavigateOnboard}
                  className="text-primary font-medium hover:underline focus:outline-none"
                >
                  Create Institution
                </button>
              </p>
            </footer>
          </div>

          <div className="mt-xl flex flex-col items-center gap-md">
            <div className="flex justify-center gap-lg">
              <a className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors" href="#">Privacy Policy</a>
              <a className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors" href="#">Terms of Service</a>
              <a className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors" href="#">Help Center</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

