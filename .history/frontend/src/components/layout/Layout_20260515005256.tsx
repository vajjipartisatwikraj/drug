import React from "react";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";

interface LayoutProps {
  children: React.ReactNode;
  user?: {
    username: string;
    role: string;
  } | null;
  onLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Navbar */}
      <Navbar user={user} onLogout={onLogout} />

      {/* Main Content Area */}
      <div className="flex flex-1 pt-16">
        {/* Sidebar */}
        <Sidebar userRole={user?.role || "auditor"} />

        {/* Content */}
        <main className="flex-1 ml-20 overflow-auto flex flex-col bg-slate-900">
          <div className="flex-1 overflow-auto px-6 py-8">
            {children}
          </div>

          {/* Footer */}
          <Footer />
        </main>
      </div>
    </div>
  );
};

export default Layout;
