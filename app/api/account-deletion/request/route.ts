import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = "support@neolearn.co.in";

function missingTableMessage() {
  return `Account deletion requests are temporarily unavailable because the request database is not configured. Please email ${SUPPORT_EMAIL} with your registered account details.`;
}

function isMissingTableError(error: {
  code?: string;
  message?: string;
  details?: string;
}) {
  const message = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("account_deletion_requests") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find")))
  );
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request. Please check the form and try again.",
      },
      { status: 400 }
    );
  }

  try {
    const userType = String(body.userType || "").trim().toLowerCase();
    const mobile = String(body.mobile || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const reason = String(body.reason || "").trim();
    const confirmed = body.confirmed === true;

    if (userType !== "student" && userType !== "parent") {
      return NextResponse.json(
        { ok: false, error: "Please select Student or Parent." },
        { status: 400 }
      );
    }

    if (
      !mobile ||
      mobile.length > 20 ||
      !/^[0-9+\-()\s]{7,20}$/.test(mobile)
    ) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid registered mobile number." },
        { status: 400 }
      );
    }

    if (!name || name.length > 120) {
      return NextResponse.json(
        { ok: false, error: "Please enter the registered account name." },
        { status: 400 }
      );
    }

    if (
      email &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (reason.length > 1000) {
      return NextResponse.json(
        { ok: false, error: "Reason must be 1,000 characters or fewer." },
        { status: 400 }
      );
    }

    if (!confirmed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please confirm that you understand the deletion request.",
        },
        { status: 400 }
      );
    }

    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl || !serviceKey) {
      console.error(
        "account-deletion request error: Supabase server configuration missing"
      );
      return NextResponse.json(
        {
          ok: false,
          error: `Account deletion requests are temporarily unavailable. Please email ${SUPPORT_EMAIL} with your registered account details.`,
        },
        { status: 503 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("account_deletion_requests")
      .insert({
        user_type: userType,
        mobile,
        email: email || null,
        name,
        reason: reason || null,
        status: "pending",
      })
      .select("id, status, created_at")
      .single();

    if (error) {
      console.error("account-deletion request insert error:", error);

      if (isMissingTableError(error)) {
        return NextResponse.json(
          { ok: false, error: missingTableMessage() },
          { status: 503 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: `We could not submit your request. Please try again or email ${SUPPORT_EMAIL}.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        requestId: data.id,
        status: data.status,
        createdAt: data.created_at,
        message: "Account deletion request submitted for admin review.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("account-deletion request route error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: `We could not submit your request. Please try again or email ${SUPPORT_EMAIL}.`,
      },
      { status: 500 }
    );
  }
}
