// Keep archived chapter records for historical progress, but do not offer
// chapters without active topics in the current student syllabus.
export function chaptersWithActiveTopics(chapters, topics) {
  const active = new Set(topics.filter(topic => topic.is_active === true).map(topic => topic.chapter_id));
  return chapters.filter(chapter => active.has(chapter.id));
}
