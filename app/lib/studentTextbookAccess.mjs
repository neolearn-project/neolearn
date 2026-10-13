function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function studentCurriculumMatches({ student, subject }) {
  const classNumber = Number(student?.classNumber);
  return Boolean(
    subject &&
      Number.isInteger(classNumber) &&
      classNumber === Number(subject.class_number) &&
      normalized(student?.board) === normalized(subject.board)
  );
}

export function eligiblePublishedTextbooks({ mappings = [], student, subject }) {
  if (!studentCurriculumMatches({ student, subject })) return [];

  const eligible = mappings
    .map((mapping) => ({
      mapping,
      source: Array.isArray(mapping?.source) ? mapping.source[0] : mapping?.source,
    }))
    .filter(({ source }) => {
      if (
        !source ||
        source.status !== "published" ||
        !source.published_at ||
        source.unpublished_at ||
        normalized(source.board) !== normalized(student.board) ||
        Number(source.class_number) !== Number(student.classNumber) ||
        normalized(source.subject) !== normalized(subject.subject_name) ||
        !source.storage_path
      ) {
        return false;
      }
      return true;
    })
    .map(({ mapping, source }) => ({
      id: source.id,
      title: source.book_name,
      edition: source.edition,
      storagePath: source.storage_path,
      page: Number(mapping.page_from) || 1,
      publishedAt: source.published_at,
    }));

  const bySource = new Map();
  for (const book of eligible) {
    const current = bySource.get(book.id);
    if (!current || book.page < current.page) bySource.set(book.id, book);
  }
  return [...bySource.values()].sort((a, b) =>
    String(b.publishedAt).localeCompare(String(a.publishedAt))
  );
}
