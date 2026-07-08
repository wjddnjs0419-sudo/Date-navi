import { Home, Trees, Heart, Wallet, Moon, PartyPopper, Camera, Coffee, ShieldCheck, MapPin, Sparkles } from 'lucide-react-native';
import { getCardStyle } from '../lib/tagStyle';
import { C } from '../constants/colors';

describe('getCardStyle', () => {
  it('영어 태그 indoor는 Home 아이콘 + gray 톤', () => {
    const style = getCardStyle(['indoor']);
    expect(style.Icon).toBe(Home);
    expect(style.bg).toBe(C.gray);
    expect(style.fg).toBe(C.grayFg);
  });

  it('한국어 태그 야외는 Trees 아이콘 + mint 톤', () => {
    const style = getCardStyle(['야외']);
    expect(style.Icon).toBe(Trees);
    expect(style.bg).toBe(C.mint);
  });

  it('romantic/cozy 계열은 Heart 아이콘', () => {
    expect(getCardStyle(['romantic']).Icon).toBe(Heart);
    expect(getCardStyle(['아늑한 분위기']).Icon).toBe(Heart);
  });

  it('여러 태그 중 첫 매칭되는 태그를 사용한다', () => {
    const style = getCardStyle(['문화', 'indoor', 'low travel', 'cheap']);
    expect(style.Icon).toBe(Home);
  });

  it('알 수 없는 태그는 기본값(Sparkles)로 폴백', () => {
    const style = getCardStyle(['알수없는태그']);
    expect(style.Icon).toBe(Sparkles);
  });

  it('태그가 없거나 undefined면 기본값으로 폴백', () => {
    expect(getCardStyle([]).Icon).toBe(Sparkles);
    expect(getCardStyle(undefined).Icon).toBe(Sparkles);
  });
});
