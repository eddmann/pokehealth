import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "🎮 Game" },
  { to: "/debug", label: "🔧 Debug" },
];

export default function Nav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-800/80 backdrop-blur-xl border-t border-slate-700 safe-bottom">
      <div className="max-w-md mx-auto flex">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "text-emerald-400 border-t-2 border-emerald-400"
                  : "text-slate-400 hover:text-slate-200"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
