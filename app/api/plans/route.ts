import { GET as getAdminPlans } from "@/app/api/admin/plans/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const response = await getAdminPlans();
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );
  return response;
}
