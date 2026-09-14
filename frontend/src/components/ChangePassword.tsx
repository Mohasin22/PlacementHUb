import React, { useState } from 'react';

interface ChangePasswordProps {
  token: string;
}

export const ChangePassword: React.FC<ChangePasswordProps> = ({ token }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to change password.');
      }

      setSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 24, padding: 24, background: 'var(--bg-surface, #fff)', borderRadius: 12, border: '1px solid var(--border-color, rgba(0,0,0,0.06))' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--text-primary, #111)' }}>Change Password</h3>
      
      {error && (
        <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: '0.9rem' }}>
          {error}
        </div>
      )}
      
      {success && (
        <div style={{ background: '#F0FDF4', color: '#16A34A', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: '0.9rem' }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #374151)' }}>Current Password</label>
          <input 
            type="password" 
            value={currentPassword} 
            onChange={(e) => setCurrentPassword(e.target.value)} 
            required 
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color, #D1D5DB)', background: 'transparent', color: 'var(--text-primary, #111)' }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #374151)' }}>New Password</label>
          <input 
            type="password" 
            value={newPassword} 
            onChange={(e) => setNewPassword(e.target.value)} 
            required 
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color, #D1D5DB)', background: 'transparent', color: 'var(--text-primary, #111)' }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #374151)' }}>Confirm New Password</label>
          <input 
            type="password" 
            value={confirmPassword} 
            onChange={(e) => setConfirmPassword(e.target.value)} 
            required 
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color, #D1D5DB)', background: 'transparent', color: 'var(--text-primary, #111)' }}
          />
        </div>
        
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            background: '#4F46E5', color: '#fff', border: 'none', padding: '10px 16px', 
            borderRadius: 8, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1, alignSelf: 'flex-start', marginTop: 8
          }}
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
};
