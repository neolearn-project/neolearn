// app/lib/teacherAvatar.ts

export function getAvatarForSubject(subjectName: string): string {
  const name = subjectName.toLowerCase();

  if (name.includes("math")) return "/avatars/niya-math.png";
  if (name.includes("science")) return "/avatars/niya-science.png";
  if (name.includes("english")) return "/avatars/niya-english.png";
  if (name.includes("social") || name.includes("sst") || name.includes("history") || name.includes("civics"))
    return "/avatars/niya-social.png";
  if (name.includes("computer") || name.includes("it") || name.includes("ict"))
    return "/avatars/niya-computer.png";
  if (name.includes("hindi"))
    return "/avatars/niya-hindi.png";

  // default fallback
  return "/avatars/niya-math.png";
}
