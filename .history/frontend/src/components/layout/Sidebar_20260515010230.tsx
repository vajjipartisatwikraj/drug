import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: string;
  adminOnly?: boolean;
}

interface SidebarProps {
  userRole?: string;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ userRole = "auditor", isExpanded, setIsExpanded }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 16l9-5V9m-9 16l-9-5V9m9 16v-5m0-5l-9-5m0 0l-2-1m2 1l2-1m9 1l9-5m-9 5l9-5"
          />
        </svg>
      ),
      path: "/audit",
    },
    {
      label: "Documents",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
      path: "/documents",
    },
    {
      label: "Reports",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
      path: "/reports",
    },
    {
      label: "Users",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 8.048M12 4.354L8.117 8.242m7.766 0L15.883 8.24M9 10h6m7 5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      ),
      path: "/admin-users",
      adminOnly: true,
    },
    {
      label: "Settings",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      path: "/settings",
    },
  ];

  const filteredItems = navItems.filter(
    (item) => !item.adminOnly || userRole === "admin"
  );

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className={`fixed left-0 top-16 bottom-0 bg-slate-800/90 border-r border-slate-700 transition-all duration-300 ease-in-out z-30 ${
        isExpanded ? "w-64" : "w-20"
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="h-full flex flex-col pt-6 pb-4 px-4 overflow-y-auto">
        {/* Navigation Items */}
        <nav className="space-y-2 flex-1">
          {filteredItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 group ${
                isActive(item.path)
                  ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
              title={!isExpanded ? item.label : ""}
            >
              <div className="flex-shrink-0">{item.icon}</div>
              <span
                className={`text-sm font-medium transition-all duration-200 ${
                  isExpanded ? "opacity-100" : "opacity-0 w-0"
                }`}
              >
                {item.label}
                {item.badge && (
                  <span className="ml-2 px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full">
                    {item.badge}
                  </span>
                )}
              </span>
            </button>
          ))}
        </nav>

        {/* Expand/Collapse Indicator */}
        <div className="pt-4 border-t border-slate-700/50">
          <div
            className={`text-xs text-slate-500 text-center transition-all duration-200 ${
              isExpanded ? "opacity-100" : "opacity-0"
            }`}
          >
            {isExpanded ? "◄ Collapse" : ""}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
