import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const revalidate = 0; // always fresh

async function getBatches() {
  const { data, error } = await supabaseAdmin
    .from("batches")
    .select("id,title,subject,class_label,capacity,created_at,enrollments(count)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function createBatch(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const classLabel = String(formData.get("class_label") ?? "");
  const capacity = Number(formData.get("capacity") ?? 30);

  if (!title) throw new Error("Title required");

  const { error } = await supabaseAdmin.from("batches").insert({
    title,
    subject,
    class_label: classLabel,
    capacity,
  });
  if (error) throw error;
}

async function deleteBatch(id: string) {
  "use server";
  const { error } = await supabaseAdmin.from("batches").delete().eq("id", id);
  if (error) throw error;
}

export default async function BatchesPage() {
  const batches = await getBatches();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Batches</h1>
        <p className="text-slate-500">Create and manage class batches.</p>
      </div>

      <form action={createBatch} className="grid gap-3 rounded-md border bg-white p-4 sm:grid-cols-4">
        <input name="title" placeholder="Title (e.g., MATH CLASS)" className="rounded border px-3 py-2" />
        <input name="subject" placeholder="Subject (e.g., Math)" className="rounded border px-3 py-2" />
        <input name="class_label" placeholder="Class label (e.g., 6)" className="rounded border px-3 py-2" />
        <input name="capacity" type="number" min={1} defaultValue={30} className="rounded border px-3 py-2" />
        <div className="sm:col-span-4">
          <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Create Batch</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Enrolled</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b: any) => {
              const count = b.enrollments?.[0]?.count ?? 0;
              return (
                <tr key={b.id} className="border-t">
                  <td className="px-4 py-3">{b.title}</td>
                  <td className="px-4 py-3">{b.subject}</td>
                  <td className="px-4 py-3">{b.class_label}</td>
                  <td className="px-4 py-3">{b.capacity}</td>
                  <td className="px-4 py-3">{count}</td>
                  <td className="px-4 py-3">
                    <form action={deleteBatch.bind(null, b.id)}>
                      <button className="rounded bg-red-600 px-3 py-1.5 text-white hover:bg-red-700">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {batches.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No batches yet. Create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
