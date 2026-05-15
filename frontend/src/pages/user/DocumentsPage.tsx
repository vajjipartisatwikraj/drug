import React from "react";

export const DocumentsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-title mb-2">Documents</h1>
        <p className="text-muted">Manage and view your uploaded BMR documents</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="card-shell p-4 hover-lift cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg surface-soft flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--color-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-xs px-2 py-1 rounded badge-success">Analyzed</span>
            </div>
            <h3 className="text-heading mb-1">BMR_Document_{i}.pdf</h3>
            <p className="text-xs text-muted">Uploaded 2 days ago</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentsPage;
