"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();

      if (mode === "signup") {
        // Check for an existing account before creating a new one. Without
        // this, resubmitting the signup form for an email that already has a
        // profile either silently no-ops (Supabase obscures repeat signups to
        // avoid leaking which emails are registered) or, worse, lets someone
        // create a second, unrelated account tied to an email they don't
        // control — neither confirms the existing account or gets the person
        // back into it, which is what they actually came here for.
        const statusRes = await fetch("/api/auth/account-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const status = statusRes.ok
          ? ((await statusRes.json()) as { exists: boolean; confirmed?: boolean })
          : { exists: false };

        if (status.exists && !status.confirmed) {
          const { error } = await supabase.auth.resend({ type: "signup", email });
          if (error) setError(error.message);
          else setMessage("That email already has an account pending confirmation — we've resent the confirmation link. Check your inbox.");
          setLoading(false);
          return;
        }

        if (status.exists && status.confirmed) {
          // There is no way to email someone their existing password — it's
          // hashed the moment it's set, and the app never has the plaintext
          // again. A reset link is the actual, secure equivalent: it gets
          // them back into the account without anyone (including us) ever
          // handling their password in the clear.
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
          });
          if (error) setError(error.message);
          else setMessage("That email already has an account — we've sent a link to reset the password, since we can't email you the existing one.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setError(error.message);
        } else if (username && data.user) {
          const { error: usernameError } = await supabase
            .from("profiles")
            .update({ username })
            .eq("id", data.user.id);
          if (usernameError) setError(`Signed up, but username couldn't be set: ${usernameError.message}`);
        }
        if (!error) {
          if (data.session) {
            // Email confirmation disabled — signed in immediately.
            router.push(next);
            router.refresh();
          } else {
            // The confirmation email may not land even for this brand-new
            // account — the built-in mailer is rate-limited and silently
            // drops sends past its cap — so offer an explicit resend instead
            // of leaving the user stuck re-submitting the form.
            setMessage("Check your email to confirm your account, then log in.");
            setAwaitingConfirmation(true);
          }
        }
      } else {
        // Login accepts either an email address or a username. The lookup
        // goes through our own route rather than calling the
        // resolve_username_email RPC directly — see
        // app/api/auth/resolve-username/route.ts for why.
        let loginEmail = identifier;
        if (!identifier.includes("@")) {
          let resolvedEmail: string | null = null;
          try {
            const res = await fetch("/api/auth/resolve-username", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: identifier }),
            });
            ({ email: resolvedEmail } = await res.json());
          } catch {
            // Falls through to the generic error below, same as a lookup miss.
          }
          if (!resolvedEmail) {
            setError("Invalid login credentials");
            setLoading(false);
            return;
          }
          loginEmail = resolvedEmail;
        }
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) setError(error.message);
        else {
          router.push(next);
          router.refresh();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    setError(null);
    setResending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) setError(error.message);
      else setMessage("Confirmation email sent again. Check your inbox (and spam folder).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the confirmation email.");
    } finally {
      setResending(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) {
        // Supabase's own message for "the Google provider isn't turned on in
        // this project" — a Dashboard setting, not something a retry fixes.
        // See docs/GOOGLE_OAUTH_SETUP.md for what's actually missing.
        setError(
          /provider is not enabled|unsupported provider/i.test(error.message)
            ? "Google sign-in isn't set up on this account yet. Use email/password below instead."
            : error.message,
        );
        setLoading(false);
      }
      // On success the browser redirects to Google; no need to reset loading.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in is unavailable right now.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Log in to your GSPS dashboard"
              : "Start scanning with structural reversion analysis"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === "login" ? (
              <Input
                type="text"
                placeholder="Email or username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
              />
            ) : (
              <>
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  type="text"
                  placeholder="Username (optional)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  pattern="[a-zA-Z0-9_]{3,32}"
                  title="3-32 characters: letters, numbers, underscores"
                  autoComplete="username"
                />
              </>
            )}
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === "login" && (
              <Link href="/forgot-password" className="self-end text-sm text-accent hover:underline">
                Forgot password?
              </Link>
            )}
            {error && <p className="text-sm text-bear">{error}</p>}
            {message && <p className="text-sm text-bull">{message}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Working…" : mode === "login" ? "Log in" : "Sign up"}
            </Button>
          </form>
          {mode === "signup" && awaitingConfirmation && (
            <Button variant="outline" onClick={handleResendConfirmation} disabled={resending || !email}>
              {resending ? "Sending…" : "Resend confirmation email"}
            </Button>
          )}
          <Button variant="outline" onClick={handleGoogle}>
            Continue with Google
          </Button>
          <p className="text-center text-sm text-muted">
            {mode === "login" ? (
              <>
                No account?{" "}
                <Link href="/signup" className="text-accent hover:underline">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="text-accent hover:underline">
                  Log in
                </Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
