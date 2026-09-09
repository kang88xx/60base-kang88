export const missions = [
  { id: 'table', reward: 3500, title: '식탁 위의 작은 준비', category: '주방', duration: 5, level: '처음도 쉬워요', description: '수저와 그릇을 꺼내 한 사람의 식탁을 차려보세요.', steps: ['얼굴과 개인 문서가 화면에 없는지 확인해요.', '그릇, 수저, 컵을 하나씩 꺼내 식탁에 놓아요.', '두 손과 물건이 보이도록 자연스러운 속도로 움직여요.'], color: 'lime', icon: 'grid' },
  { id: 'laundry', reward: 2500, title: '차곡차곡, 수건 개기', category: '생활', duration: 3, level: '처음도 쉬워요', description: '마른 수건 세 장을 같은 크기로 접어 정리해요.', steps: ['평평한 곳에 마른 수건 세 장을 준비해요.', '한 장씩 펼치고, 접고, 포개는 과정을 기록해요.', '수건과 손이 화면 밖으로 나가지 않게 해요.'], color: 'blue', icon: 'folder' },
  { id: 'shelf', reward: 4500, title: '나만의 정리 순서', category: '정리', duration: 5, level: '가볍게 도전', description: '책과 작은 물건을 꺼내 선반 한 칸을 정리해요.', steps: ['이름, 주소, 민감한 문서는 먼저 치워요.', '선반 한 칸의 물건을 꺼내 분류해요.', '분류한 물건을 다시 놓는 동작까지 촬영해요.'], color: 'peach', icon: 'book' },
  { id: 'coffee', reward: 3000, title: '여유를 담는 한 잔', category: '주방', duration: 3, level: '처음도 쉬워요', description: '뜨겁지 않은 물로 컵과 음료를 준비하는 과정을 담아요.', steps: ['컵, 상온의 물, 음료 재료를 준비해요.', '재료를 꺼내고 음료를 만드는 과정을 담아요.', '촬영을 위해 위험한 도구나 뜨거운 물을 사용하지 않아요.'], color: 'lavender', icon: 'sun' },
  { id: 'bag', reward: 2500, title: '외출 전, 가방 챙기기', category: '생활', duration: 3, level: '처음도 쉬워요', description: '개인정보가 없는 물건으로 가방을 채워보세요.', steps: ['빈 가방과 수첩, 파우치 등 세 가지 물건을 준비해요.', '각 물건을 가방에 넣고 지퍼를 닫아요.', '열쇠 번호, 신분증, 카드 정보가 보이지 않게 해요.'], color: 'sand', icon: 'folder' },
  { id: 'recycle', reward: 4000, title: '분리해서, 가지런히', category: '정리', duration: 5, level: '가볍게 도전', description: '깨끗한 빈 용기를 종류별로 분류해요.', steps: ['날카롭지 않은 깨끗한 용기를 준비해요.', '주소 라벨을 제거한 뒤 종류별로 분류해요.', '마지막 정돈된 모습까지 잠시 담아요.'], color: 'mint', icon: 'grid' },
];
export const getMission = id => missions.find(m => m.id === id) || missions[0];
export const formatDuration = seconds => `${Math.floor((Number(seconds) || 0) / 60).toString().padStart(2, '0')}:${Math.floor((Number(seconds) || 0) % 60).toString().padStart(2, '0')}`;
export const formatBytes = bytes => bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil((bytes || 0) / 1024)} KB`;
export const statusLabel = status => status === 'ready' ? '준비 완료' : '초안';

// 시연용 보상·상품 정책이며 실제 지급액이나 판매 조건이 아닙니다.
export const formatMoney = amount => `${Number(amount || 0).toLocaleString('ko-KR')}원`;
export const reviewStatusLabel = status => ({submitted:'심사 대기',reviewing:'심사 중',approved:'통과',rejected:'반려'}[status] || '미제출');
export const products = [
  {id:'chest-mount',name:'스마트폰 체스트 마운트',category:'촬영 장비',price:15000,description:'두 손이 자유로운 1인칭 촬영을 위한 착용형 거치대 예시',icon:'camera',color:'lime',stock:20},
  {id:'phone-grip',name:'촬영용 스마트폰 그립',category:'촬영 장비',price:5000,description:'안정적으로 스마트폰을 잡는 보조 그립 예시',icon:'camera',color:'blue',stock:30},
  {id:'mini-tripod',name:'미니 삼각대',category:'촬영 장비',price:10000,description:'작업 준비와 고정 촬영에 사용하는 삼각대 예시',icon:'grid',color:'peach',stock:15},
  {id:'cleaning-kit',name:'렌즈 클리닝 키트',category:'관리 용품',price:3000,description:'촬영 전 렌즈를 정리하는 관리 용품 예시',icon:'sun',color:'mint',stock:50},
];
export const banks = [{code:'kb',name:'KB국민은행'},{code:'shinhan',name:'신한은행'},{code:'woori',name:'우리은행'},{code:'hana',name:'하나은행'},{code:'nh',name:'NH농협은행'},{code:'kakao',name:'카카오뱅크'},{code:'toss',name:'토스뱅크'}];
