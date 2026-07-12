"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Loader2,
  Check,
  X,
  User,
  Lock,
  Plus,
  Trash2,
  Copy,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmModal from "@/components/confirm-modal";
import { useThemeStore } from "@/stores/theme";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface MeResponse {
  user: {
    id: string;
    username: string;
    email: string;
    totpEnabled: boolean;
  };
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: Record<string, boolean>;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface NotificationPreferences {
  emailOnInstall: boolean;
  emailOnCrash: boolean;
  emailOnRemove: boolean;
  emailOnApiKey: boolean;
}

type Phase = "idle" | "enabling" | "recovery";

function ThemeSection() {
  const { theme, setTheme } = useThemeStore();

  const options = [
    { value: "dark" as const, label: "Dark", description: "Dark mode for reduced eye strain", icon: Moon },
    { value: "light" as const, label: "Light", description: "Light mode for bright environments", icon: Sun },
    { value: "system" as const, label: "System", description: "Follow your system preference", icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5" />
          Theme
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            const selected = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                  selected
                    ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    selected ? "text-brand-400" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { data: me, mutate, isLoading } = useSWR<MeResponse>(
    `/api/v1/auth/me`,
    (url: string) => fetchApi<MeResponse>(url)
  );

  const setUser = useAuthStore((s) => s.setUser);
  const totpEnabled = me?.user.totpEnabled ?? false;

  const [phase, setPhase] = useState<Phase>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Profile state
  const [profileUsername, setProfileUsername] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // API Keys state
  const { data: keysData, mutate: mutateKeys } = useSWR<{ keys: ApiKey[] }>(
    `/api/v1/auth/api-keys`,
    (url: string) => fetchApi<{ keys: ApiKey[] }>(url)
  );
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [newKeyCreating, setNewKeyCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  // Notification Preferences state
  const { data: notifData, mutate: mutateNotif } = useSWR<{ preferences: NotificationPreferences }>(
    `/api/v1/notifications/preferences`,
    (url: string) => fetchApi<{ preferences: NotificationPreferences }>(url)
  );
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    emailOnInstall: true,
    emailOnCrash: true,
    emailOnRemove: true,
    emailOnApiKey: true,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  useEffect(() => {
    if (notifData?.preferences) {
      setNotifPrefs(notifData.preferences);
    }
  }, [notifData]);

  // Populate profile fields when data loads
  useEffect(() => {
    if (me?.user) {
      setProfileUsername(me.user.username);
      setProfileEmail(me.user.email);
    }
  }, [me]);

  // Clear sensitive state on unmount
  useEffect(() => {
    return () => {
      setSecret("");
      setQrCode("");
      setCode("");
      setRecoveryCodes([]);
    };
  }, []);

  async function startEnable() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetchApi<{ secret: string; qrCode: string }>(
        `/api/v1/auth/2fa/enable`,
        { method: "POST" }
      );
      setSecret(res.secret);
      setQrCode(res.qrCode);
      setCode("");
      setPhase("enabling");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetchApi<{ recoveryCodes: string[] }>(
        `/api/v1/auth/2fa/confirm`,
        { method: "POST", body: JSON.stringify({ code }) }
      );
      setRecoveryCodes(res.recoveryCodes);
      setPhase("recovery");
      mutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!code && phase !== "idle") return;
    setError(null);
    setBusy(true);
    try {
      await fetchApi(`/api/v1/auth/2fa/disable`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setPhase("idle");
      setCode("");
      mutate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setProfileError(null);
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      await fetchApi(`/api/v1/auth/profile`, {
        method: "PUT",
        body: JSON.stringify({
          username: profileUsername !== me?.user.username ? profileUsername : undefined,
          email: profileEmail !== me?.user.email ? profileEmail : undefined,
          currentPassword: profilePassword,
        }),
      });
      setProfileSaved(true);
      setProfilePassword("");
      mutate();
      // Update auth store with new values
      if (me?.user) {
        setUser({
          ...me.user,
          username: profileUsername !== me?.user.username ? profileUsername : me.user.username,
          email: profileEmail !== me?.user.email ? profileEmail : me.user.email,
        });
      }
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword() {
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    setPasswordSaving(true);
    try {
      await fetchApi(`/api/v1/auth/password`, {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch (e) {
      setPasswordError((e as Error).message);
    } finally {
      setPasswordSaving(false);
    }
  }

  async function createApiKey() {
    setNewKeyCreating(true);
    try {
      const body: Record<string, unknown> = { name: newKeyName.trim() };
      if (newKeyExpiry) {
        body.expiresInDays = parseInt(newKeyExpiry, 10);
      }
      const res = await fetchApi<ApiKey & { key: string }>(`/api/v1/auth/api-keys`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreatedKey(res.key);
      mutateKeys();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNewKeyCreating(false);
    }
  }

  async function revokeApiKey(id: string) {
    try {
      await fetchApi(`/api/v1/auth/api-keys/${id}`, { method: "DELETE" });
      mutateKeys();
      setRevokeTarget(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveNotificationPreferences() {
    setNotifSaving(true);
    setNotifSaved(false);
    try {
      await fetchApi(`/api/v1/notifications/preferences`, {
        method: "PUT",
        body: JSON.stringify(notifPrefs),
      });
      setNotifSaved(true);
      mutateNotif();
      setTimeout(() => setNotifSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNotifSaving(false);
    }
  }

  const hasProfileChanges =
    profileUsername !== (me?.user?.username ?? "") ||
    profileEmail !== (me?.user?.email ?? "") ||
    profilePassword.length > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and security
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Username</label>
                <Input
                  value={profileUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setProfileUsername(e.target.value)
                  }
                  placeholder="Username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={profileEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setProfileEmail(e.target.value)
                  }
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Current Password <span className="text-muted-foreground">(required to save)</span>
                </label>
                <Input
                  type="password"
                  value={profilePassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setProfilePassword(e.target.value)
                  }
                  placeholder="Enter your current password"
                />
              </div>
              {profileError && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  {profileError}
                </p>
              )}
              {profileSaved && (
                <p className="text-sm text-emerald-400 bg-emerald-500/10 p-3 rounded-lg flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Profile updated successfully
                </p>
              )}
              <Button
                onClick={saveProfile}
                disabled={profileSaving || !hasProfileChanges}
              >
                {profileSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                {profileSaving ? "Saving..." : "Save Profile"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Change Password Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Current Password</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCurrentPassword(e.target.value)
              }
              placeholder="Enter current password"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewPassword(e.target.value)
              }
              placeholder="Min 8 characters"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm New Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(e.target.value)
              }
              placeholder="Re-enter new password"
            />
          </div>
          {passwordError && (
            <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              {passwordError}
            </p>
          )}
          {passwordSaved && (
            <p className="text-sm text-emerald-400 bg-emerald-500/10 p-3 rounded-lg flex items-center gap-2">
              <Check className="h-4 w-4" />
              Password changed successfully
            </p>
          )}
          <Button
            onClick={changePassword}
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {passwordSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            {passwordSaving ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>

      {/* 2FA Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Badge variant={totpEnabled ? "success" : "secondary"}>
                  {totpEnabled ? (
                    <ShieldCheck className="h-3 w-3 mr-1" />
                  ) : (
                    <ShieldOff className="h-3 w-3 mr-1" />
                  )}
                  {totpEnabled ? "Enabled" : "Disabled"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Protect your account with a TOTP authenticator app.
                </span>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  {error}
                </p>
              )}

              {phase === "idle" && (
                <Button onClick={totpEnabled ? () => setPhase("enabling") : startEnable}>
                  {totpEnabled ? "Reconfigure" : "Enable 2FA"}
                </Button>
              )}

              {phase === "enabling" && !totpEnabled && qrCode && (
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    Scan this QR code with your authenticator app, then enter the
                    6-digit code to confirm.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <img
                      src={qrCode}
                      alt="2FA QR code"
                      className="h-40 w-40 rounded-lg bg-white p-2"
                    />
                    <div className="flex-1 space-y-2 min-w-0">
                      <p className="text-xs text-muted-foreground">Manual key:</p>
                      <code className="block break-all text-xs bg-muted p-2 rounded">
                        {secret}
                      </code>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium">Verification code</label>
                      <Input
                        inputMode="numeric"
                        placeholder="123456"
                        value={code}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCode(e.target.value)
                        }
                      />
                    </div>
                    <Button onClick={confirmEnable} disabled={busy || code.length < 6}>
                      {busy ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      Confirm
                    </Button>
                  </div>
                </div>
              )}

              {phase === "enabling" && totpEnabled && (
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    Enter your current 2FA code to disable, then reconfigure.
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium">Current code</label>
                      <Input
                        inputMode="numeric"
                        placeholder="123456"
                        value={code}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCode(e.target.value)
                        }
                      />
                    </div>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        setError(null);
                        setBusy(true);
                        try {
                          await fetchApi(`/api/v1/auth/2fa/disable`, {
                            method: "POST",
                            body: JSON.stringify({ code }),
                          });
                          setPhase("idle");
                          setCode("");
                          mutate();
                          startEnable();
                        } catch (e) {
                          setError((e as Error).message);
                          setBusy(false);
                        }
                      }}
                      disabled={busy || code.length < 6}
                    >
                      Disable & Reconfigure
                    </Button>
                  </div>
                </div>
              )}

              {phase === "recovery" && (
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-brand-400" />
                    2FA enabled! Save these recovery codes.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Each code can be used once if you lose access to your
                    authenticator.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {recoveryCodes.map((c) => (
                      <code
                        key={c}
                        className="text-xs bg-muted p-2 rounded text-center"
                      >
                        {c}
                      </code>
                    ))}
                  </div>
                  <Button onClick={() => setPhase("idle")}>Done</Button>
                </div>
              )}

              {phase === "idle" && totpEnabled && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium">Current code to disable</label>
                    <Input
                      inputMode="numeric"
                      placeholder="123456"
                      value={code}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCode(e.target.value)
                      }
                    />
                  </div>
                  <Button
                    variant="destructive"
                    onClick={disable}
                    disabled={busy || code.length < 6}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-1" />
                    )}
                    Disable
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* API Keys Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            API Keys
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowKeyModal(true);
              setCreatedKey(null);
              setNewKeyName("");
              setNewKeyExpiry("");
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Key
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {keysData?.keys && keysData.keys.length === 0 && (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          )}
          {keysData?.keys && keysData.keys.length > 0 && (
            <div className="space-y-3">
              {keysData.keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{k.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                        {k.key_prefix}...
                      </span>
                      <span>
                        Created {new Date(k.created_at).toLocaleDateString()}
                      </span>
                      {k.last_used_at && (
                        <span>
                          Last used {new Date(k.last_used_at).toLocaleDateString()}
                        </span>
                      )}
                      {k.expires_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires {new Date(k.expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive flex-shrink-0"
                    onClick={() => setRevokeTarget(k)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose which email notifications you&apos;d like to receive.
          </p>
          {[
            { key: "emailOnInstall" as const, label: "Server installed", desc: "When a server finishes installing" },
            { key: "emailOnCrash" as const, label: "Server crashed", desc: "When a server crashes unexpectedly" },
            { key: "emailOnRemove" as const, label: "Server removed", desc: "When a server is deleted" },
            { key: "emailOnApiKey" as const, label: "API key created", desc: "When a new API key is created" },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between p-3 rounded-lg border border-border"
            >
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifPrefs[item.key]}
                onClick={() =>
                  setNotifPrefs((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                }
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-background",
                  notifPrefs[item.key] ? "bg-brand-500" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    notifPrefs[item.key] ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          ))}
          {notifSaved && (
            <p className="text-sm text-emerald-400 bg-emerald-500/10 p-3 rounded-lg flex items-center gap-2">
              <Check className="h-4 w-4" />
              Preferences saved
            </p>
          )}
          <Button onClick={saveNotificationPreferences} disabled={notifSaving}>
            {notifSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {notifSaving ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>

      {/* Create API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!createdKey) setShowKeyModal(false); }} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create API Key</h3>
              {!createdKey && (
                <button onClick={() => setShowKeyModal(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {createdKey ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-300">
                    This key is shown only once. Copy it now — you won't be able to see it again.
                  </p>
                </div>
                <div className="relative">
                  <Input
                    readOnly
                    value={createdKey}
                    className="font-mono text-xs pr-10"
                    onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                      (e.target as HTMLInputElement).select();
                    }}
                  />
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(createdKey);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setShowKeyModal(false);
                    setCreatedKey(null);
                  }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    placeholder="e.g. CI/CD Pipeline"
                    value={newKeyName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewKeyName(e.target.value)
                    }
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Expires in (days) <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Leave empty for no expiry"
                    value={newKeyExpiry}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewKeyExpiry(e.target.value)
                    }
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" size="sm" onClick={() => setShowKeyModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={createApiKey}
                    disabled={newKeyCreating || !newKeyName.trim()}
                  >
                    {newKeyCreating ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Create
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Theme Section */}
      <ThemeSection />

      {/* Revoke Confirmation Modal */}
      <ConfirmModal
        open={!!revokeTarget}
        title="Revoke API Key"
        description={`Are you sure you want to revoke "${revokeTarget?.name}"? Any application using this key will stop working.`}
        confirmLabel="Revoke"
        variant="danger"
        onConfirm={() => revokeTarget && revokeApiKey(revokeTarget.id)}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
