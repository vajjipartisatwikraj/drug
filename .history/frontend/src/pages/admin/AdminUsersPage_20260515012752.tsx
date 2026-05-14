import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface AdminUserRow {
  id: string;
  username: string;
  role: string;
  password_hash: string;
  employee_details: Record<string, unknown>;
  audited_document_ids: string[];
  created_at?: string;
}

interface AdminUsersPageProps {
  token: string;
}

function toLocalDateTime(value?: string): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export const AdminUsersPage: React.FC<AdminUsersPageProps> = ({ token }) => {
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminUserTotals, setAdminUserTotals] = useState<{
    admins: number;
    auditors: number;
    users: number;
  } | null>(null);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAdminUsers();
  }, []);

  const fetchAdminUsers = async () => {
    if (!token) return;
    setLoadingAdminUsers(true);
    setAdminUsersError(null);
    try {
      const response = await fetch("/api/admin/users/details", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Failed to fetch user details");
      setAdminUsers((payload.users || []) as AdminUserRow[]);
      setAdminUserTotals(payload.totals || null);
    } catch (err) {
      setAdminUsersError(err instanceof Error ? err.message : "Failed to fetch user details");
    } finally {
      setLoadingAdminUsers(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">User Details</h1>
        <p className="text-slate-400">Manage and view all system users</p>
      </div>

      {adminUserTotals && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-sm text-slate-400">Total Users</p>
            <p className="text-3xl font-bold text-white mt-2">{adminUserTotals.users}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-sm text-slate-400">Admins</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              {adminUserTotals.admins}
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-sm text-slate-400">Auditors</p>
            <p className="text-3xl font-bold text-blue-400 mt-2">{adminUserTotals.auditors}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
        {loadingAdminUsers && <p className="text-slate-300 text-sm p-4">Loading user details...</p>}
        {adminUsersError && (
          <p className="text-red-400 text-sm p-4">{adminUsersError}</p>
        )}
        {!loadingAdminUsers && !adminUsersError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/80">
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">Role</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Password Hash
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">
                    Documents
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-300">Created</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-slate-200">{u.username}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          u.role === "admin"
                            ? "bg-emerald-600/20 text-emerald-400"
                            : "bg-blue-600/20 text-blue-400"
                        }`}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs break-all text-slate-400">
                      {u.password_hash.substring(0, 20)}...
                    </td>
                    <td className="px-6 py-4 text-slate-200">
                      {u.audited_document_ids.length}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {toLocalDateTime(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUsersPage;
