import React, { useState } from "react";
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
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  return (
    <div className="min-h-screen app-shell flex flex-col">
      {/* Navbar */}
      <Navbar user={user} onLogout={onLogout} />

      {/* Main Content Area */}
      <div className="flex flex-1 pt-16">
        {/* Sidebar */}
        <Sidebar userRole={user?.role || "auditor"} isExpanded={sidebarExpanded} setIsExpanded={setSidebarExpanded} />

        {/* Content - dynamically adjusts margin based on sidebar state */}
        <main className={`flex-1 overflow-auto flex flex-col app-shell transition-all duration-300 ease-in-out ${
          sidebarExpanded ? "ml-64" : "ml-20"
        }`}>
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
