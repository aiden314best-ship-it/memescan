"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconClose } from "./icons";

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "info" | "up" | "down" | "warn";
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-4), { ...t, id }]);
      setTimeout(() => dismiss(id), 12_000);
    },
    [dismiss],
  );
  const border = { info: "border-line", up: "border-up/50", down: "border-down/50", warn: "border-warn/50" };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-4 lg:items-end" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`card pointer-events-auto flex w-full max-w-sm items-start gap-3 border-l-4 p-3 shadow-lg ${border[t.tone]}`}>
            <div className="flex-1 text-sm">
              <p className="font-medium">{t.title}</p>
              {t.body && <p className="text-muted">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-fg">
              <IconClose width={16} height={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
