import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { scorePassword } from "@/lib/utils";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  showStrength?: boolean;
  /** Solid light style used on the minimal auth surfaces. */
  solid?: boolean;
}

export function PasswordInput({ showStrength, solid, className, value, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const strength = scorePassword(String(value || ""));
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          className={cn(solid ? "input-solid pr-11" : "input pr-11 font-mono", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2",
            solid ? "text-slate-400 hover:text-slate-700" : "text-muted hover:text-content",
          )}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <AnimatePresence>
        {showStrength && value && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2"
          >
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-1.5 flex-1 rounded-full transition-colors"
                  style={{
                    background:
                      i < strength.score
                        ? strength.color
                        : "rgb(var(--border))",
                  }}
                />
              ))}
            </div>
            <span className="text-xs font-medium" style={{ color: strength.color }}>
              {strength.label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
