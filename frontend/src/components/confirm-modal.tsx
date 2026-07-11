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
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    btnClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-yellow-500/10",
    iconColor: "text-yellow-500",
    btnClass: "bg-yellow-600 text-white hover:bg-yellow-700",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className={cn("flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center", cfg.iconBg)}>
            <Icon className={cn("h-5 w-5", cfg.iconColor)} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
