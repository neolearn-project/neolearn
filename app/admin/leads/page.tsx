import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin"); // send /admin/leads → /admin
}
