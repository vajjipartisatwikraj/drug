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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-slate-400">Manage your preferences and account settings</p>
      </div>

      {/* Notifications Section */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">Email Notifications</p>
              <p className="text-xs text-slate-400">Receive email updates on document analysis</p>
            </div>
            <button
              onClick={() => handleToggle("emailNotifications")}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.emailNotifications ? "bg-blue-600" : "bg-slate-600"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.emailNotifications ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-slate-700 pt-4">
            <div>
              <p className="text-sm text-white font-medium">Report Reminders</p>
              <p className="text-xs text-slate-400">Get reminded about pending reports</p>
            </div>
            <button
              onClick={() => handleToggle("reportReminders")}
              className={`w-12 h-6 rounded-full transition-colors ${
                settings.reportReminders ? "bg-blue-600" : "bg-slate-600"
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
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Preferences</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Language</label>
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, language: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-400"
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
        <button className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
          Cancel
        </button>
        <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
