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
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/20">
            <Brain className="h-6 w-6 text-destructive" />
          </div>
          <Card className="w-full border-border bg-card">
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
