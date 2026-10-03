"use client";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
export function ThemeToggle({ initial }: { initial: "light" | "dark" }) {
  const [theme, setTheme] = useState(initial);
  return (
    <button
      className="btn !px-3"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      onClick={() => {
        const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        document.documentElement.dataset.theme = next;
        document.cookie = `theme=${next};path=/;max-age=31536000;SameSite=Lax`;
      }}
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
