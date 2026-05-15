import React, { useState } from "react";

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    reportReminders: false,
    darkMode: true,
    language: "en",
  });

  const handleToggle = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl text-title mb-2">Settings</h1>
        <p className="text-muted">Manage your preferences and account settings</p>
      </div>

      {/* Notifications Section */}
      <div className="card-shell p-6">
        <h2 className="text-lg text-heading mb-4">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-body font-medium">Email Notifications</p>
              <p className="text-xs text-muted">Receive email updates on document analysis</p>
            </div>
            <button
              onClick={() => handleToggle("emailNotifications")}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.emailNotifications ? "bg-[var(--color-success)]" : "bg-[var(--color-border-strong)]"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.emailNotifications ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
            <div>
              <p className="text-sm text-body font-medium">Report Reminders</p>
              <p className="text-xs text-muted">Get reminded about pending reports</p>
            </div>
            <button
              onClick={() => handleToggle("reportReminders")}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.reportReminders ? "bg-[var(--color-success)]" : "bg-[var(--color-border-strong)]"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.reportReminders ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Preferences Section */}
      <div className="card-shell p-6">
        <h2 className="text-lg text-heading mb-4">Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body mb-2">Language</label>
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, language: e.target.value }))
              }
              className="w-full input-field px-3 py-2"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button className="btn-secondary px-4 py-2 text-sm font-medium">
          Cancel
        </button>
        <button className="btn-primary px-4 py-2 text-sm font-medium">
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
