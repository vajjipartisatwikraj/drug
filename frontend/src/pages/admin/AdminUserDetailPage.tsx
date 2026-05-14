import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface AdminUserDetail {
  id: string;
  username: string;
  role: string;
  password_hash: string;
  employee_details: Record<string, unknown>;
  audited_document_ids: string[];
  created_at?: string;
  documents_analyzed?: number;
  last_active?: string;
}

interface AdminUserDetailPageProps {
  token: string;
}

function toLocalDateTime(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export const AdminUserDetailPage: React.FC<AdminUserDetailPageProps> = ({ token }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id && token) {
      loadUser();
    }
  }, [id, token]);

  const loadUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to load user details");
      setUser(payload.user as AdminUserDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user details");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-slate-300 text-center py-8">Loading user details...</div>;
  if (error) return <div className="text-red-400 text-center py-8">{error}</div>;
  if (!user) return <div className="text-slate-300 text-center py-8">User not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate(-1)} className="mb-4 text-blue-400 hover:text-blue-300">
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-white mb-2">{user.username}</h1>
        <p className="text-slate-400">User ID: {id}</p>
      </div>

      {/* User Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Role</p>
          <p className={`text-lg font-bold mt-2 ${user.role === "admin" ? "text-emerald-400" : "text-blue-400"}`}>
            {user.role.toUpperCase()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Documents Analyzed</p>
          <p className="text-3xl font-bold text-white mt-2">{user.audited_document_ids.length}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Created</p>
          <p className="text-sm text-slate-100 mt-2">{toLocalDateTime(user.created_at)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">Last Active</p>
          <p className="text-sm text-slate-100 mt-2">{toLocalDateTime(user.last_active)}</p>
        </div>
      </div>

      {/* User Details */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Employee Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(user.employee_details || {}).map(([key, value]) => (
            <div key={key} className="p-3 rounded-lg bg-slate-900/30 border border-slate-700/50">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{key}</p>
              <p className="text-sm text-slate-100">{String(value) || "-"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Documents Table */}
      {user.audited_document_ids.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-white">Audited Documents</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/80">
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">Document ID</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {user.audited_document_ids.map((docId) => (
                  <tr key={docId} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 text-slate-200 font-mono text-xs">{docId}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/document/${docId}`)}
                        className="text-blue-400 hover:text-blue-300 font-medium text-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Security Section */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Security Information</h3>
        <div className="p-4 bg-slate-900/30 rounded-lg border border-slate-700/50">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Password Hash (First 32 chars)</p>
          <p className="text-sm font-mono text-slate-300 break-all">{user.password_hash.substring(0, 32)}...</p>
        </div>
      </div>
    </div>
  );
};

export default AdminUserDetailPage;
