import prisma from './prisma';

export async function recalculateLessonScore(
  studentId: string,
  lessonId: string
): Promise<void> {
  // 1. 获取该课程的所有句子
  const sentences = await prisma.sentence.findMany({
    where: { lessonId },
    select: { id: true },
  });
  const sentenceCount = sentences.length;
  if (sentenceCount === 0) return;

  // 2. 获取该学生该课程的所有录音
  const recordings = await prisma.recordingSubmission.findMany({
    where: { studentId, lessonId },
    select: { sentenceId: true, score: true },
  });

  // 3. 检查条件1：每个句子都有录音
  const coveredIds = new Set(recordings.map((r) => r.sentenceId));
  const allCovered = sentences.every((s) => coveredIds.has(s.id));

  // 4. 检查条件2：所有录音都已打分
  const allScored = recordings.length > 0 && recordings.every((r) => r.score !== null);

  if (!allCovered || !allScored) {
    // 条件不满足 → 删除奖杯记录（课程解锁）
    await prisma.lessonScore.deleteMany({ where: { studentId, lessonId } });
    return;
  }

  // 5. 计算分数
  const totalScore = recordings.reduce((sum, r) => sum + (r.score ?? 0), 0);
  const maxScore = sentenceCount * 5;
  const scorePercent = Math.round((totalScore / maxScore) * 100);
  const trophyLevel =
    scorePercent >= 80 ? 'gold' : scorePercent >= 50 ? 'silver' : 'bronze';

  // 6. Upsert LessonScore
  await prisma.lessonScore.upsert({
    where: { studentId_lessonId: { studentId, lessonId } },
    create: { studentId, lessonId, totalScore, maxScore, scorePercent, trophyLevel },
    update: { totalScore, maxScore, scorePercent, trophyLevel },
  });
}
