import { decidePersona, buildPersonaInstruction } from "./personaEngine";

function run(name: string, profile: any, question: string, signals: any = {}) {
  const decision = decidePersona(profile, { question, ...signals });
  console.log("\n==", name, "==");
  console.log("Q:", question);
  console.log("Decision:", decision);
  console.log("Instruction:\n", buildPersonaInstruction(decision));
}

const profileA = {
  preferred_language: "en",
  preferred_speed: "normal",
  explain_style: "step_by_step",
};

run("Confusion => slow + simple", profileA, "I don't understand, explain again", { topicId: "16" });
run("Hindi detected", null, "मुझे समझ नहीं आया", { topicId: "16" });
run("Bengali detected", null, "আমি বুঝতে পারছি না", { topicId: "16" });
run("Asked example => example_first", profileA, "Give me an example of fractions", { topicId: "16" });
run("Why/prove => detailed", profileA, "Why does this work? explain why", { topicId: "16" });
