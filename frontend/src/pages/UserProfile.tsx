import React, { useState, useEffect } from 'react';
import { ChangePassword } from '../components/ChangePassword';

const API = 'http://localhost:8000/api';

interface UserProfileProps {
  token: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    bio: '',
    personal_email: '',
    institute_email: '',
    photo_url: ''
  });

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/profile/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load profile');
      setProfile(data);
      setForm({
        name: data.name || '',
        phone: data.phone || '',
        bio: data.bio || '',
        personal_email: data.personal_email || '',
        institute_email: data.institute_email || '',
        photo_url: data.photo_url || ''
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch(`${API}/profile/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update profile');
      setSuccess('Profile updated successfully!');
      fetchProfile();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-primary mr-2">autorenew</span>
        Loading profile...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-surface-container-lowest rounded-xl card-shadow overflow-hidden">
      <div className="relative h-48 bg-gradient-to-r from-primary to-primary-container">
        {/* Banner */}
      </div>
      
      <div className="px-xl pb-xl relative">
        <div className="flex justify-between items-end -mt-16 mb-lg">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full border-4 border-white bg-surface-container-highest overflow-hidden flex items-center justify-center shadow-lg">
              {form.photo_url ? (
                <img src={form.photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl text-on-surface-variant font-bold">{profile?.name?.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <button className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
          </div>
          
          <div className="text-right">
            <span className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider">{profile?.role}</span>
          </div>
        </div>

        <div className="mb-xl">
          <h1 className="text-headline-md font-headline-md text-on-surface font-bold">{profile?.name}</h1>
          <p className="text-body-md text-on-surface-variant mt-1">{profile?.institute_email}</p>
        </div>

        {error && <div className="mb-md p-sm bg-error-container text-error rounded-lg text-sm">{error}</div>}
        {success && <div className="mb-md p-sm bg-green-100 text-green-700 rounded-lg text-sm">{success}</div>}

        <form onSubmit={handleSave} className="space-y-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <div className="space-y-xs">
              <label className="text-label-md font-semibold text-on-surface">Full Name</label>
              <input 
                type="text" 
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none transition-colors" 
              />
            </div>
            <div className="space-y-xs">
              <label className="text-label-md font-semibold text-on-surface">Phone Number</label>
              <input 
                type="text" 
                value={form.phone} 
                onChange={e => setForm({...form, phone: e.target.value})}
                className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none transition-colors" 
              />
            </div>
            <div className="space-y-xs">
              <label className="text-label-md font-semibold text-on-surface">Personal Email</label>
              <input 
                type="email" 
                value={form.personal_email} 
                onChange={e => setForm({...form, personal_email: e.target.value})}
                className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none transition-colors" 
              />
            </div>
            <div className="space-y-xs">
              <label className="text-label-md font-semibold text-on-surface">Institution/College Email</label>
              <input 
                type="email" 
                value={form.institute_email} 
                onChange={e => setForm({...form, institute_email: e.target.value})}
                className="w-full h-11 px-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none transition-colors" 
              />
            </div>
          </div>

          <div className="space-y-xs">
            <label className="text-label-md font-semibold text-on-surface">Bio / Department</label>
            <textarea 
              value={form.bio} 
              onChange={e => setForm({...form, bio: e.target.value})}
              rows={4}
              className="w-full p-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:border-primary outline-none transition-colors resize-none" 
              placeholder="Tell us a bit about yourself or your department..."
            />
          </div>

          <div className="flex justify-end pt-md border-t border-outline-variant">
            <button 
              type="submit" 
              disabled={saving}
              className="h-11 px-xl bg-primary text-on-primary rounded-lg font-label-md font-semibold hover:bg-primary-container hover:text-on-primary-container active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <><span className="material-symbols-outlined animate-spin text-[18px]">autorenew</span> Saving...</>
              ) : (
                'Save Profile'
              )}
            </button>
          </div>
        </form>

        <ChangePassword token={token} />
      </div>
    </div>
  );
};