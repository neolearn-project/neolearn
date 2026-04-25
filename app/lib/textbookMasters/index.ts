import { MasterSubject } from "./types";
import { cbseClass6EnglishPoorvi } from "./cbse/class6/englishpoorvi";
import { cbseClass6Hindiमलहर } from "./cbse/class6/hindiमलहर";
import { cbseClass6MathematicsGanitaPrakash } from "./cbse/class6/mathematicsganitaPrakash";
import { cbseClass6SanskritDeepakam } from "./cbse/class6/sanskritdeepakam";
import { cbseClass6ScienceCuriosity } from "./cbse/class6/sciencecuriosity";
import { cbseClass6SocialScienceExploringSocietyIndiaandBeyond } from "./cbse/class6/socialScienceexploringSocietyIndiaandBeyond";

function keyOf(args: {
  board: string;
  classNumber: number;
  subjectName: string;
  bookName?: string;
}) {
  return [
    String(args.board || "").trim().toLowerCase(),
    Number(args.classNumber || 0),
    String(args.subjectName || "").trim().toLowerCase(),
    String(args.bookName || "").trim().toLowerCase(),
  ].join("|");
}

const masters: MasterSubject[] = [
  cbseClass6EnglishPoorvi,
  cbseClass6Hindiमलहर,
  cbseClass6MathematicsGanitaPrakash,
  cbseClass6SanskritDeepakam,
  cbseClass6ScienceCuriosity,
  cbseClass6SocialScienceExploringSocietyIndiaandBeyond,
];

export const TEXTBOOK_MASTERS: Record<string, MasterSubject> = Object.fromEntries(
  masters.map((m) => [
    keyOf({
      board: m.board,
      classNumber: m.classNumber,
      subjectName: m.subjectName,
      bookName: m.bookName || "",
    }),
    m,
  ])
);

export function getTextbookMaster(args: {
  board: string;
  classNumber: number;
  subjectName: string;
  bookName?: string;
}) {
  return (
    TEXTBOOK_MASTERS[
      keyOf({
        board: args.board,
        classNumber: args.classNumber,
        subjectName: args.subjectName,
        bookName: args.bookName || "",
      })
    ] || null
  );
}

export * from "./types";
