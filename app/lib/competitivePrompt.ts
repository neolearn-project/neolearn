export function isCompetitiveMode(value: unknown): boolean {
  return String(value || "").trim().toLowerCase() === "competitive";
}

export function competitiveExamLabel(value: unknown): string {
  return String(value || "").trim() || "Competitive Exam";
}

export const COMPETITIVE_RESPONSE_STRUCTURE = [
  "Exam relevance",
  "Deep concept explanation",
  "Key formulas/facts/rules",
  "Step-by-step solved example",
  "Shortcut/trick",
  "Common mistakes/traps",
  "Exam-style MCQs",
  "Answer explanations",
  "Quick revision points",
  "Next practice task",
];

type CompetitiveResponseType = "lesson" | "doubt" | "notes";

function isNumericalCompetitiveSubject(subject: unknown): boolean {
  return /\b(math|mathematics|physics|quant|aptitude|jee)\b/i.test(
    String(subject || "")
  );
}

export function buildCompetitiveStructureInstruction(
  exam: string,
  options: {
    responseType?: CompetitiveResponseType;
    subject?: string;
  } = {}
): string {
  const responseType = options.responseType || "doubt";
  const subject = String(options.subject || "").trim();
  const numericalSubject = isNumericalCompetitiveSubject(subject);
  const responseFocus =
    responseType === "lesson"
      ? "- This is a lesson: build the concept from first principles, then move into exam application."
      : responseType === "doubt"
      ? '- This is a doubt reply: do not repeat a full lesson; diagnose the doubt, give a fresh angle, use a new example, and include a compact "Weak Area Diagnosis" with targeted practice.'
      : "- This is notes content: keep it revision-first, compact, and highly scannable.";

  return `
Competitive Deep Mode for ${competitiveExamLabel(exam)}:
- Teach like a serious Indian competitive exam mentor: direct, precise, analytical, and exam-oriented.
- Keep the answer strictly exam-focused, conceptually deep, and practice-oriented.
- Cover the selected subject/chapter/topic only.
- Use compact bullets under each heading so the answer works on mobile.
- Use PDF-safe ASCII math notation: use => for arrows, x for multiplication, / for division, sqrt(...) for roots, ^ for powers, >= and <= for inequalities.
- Target 550-850 words for doubt replies and 850-1200 words for full lessons; stay compact by using bullets, not long paragraphs.
- Minimum depth: every concept section must include why it matters, how to apply it, and one exam-style edge case.
- No generic filler, praise, motivational padding, vague advice, or repeated definitions.
- Use subject-specific examples from the selected subject: numerical setup for Physics/Math/Chemistry, reaction/exception logic for Chemistry, NCERT-linked facts for Biology, passage/grammar evidence for English, and high-yield factual logic for Social Science/GK.
- Include exam-specific traps: units/signs, limiting cases, exception words, close distractors, misread data, over-generalized rules, and elimination mistakes.
- Add "Trap Alert:" bullets wherever a common exam mistake is likely.
- Add difficulty labels to practice items: Easy, Moderate, or Hard.
${responseFocus}
- Use the exact numbered headings below in this order:
1. Exam relevance
2. Deep concept explanation
3. Key formulas/facts/rules
4. Step-by-step solved example
5. Shortcut/trick
6. Common mistakes/traps
7. Exam-style MCQs
8. Answer explanations
9. Quick revision points
10. Next practice task
- For headings 1-6, use 2-4 high-value bullets each.
- In section 7, include exactly 5 exam-style MCQs.
- Each MCQ must show difficulty (Easy/Moderate/Hard), four options (A-D), correct answer, and a compact explanation.
- Every MCQ correct answer must exactly match one option and must match the explanation/calculation.
- In section 8, explain all 5 MCQs: why the correct option is correct and why one tempting wrong option fails.
${numericalSubject ? "- For Physics/Math, at least 2 of the 5 MCQs must be numerical or application-based with values, formula use, and calculation logic." : "- For non-numerical subjects, at least 2 of the 5 MCQs must be application, assertion, passage, case, statement-pair, or elimination-based."}
- For numerical subjects, show formula, substitution, calculation steps, units, and final answer.
- For theory subjects, include high-yield facts, elimination logic, and trap options.
- Make shortcuts safe: explain when the shortcut applies and when it fails.
- Quick revision points must be concise, memory-ready bullets only; no long paragraphs.
- Next practice task must be one concrete task with difficulty and expected time.
- Avoid repeating the same wording, example, or MCQ pattern across lesson and doubt replies; use a fresh angle when answering a doubt.
${responseType === "doubt" ? '- After section 10, add "Weak Area Diagnosis" with 2-3 likely weak concepts, 5 targeted practice questions, answer key, compact explanations, and short improvement advice.' : ""}
`.trim();
}

export function buildCompetitiveJsonQuestionInstruction(exam: string): string {
  return `
Competitive Deep Mode for ${competitiveExamLabel(exam)}:
- Create Indian competitive exam-style MCQs that test concept depth, application, and common traps.
- Avoid generic recall unless the selected topic is factual.
- Prefer previous-exam style wording, tight data, plausible distractors, and one clearly tempting trap option.
- Add a difficulty label to every question: Easy, Moderate, or Hard.
- Options must be concise, parallel, and mutually exclusive.
- Options must be unique in meaning and value. Do not include equivalent options such as 5 and 25/5.
- Explanations must include answer logic, why the correct option is correct, and why one tempting wrong option fails.
- Before returning JSON, verify that correctIndex points to the exact option proven by the explanation.
- If an explanation contains a calculation or final numeric result, that result must be present in the correct option and must not point to a different numeric option.
- Never generate an explanation where the calculated answer is missing from the options; revise the options or correctIndex first.
- Keep every question strictly within the selected topic.
- Use PDF-safe ASCII math notation only: =>, x, /, sqrt(...), ^2, >=, <=.
- Keep explanations compact enough for mobile: 2-4 short sentences.
`.trim();
}
