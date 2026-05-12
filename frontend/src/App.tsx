import { FileUpload } from "./components/FileUpload";
import { AuditPreview } from "./components/AuditPreview";
import { StatusBadge } from "./components/StatusBadge";
import { PageNav } from "./components/PageNav";
import { useAudit } from "./hooks/useAudit";

function App() {
  const {
    markdown,
    status,
    error,
    elapsedTime,
    pipelineChecks,
    uploadAndAudit,
    reset,
  } = useAudit();

  const handleFileSelect = async (file: File) => {
    await uploadAndAudit(file);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800/80 border-b border-slate-700 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">
                  BMR Audit System
                </h1>
                <p className="text-sm text-slate-400">
                  Pharmaceutical Document Analysis
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <StatusBadge status={status} />
              {status !== "idle" && elapsedTime && (
                <span className="text-sm text-slate-300 font-mono">
                  Elapsed: {elapsedTime}
                </span>
              )}

              {status !== "idle" && (
                <button
                  onClick={reset}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  New Audit
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        {status === "idle" ? (
          /* Upload View */
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-white mb-2">
                Upload Batch Manufacturing Record
              </h2>
              <p className="text-slate-400">
                Upload your BMR PDF for comprehensive audit with mathematical
                validation
              </p>
            </div>

            <FileUpload
              onFileSelect={handleFileSelect}
              disabled={status !== "idle"}
            />

            {/* Features List */}
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                {
                  icon: "🔍",
                  title: "OCR Extraction",
                  desc: "High-fidelity text extraction",
                },
                {
                  icon: "✍️",
                  title: "Signature Detection",
                  desc: "Identify handwritten entries",
                },
                {
                  icon: "🧮",
                  title: "Math Validation",
                  desc: "Zero-trust local math engine",
                },
                {
                  icon: "📊",
                  title: "Cross-Page Check",
                  desc: "Batch consistency validation",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="flex items-start gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <span className="text-2xl">{feature.icon}</span>
                  <div>
                    <h3 className="font-medium text-white">{feature.title}</h3>
                    <p className="text-sm text-slate-400">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Audit View */
          <div className="grid grid-cols-12 gap-6">
            {/* Sidebar */}
            <aside className="col-span-3 space-y-4 lg:sticky lg:top-24 lg:self-start">
              <PageNav markdown={markdown} status={status} />

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Error
                  </h3>
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="text-sm font-medium text-slate-300 mb-3">
                  Pipeline Validation
                </h3>
                <div className="space-y-2">
                  {pipelineChecks.map((step) => (
                    <div key={step.key} className="flex items-start gap-2">
                      <span
                        className={`mt-1 inline-block w-2.5 h-2.5 rounded-full ${
                          step.status === "done"
                            ? "bg-emerald-400"
                            : step.status === "in_progress"
                              ? "bg-amber-400"
                              : step.status === "error"
                                ? "bg-red-400"
                                : "bg-slate-600"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-200">{step.label}</p>
                        {step.message && (
                          <p
                            className="text-[11px] text-slate-400 truncate"
                            title={step.message}
                          >
                            {step.message}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <h3 className="text-sm font-medium text-slate-400 mb-3">
                  Legend
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50"></span>
                    <span className="text-slate-300">Pass - Verified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/50"></span>
                    <span className="text-slate-300">Fail - Issues Found</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50"></span>
                    <span className="text-slate-300">Processing</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Preview */}
            <div className="col-span-9">
              <div className="min-h-[80vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-800/30 p-6 scroll-smooth">
                <AuditPreview
                  markdown={markdown}
                  isStreaming={
                    status === "processing" || status === "uploading"
                  }
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 py-4 mt-8 hidden">
        <div className="absolute bottom-4 w-full text-center text-xs text-slate-500 font-medium">
          <p>
            BMR Audit System powered by Gemma-4-31B-IT AI with Local Math Engine
            Verification.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
