import { LessonPlayer } from "@/components/school/lesson-player";

export const metadata = { title: "Lesson — GSPS School" };

export default async function LessonPage({ params }: { params: Promise<{ lessonSlug: string[] }> }) {
  const { lessonSlug } = await params;
  const lessonId = lessonSlug.join("/");
  return <LessonPlayer lessonId={lessonId} />;
}
