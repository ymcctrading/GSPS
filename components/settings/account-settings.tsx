"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserRound } from "lucide-react";

export function AccountSettings() {
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<{ error?: string; message?: string }>({});
  const [usernameLoading, setUsernameLoading] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ error?: string; message?: string }>({});
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      if (!data.user) return;
      supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profile }) => setUsername(profile?.username ?? ""));
    });
  }, []);

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUsernameStatus({});
    setUsernameLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ username: username || null })
        .eq("id", data.user.id);
      if (error) setUsernameStatus({ error: error.message.includes("unique") ? "That username is taken." : error.message });
      else setUsernameStatus({ message: "Username saved." });
    } catch (err) {
      setUsernameStatus({ error: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setUsernameLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus({});
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ error: "Passwords don't match" });
      return;
    }
    setPasswordLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setPasswordStatus({ error: error.message });
      else {
        setPasswordStatus({ message: "Password updated." });
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setPasswordStatus({ error: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-accent" /> Account
        </CardTitle>
        <CardDescription>{email ? `Signed in as ${email}` : "Username and password."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={handleUsernameSubmit} className="flex flex-col gap-2">
          <label className="text-sm text-muted" htmlFor="account-username">
            Username
          </label>
          <div className="flex gap-2">
            <Input
              id="account-username"
              type="text"
              placeholder="Choose a username (optional)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-zA-Z0-9_]{3,32}"
              title="3-32 characters: letters, numbers, underscores"
            />
            <Button type="submit" variant="outline" disabled={usernameLoading}>
              {usernameLoading ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted">Lets you log in with a handle instead of your email.</p>
          {usernameStatus.error && <p className="text-sm text-bear">{usernameStatus.error}</p>}
          {usernameStatus.message && <p className="text-sm text-bull">{usernameStatus.message}</p>}
        </form>

        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2 border-t border-border pt-4">
          <label className="text-sm text-muted" htmlFor="account-new-password">
            Change password
          </label>
          <Input
            id="account-new-password"
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
          />
          <Button type="submit" variant="outline" disabled={passwordLoading} className="self-start">
            {passwordLoading ? "Updating…" : "Update password"}
          </Button>
          {passwordStatus.error && <p className="text-sm text-bear">{passwordStatus.error}</p>}
          {passwordStatus.message && <p className="text-sm text-bull">{passwordStatus.message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
