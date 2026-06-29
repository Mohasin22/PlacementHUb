import React, { useState, useRef } from 'react';

interface Props {
  token: string;
  onUploadSuccess: () => void;
}

const API = 'http://localhost:8000/api';

export const BulkStudentUpload: React.FC<Props> = ({ token, onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{inserted: number, updated: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please select a valid Excel file (.xlsx or .xls)');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/students/bulk-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Upload failed');
      }

      setResult({ inserted: data.inserted, updated: data.updated });
      onUploadSuccess();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="bg-surface-container-lowest p-md rounded-xl card-shadow border border-outline-variant mt-lg">
      <div className="flex items-center justify-between mb-sm">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-3xl">upload_file</span>
          <div>
            <h3 className="text-title-md font-semibold text-on-surface">Bulk Student Upload</h3>
            <p className="text-body-sm text-on-surface-variant">Upload Google Form Excel (.xlsx) responses</p>
          </div>
        </div>
        
        <input 
          type="file" 
          accept=".xlsx, .xls" 
          className="hidden" 
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
        >
          {uploading ? (
            <><span className="material-symbols-outlined animate-spin text-[18px]">autorenew</span> Uploading...</>
          ) : (
            <><span className="material-symbols-outlined text-[18px]">cloud_upload</span> Select Excel File</>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-sm p-2 bg-error-container text-error rounded-lg text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">error</span> {error}
        </div>
      )}

      {result && (
        <div className="mt-sm p-2 bg-green-100 text-green-700 rounded-lg text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          Successfully processed {result.inserted + result.updated} students ({result.inserted} new, {result.updated} updated).
        </div>
      )}
    </div>
  );
};
