import { describe, expect, it } from 'vitest';
import { parseVoice } from './parse';

describe('voice transaction', () => {
  const today = '2026-01-01';
  it.each([
    ['3천원', 3000], ['3,000원', 3000], ['3000 원', 3000], ['3만5천원', 35000],
    ['12000원', 12000], ['삼천 원', 3000], ['만오천원', 15000],
  ])('reads %s', (phrase, amount) => {
    expect(parseVoice(`지금 마트에서 ${phrase} 결제했어. 추가해줘.`, today))
      .toEqual({ amount, type: 'expense', occurredOn: today, memo: '마트', merchant: '마트' });
  });
  it('keeps repeated amounts but rejects ambiguous or missing amounts', () => {
    expect(parseVoice('3천원. 삼천 원.', today)?.amount).toBe(3000);
    expect(parseVoice('삼천원 오천원', today)).toBeNull();
    expect(parseVoice('어제 31일에 결제했어', today)).toBeNull();
  });
  it.each([['어제', '2025-12-31'], ['그제', '2025-12-30'], ['그저께', '2025-12-30'], ['31일', '2025-12-31'], ['1일', today]])('dates %s', (when, occurredOn) => {
    expect(parseVoice(`${when} 월급 12000 원 받았어`, today)).toMatchObject({ type: 'income', occurredOn, merchant: null });
  });
  it('rejects impossible dates', () => {
    expect(parseVoice('31일에 만원', '2026-03-01')).toBeNull();
  });
  it.each([
    ['스타벅스 만오천원', '스타벅스'],
    ['택시비 12000원', '택시비'],
    ['점심 김밥천국 8천 원', '점심 김밥천국'],
    ['15일 이마트 3만5천원 카드로 결제', '이마트'],
    ['월급 300만원 들어왔어', '월급'],
    ['오늘 커피를 현금으로 3,000원을 결제했어. 추가해줘.', '커피'],
    ['어제 GS25 3000 썼어', 'GS25'],
    ['지금 삼천 원 썼어', '지출'],
    ['어제 만원 받았어', '수입'],
  ])('keeps the description from %s', (phrase, memo) => {
    expect(parseVoice(phrase, today)).toMatchObject({ memo, merchant: null });
  });
});
