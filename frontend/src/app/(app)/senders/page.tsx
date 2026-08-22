import { Suspense } from "react";
import { SendersManagement } from "@/components/senders-management";

export default function SendersPage() {
  return (
    <Suspense>
      <SendersManagement />
    </Suspense>
  );
}
