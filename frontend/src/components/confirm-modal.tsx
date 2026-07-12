"use client";

import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

const variantConfig = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-400",
    btnClass:
      "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-glow-danger",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-400",
    btnClass:
      "bg-gradient-to-r from-yellow-600 to-yellow-500 text-white shadow-glow-warning",
  },
  info: {
    icon: Info,
    iconBg: "bg-brand-500/10",
    iconColor: "text-brand-400",
    btnClass: "",
  },
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative glass-card rounded-2xl shadow-glass w-full max-w-sm mx-4 p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
              cfg.iconBg
            )}
          >
            <Icon className={cn("h-5 w-5", cfg.iconColor)} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" className={cfg.btnClass} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
