import React, { useState, useRef, useEffect } from 'react';
import campusBg from '../assets/campus-bg.png';

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

const PlacementHubLogo: React.FC = () => (
  <div className="flex flex-col items-center justify-center select-none text-center">
    <img
      src="/placementhub-horizontal.png"
      alt="PlacementHub Logo"
      className="h-12 sm:h-14 w-auto object-contain mb-2"
    />
    <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
      Campus Recruitment & Career Portal
    </p>
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
    <main
      className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 relative bg-stone-100 bg-cover bg-center bg-no-repeat selection:bg-indigo-100 selection:text-indigo-900"
      style={{
        backgroundImage: `url(${campusBg})`,
      }}
    >
      {/* Subtle backdrop overlay to ensure crisp contrast with the sketch */}
      <div className="absolute inset-0 bg-stone-900/[0.02] backdrop-blur-[0.5px] pointer-events-none" />

      {/* Centered Sign In Container */}
      <div className="w-full max-w-[420px] relative z-10 animate-fade-in-up">
        {/* Heading directly on top of the sign in box */}
        <div className="mb-6">
          <PlacementHubLogo />
        </div>

        {/* Sign In Box */}
        <div className="bg-white/95 backdrop-blur-md border border-stone-200/90 rounded-2xl shadow-xl shadow-stone-900/5 p-7 sm:p-8 space-y-6">
          <header className="space-y-1 text-center">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Sign in to your account</h2>
            <p className="text-sm text-slate-500">Enter your credentials to access the portal</p>
          </header>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200/80 text-red-700 rounded-xl text-sm text-center font-medium">
              {error}
            </div>
          )}
          {message && (
            <div className="p-3 bg-blue-50 border border-blue-200/80 text-blue-700 rounded-xl text-sm text-center font-medium">
              {message}
            </div>
          )}

          {step === 'login' && (
            <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="email">
                    Email Address
                  </label>
                  <input
                    className="w-full h-11 px-3.5 rounded-xl border border-stone-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400"
                    id="email"
                    placeholder="name@university.edu or student@gmail.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="password">
                      Password
                    </label>
                  </div>
                  <input
                    className="w-full h-11 px-3.5 rounded-xl border border-stone-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400"
                    id="password"
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <label htmlFor="rememberMe" className="text-xs font-medium text-slate-600 cursor-pointer select-none">
                    Remember me on this device
                  </label>
                </div>
              </div>

              <button
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="flex justify-center items-center pt-1">
                <button
                  type="button"
                  onClick={(e) => handleRequestOtp(e, false)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline disabled:opacity-50 transition-colors"
                  disabled={isLoading}
                >
                  Login with OTP instead
                </button>
              </div>
            </form>
          )}

          {step === 'otp' && (
            <div className="space-y-5">
              <div className="space-y-1 text-center">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">Enter Verification Code</label>
                <p className="text-xs text-slate-500">Sent to <span className="font-semibold text-slate-800">{email}</span></p>
              </div>

              {devOtp && (
                <div className="p-3 bg-indigo-50 border border-indigo-200/80 rounded-xl text-center animate-fade-in space-y-2">
                  <p className="text-xs text-indigo-700 font-medium">Dev OTP Code: <strong className="text-sm font-mono tracking-widest bg-indigo-100/80 px-2 py-0.5 rounded text-indigo-900">{devOtp}</strong></p>
                  <button
                    type="button"
                    onClick={() => {
                      const digits = devOtp.split('');
                      setOtp(digits);
                      handleVerifyOtp(devOtp);
                    }}
                    className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 font-medium transition-all shadow-sm"
                  >
                    Auto-fill & Verify Code
                  </button>
                </div>
              )}

              <div className="flex justify-between gap-2 mt-3" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border border-stone-300 focus:border-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-900 transition-all"
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

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
                  onClick={() => { setStep('login'); setOtp(Array(6).fill('')); setError(null); setDevOtp(null); }}
                >
                  ← Back to Sign In
                </button>
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:underline font-semibold disabled:opacity-50"
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
              <form className="space-y-5" onSubmit={handleSetPassword}>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">New Password</label>
                    <input
                      className="w-full h-11 px-3.5 rounded-xl border border-stone-300 bg-white text-slate-900 text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all outline-none placeholder:text-slate-400"
                      placeholder="Set a strong password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                    {newPassword.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: sc.width, backgroundColor: sc.color }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                          <span style={{ color: sc.color }} className="font-bold">{sc.label}</span>
                          <span className="text-slate-500">
                            {strength === 'weak' ? 'Use 6+ chars' : strength === 'fair' ? 'Add special char' : '✓ Strong password'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={isLoading || newPassword.length < 6}
                >
                  {isLoading ? 'Saving...' : 'Save & Continue'}
                </button>
              </form>
            );
          })()}

          {onNavigateOnboard && (
            <footer className="pt-4 border-t border-stone-200/80 text-center">
              <p className="text-xs text-slate-500">
                New to PlacementHub?{' '}
                <button
                  type="button"
                  onClick={onNavigateOnboard}
                  className="text-indigo-600 font-semibold hover:text-indigo-800 hover:underline focus:outline-none transition-colors"
                >
                  Create Institution
                </button>
              </p>
            </footer>
          )}
        </div>
      </div>
    </main>
  );
};

