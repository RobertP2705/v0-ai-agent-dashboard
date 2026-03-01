import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Brain } from "lucide-react"

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/15 shadow-[0_0_24px_rgba(239,68,68,0.15)]">
            <Brain className="h-7 w-7 text-destructive" />
          </div>
          <Card className="w-full rounded-xl border-border/80 bg-card/80 shadow-xl shadow-black/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-center text-sm font-semibold text-foreground">
                Authentication Error
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-center font-mono text-xs text-muted-foreground">
                {params?.error
                  ? `Error: ${params.error}`
                  : "An unspecified authentication error occurred."}
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">Try Again</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
