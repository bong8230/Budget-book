import type { Category } from '@/lib/db/types';

// Longest match wins: 쿠팡이츠 is food, while 쿠팡 is shopping.
const groups: Record<string, string> = {
  '식비': '이마트 홈플러스 롯데마트 하나로마트 노브랜드 트레이더스 코스트코 GS25 CU 씨유 세븐일레븐 이마트24 미니스톱 편의점 배달의민족 배민 쿠팡이츠 요기요 땡겨요 김밥천국 김가네 한솥 본죽 맘스터치 롯데리아 맥도날드 버거킹 서브웨이 써브웨이 KFC 교촌치킨 굽네치킨 피자헛 도미노피자 마트 식당 음식점 구내식당 배달',
  '카페·간식': '스타벅스 메가커피 메가MGC커피 컴포즈 투썸 이디야 커피빈 할리스 폴바셋 빽다방 파스쿠찌 엔제리너스 탐앤탐스 공차 매머드커피 더벤티 파리바게뜨 파리바게트 뚜레쥬르 던킨 배스킨라빈스 설빙 와플대학 카페 커피 빵집 베이커리',
  '생활': '다이소 크린토피아 빨래방 세탁소 철물점 열쇠집 생활용품 종량제봉투 우체국택배 코인세탁',
  '교통': '카카오T 카카오택시 티머니 코레일 SRT KTX 공항철도 서울교통공사 고속버스 시외버스 지하철 택시 버스 주차장 공영주차 하이패스 통행료 주유소 SK에너지 GS칼텍스 현대오일뱅크 에쓰오일 따릉이 쏘카 그린카',
  '주거·통신': 'SKT SK텔레콤 KT 케이티 LGU+ LG유플러스 SK브로드밴드 KT스카이라이프 넷플릭스 유튜브프리미엄 디즈니플러스 티빙 웨이브 왓챠 관리비 도시가스 한국전력 전기요금 수도요금 월세 인터넷요금 통신요금',
  '의료': '병원 약국 의원 치과 한의원 보건소 건강검진 응급실 조산원',
  '경조사': '축의금 부의금 조의금 경조금 결혼축하금 돌잔치 장례식장',
  '쇼핑': '쿠팡 11번가 무신사 올리브영 지마켓 G마켓 옥션 네이버쇼핑 롯데온 SSG닷컴 오늘의집 에이블리 지그재그 W컨셉 유니클로 자라 탑텐 스파오 신세계백화점 롯데백화점 현대백화점 아울렛 교보문고 알라딘 예스24',
  '급여': '급여 월급 상여금 성과급 보너스',
  '부수입': '부수입 용돈 부업 이자수입 배당금 강의료 원고료',
};

const compact = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const entries = Object.entries(groups).flatMap(([category, words]) =>
  words.split(' ').map(word => ({ category, word: compact(word) })),
).sort((a, b) => b.word.length - a.word.length);

export function normalizeMerchant(value: string): string {
  const name = value.normalize('NFKC').trim().toLowerCase();
  const base = name.replace(/(?:\s+|\s*\()([가-힣a-z0-9]+(?:지점|점))\)?$/, '');
  if (base !== name) return compact(base);
  const key = compact(name);
  const brand = entries.find(e => key.startsWith(e.word) && /^[가-힣0-9]+점$/.test(key.slice(e.word.length)));
  return brand?.word ?? key;
}

export function dictionaryCategory(text: string, merchant: string | null, categories: Category[]) {
  const allowed = new Map(categories.map(c => [c.name, c.id]));
  for (const input of [merchant, text]) {
    if (!input) continue;
    const normalized = input.normalize('NFKC').toLowerCase();
    const key = compact(normalized);
    const entry = entries.find(({ word }) => /^[a-z0-9+]+$/.test(word)
      ? new RegExp('(?<![a-z0-9])' + word.replace(/\+/g, '\\+') + '(?![a-z0-9])').test(normalized)
      : key.includes(word));
    if (entry) return allowed.get(entry.category) ?? null;
  }
  return null;
}
