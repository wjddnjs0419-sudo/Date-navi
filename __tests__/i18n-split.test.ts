import { ko, en } from '../locales';

const ORIGINAL_NAMESPACES = [
  'language','common','tabs','settings','auth','home','nickname','coupleConnect',
  'preferences','mode','feeling','course','result','candidates','memories','card',
  'confirm','review','notifications','location','pickers','modeFlow','legal',
  'onboarding','splash','share','account','plans',
];

describe('i18n split barrel', () => {
  it('merged ko has every original namespace', () => {
    for (const ns of ORIGINAL_NAMESPACES) expect(ko).toHaveProperty(ns);
  });
  it('ko and en have identical top-level key sets', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });
  it('preserves a known deep key', () => {
    expect(typeof (ko as any).auth).toBe('object');
    expect(typeof (ko as any).home.greetingLine1).toBe('string');
  });
});
