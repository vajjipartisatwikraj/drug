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
    <div className="min-h-screen app-shell flex flex-col">
      {/* Navigation */}
      <nav className={`sticky top-0 z-50 backdrop-blur-md transition-all duration-300 ${isScrolled ? 'surface-strong shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[var(--color-success)] rounded-lg flex items-center justify-center font-bold text-lg text-[#0b1a1d]">
              DA
            </div>
            <span className="text-xl text-title">DrugAudit</span>
          </div>
          <button
            onClick={handleLoginClick}
            className="px-6 py-2.5 btn-primary"
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
              <h1 className="text-5xl md:text-6xl text-title leading-tight">
                Intelligent Drug Analysis & Compliance
              </h1>
              <p className="text-xl text-muted leading-relaxed">
                Streamline pharmaceutical compliance audits with AI-powered analysis. Upload documents, get instant insights, and ensure regulatory compliance effortlessly.
              </p>
            </div>
            <button
              onClick={handleLoginClick}
              className="inline-block px-8 py-4 btn-primary text-lg"
            >
              Get Started →
            </button>
          </div>

          {/* Hero Visual */}
          <div className="relative h-80 md:h-96">
            <div className="absolute inset-0 card-shell flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-6xl">📋</div>
                <p className="text-lg text-muted">Intelligent Document Analysis</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="surface-strong border-y border-[var(--color-border)] py-20">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-4xl text-title text-center mb-4">Powerful Features</h2>
            <p className="text-center text-muted mb-16 max-w-2xl mx-auto">
              Comprehensive tools designed for pharmaceutical compliance professionals
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="group card-shell p-8 hover-lift">
                <div className="w-14 h-14 bg-[var(--color-success)] rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-[#0b1a1d]">
                  <span className="text-2xl">🔍</span>
                </div>
                <h3 className="text-xl text-heading mb-3">AI-Powered Analysis</h3>
                <p className="text-muted leading-relaxed">
                  Advanced machine learning algorithms analyze pharmaceutical documents with precision and identify compliance issues instantly.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="group card-shell p-8 hover-lift">
                <div className="w-14 h-14 bg-[var(--color-success)] rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-[#0b1a1d]">
                  <span className="text-2xl">⚡</span>
                </div>
                <h3 className="text-xl text-heading mb-3">Real-Time Reports</h3>
                <p className="text-muted leading-relaxed">
                  Generate comprehensive compliance reports instantly. Export findings in multiple formats for easy sharing and documentation.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="group card-shell p-8 hover-lift">
                <div className="w-14 h-14 bg-[var(--color-success)] rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-[#0b1a1d]">
                  <span className="text-2xl">🔒</span>
                </div>
                <h3 className="text-xl text-heading mb-3">Secure & Compliant</h3>
                <p className="text-muted leading-relaxed">
                  Enterprise-grade security with full HIPAA compliance. Your data is encrypted and protected with industry-leading standards.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-4xl text-title text-center mb-16">How It Works</h2>

          <div className="grid md:grid-cols-4 gap-6 relative">
            {/* Steps */}
            {[
              { icon: '📤', title: 'Upload', desc: 'Upload pharmaceutical documents' },
              { icon: '🤖', title: 'Analyze', desc: 'AI processes and analyzes content' },
              { icon: '📊', title: 'Review', desc: 'Examine detailed findings' },
              { icon: '✅', title: 'Export', desc: 'Generate compliance reports' },
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="card-shell p-6 text-center">
                  <div className="text-4xl mb-4">{step.icon}</div>
                  <h3 className="text-heading text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-muted">{step.desc}</p>
                </div>
                {idx < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                    <div className="text-subtle text-2xl">→</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="surface-strong border-t border-[var(--color-border)] py-20">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl text-title mb-4">Ready to Streamline Your Audit Process?</h2>
            <p className="text-xl text-muted mb-10">
              Join pharmaceutical professionals using DrugAudit for faster, more accurate compliance audits.
            </p>
            <button
              onClick={handleLoginClick}
              className="px-10 py-4 btn-primary text-lg inline-block"
            >
              Start Auditing Today
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[var(--color-border)] py-12 surface-strong">
          <div className="max-w-6xl mx-auto px-6 text-center text-muted">
            <p>&copy; 2026 DrugAudit. Intelligent pharmaceutical compliance analysis.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
