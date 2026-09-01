import { AcademyView } from "@/components/school/academy-view";

export const metadata = { title: "Academy — GSPS School" };

export default async function AcademyPage({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  return <AcademyView academySlug={academySlug} />;
}
