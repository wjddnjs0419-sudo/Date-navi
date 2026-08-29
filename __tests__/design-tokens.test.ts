import { C, DS, R, SP, T } from '../constants/theme';

describe('product design tokens', () => {
  it('keeps the Loading and Input product baseline values stable', () => {
    expect(DS.color.canvas).toBe('#FFF9FC');
    expect(DS.color.brandPrimary).toBe('#F26B7A');
    expect(DS.color.brandSubtle).toBe('#FFEEF0');
    expect(DS.color.refineCandidate.contentStrong).toBe('#3B2E2E');
    expect(DS.color.selection.like).toEqual({
      background: '#FFF3E0',
      border: '#A77738',
      foreground: '#A77738',
      borderWidth: 2,
    });
    expect(DS.radius.input).toBe(16);
    expect(DS.radius.card).toBe(22);
    expect(DS.elevation.card).toEqual({});
    expect(DS.spacing.tab).toBe(64);
    expect(DS.exception.quickPlanningLoading).toEqual(expect.objectContaining({ compositionTop: 72, compositionBottom: 32 }));
  });

  it('keeps legacy aliases on the semantic source of truth', () => {
    expect(C.pink).toBe(DS.color.brandPrimary);
    expect(C.pinkLight).toBe(DS.color.brandSubtle);
    expect(C.refineCandidateStrong).toBe(DS.color.refineCandidate.contentStrong);
    expect(SP.screen).toBe(DS.spacing.screen);
    expect(R.input).toBe(DS.radius.input);
    expect(R.card).toBe(DS.radius.card);
    expect(T.inputTitle).toMatchObject({ fontSize: 26, lineHeight: 34, fontWeight: '700', color: DS.color.textPrimary });
    expect(T.button).toMatchObject({ fontSize: 15, lineHeight: 20, fontWeight: '600', color: DS.color.surface });
    expect(T.h1).toMatchObject({ fontSize: 22, lineHeight: 30, color: DS.color.textPrimary });
    expect(new Set([C.catMeal, C.catCafe, C.catWalk]).size).toBe(3);
  });
});
