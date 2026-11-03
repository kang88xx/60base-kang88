// App presentation metadata mirrors the currently published filming activities.
// Rewards and open intake are read from the authoritative public catalog.
export const examples=[
  {id:'dishwashing',label:'설거지',title:'주방 설거지 예시',src:'../assets/videos/collection/dishwashing.mp4',poster:'../assets/videos/collection/dishwashing.jpg',note:'손, 싱크대, 식기가 한 화면에 들어오는지 확인하세요.'},
  {id:'folding-clothes',label:'빨래 개기',title:'의류 정리 예시',src:'../assets/videos/collection/folding-clothes.mp4',poster:'../assets/videos/collection/folding-clothes.jpg',note:'옷 전체와 접는 손의 움직임이 잘리지 않게 촬영합니다.'},
  {id:'cutting-vegetables',label:'채소 손질',title:'채소 손질 예시',src:'../assets/videos/collection/cutting-vegetables.mp4',poster:'../assets/videos/collection/cutting-vegetables.jpg',note:'칼을 쓰는 장면은 천천히, 안전을 우선해 기록합니다.'},
  {id:'vacuuming',label:'바닥 청소',title:'거실 바닥 청소 예시',src:'../assets/videos/collection/vacuuming.mp4',poster:'../assets/videos/collection/vacuuming.jpg',note:'청소기 헤드와 바닥의 이동 경로가 함께 보이도록 촬영합니다.'},
  {id:'folding-towels',label:'수건 접기',title:'수건 접기 예시',src:'../assets/videos/collection/folding-towels.mp4',poster:'../assets/videos/collection/folding-towels.jpg',note:'수건 전체와 접고 정리하는 손의 움직임이 함께 보이도록 촬영합니다.'},
  {id:'dishwashing-2',label:'식기 헹구기',title:'식기 헹구기 예시',src:'../assets/videos/collection/dishwashing-2.mp4',poster:'../assets/videos/collection/dishwashing-2.jpg',note:'식기와 양손, 흐르는 물이 화면에 함께 들어오는지 확인하세요.'},
  {id:'folding-clothes-2',label:'빨래 개기 2',title:'새 의류 정리 예시',src:'../assets/videos/collection/folding-clothes-2.mp4',poster:'../assets/videos/collection/folding-clothes-2.jpg',note:'옷 전체와 접는 두 손의 움직임을 함께 확인해요.'},
  {id:'dishwashing-10',label:'설거지 10',title:'새 설거지 예시',src:'../assets/videos/collection/dishwashing-10.mp4',poster:'../assets/videos/collection/dishwashing-10.jpg',note:'식기를 잡고 닦고 헹구는 손동작을 확인해요.'},
  {id:'cleaning-stove',label:'가스레인지 닦기',title:'가스레인지 표면 청소 예시',src:'../assets/videos/collection/cleaning-stove.mp4',poster:'../assets/videos/collection/cleaning-stove.jpg',note:'천으로 화구 주변 표면을 닦는 동작을 담은 발췌본이에요.'},
  {id:'cleaning-refrigerator',label:'냉장고 정리',title:'냉장고 정리 예시',src:'../assets/videos/collection/cleaning-refrigerator.mp4',poster:'../assets/videos/collection/cleaning-refrigerator.jpg',note:'식재료와 봉지를 꺼내고 정리하는 손동작을 확인해요.'},
  {id:'cleaning-desk',label:'작업대 정리',title:'작업대 위 물건 정리 예시',src:'../assets/videos/collection/cleaning-desk.mp4',poster:'../assets/videos/collection/cleaning-desk.jpg',note:'공개 발췌본은 화면과 사진 보호를 위해 상단 절반을 가렸어요.'},
  {id:'cleaning-desk-2',label:'책상 정리',title:'노트와 소품 정리 예시',src:'../assets/videos/collection/cleaning-desk-2.mp4',poster:'../assets/videos/collection/cleaning-desk-2.jpg',note:'공개 발췌본은 화면과 메모 보호를 위해 상단 절반을 가렸어요.'},
  {id:'cleaning-fish-tank',label:'어항 청소',title:'어항 청소 예시',src:'../assets/videos/collection/cleaning-fish-tank.mp4',poster:'../assets/videos/collection/cleaning-fish-tank.jpg',note:'어항 안에서 손과 뜰채를 사용하는 작업 장면이에요.'},
];
export const activities=[
  {id:'dishwashing',category:'주방',title:'설거지',description:'싱크대에서 식기를 씻고 헹구는 흐름을 자연스럽게 기록합니다.',actions:['식기 준비하기 — 그릇·컵·냄비를 모으고 물에 적시기','씻고 헹구기 — 세제와 수세미로 닦고 헹구기','건조하고 정리하기 — 건조대에 놓거나 식기장에 정리하기'],tips:['양손과 싱크대 안쪽이 함께 보이도록 고개 각도를 맞춥니다.','상표나 개인 문서가 보이면 촬영 전에 치웁니다.'],exampleId:'dishwashing-10'},
  {id:'cutting-vegetables',category:'주방',title:'채소 씻기·손질·썰기',description:'채소를 씻고 손질한 뒤 안전하게 써는 과정을 담습니다.',actions:['채소 준비하기 — 꺼내고 씻고 물기 털기','손질하기 — 껍질·꼭지·씨 제거하기','자르고 나누기 — 도마에서 썰고 크기 맞추기','정리하기 — 용기에 담고 자투리·도구 정리하기'],tips:['칼을 사용하는 장면은 속도를 올리지 말고 평소보다 차분하게 진행합니다.','손, 칼, 도마가 화면 밖으로 나가지 않게 확인합니다.'],exampleId:'cutting-vegetables'},
  {id:'folding-clothes',category:'세탁·의류',title:'빨래 개기',description:'마른 옷을 펼치고 접어 정리하는 손동작을 안정적으로 기록합니다.',actions:['마른 빨래 준비하기 — 건조대나 건조기에서 꺼내 펼치기','옷과 수건 개기 — 평소 순서로 접고 양말 짝 맞추기','의류 정리하기 — 접은 옷을 쌓거나 제자리에 넣기'],tips:['옷 전체와 접는 손이 동시에 보이도록 상체 각도를 조정합니다.','개인 정보가 적힌 라벨이나 문구는 보이지 않게 합니다.'],exampleId:'folding-clothes-2'},
  {id:'simple-cooking',category:'주방',title:'간단한 요리',description:'재료 준비부터 조리 도구 사용까지 한 가지 간단한 요리 흐름을 촬영합니다.',actions:['재료 준비하기 — 재료와 조리 도구 꺼내기','조리하기 — 섞기·볶기·끓이기·굽기 중 실제 작업하기','완성된 음식 담기 — 그릇에 옮기고 도구 정리하기'],tips:['뜨거운 조리도구를 다룰 때는 안전을 먼저 확인합니다.','불필요한 대화나 연출 없이 평소 순서를 유지합니다.']},
  {id:'plants',category:'정원·베란다',title:'식물 물주기',description:'화분 위치를 확인하고 물을 주거나 잎을 정리하는 과정을 담습니다.',actions:['식물 살피기 — 잎과 흙 상태 확인하기','물과 영양 주기 — 필요한 만큼 물이나 비료 주기','식물 관리하기 — 잎 닦기·마른 잎 제거·가지치기','주변 정리하기 — 물기와 원예 도구 정리하기'],tips:['베란다 밖 주소나 이웃 공간이 화면에 들어오지 않게 합니다.','흙, 화분, 손 움직임이 함께 보이면 좋습니다.']},
  {id:'bedroom',category:'침실',title:'침대 정돈',description:'시트, 이불, 베개를 정리하며 침대를 평소처럼 정돈합니다.',actions:['침구 준비하기 — 이불을 걷고 필요한 시트 교체하기','침대 정돈하기 — 이불을 펴거나 접고 모서리 정리하기','마무리하기 — 베개와 쿠션을 놓고 침대 주변 정리하기'],tips:['얼굴 사진, 주소 라벨, 개인 문서는 촬영 전에 치웁니다.','침대 전체와 손의 움직임이 번갈아 보이도록 천천히 움직입니다.']},
  {id:'dining',category:'다이닝',title:'식탁 차리기·치우기',description:'식탁을 차리거나 식사 후 식기와 테이블을 정리하는 흐름을 촬영합니다.',actions:['식탁 차리기 — 식기·수저·음식·음료 준비하기','식사 후 정리하기 — 식기를 모으고 남은 음식 보관하기','식탁 청소하기 — 테이블·매트·의자와 주변 정리하기'],tips:['식탁 위 물건의 위치 변화가 보이도록 너무 가까이 붙지 않습니다.','가족 얼굴이나 사적인 대화가 들어가지 않게 합니다.']},
  {id:'car-interior',category:'기타',title:'자동차 내부 청소',description:'차 안의 먼지를 닦고 물건을 정리하는 일상 청소 장면을 기록합니다.',actions:['대시보드나 좌석 닦기','개인 물건 정리','쓰레기 분리하기'],tips:['차량번호, 주소, 출입증이 보이지 않게 합니다.','운전 중 촬영하지 않고 정차 상태에서만 진행합니다.']},
];
export const categories=[
 {name:'전체',icon:'squares-four'}, {name:'주방',icon:'cooking-pot'},
 {name:'세탁·의류',label:'세탁',icon:'t-shirt'}, {name:'정원·베란다',label:'식물',icon:'plant'},
 {name:'침실',icon:'bed'}, {name:'다이닝',label:'식탁',icon:'fork-knife'}, {name:'기타',icon:'car'},
];
export const exampleFor=activity=>examples.find(item=>item.id===activity?.exampleId)||null;
export const activityFor=id=>activities.find(item=>item.id===id);

// Reference ideas are not published tasks and carry no reward or intake status.
export const activityIdeas = [
  {
    "name": "주방",
    "activities": [
      {
        "name": "설거지 및 식기 정리",
        "actions": [
          "그릇, 컵, 냄비 씻기",
          "헹구고 건조하기",
          "식기세척기에 넣고 꺼내기",
          "식기장에 정리하기"
        ]
      },
      {
        "name": "채소 및 과일 손질",
        "actions": [
          "재료 꺼내기",
          "씻고 물기 제거하기",
          "껍질 벗기고 자르기",
          "씨앗과 꼭지 제거하기",
          "손질한 재료 용기에 담기"
        ]
      },
      {
        "name": "간단한 요리 및 조리",
        "actions": [
          "재료 준비하기",
          "재료 섞고 볶기",
          "끓이거나 굽기",
          "조리 도구 사용하기",
          "완성된 음식 담기"
        ]
      },
      {
        "name": "식사 준비 및 플레이팅",
        "actions": [
          "음식 준비하기",
          "접시와 수저 놓기",
          "음식 나누어 담기",
          "식탁 차리기",
          "식사 후 그릇 정리하기"
        ]
      },
      {
        "name": "주방 청소 및 정리",
        "actions": [
          "조리대와 싱크대 닦기",
          "주방용품 정리하기",
          "냉장고 식재료 정리하기",
          "식재료 보관하기",
          "쓰레기 및 재활용품 분리하기"
        ]
      }
    ]
  },
  {
    "name": "세탁·의류",
    "activities": [
      {
        "name": "세탁물 분류 및 세탁",
        "actions": [
          "빨래 모으고 분류하기",
          "세탁기에 넣기",
          "세제 넣기",
          "세탁기 조작하기",
          "세탁물 꺼내기"
        ]
      },
      {
        "name": "빨래 건조 및 개기",
        "actions": [
          "빨래 널기",
          "건조기에서 꺼내기",
          "옷과 수건 개기",
          "양말 짝 맞추기",
          "개별 옷 정리하기"
        ]
      },
      {
        "name": "옷장 및 의류 정리",
        "actions": [
          "옷 분류하기",
          "옷걸이에 걸기",
          "옷장에 넣기",
          "계절 옷 정리하기",
          "다림질하기"
        ]
      },
      {
        "name": "침구류 세탁 및 정리",
        "actions": [
          "침구류 걷기",
          "침대 시트 교체하기",
          "이불과 베개 정리하기",
          "세탁 및 건조하기",
          "침구류 보관하기"
        ]
      }
    ]
  },
  {
    "name": "정원·베란다",
    "activities": [
      {
        "name": "식물 관리 및 원예",
        "actions": [
          "식물에 물 주기",
          "잎 닦기 및 마른 잎 제거하기",
          "가지치기하기",
          "비료 주기",
          "화분 관리하기"
        ]
      },
      {
        "name": "분갈이 및 식물 심기",
        "actions": [
          "흙 준비하기",
          "화분에 흙 담기",
          "식물 옮겨 심기",
          "흙 다듬기",
          "물 주기 및 주변 정리하기"
        ]
      },
      {
        "name": "베란다 청소 및 정리",
        "actions": [
          "바닥 쓸고 닦기",
          "화분과 물건 옮기기",
          "원예 도구 정리하기",
          "건조대 정리하기",
          "베란다 전체 정돈하기"
        ]
      }
    ]
  },
  {
    "name": "침실",
    "activities": [
      {
        "name": "침대 및 침구 정리",
        "actions": [
          "이불 펴고 접기",
          "베개 정리하기",
          "시트 교체하기",
          "침대 주변 정리하기"
        ]
      },
      {
        "name": "옷장 및 개인용품 정리",
        "actions": [
          "서랍 정리하기",
          "화장품 분류하기",
          "개인 소지품 정리하기",
          "물건 제자리에 놓기"
        ]
      },
      {
        "name": "침실 청소 및 정돈",
        "actions": [
          "협탁 정리하기",
          "먼지 닦기",
          "바닥 청소하기",
          "휴지통 비우기",
          "침실 전체 정리하기"
        ]
      }
    ]
  },
  {
    "name": "다이닝",
    "activities": [
      {
        "name": "식탁 차리기 및 식사 준비",
        "actions": [
          "식탁 닦기",
          "식기와 수저 놓기",
          "음식 담기",
          "물과 음료 준비하기",
          "식사 공간 꾸미기"
        ]
      },
      {
        "name": "식사 후 정리 및 청소",
        "actions": [
          "식기 모으기",
          "남은 음식 보관하기",
          "식탁 닦기",
          "식탁 매트와 의자 정리하기",
          "주변 바닥 청소하기"
        ]
      }
    ]
  },
  {
    "name": "거실",
    "activities": [
      {
        "name": "거실 정리 및 수납",
        "actions": [
          "소파 쿠션 정리하기",
          "담요 접기",
          "리모컨과 생활용품 정리하기",
          "책과 잡지 정리하기",
          "선반 및 테이블 정리하기"
        ]
      },
      {
        "name": "거실 청소",
        "actions": [
          "먼지 닦기",
          "테이블 닦기",
          "바닥 청소하기",
          "소파 주변 정리하기",
          "청소 도구 정리하기"
        ]
      }
    ]
  },
  {
    "name": "욕실",
    "activities": [
      {
        "name": "욕실 청소",
        "actions": [
          "세면대 닦기",
          "거울 닦기",
          "수도꼭지 청소하기",
          "샤워 공간 청소하기",
          "바닥 청소하기",
          "변기통 & 샤워부스 청소하기"
        ]
      },
      {
        "name": "욕실용품 및 수납 정리",
        "actions": [
          "샴푸와 바디워시 정리하기",
          "수건 걸기",
          "욕실 수납장 정리하기",
          "욕실용품 보충하기",
          "쓰레기통 비우기"
        ]
      }
    ]
  },
  {
    "name": "기타",
    "activities": [
      {
        "name": "택배 개봉 및 포장 정리",
        "actions": [
          "택배 상자 개봉하기",
          "포장재 분리하기",
          "물건 확인하고 정리하기",
          "상자 접고 보관하기"
        ]
      },
      {
        "name": "분리수거 및 쓰레기 정리",
        "actions": [
          "재활용품 분류하기",
          "플라스틱과 종이 분리하기",
          "쓰레기 봉투 정리하기",
          "재활용품 배출 준비하기"
        ]
      },
      {
        "name": "신발 및 외출용품 정리",
        "actions": [
          "신발 정리하기",
          "신발장 정돈하기",
          "가방 정리하기",
          "외출용품 분류 및 보관하기"
        ]
      },
      {
        "name": "생활용품 조립 및 간단한 수리",
        "actions": [
          "생활용품 조립하기",
          "나사 조이기",
          "건전지 교체하기",
          "간단한 수납용품 설치하기"
        ]
      }
    ]
  }
];
