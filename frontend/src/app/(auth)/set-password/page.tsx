import { Suspense } from "react";
import { SetPasswordForm } from "@/components/set-password-form";

// The token arrives as a query parameter, so this page cannot be prerendered.
export const dynamic = "force-dynamic";

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  );
}
