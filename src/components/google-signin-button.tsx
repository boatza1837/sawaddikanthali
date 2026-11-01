"use client";
import { useFormStatus } from "react-dom";
import { Button } from "./ui/button";
export function GoogleSignInButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} aria-busy={pending}>
      {pending ? "กำลังไปยัง Google…" : "Continue with Google"}
    </Button>
  );
}
