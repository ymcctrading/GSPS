import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SCHOOL_RESOURCES } from "@/lib/school/resources";
import { SchoolSubNav } from "@/components/school/sub-nav";

export function ResourcesView() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Resources</h1>
        <p className="text-sm text-muted">Published GSPS School reference material and templates.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SCHOOL_RESOURCES.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{r.title}</CardTitle>
                <Badge variant="muted">{r.category}</Badge>
              </div>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={r.href} className="text-sm font-medium text-accent hover:underline">
                Open →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <SchoolSubNav />
    </div>
  );
}
