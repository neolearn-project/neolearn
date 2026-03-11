const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;
const to = "+916009801220";
const code = process.argv[2];

async function main() {
  try {
    const result = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({
        to,
        code,
      });

    console.log("CHECK SUCCESS:");
    console.log("status:", result.status);
    console.log("valid:", result.valid);
  } catch (err) {
    console.error("CHECK ERROR:");
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("status:", err.status);
    console.error("moreInfo:", err.moreInfo);
  }
}

main();