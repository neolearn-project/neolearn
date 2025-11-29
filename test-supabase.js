const url =
  "https://hnhynkbwxlbtyyjbwifr.supabase.co/rest/v1/subjects?select=*";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuaHlua2J3eGxidHl5amJ3aWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNDUxNzQsImV4cCI6MjA3MTYyMTE3NH0.HrHuEQhlbTJuca7RdW0U2XDVsYryV4W028HFAXDFfts";

async function main() {
  try {
    const res = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });

    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Body:", data);
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

main();