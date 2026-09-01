import { CourseView } from "@/components/school/course-view";

export const metadata = { title: "Course — GSPS School" };

export default async function CoursePage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  return <CourseView courseSlug={courseSlug} />;
}
