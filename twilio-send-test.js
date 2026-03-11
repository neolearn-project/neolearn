const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
const to = "+916009801220";

async function main() {
  try {
    const result = await client.verify.v2
      .services(verifySid)
      .verifications.create({
        to,
        channel: "sms",
      });

    console.log("SEND SUCCESS:");
    console.log("sid:", result.sid);
    console.log("status:", result.status);
    console.log("to:", result.to);
  } catch (err) {
    console.error("SEND ERROR:");
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("status:", err.status);
    console.error("moreInfo:", err.moreInfo);
  }
}

main();