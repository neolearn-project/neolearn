const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

async function main() {
  console.log({ accountSid, verifySid });

  const client = twilio(accountSid, authToken);

  try {
    const result = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({
        to: "+916009801220",
        code: "255530",
      });

    console.log("SUCCESS:", result.status);
  } catch (err) {
    console.error("TWILIO ERROR:");
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("status:", err.status);
    console.error("moreInfo:", err.moreInfo);
    console.error("details:", err.details);
  }
}

main();