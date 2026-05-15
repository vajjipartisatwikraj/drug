import React, { useState } from "react";

export const ProfilePage: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    department: "Quality Assurance",
    phone: "+1 (555) 123-4567",
  });

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl text-title mb-2">Profile</h1>
        <p className="text-muted">Manage your personal information</p>
      </div>

      {/* Profile Header */}
      <div className="card-shell p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[var(--color-success)] flex items-center justify-center text-3xl font-bold text-[#0b1a1d]">
              {profile.firstName.charAt(0)}
              {profile.lastName.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl text-title">
                {profile.firstName} {profile.lastName}
              </h2>
              <p className="text-muted">{profile.department}</p>
            </div>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="btn-primary px-4 py-2 text-sm font-medium"
          >
            {isEditing ? "Cancel" : "Edit Profile"}
          </button>
        </div>

        {/* Profile Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[var(--color-border)] pt-6">
          <div>
            <p className="text-xs text-subtle uppercase tracking-wider">Email</p>
            <p className="text-sm text-body mt-1">{profile.email}</p>
          </div>
          <div>
            <p className="text-xs text-subtle uppercase tracking-wider">Phone</p>
            <p className="text-sm text-body mt-1">{profile.phone}</p>
          </div>
          <div>
            <p className="text-xs text-subtle uppercase tracking-wider">Department</p>
            <p className="text-sm text-body mt-1">{profile.department}</p>
          </div>
          <div>
            <p className="text-xs text-subtle uppercase tracking-wider">Role</p>
            <p className="text-sm text-body mt-1">
              <span className="px-2 py-1 rounded-full text-xs badge-neutral">
                Auditor
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Edit Profile Form */}
      {isEditing && (
        <div className="card-shell p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                First Name
              </label>
              <input
                type="text"
                value={profile.firstName}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, firstName: e.target.value }))
                }
                className="w-full input-field px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={profile.lastName}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, lastName: e.target.value }))
                }
                className="w-full input-field px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-2">Email</label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, email: e.target.value }))
              }
              className="w-full input-field px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-body mb-2">Phone</label>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, phone: e.target.value }))
              }
              className="w-full input-field px-3 py-2"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
            <button
              onClick={() => setIsEditing(false)}
              className="btn-secondary px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="btn-primary px-4 py-2 text-sm font-medium"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
