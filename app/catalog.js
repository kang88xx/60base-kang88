// App presentation metadata mirrors the currently published filming activities.
// Rewards and open intake are read from the authoritative public catalog.
export const examples=[
  {id:'dishwashing',label:'설거지',title:'주방 설거지 예시',src:'../assets/videos/collection/dishwashing.mp4',poster:'../assets/videos/collection/dishwashing.jpg',note:'손, 싱크대, 식기가 한 화면에 들어오는지 확인하세요.'},
  {id:'folding-clothes',label:'빨래 개기',title:'의류 정리 예시',src:'../assets/videos/collection/folding-clothes.mp4',poster:'../assets/videos/collection/folding-clothes.jpg',note:'옷 전체와 접는 손의 움직임이 잘리지 않게 촬영합니다.'},
  {id:'cutting-vegetables',label:'채소 손질',title:'채소 손질 예시',src:'../assets/videos/collection/cutting-vegetables.mp4',poster:'../assets/videos/collection/cutting-vegetables.jpg',note:'칼을 쓰는 장면은 천천히, 안전을 우선해 기록합니다.'},
  {id:'vacuuming',label:'바닥 청소',title:'거실 바닥 청소 예시',src:'../assets/videos/collection/vacuuming.mp4',poster:'../assets/videos/collection/vacuuming.jpg',note:'청소기 헤드와 바닥의 이동 경로가 함께 보이도록 촬영합니다.'},
  {id:'folding-towels',label:'수건 접기',title:'수건 접기 예시',src:'../assets/videos/collection/folding-towels.mp4',poster:'../assets/videos/collection/folding-towels.jpg',note:'수건 전체와 접고 정리하는 손의 움직임이 함께 보이도록 촬영합니다.'},
  {id:'dishwashing-2',label:'식기 헹구기',title:'식기 헹구기 예시',src:'../assets/videos/collection/dishwashing-2.mp4',poster:'../assets/videos/collection/dishwashing-2.jpg',note:'식기와 양손, 흐르는 물이 화면에 함께 들어오는지 확인하세요.'},
];
export const activities=[
  {id:'dishwashing',category:'주방',title:'설거지',description:'싱크대에서 식기를 씻고 헹구는 흐름을 자연스럽게 기록합니다.',actions:['식기를 물에 적시기','세제와 수세미로 닦기','헹군 뒤 건조대에 놓기'],tips:['양손과 싱크대 안쪽이 함께 보이도록 고개 각도를 맞춥니다.','상표나 개인 문서가 보이면 촬영 전에 치웁니다.'],exampleId:'dishwashing'},
  {id:'cutting-vegetables',category:'주방',title:'채소 씻기·손질·썰기',description:'채소를 씻고 손질한 뒤 안전하게 써는 과정을 담습니다.',actions:['채소 씻기','껍질 또는 꼭지 손질','도마 위에서 자르기'],tips:['칼을 사용하는 장면은 속도를 올리지 말고 평소보다 차분하게 진행합니다.','손, 칼, 도마가 화면 밖으로 나가지 않게 확인합니다.'],exampleId:'cutting-vegetables'},
  {id:'folding-clothes',category:'세탁·의류',title:'빨래 개기',description:'마른 옷을 펼치고 접어 정리하는 손동작을 안정적으로 기록합니다.',actions:['옷 펼치기','소매와 몸판 접기','접은 옷을 쌓거나 넣기'],tips:['옷 전체와 접는 손이 동시에 보이도록 상체 각도를 조정합니다.','개인 정보가 적힌 라벨이나 문구는 보이지 않게 합니다.'],exampleId:'folding-clothes'},
  {id:'simple-cooking',category:'주방',title:'간단한 요리',description:'재료 준비부터 조리 도구 사용까지 한 가지 간단한 요리 흐름을 촬영합니다.',actions:['재료 놓기','팬이나 냄비 사용','그릇에 옮겨 담기'],tips:['뜨거운 조리도구를 다룰 때는 안전을 먼저 확인합니다.','불필요한 대화나 연출 없이 평소 순서를 유지합니다.']},
  {id:'plants',category:'정원·베란다',title:'식물 물주기',description:'화분 위치를 확인하고 물을 주거나 잎을 정리하는 과정을 담습니다.',actions:['화분 앞에 서기','물뿌리개 또는 컵으로 물 주기','주변 물기 정리'],tips:['베란다 밖 주소나 이웃 공간이 화면에 들어오지 않게 합니다.','흙, 화분, 손 움직임이 함께 보이면 좋습니다.']},
  {id:'bedroom',category:'침실',title:'침대 정돈',description:'시트, 이불, 베개를 정리하며 침대를 평소처럼 정돈합니다.',actions:['시트 또는 이불 펴기','침대 모서리 정리','베개와 쿠션 놓기'],tips:['얼굴 사진, 주소 라벨, 개인 문서는 촬영 전에 치웁니다.','침대 전체와 손의 움직임이 번갈아 보이도록 천천히 움직입니다.']},
  {id:'dining',category:'다이닝',title:'식탁 차리기·치우기',description:'식탁을 차리거나 식사 후 식기와 테이블을 정리하는 흐름을 촬영합니다.',actions:['식기 놓기','사용한 그릇 치우기','테이블 닦기'],tips:['식탁 위 물건의 위치 변화가 보이도록 너무 가까이 붙지 않습니다.','가족 얼굴이나 사적인 대화가 들어가지 않게 합니다.']},
  {id:'car-interior',category:'기타',title:'자동차 내부 청소',description:'차 안의 먼지를 닦고 물건을 정리하는 일상 청소 장면을 기록합니다.',actions:['대시보드나 좌석 닦기','개인 물건 정리','쓰레기 분리하기'],tips:['차량번호, 주소, 출입증이 보이지 않게 합니다.','운전 중 촬영하지 않고 정차 상태에서만 진행합니다.']},
];
export const categories=[
 {name:'전체',icon:'squares-four'}, {name:'주방',icon:'cooking-pot'},
 {name:'세탁·의류',label:'세탁',icon:'t-shirt'}, {name:'정원·베란다',label:'식물',icon:'plant'},
 {name:'침실',icon:'bed'}, {name:'다이닝',label:'식탁',icon:'fork-knife'}, {name:'기타',icon:'car'},
];
export const exampleFor=activity=>examples.find(item=>item.id===activity?.exampleId)||null;
export const activityFor=id=>activities.find(item=>item.id===id);
