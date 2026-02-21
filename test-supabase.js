const url = process.env.SUPABASE_REST_TEST_URL;
const apiKey = process.env.SUPABASE_REST_TEST_KEY;

if (!url || !apiKey) {
  console.error(
    "Missing SUPABASE_REST_TEST_URL or SUPABASE_REST_TEST_KEY. Set both env vars before running this diagnostic script."
  );
  process.exit(1);
}

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
    process.exit(1);
  }
}

main();
