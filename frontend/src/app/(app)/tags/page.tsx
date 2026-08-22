import { Suspense } from "react";
import { TagsManagement } from "@/components/tags-management";

export default function TagsPage() {
  return (
    <Suspense>
      <TagsManagement />
    </Suspense>
  );
}
