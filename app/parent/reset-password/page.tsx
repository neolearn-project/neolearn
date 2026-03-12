"use client";

import { useRouter } from "next/navigation";
import ResetPasswordForm from "@/app/components/ResetPasswordForm";

export default function ParentResetPasswordPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-sm border border-slate-200 p-5 text-sm">
        <div className="mb-4 text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase">NeoLearn</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Parent Reset Password</h1>
          <p className="mt-1 text-slate-600">
            Verify your parent mobile with OTP and set a new password.
          </p>
        </div>

        <ResetPasswordForm
          mode="parent"
          onDone={() => router.replace("/parent/login")}
          onBack={() => router.replace("/parent/login")}
        />
      </div>
    </div>
  );
}