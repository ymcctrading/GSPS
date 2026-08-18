"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      });
      if (error) setError(error.message);
      else setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>
            Enter the email on your account and we&apos;ll send a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sent ? (
            <p className="text-sm text-bull">
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              {error && <p className="text-sm text-bear">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted">
            <Link href="/login" className="text-accent hover:underline">
              Back to log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
