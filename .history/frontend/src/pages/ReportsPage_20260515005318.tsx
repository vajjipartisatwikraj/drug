import React from "react";

export const ReportsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Reports</h1>
        <p className="text-slate-400">View and manage audit reports</p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/80">
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Report ID
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr
                  key={i}
                  className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-slate-200">REP-{String(i).padStart(5, "0")}</td>
                  <td className="px-6 py-4 text-sm text-slate-200">BMR_Document_{i}.pdf</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 rounded-full text-xs bg-emerald-600/20 text-emerald-400">
                      Completed
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(Date.now() - i * 86400000).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-blue-400 hover:text-blue-300 font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
