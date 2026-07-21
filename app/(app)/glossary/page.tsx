import { Glossary } from "@/components/glossary";

export const metadata = { title: "Glossary — GSPS" };

export default function GlossaryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Glossary</h1>
        <p className="text-sm text-muted">
          Every term in GSPS, explained in plain English for beginners.
        </p>
      </div>
      <Glossary />
    </div>
  );
}
