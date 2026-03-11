const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function main() {
  try {
    const services = await client.verify.v2.services.list({ limit: 20 });
    console.log("Found services:");
    for (const s of services) {
      console.log(`${s.sid} | ${s.friendlyName}`);
    }
  } catch (err) {
    console.error("LIST ERROR:");
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("status:", err.status);
    console.error("moreInfo:", err.moreInfo);
  }
}

main();