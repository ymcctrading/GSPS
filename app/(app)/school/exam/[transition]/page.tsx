import { GraduationExam } from "@/components/school/graduation-exam";

export const metadata = { title: "Graduation exam — GSPS School" };

export default async function GraduationExamPage({ params }: { params: Promise<{ transition: string }> }) {
  const { transition } = await params;
  return <GraduationExam transition={transition} />;
}
