import React from "react";
import { Link, useLocation } from "react-router-dom";

interface TopbarProps {
  userName: string;
  onLogout: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ userName, onLogout }) => {
  const location = useLocation();

  const navLinks = [
    { path: "/dashboard", label: "Submissions" },
    { path: "/reports", label: "Reports" },
    { path: "/conditions", label: "Conditions" },
  ];

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Agapay Admin</h1>
              <p className="text-sm text-gray-500">Welcome, {userName}</p>
            </div>

            {/* Navigation Links */}
            <nav className="flex gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === link.path
                      ? "bg-emerald-100 text-emerald-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <button
            onClick={onLogout}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};
