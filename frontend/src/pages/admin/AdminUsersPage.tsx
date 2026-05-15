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
  const navigate = useNavigate();
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
        <h1 className="text-3xl text-title mb-2">User Details</h1>
        <p className="text-muted">Manage and view all system users</p>
      </div>

      {adminUserTotals && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card-shell p-4">
            <p className="text-sm text-muted">Total Users</p>
            <p className="text-3xl text-title mt-2">{adminUserTotals.users}</p>
          </div>
          <div className="card-shell p-4">
            <p className="text-sm text-muted">Admins</p>
            <p className="text-3xl text-heading mt-2" style={{ color: "var(--color-success)" }}>
              {adminUserTotals.admins}
            </p>
          </div>
          <div className="card-shell p-4">
            <p className="text-sm text-muted">Auditors</p>
            <p className="text-3xl text-heading mt-2">{adminUserTotals.auditors}</p>
          </div>
        </div>
      )}

      <div className="card-shell overflow-hidden">
        {loadingAdminUsers && <p className="text-muted text-sm p-4">Loading user details...</p>}
        {adminUsersError && (
          <p className="text-[var(--color-danger)] text-sm p-4">{adminUsersError}</p>
        )}
        {!loadingAdminUsers && !adminUsersError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-strong)]">
                  <th className="px-6 py-3 text-left font-semibold text-body">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Role</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">
                    Password Hash
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-body">
                    Documents
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Created</th>
                  <th className="px-6 py-3 text-left font-semibold text-body">Action</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-strong)] transition-colors"
                  >
                    <td className="px-6 py-4 text-body">{u.username}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          u.role === "admin"
                            ? "badge-success"
                            : "badge-neutral"
                        }`}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs break-all text-muted">
                      {u.password_hash.substring(0, 20)}...
                    </td>
                    <td className="px-6 py-4 text-body">
                      {u.audited_document_ids.length}
                    </td>
                    <td className="px-6 py-4 text-muted">
                      {toLocalDateTime(u.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/admin/user/${u.id}`)}
                        className="text-[var(--color-success)] hover:text-[var(--color-text)] font-medium text-sm"
                      >
                        View
                      </button>
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
