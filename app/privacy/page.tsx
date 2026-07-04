import { permanentRedirect } from "next/navigation";

export default function PrivacyPage() {
  permanentRedirect("/privacy-policy");
}
