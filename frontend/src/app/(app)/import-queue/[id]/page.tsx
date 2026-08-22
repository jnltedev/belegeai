import { ReviewPanel } from "@/components/review-panel";

export default async function ImportQueueReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewPanel documentId={id} />;
}
