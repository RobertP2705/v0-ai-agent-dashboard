"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Brain, Mail, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

export default function SignUpPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError("Email and password are required")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during sign up")
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="relative w-full max-w-sm">
          <div className="flex flex-col items-center gap-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-[0_0_24px_rgba(34,197,94,0.2)]">
              <Mail className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="w-full rounded-xl border border-border/80 bg-card/80 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <h2 className="text-sm font-medium text-foreground">
                  Check your email
                </h2>
                <p className="text-center font-mono text-xs text-muted-foreground">
                  {"We've sent a confirmation link to "}
                  <span className="font-semibold text-foreground">{email}</span>
                  {". Click the link to activate your account."}
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/login">Back to sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-[0_0_24px_rgba(34,197,94,0.2)]">
              <Brain className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Create Account
              </h1>
              <p className="mt-1.5 font-mono text-xs text-muted-foreground/70">
                Get started with Swarm Lab
              </p>
            </div>
          </div>

          <div className="w-full rounded-xl border border-border/80 bg-card/80 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
            <div className="flex flex-col gap-5">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              <form onSubmit={handleSignUp} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="text-xs text-foreground">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className="pl-8 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-xs text-foreground">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="pr-8 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-password" className="text-xs text-foreground">
                    Confirm Password
                  </Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    className="font-mono text-xs"
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/auth/login"
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          <p className="font-mono text-[10px] text-muted-foreground/50">
            Authorized personnel only
          </p>
        </div>
      </div>
    </div>
  )
}
