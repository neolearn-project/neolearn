import { supabaseAdmin } from "@/lib/supabaseAdmin";

export class OwnershipError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

function bearerToken(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function authenticatedUser(req: Request) {
  const token = bearerToken(req);
  if (!token) throw new OwnershipError("Authentication required.", 401);

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new OwnershipError("Invalid or expired session.", 401);
  }

  return { admin, user: data.user, token };
}

export async function requireStudentIdentity(req: Request) {
  const { admin, user, token } = await authenticatedUser(req);

  const { data: studentRows, error: studentError } = await admin
    .from("students")
    .select("phone")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1);

  if (studentError) throw new OwnershipError("Unable to verify student identity.", 500);

  let mobile = String(studentRows?.[0]?.phone || "").trim();

  if (!mobile) {
    const { data: profile, error: profileError } = await admin
      .from("student_profile")
      .select("mobile")
      .eq("student_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new OwnershipError("Unable to verify student profile.", 500);
    }
    mobile = String(profile?.mobile || "").trim();
  }

  if (!/^\d{10}$/.test(mobile)) {
    throw new OwnershipError("Authenticated student profile is not linked.", 403);
  }

  return { admin, user, token, mobile };
}

export async function requireParentIdentity(req: Request) {
  const { admin, user, token } = await authenticatedUser(req);
  const { data: profile, error } = await admin
    .from("parent_profile")
    .select("mobile")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new OwnershipError("Unable to verify parent identity.", 500);

  const mobile = String(profile?.mobile || "").trim();
  if (!/^\d{10}$/.test(mobile)) {
    throw new OwnershipError("Authenticated parent profile is not linked.", 403);
  }

  return { admin, user, token, mobile };
}

export async function requireStudentMobile(req: Request, requestedMobile: string) {
  const identity = await requireStudentIdentity(req);
  if (identity.mobile !== requestedMobile) {
    throw new OwnershipError("Student access denied.", 403);
  }
  return identity;
}

export async function requireParentMobile(req: Request, requestedMobile: string) {
  const identity = await requireParentIdentity(req);
  if (identity.mobile !== requestedMobile) {
    throw new OwnershipError("Parent access denied.", 403);
  }
  return identity;
}

export async function requireParentChild(req: Request, childMobile: string) {
  const identity = await requireParentIdentity(req);
  const { data: child, error } = await identity.admin
    .from("children")
    .select("id, parent_mobile, child_mobile")
    .eq("parent_mobile", identity.mobile)
    .eq("child_mobile", childMobile)
    .limit(1)
    .maybeSingle();

  if (error) throw new OwnershipError("Unable to verify child ownership.", 500);
  if (!child) throw new OwnershipError("Child access denied.", 403);

  return { ...identity, child };
}

export async function requireStudentOrParentChild(req: Request, studentMobile: string) {
  try {
    return { kind: "student" as const, ...(await requireStudentMobile(req, studentMobile)) };
  } catch (error) {
    if (error instanceof OwnershipError && error.status >= 500) throw error;
  }

  return { kind: "parent" as const, ...(await requireParentChild(req, studentMobile)) };
}

export function isTrustedCronRequest(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  return (
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`
  );
}

export function ownershipErrorResponse(error: unknown) {
  const status = error instanceof OwnershipError ? error.status : 500;
  const message =
    error instanceof OwnershipError ? error.message : "Authorization check failed.";
  return Response.json({ ok: false, error: message }, { status });
}
