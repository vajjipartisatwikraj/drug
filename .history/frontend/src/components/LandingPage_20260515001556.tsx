import { useState } from 'react';

interface LandingPageProps {
  onLoginClick?: () => void;
}

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = (e.target as HTMLDivElement).scrollTop;
    setIsScrolled(scrollTop > 50);
  };

  const handleLoginClick = () => {
    if (onLoginClick) {
      onLoginClick();
    } else {
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white flex flex-col">
      {/* Navigation */}
      <nav className={`sticky top-0 z-50 backdrop-blur-md transition-all duration-300 ${isScrolled ? 'bg-blue-950/50 shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center font-bold text-lg">
              DA
            </div>
            <span className="text-xl font-bold">DrugAudit</span>
          </div>
          <button
            onClick={handleLoginClick}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-blue-500/50"
          >
            Login
          </button>
        </div>
      </nav>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold leading-tight bg-gradient-to-r from-blue-300 via-blue-400 to-blue-500 bg-clip-text text-transparent">
                Intelligent Drug Analysis & Compliance
              </h1>
              <p className="text-xl text-blue-100 leading-relaxed">
                Streamline pharmaceutical compliance audits with AI-powered analysis. Upload documents, get instant insights, and ensure regulatory compliance effortlessly.
              </p>
            </div>
            <button
              onClick={handleLoginClick}
              className="inline-block px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-blue-500/50 hover:scale-105"
            >
              Get Started →
            </button>
          </div>

          {/* Hero Visual */}
          <div className="relative h-80 md:h-96">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl backdrop-blur-sm border border-blue-400/30 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-6xl">📋</div>
                <p className="text-lg text-blue-200">Intelligent Document Analysis</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-blue-950/40 backdrop-blur-sm border-y border-blue-400/10 py-20">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-4xl font-bold text-center mb-4">Powerful Features</h2>
            <p className="text-center text-blue-200 mb-16 max-w-2xl mx-auto">
              Comprehensive tools designed for pharmaceutical compliance professionals
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="group bg-gradient-to-br from-blue-900/50 to-blue-950/50 rounded-xl p-8 border border-blue-400/20 hover:border-blue-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">🔍</span>
                </div>
                <h3 className="text-xl font-bold mb-3">AI-Powered Analysis</h3>
                <p className="text-blue-200 leading-relaxed">
                  Advanced machine learning algorithms analyze pharmaceutical documents with precision and identify compliance issues instantly.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="group bg-gradient-to-br from-blue-900/50 to-blue-950/50 rounded-xl p-8 border border-blue-400/20 hover:border-blue-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">⚡</span>
                </div>
                <h3 className="text-xl font-bold mb-3">Real-Time Reports</h3>
                <p className="text-blue-200 leading-relaxed">
                  Generate comprehensive compliance reports instantly. Export findings in multiple formats for easy sharing and documentation.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="group bg-gradient-to-br from-blue-900/50 to-blue-950/50 rounded-xl p-8 border border-blue-400/20 hover:border-blue-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">🔒</span>
                </div>
                <h3 className="text-xl font-bold mb-3">Secure & Compliant</h3>
                <p className="text-blue-200 leading-relaxed">
                  Enterprise-grade security with full HIPAA compliance. Your data is encrypted and protected with industry-leading standards.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-4xl font-bold text-center mb-16">How It Works</h2>

          <div className="grid md:grid-cols-4 gap-6 relative">
            {/* Steps */}
            {[
              { icon: '📤', title: 'Upload', desc: 'Upload pharmaceutical documents' },
              { icon: '🤖', title: 'Analyze', desc: 'AI processes and analyzes content' },
              { icon: '📊', title: 'Review', desc: 'Examine detailed findings' },
              { icon: '✅', title: 'Export', desc: 'Generate compliance reports' },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-gradient-to-br from-blue-900/60 to-blue-950/60 rounded-xl p-6 border border-blue-400/20 text-center">
                  <div className="text-4xl mb-4">{step.icon}</div>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-blue-200">{step.desc}</p>
                </div>
                {idx < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                    <div className="text-blue-400/30 text-2xl">→</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-gradient-to-r from-blue-900/60 to-blue-950/60 border-t border-blue-400/10 py-20">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl font-bold mb-4">Ready to Streamline Your Audit Process?</h2>
            <p className="text-xl text-blue-200 mb-10">
              Join pharmaceutical professionals using DrugAudit for faster, more accurate compliance audits.
            </p>
            <button
              onClick={handleLoginClick}
              className="px-10 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-blue-500/50 hover:scale-105 inline-block"
            >
              Start Auditing Today
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-blue-400/10 py-12 bg-slate-950/50">
          <div className="max-w-6xl mx-auto px-6 text-center text-blue-300">
            <p>&copy; 2026 DrugAudit. Intelligent pharmaceutical compliance analysis.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
