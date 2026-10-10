// Public leaderboard entries contain derived anonymous labels, never user records.
export function communitySummary(store, currentUser) {
  const members = store.all(`
    WITH rewards AS (
      SELECT userId, SUM(amount) points FROM ledger WHERE kind='reward' GROUP BY userId
    ), approved AS (
      SELECT userId, COUNT(*) approvedVideoCount, COALESCE(SUM(duration),0) approvedSeconds
      FROM videos WHERE status='approved' GROUP BY userId
    )
    SELECT u.id, COALESCE(r.points,0) points,
      COALESCE(a.approvedVideoCount,0) approvedVideoCount, COALESCE(a.approvedSeconds,0) approvedSeconds
    FROM users u LEFT JOIN rewards r ON r.userId=u.id LEFT JOIN approved a ON a.userId=u.id
    WHERE u.role='member' AND u.status='active'
    ORDER BY points DESC, approvedSeconds DESC, u.id ASC
  `);
  let rank = 0, previousPoints = null, position = 0;
  const leaders = [], total = { approvedPoints: 0, approvedVideoCount: 0, approvedSeconds: 0, participantCount: 0 };
  let me = { rank: null, label: '나', points: 0, approvedVideoCount: 0, approvedSeconds: 0 };
  for (const member of members) {
    total.approvedPoints += member.points;
    total.approvedVideoCount += member.approvedVideoCount;
    total.approvedSeconds += member.approvedSeconds;
    if (member.points > 0 || member.approvedVideoCount > 0) total.participantCount++;
    let memberRank = null;
    if (member.points > 0) {
      if (member.points !== previousPoints) rank++;
      previousPoints = member.points;
      memberRank = rank;
      position++;
      if (leaders.length < 10) leaders.push({ rank, label: `참여자 ${String(position).padStart(3, '0')}`, isMe: member.id === currentUser.id, points: member.points, approvedVideoCount: member.approvedVideoCount, approvedSeconds: member.approvedSeconds });
    }
    if (member.id === currentUser.id) me = { rank: memberRank, label: '나', points: member.points, approvedVideoCount: member.approvedVideoCount, approvedSeconds: member.approvedSeconds };
  }
  return { period: 'all_time', rewardUnit: 'points', total, leaders, me };
}
