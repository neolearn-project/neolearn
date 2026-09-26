import { NextRequest } from "next/server";
import { requireStudentIdentity } from "@/lib/auth/ownership";
import { createStudentAiCreditHandler } from "@/app/lib/studentAiCreditVisibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createStudentAiCreditHandler({ requireStudentIdentity }) as
  (request: NextRequest) => Promise<Response>;
