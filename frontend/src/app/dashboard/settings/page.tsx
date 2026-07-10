"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetchApi } from "@/lib/api";
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  ScanLine,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MeResponse {
  user: {
    id: string;
    username: string;
    email: string;
    totpEnabled: boolean;
  };
}

type Phase = "idle" | "enabling" | "recovery";

export default function SettingsPage() {
  const { data: me, mutate, isLoading } = useSWR<MeResponse>(
    `/api/v1/auth/me`,
    (url: string) => fetchApi<MeResponse>(url)
  );

  const totpEnabled = me?.user.totpEnabled ?? false;

  const [phase, setPhase] = useState<Phase>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account security
        </p>
      </div>

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
    </div>
  );
}
