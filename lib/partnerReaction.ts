export type ReactionRow = {
  card_id: string;
  reaction_type: string;
  condition_tag: string | null;
  created_at: string;
};

export function pickLatestReaction(rows: ReactionRow[]): ReactionRow | null {
  if (!rows.length) return null;
  return rows.reduce((latest, row) => (
    new Date(row.created_at).getTime() > new Date(latest.created_at).getTime() ? row : latest
  ));
}

export function formatReactionText(
  row: ReactionRow,
  labels: { condition: (tag: string) => string | undefined; reaction: (type: string) => string },
): string {
  const conditionLabel = row.condition_tag ? labels.condition(row.condition_tag) : undefined;
  const reactionLabel = labels.reaction(row.reaction_type);
  return conditionLabel ? `${conditionLabel} ${reactionLabel}` : reactionLabel;
}
