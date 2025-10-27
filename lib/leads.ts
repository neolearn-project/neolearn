export async function createBrowserLead(payload:{student_name:string;student_class:string;parent_phone:string;source?:string}){
  const res = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if(!res.ok){ const t = await res.text(); throw new Error(t || "Insert failed"); }
  return await res.json();
}
