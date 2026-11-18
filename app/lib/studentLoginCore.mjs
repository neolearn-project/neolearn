export class StudentLoginError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function normalizeStudentMobile(value) {
  const raw = String(value || "").trim().replace(/[ ()-]/g, "");
  const mobile = raw.startsWith("+91") ? raw.slice(3) : raw;
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new StudentLoginError("Enter a valid Indian mobile number.");
  return mobile;
}
export function normalizeStudentSignup(body) {
  const mobile = normalizeStudentMobile(body.studentMobile ?? body.mobile);
  const username = String(body.studentUserId ?? body.username ?? "").trim().toLowerCase();
  const name = String(body.studentName ?? body.name ?? "").trim();
  const password = String(body.studentPassword ?? body.password ?? "");
  const track = String(body.track || "regular");
  const classId = String(body.classNumber ?? body.classId ?? "6");
  const board = String(body.board || "CBSE").toUpperCase();
  const competitiveExam = String(body.competitiveExam || "");
  const country = String(body.country || "India");
  const language = String(body.preferredLanguage || "English");
  const parentName = String(body.parentName || "").trim();
  const parentMobile = body.parentMobile ? normalizeStudentMobile(body.parentMobile) : "";
  if (username.startsWith("parent_") || !/^[a-z0-9._-]{4,40}$/.test(username)) throw new StudentLoginError("User ID must be 4–40 letters, numbers, dots, underscores or hyphens.");
  if (!name || name.length > 120 || password.length < 6 || password.length > 128) throw new StudentLoginError("Enter a name and a password of 6–128 characters.");
  if (!["regular", "competitive"].includes(track)) throw new StudentLoginError("Invalid learning track.");
  if (track === "regular" && (!["CBSE", "ICSE", "TBSE"].includes(board) || !/^(6|7|8|9|10|11|12)$/.test(classId))) throw new StudentLoginError("Choose a supported board and class.");
  if (track === "competitive" && !["JEE","NEET","CUET","SSC","Banking","UPSC","Foundation"].includes(competitiveExam)) throw new StudentLoginError("Choose a supported exam.");
  if (!["India","Bangladesh","Nepal"].includes(country) || !["English","Hindi","Bengali"].includes(language) || parentName.length > 120) throw new StudentLoginError("Invalid profile details.");
  return {mobile,username,name,password,track,classId,board,competitiveExam,country,language,parentName,parentMobile};
}
// Password is never persisted in challenge state or logs.
export function signupBinding(profile) {
  const {password, ...binding} = profile;
  return JSON.stringify(binding);
}
export function storedStudentFromResponse(data) {
  const st = data?.student;
  if (!st?.user_id || !data?.session?.access_token || !data?.session?.refresh_token) throw new StudentLoginError("Your session could not be opened. Please log in.");
  return {studentId:st.user_id,userId:st.user_id,username:st.username,name:st.full_name||st.name||"Student",mobile:st.mobile,classId:String(st.class_id||st.classId||"6"),board:st.board||"CBSE",track:st.track||"regular",subjectType:st.track||"regular",competitiveExam:st.competitiveExam||null,...data.session};
}
export function createStudentOtpFlow(deps) {
  return {
    async start({mobile,purpose,binding,request}) {
      if (!["student_login","student_signup","student_reset","parent_reset","parent_login","guardian_link"].includes(purpose)) throw new StudentLoginError("Invalid OTP purpose.");
      const reserved = await deps.reserve({mobile,purpose,binding,request});
      let target = null;
      if(purpose === "student_signup") await deps.checkSignup(mobile,binding);
      else target = deps.resolveTarget ? await deps.resolveTarget(purpose,mobile) : await deps.resolveStudent(mobile);
      // Unknown login numbers get the same shape and no SMS.
      const sid = ["student_signup","guardian_link","parent_login"].includes(purpose) || target ? await deps.send(mobile) : null;
      await deps.attach(reserved.id, sid, target?.id || null);
      return {ok:true,otpToken:reserved.id,retryAfter:60,expiresIn:600,message:"If this mobile is eligible, an OTP has been sent."};
    },
    async verify({mobile,purpose,binding,otpToken,otp}) {
      if (!/^[0-9a-f-]{36}$/i.test(otpToken || "") || !/^\d{6}$/.test(otp || "")) throw new StudentLoginError("Enter the six-digit OTP from your current request.");
      const claim = await deps.claim({mobile,purpose,binding,otpToken});
      let approved = false;
      try {
        approved = !!claim.provider_sid && await deps.check(claim.provider_sid, otp);
      } catch (error) {
        await deps.finish(claim, false);
        throw error;
      }
      // A successful code is consumed before any account/session operation.
      await deps.finish(claim, approved);
      if (!approved) throw new StudentLoginError("OTP is invalid or expired.",401);
      return claim.target_user_id;
    }
  };
}
