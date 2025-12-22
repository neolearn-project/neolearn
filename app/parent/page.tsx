import { redirect } from "next/navigation";

export default function ParentRootPage() {
  // Whenever someone opens /parent, send them to the dashboard
  redirect("/parent/dashboard");
}
