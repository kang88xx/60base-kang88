import { useEffect, useRef, useState } from 'react';
import { useReferenceMotion } from './useReferenceMotion.js';
import { QualityMotion } from './OriginalMotions.jsx';
import { ProcessMotion } from './ProcessMotion.jsx';
import { SelectedData } from './SelectedData.jsx';
import { ServiceMotion } from './ServiceMotion.jsx';
import { useContactForm } from './useContactForm.js';
import { FixedPromo } from './FixedPromo.jsx';
import './faq-refinements.css';

const copy = {
  en: {
    nav: ['DATA', 'SERVICES', 'ABOUT'], contact: 'CONTACT', menu: 'Open navigation', closeMenu: 'Close navigation',
    hero: ['HUMAN ACTIONS.', 'DATA FOR PHYSICAL AI.'], heroLabel: '60BASE — PHYSICAL AI / ACTION DATA',
    aboutLabel: 'ABOUT 60BASE', aboutTitle: 'Real life. Real actions.\nData with purpose.',
    aboutCopy: 'We turn everyday human actions into training data for physical AI. Based in Korea, we prepare first-person footage through task design, recording, annotation and review.',
    profile: 'COMPANY PROFILE', dataLabel: 'SELECTED DATA', dataTitle: 'Everyday actions.\nCaptured up close.',
    dataCopy: 'A closer look at the movements that make up everyday life. Explore excerpts from our first-person collection.',
    watch: 'VIEW FILM', excerpt: '20-SECOND EXCERPT',
    sampleNote: 'Public samples show the action and viewpoint. Availability, volume and usage rights are agreed for each project.',
    sampleCta: 'DISCUSS YOUR DATASET', servicesLabel: 'DATA SERVICES', servicesTitle: 'Source existing data.\nCommission new data.',
    services: [
      { title: 'Real-world data collection', body: 'Plan and collect first-person recordings around your tasks, environments, viewpoints and schedule.', tags: ['TASK DESIGN', 'FIRST-PERSON VIDEO'], film: 'cutting-vegetables' },
      { title: 'Hand tracking & annotation', body: 'Estimate hand landmarks and organize action segments alongside the original footage.', tags: ['HAND LANDMARKS', 'ACTION SEGMENTS'], film: 'hand-tracking' },
      { title: 'Quality review', body: 'Compare source footage, tracking outputs and labels to identify missing or occluded actions.', tags: ['FOOTAGE REVIEW', 'LABEL CHECKS'], film: 'review-desk' },
    ], serviceFilm: 'WATCH THE EXAMPLE', processLabel: 'HOW IT WORKS', processTitle: 'From your brief\nto the final dataset.',
    steps: [
      ['Tell us what you need', 'Share the tasks, recording conditions, volume and target delivery date.'],
      ['Review a sample', 'Confirm the sample, deliverables, acceptance criteria and quote.'],
      ['Collect & prepare', 'Record the agreed actions and prepare the annotations and review records.'],
      ['Review & deliver', 'Check the final files and correct items within the agreed scope.'],
    ], qualityLabel: 'QUALITY & RIGHTS', qualityTitle: 'Agreed standards.\nAt every stage.',
    quality: [
      ['Sample criteria', 'Confirm framing and task scope with a sample before collection.'],
      ['Data review', 'Compare footage and labels to identify missing or occluded segments.'],
      ['Consent & usage terms', 'Define recording consent, purposes, duration and redistribution terms in each project agreement.'],
      ['Delivery & remediation', 'Receive footage, labels and review records, with corrections within the agreed scope.'],
    ], faqLabel: 'A FEW ANSWERS', faqTitle: 'Good questions.\nClear answers.',
    faq: [
      ['What data can I purchase?', 'We work with first-person footage of everyday tasks. Review public samples, then ask about available datasets, custom production and usage terms.'],
      ['Can you record specific actions?', 'Yes. We plan custom collection around your tasks, environments, viewpoints, volume and timeline.'],
      ['How is quality reviewed?', 'A sample is approved before production, with agreed capture, annotation and review criteria. Items that fall short of the acceptance criteria are corrected within the agreed scope.'],
      ['Can I use the data for training or commercial projects?', 'Training, evaluation, commercial use and redistribution terms are defined in each project agreement. Capture consent and data usage rights are reviewed together.'],
      ['How is the data delivered?', 'We deliver footage, labels, consent and usage documents, and review records in the agreed structure. File formats and delivery methods are agreed in advance.'],
      ['How can I contribute recordings?', 'Open Physical AI Studio from the 60BASE Studio badge for contributor information and recording guidance.'],
    ], contactLabel: 'START A CONVERSATION', contactTitle: ['Data sourcing &', 'custom collection'],
    contactCopy: 'Tell us the actions and recording conditions you need. We’ll define the collection and annotation scope for your project.', contactNote: 'Data sourcing, custom collection, annotation and review.',
    studio: 'JOIN 60BASE STUDIO', studioCopy: 'Interested in filming? Find participation information and filming education in Studio.',
    name: 'Name or company', email: 'Work email', type: 'Data type or task', brief: 'Your brief', optional: 'Optional', directEmail: 'Email us directly',
    namePlaceholder: 'Your name or company', typePlaceholder: 'First-person video, hand actions, action labels…', briefPlaceholder: 'Tasks, recording conditions, volume and target delivery date.',
    backTop: 'BACK TO TOP', close: 'CLOSE',
  },
  ko: {
    nav: ['DATA', 'SERVICES', 'ABOUT'], contact: 'CONTACT', menu: '메뉴 열기', closeMenu: '메뉴 닫기',
    hero: ['사람의 모든 행동,', '피지컬 AI의 데이터로.'], heroLabel: '60BASE — PHYSICAL AI / ACTION DATA',
    aboutLabel: 'ABOUT 60BASE', aboutTitle: '실제 일상. 실제 행동.\n목적이 있는 데이터.',
    aboutCopy: '사람의 일상적인 행동을, 로봇이 배울 수 있는 데이터로 만듭니다. 한국의 생활 공간에서 필요한 동작과 촬영 조건을 정하고, 1인칭 영상 수집부터 가공·검수까지 준비합니다.',
    profile: '회사소개서', dataLabel: 'SELECTED DATA', dataTitle: '일상의 행동,\n가까이에서.',
    dataCopy: '생활 속 작은 움직임을 새로운 시점으로 살펴보세요. 실제 1인칭 수집 영상의 발췌본을 소개합니다.',
    watch: '영상 보기', excerpt: '20초 발췌 영상',
    sampleNote: '공개 샘플로 동작과 촬영 시점을 확인할 수 있습니다. 구매 가능 범위, 수량과 이용 조건은 프로젝트별로 협의합니다.',
    sampleCta: '데이터 구매·제작 문의', servicesLabel: 'DATA SERVICES', servicesTitle: '구매도,\n맞춤 제작도.',
    services: [
      { title: '실사 데이터 수집', body: '필요한 동작과 환경, 촬영 시점과 일정을 정하고 1인칭 영상을 수집합니다.', tags: ['동작 설계', '1인칭 영상'], film: 'cutting-vegetables' },
      { title: '손동작 추적·가공', body: '영상에서 손의 관절 좌표를 추정하고, 작업 구간과 함께 정리합니다.', tags: ['손 관절 좌표', '작업 구간'], film: 'hand-tracking' },
      { title: '데이터 검수', body: '원본 영상과 추적 결과, 라벨을 대조하고 누락과 가림 구간을 확인합니다.', tags: ['영상 검수', '라벨 확인'], film: 'review-desk' },
    ], serviceFilm: '예시 영상 보기', processLabel: 'HOW IT WORKS', processTitle: '필요한 동작에서\n완성된 데이터까지.',
    steps: [
      ['요구사항 협의', '필요한 동작과 촬영 조건, 수량과 희망 납기를 알려주세요.'],
      ['샘플·견적 확인', '샘플과 납품 항목, 인수 기준과 견적을 확인합니다.'],
      ['수집·가공', '합의한 동작을 촬영하고 라벨과 검수 기록을 준비합니다.'],
      ['검수·납품', '최종 파일을 확인하고 합의한 범위에서 미달 항목을 보완합니다.'],
    ], qualityLabel: 'QUALITY & RIGHTS', qualityTitle: '촬영부터 납품까지,\n합의한 기준대로.',
    quality: [
      ['샘플 기준', '본 수집 전에 구도와 동작 범위를 샘플로 확인합니다.'],
      ['데이터 검수', '영상과 라벨을 대조해 누락·가림 구간을 확인합니다.'],
      ['동의·이용 범위', '촬영 동의와 사용 목적·기간·재배포 조건을 프로젝트별 계약에서 정합니다.'],
      ['납품·보완', '영상·라벨·검수 기록을 전달하고, 미달 항목은 합의한 범위에서 보완합니다.'],
    ], faqLabel: 'A FEW ANSWERS', faqTitle: '궁금한 점이\n있으신가요?',
    faq: [
      ['어떤 데이터를 구매할 수 있나요?', '1인칭 시점의 생활 동작 영상을 다룹니다. 공개 샘플을 먼저 살펴보고, 구매 가능한 범위와 이용 조건을 문의해 주세요.'],
      ['원하는 동작을 따로 수집할 수 있나요?', '가능합니다. 필요한 동작, 환경, 촬영 시점, 수량과 일정을 바탕으로 수집 계획을 협의합니다.'],
      ['품질은 어떤 기준으로 확인하나요?', '본 수집 전에 샘플을 승인하고 촬영·가공·검수 기준을 정합니다. 인수 기준에 미달한 항목은 계약에서 정한 범위에 따라 보완합니다.'],
      ['학습이나 상업적 용도로 사용할 수 있나요?', '학습·평가·상업적 이용과 재배포 조건은 프로젝트별 계약에서 정합니다. 촬영 동의와 데이터 이용 범위를 함께 확인합니다.'],
      ['어떤 형태로 납품받나요?', '영상, 라벨, 동의·이용 문서와 검수 기록을 협의한 구성으로 전달합니다. 필요한 파일 형식과 전달 경로는 사전에 정합니다.'],
      ['촬영에 참여하고 싶어요.', '참여 안내와 촬영 교육은 화면에 고정된 60BASE Studio 배지에서 Physical AI Studio로 이동해 확인할 수 있습니다.'],
    ], contactLabel: 'START A CONVERSATION', contactTitle: ['데이터 구매·제작', '문의'],
    contactCopy: '필요한 동작과 촬영 조건을 알려주세요. 프로젝트에 맞는 수집·가공 범위를 함께 정리합니다.', contactNote: '데이터 구매, 맞춤 수집, 가공과 검수를 함께 준비합니다.',
    studio: '60BASE STUDIO 참여 안내', studioCopy: '촬영에 참여하고 싶다면 Studio에서 참여 안내와 촬영 교육을 확인하세요.',
    name: '이름 또는 회사명', email: '업무용 이메일', type: '수집 데이터 타입', brief: '필요한 데이터', optional: '선택', directEmail: '이메일로 직접 문의',
    namePlaceholder: '이름 또는 회사명', typePlaceholder: '1인칭 영상, 손동작, 작업 구간 라벨 등', briefPlaceholder: '작업 종류, 촬영 조건, 수량, 희망 납기를 알려주세요.',
    backTop: '맨 위로', close: '닫기',
  },
};

const samples = [
  { id: 'cutting-vegetables', category: 'kitchen', title: ['Cutting vegetables', '채소 손질'], desc: ['Preparing ingredients, one movement at a time.', '재료를 손질하는 손의 움직임.'], tags: ['KITCHEN', 'FIRST-PERSON'] },
  { id: 'dishwashing', category: 'kitchen', title: ['Washing dishes', '설거지'], desc: ['Hands, utensils and the everyday washing routine.', '손과 식기, 반복되는 설거지 동작.'], tags: ['KITCHEN', 'FIRST-PERSON'] },
  { id: 'folding-clothes', category: 'home', title: ['Folding clothes', '빨래 개기'], desc: ['Grasping, folding and arranging familiar fabrics.', '옷감을 잡고 접어 정리하는 과정.'], tags: ['HOME', 'FIRST-PERSON'] },
  { id: 'vacuuming', category: 'home', title: ['Vacuuming', '바닥 청소'], desc: ['Moving through a real home with a handheld tool.', '도구를 다루며 생활 공간을 이동하는 동작.'], tags: ['HOME', 'FIRST-PERSON'] },
  { id: 'folding-towels', category: 'home', title: ['Folding towels', '수건 접기'], desc: ['A small sequence of precise, repeatable actions.', '수건을 가지런히 접는 연속 동작.'], tags: ['HOME', 'FIRST-PERSON'] },
  { id: 'dishwashing-2', category: 'kitchen', title: ['Rinsing dishes', '식기 헹구기'], desc: ['Following the flow from washing to rinsing.', '세척에서 헹굼으로 이어지는 움직임.'], tags: ['KITCHEN', 'FIRST-PERSON'] },
];

function Arrow({ diagonal = false }) { return <span className="arrow" aria-hidden="true">{diagonal ? '↗' : '→'}</span>; }
function Multiline({ text }) { return text.split('\n').map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>); }
function SectionLabel({ children }) { return <div className="section-label"><span>{children}</span></div>; }

export function App() {
  const [language, setLanguage] = useState(new URLSearchParams(location.search).get('lang') === 'ko' ? 'ko' : 'en');
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredStep, setHoveredStep] = useState(null);
  const [selectedStep, setSelectedStep] = useState(null);
  const [stepRestart, setStepRestart] = useState([0, 0, 0, 0]);
  const [stepRuleRestart, setStepRuleRestart] = useState([0, 0, 0, 0]);
  const [film, setFilm] = useState(null);
  const dialog = useRef(null);
  const dialogVideo = useRef(null);
  const menuButton = useRef(null);
  const filmOpener = useRef(null);
  const t = copy[language];
  const contactForm = useContactForm(language);
  const localeIndex = language === 'en' ? 0 : 1;
  useReferenceMotion({ language, menuOpen, filmOpen: Boolean(film), hasDraft: Boolean(contactForm.statusText) });

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    const title = language === 'en' ? '60base | Action data sourcing & custom collection' : '60base | 행동 데이터 구매·맞춤 수집';
    const description = language === 'en'
      ? '60BASE sources, collects, annotates and reviews first-person action data from Korea for physical AI training.'
      : '60BASE는 피지컬 AI 학습을 위한 한국의 1인칭 영상 데이터를 수집·가공·검수합니다.';
    const imageAlt = language === 'en'
      ? '60BASE — HUMAN ACTIONS. DATA FOR PHYSICAL AI. Large cream lettering on a black background.'
      : '60BASE — 검은 배경 위 크림색 큰 영문 문구 HUMAN ACTIONS. DATA FOR PHYSICAL AI.';
    document.title = title;
    for (const [attribute, key, content] of [
      ['name', 'description', description],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:locale', language === 'en' ? 'en_US' : 'ko_KR'],
      ['property', 'og:url', `https://60base.ai/?lang=${language}`],
      ['property', 'og:image:alt', imageAlt],
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', description],
      ['name', 'twitter:image:alt', imageAlt],
    ]) {
      let meta = document.querySelector(`meta[${attribute}="${key}"]`);
      if (!meta) { meta = document.createElement('meta'); meta.setAttribute(attribute, key); document.head.append(meta); }
      meta.setAttribute('content', content);
    }
  }, [language]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    const firstFaq = document.querySelector('details[name="60base-faq"]');
    if (firstFaq) firstFaq.open = true;
  }, []);

  useEffect(() => {
    if (film && dialog.current) { if (!dialog.current.open) dialog.current.showModal(); dialogVideo.current?.play().catch(() => {}); }
  }, [film]);

  function openFilm(id, title, event) { filmOpener.current = event.currentTarget; setFilm({ id, title }); }
  function replayStep(index) {
    setStepRestart(values => values.map((value, step) => value + (step === index ? 1 : 0)));
    replayStepRule(index);
  }
  function replayStepRule(index) {
    setStepRuleRestart(values => values.map((value, step) => value + (step === index ? 1 : 0)));
  }
  function closeFilm() { dialogVideo.current?.pause(); dialog.current?.close(); }
  function onDialogClosed() { dialogVideo.current?.pause(); setFilm(null); filmOpener.current?.focus(); }
  function changeLanguage(nextLanguage) {
    const url = new URL(location.href);
    if (/^\/index(?:\.(?:ko|en))?\.html$/.test(url.pathname)) url.pathname = '/';
    url.searchParams.set('lang', nextLanguage);
    history.replaceState(history.state, '', url);
    setLanguage(nextLanguage);
  }
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <a className="skip-link" href="#main">{language === 'en' ? 'Skip to content' : '본문 바로가기'}</a>
      <header className={`site-nav${compact ? ' is-compact' : ''}${menuOpen ? ' is-open' : ''}`}>
        <div className="nav-main-panel">
          <div className="nav-topline">
            <a className="nav-logo" href="#hero" aria-label="60BASE home" onClick={closeMenu}><img src="/assets/brand/logo-new2.svg" alt="60BASE" /></a>
            <button ref={menuButton} className="nav-hamburger" type="button" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? t.closeMenu : t.menu} onClick={() => setMenuOpen(!menuOpen)}><span /><span /></button>
          </div>
          <nav className="nav-menu" aria-label={language === 'en' ? 'Main navigation' : '주요 메뉴'}>{['data', 'services', 'about'].map((id, i) => <a key={id} href={`#${id}`} onClick={closeMenu}><span className="nav-dot" aria-hidden="true" />{t.nav[i]}</a>)}</nav>
        </div>
        <a className="nav-contact" href="#contact" onClick={closeMenu}>{t.contact}<Arrow /></a>
        <nav className="nav-mobile-menu" id="mobile-navigation" hidden={!menuOpen} aria-label={language === 'en' ? 'Mobile navigation' : '모바일 메뉴'}>{['data', 'services', 'about'].map((id, i) => <a key={id} href={`#${id}`} onClick={closeMenu}>{t.nav[i]}<Arrow diagonal /></a>)}<a href="#contact" onClick={closeMenu}>{t.contact}<Arrow diagonal /></a></nav>
      </header>

      <main id="main">
        <section className="section-hero" id="hero" aria-labelledby="hero-title">
          <div className="hero-body">
            <div className="hero-label"><span>{t.heroLabel}</span><div className="section-line" /></div>
            <div className="hero-headline"><h1 id="hero-title">{t.hero.map((line) => <span className="headline-line" key={line}><span className="headline-inner">{line}</span></span>)}</h1></div>
          </div>
            <div className="showreel-card">
              <video src="/assets/media/hero-graded.mp4" poster="/assets/media/hero-graded.jpg" autoPlay muted loop playsInline preload="metadata" aria-label={language === 'en' ? 'First-person vegetable preparation footage' : '1인칭 채소 손질 영상'} />
            </div>
        </section>

        <section className="section-about section-pad" id="about" aria-labelledby="about-title">
          <SectionLabel>{t.aboutLabel}</SectionLabel>
          <div className="about-content" data-reveal><h2 id="about-title"><Multiline text={t.aboutTitle} /></h2><div className="about-bottom"><p>{t.aboutCopy}</p><div className="about-links"><a className="text-link" href="https://huggingface.co/60base" target="_blank" rel="noreferrer"><span className="about-huggingface-label"><img className="about-huggingface-logo" src="/assets/brand/huggingface-logo.svg" alt="" aria-hidden="true" width="20" height="20" />HUGGING FACE</span><Arrow diagonal /></a><button type="button" className="text-link" disabled>{t.profile}<Arrow diagonal /></button></div></div></div>
        </section>

        <SelectedData t={t} samples={samples.slice(0, 4)} localeIndex={localeIndex} onOpenFilm={openFilm} />

        <section className="section-services section-pad" id="services" aria-labelledby="services-title">
          <SectionLabel>{t.servicesLabel}</SectionLabel>
          <div className="services-expanded">
            <h2 id="services-title" className="services-heading" data-reveal><Multiline text={t.servicesTitle} /></h2>
            <div className="service-features">
              {t.services.map((service, i) => <article className="service-feature" key={service.film}>
                <div className="service-feature-copy">
                  <h3>{service.title}</h3>
                  <p>{service.body}</p>
                  <div className="tags">{service.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                </div>
                <div className="service-feature-art"><ServiceMotion index={i} language={language} /></div>
              </article>)}
            </div>
          </div>
        </section>

        <section className="section-process section-pad" id="process" aria-labelledby="process-title">
          <SectionLabel>{t.processLabel}</SectionLabel>
          <div className="process-content">
            <h2 id="process-title" data-reveal>{t.processTitle.replace(/\n/g, ' ')}</h2>
            <div className="process-motion-layout">
              <div className="process-list">
                {t.steps.map(([title, body], i) => <article className={`process-step${selectedStep === i ? ' is-active' : ''}`} key={i} onPointerEnter={() => { setHoveredStep(i); replayStepRule(i); }} onPointerLeave={() => setHoveredStep(current => current === i ? null : current)} onClick={() => { setSelectedStep(i); replayStep(i); }}>
                  <div className="process-step-copy">
                    <h3><button type="button" aria-pressed={selectedStep === i} onFocus={() => replayStep(i)}>{title}</button></h3>
                    <p>{body}</p>
                  </div>
                  <ProcessMotion activeStep={i} language={language} restartKey={stepRestart[i]} theme="light" controls={false} loop={hoveredStep === i} />
                  <span className="process-step-rule" key={stepRuleRestart[i]} aria-hidden="true" />
                </article>)}
              </div>
            </div>
          </div>
        </section>

        <section className="section-quality section-pad" id="quality" aria-labelledby="quality-title"><SectionLabel>{t.qualityLabel}</SectionLabel><div className="quality-content"><h2 id="quality-title" data-reveal><Multiline text={t.qualityTitle} /></h2><div className="quality-grid">{t.quality.map(([title, body], i) => <article className="quality-item" key={i}><QualityMotion index={i} language={language} /><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>

        <section className="section-faq section-pad" id="faq" aria-labelledby="faq-title"><SectionLabel>{t.faqLabel}</SectionLabel><div className="faq-content"><h2 id="faq-title"><Multiline text={t.faqTitle} /></h2><div className="faq-list">{t.faq.map(([question, answer], i) => <details key={i} name="60base-faq"><summary>{question}<span className="faq-symbol" aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></div></section>

        <section className="section-contact section-pad" id="contact" aria-labelledby="contact-title"><SectionLabel>{t.contactLabel}</SectionLabel><div className="contact-layout">
          <div className="contact-heading" data-reveal><h2 id="contact-title">{t.contactTitle[0]}<br />{t.contactTitle[1]}</h2><p>{t.contactCopy}</p></div>
          <form id="contact-form" className="contact-form" onSubmit={contactForm.submit} aria-labelledby="contact-title" aria-busy={contactForm.sending} noValidate>
            <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}><label htmlFor="contact-website">Website</label><input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
            <label><span>{t.name}</span><input id="contact-name" name="name" value={contactForm.values.name} onChange={contactForm.change} readOnly={contactForm.sending} autoComplete="organization" placeholder={t.namePlaceholder} maxLength="100" aria-invalid={contactForm.errors.name || undefined} aria-describedby={contactForm.errors.name ? 'contact-name-error' : undefined} required /><span id="contact-name-error" className="field-error" hidden={!contactForm.errors.name}>{contactForm.errorText.name}</span></label>
            <label><span>{t.email}</span><input id="contact-email" name="email" value={contactForm.values.email} onChange={contactForm.change} readOnly={contactForm.sending} type="email" autoComplete="email" placeholder="you@company.com" maxLength="254" aria-invalid={contactForm.errors.email || undefined} aria-describedby={contactForm.errors.email ? 'contact-email-error' : undefined} required /><span id="contact-email-error" className="field-error" hidden={!contactForm.errors.email}>{contactForm.errorText.email}</span></label>
            <label className="full-width"><span className="field-label"><span>{t.type}</span><span className="field-optional">{t.optional}</span></span><input id="contact-type" name="dataType" value={contactForm.values.dataType} onChange={contactForm.change} readOnly={contactForm.sending} placeholder={t.typePlaceholder} maxLength="180" aria-invalid={contactForm.errors.dataType || undefined} aria-describedby={contactForm.errors.dataType ? 'contact-type-error' : undefined} /><span id="contact-type-error" className="field-error" hidden={!contactForm.errors.dataType}>{contactForm.errorText.dataType}</span></label>
            <label className="full-width"><span>{t.brief}</span><textarea id="contact-message" name="message" value={contactForm.values.message} onChange={contactForm.change} readOnly={contactForm.sending} rows="4" placeholder={t.briefPlaceholder} maxLength="5000" aria-invalid={contactForm.errors.message || undefined} aria-describedby={contactForm.errors.message ? 'contact-message-error' : undefined} required /><span id="contact-message-error" className="field-error" hidden={!contactForm.errors.message}>{contactForm.errorText.message}</span></label>
            <div className="form-actions full-width"><button className="button contact-submit" type="submit" disabled={contactForm.sending || contactForm.sent} data-state={['validation', 'rateLimited', 'unavailable', 'invalid', 'unconfirmed'].includes(contactForm.status) ? 'Error' : 'Default'}>{contactForm.buttonLabel}<Arrow diagonal /></button><a className="contact-direct-email" href="mailto:60base.ai@gmail.com"><span>{t.directEmail}</span><span>60base.ai@gmail.com<Arrow diagonal /></span></a></div>
            <p id="form-status" className="contact-form-status full-width" role="status" aria-live="polite" hidden={!contactForm.statusText}>{contactForm.statusText}</p>
          </form>
        </div>
        <footer className="site-footer"><a href="#hero" aria-label="60BASE home"><img src="/assets/brand/logo-new2.svg" alt="60BASE" /></a><span>© 2026 60BASE. All Rights Reserved.</span><div><button className="footer-language" type="button" aria-label={language === 'en' ? '한국어로 보기' : 'View in English'} onClick={() => changeLanguage(language === 'en' ? 'ko' : 'en')}>{language === 'en' ? '한국어' : 'ENGLISH'}</button></div></footer>
        </section>
      </main>
      <FixedPromo language={language} />

      <dialog className="film-dialog" ref={dialog} aria-labelledby="film-title" onClose={onDialogClosed} onCancel={() => dialogVideo.current?.pause()} onClick={(event) => { if (event.target === event.currentTarget) closeFilm(); }}><div className="film-heading"><div><span className="mono">60BASE / {t.excerpt}</span><h2 id="film-title">{film?.title}</h2></div><button className="button button-dark" type="button" onClick={closeFilm} autoFocus>{t.close}<span aria-hidden="true">×</span></button></div>{film && <video ref={dialogVideo} src={`/assets/media/${film.id}.mp4`} poster={`/assets/media/${film.id}.jpg`} controls playsInline muted preload="metadata" />}</dialog>
    </>
  );
}
