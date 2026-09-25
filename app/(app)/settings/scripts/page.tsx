import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomScriptEditor } from "@/components/settings/custom-script-editor";

export default function CustomScriptsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">Custom scripts</h1>
        <p className="text-sm text-muted">
          Author your own entry/stop/target rules — a parallel, clearly-labeled system that never
          touches GSPS&apos;s own structural trade plan or scored verdict.
        </p>
      </div>

      <CustomScriptEditor />
    </div>
  );
}
