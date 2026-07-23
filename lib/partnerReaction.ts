export type ReactionRow = {
  card_id: string;
  reaction_type: string;
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
  labels: { reaction: (type: string) => string },
): string {
  return labels.reaction(row.reaction_type);
}

export type CardStatusRow = {
  id: string;
  title: string;
  status: string;
};

export function filterActiveCards(cards: CardStatusRow[]): CardStatusRow[] {
  return cards.filter(card => card.status === 'active');
}
