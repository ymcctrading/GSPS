import { Glossary } from "@/components/glossary";

export const metadata = { title: "Glossary — GSPS" };

export default function GlossaryPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Glossary</h1>
        <p className="text-sm text-muted">
          Every term in GSPS, explained in plain English for beginners.
        </p>
      </div>
      <Glossary />
    </div>
  );
}
