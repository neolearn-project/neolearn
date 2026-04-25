export type MasterTopic = {
  number: number;
  name: string;
};

export type MasterChapter = {
  number: number;
  name: string;
  chapterType?: string;
  topics: MasterTopic[];
};

export type MasterSubject = {
  board: string;
  classNumber: number;
  subjectName: string;
  subjectCode: string;
  bookName?: string;
  textbookSeries?: string;
  chapters: MasterChapter[];
};
