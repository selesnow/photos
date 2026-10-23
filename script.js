/* ==========================================================================
   ИНТЕРАКТИВНАЯ ЛОГИКА И СКРИПТЫ: КРИСТИНА СЕЛЕЗНЁВА | ФОТОГРАФ В ХУРГАДЕ
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* --- 1. Header & Mobile Menu --- */
  const header = document.getElementById('header');
  const mobileToggle = document.getElementById('mobile-toggle');
  const navMenu = document.getElementById('nav-menu');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
      const icon = mobileToggle.querySelector('i');
      if (navMenu.classList.contains('active')) {
        icon.className = 'ri-close-line';
      } else {
        icon.className = 'ri-menu-line';
      }
    });
  }

  // Закрытие мобильного меню при клике на ссылку
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('active');
      if (mobileToggle) {
        mobileToggle.querySelector('i').className = 'ri-menu-line';
      }
    });
  });

  /* --- 2. Инициализация Слайдеров Swiper --- */
  const swiperOptions = {
    slidesPerView: 1,
    spaceBetween: 20,
    loop: true,
    grabCursor: true,
    breakpoints: {
      640: { slidesPerView: 2, spaceBetween: 20 },
      1024: { slidesPerView: 3, spaceBetween: 25 },
      1280: { slidesPerView: 4, spaceBetween: 30 }
    }
  };

  const familySwiper = new Swiper('.swiper-family', {
    ...swiperOptions,
    navigation: {
      nextEl: '.family-next',
      prevEl: '.family-prev',
    },
  });

  const coupleSwiper = new Swiper('.swiper-couple', {
    ...swiperOptions,
    navigation: {
      nextEl: '.couple-next',
      prevEl: '.couple-prev',
    },
  });

  const singleSwiper = new Swiper('.swiper-single', {
    ...swiperOptions,
    navigation: {
      nextEl: '.single-next',
      prevEl: '.single-prev',
    },
  });

  const reviewsSwiper = new Swiper('.swiper-reviews', {
    slidesPerView: 1,
    spaceBetween: 18,
    loop: true,
    grabCursor: true,
    breakpoints: {
      640: { slidesPerView: 2, spaceBetween: 20 },
      1024: { slidesPerView: 3, spaceBetween: 24 }
    },
    navigation: {
      nextEl: '.reviews-next',
      prevEl: '.reviews-prev',
    },
  });

  /* --- 3. Переключение вкладок Портфолио (Tabs) --- */
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const activeContent = document.getElementById(`tab-${targetTab}`);
      if (activeContent) {
        activeContent.classList.add('active');
        // Обновляем слайдер при переключении вкладки
        if (targetTab === 'family') familySwiper.update();
        if (targetTab === 'couple') coupleSwiper.update();
        if (targetTab === 'single') singleSwiper.update();
      }
    });
  });

  /* --- 4. Интерактивный Калькулятор Стоимости --- */
  const calcTypeBtns = document.querySelectorAll('#calc-type-grid .calc-option-btn');
  const calcLocBtns = document.querySelectorAll('#calc-loc-grid .calc-option-btn');
  const optFast = document.getElementById('opt-fast');
  const optDress = document.getElementById('opt-dress');
  const optRaw = document.getElementById('opt-raw');
  const optTransfer = document.getElementById('opt-transfer');
  const calcTransferPrice = document.getElementById('calc-transfer-price');
  const transferLocNote = document.getElementById('transfer-loc-note');

  const sumType = document.getElementById('sum-type');
  const sumLoc = document.getElementById('sum-loc');
  const sumDate = document.getElementById('sum-date');
  const sumTransfer = document.getElementById('sum-transfer');
  const sumExtras = document.getElementById('sum-extras');
  const sumTime = document.getElementById('sum-time');
  const sumTotal = document.getElementById('sum-total');
  const btnTelegram = document.getElementById('btn-book-telegram');
  const btnWhatsapp = document.getElementById('btn-book-whatsapp');
  const calcDate = document.getElementById('calc-date');
  const calcDateClear = document.getElementById('calc-date-clear');
  const calcDateWrap = document.querySelector('.calc-date-input-wrap');

  // Минимальная доступная дата — завтрашний день (текущий и прошедшие дни заблокированы)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  let fpDate = null;
  if (typeof window.flatpickr === 'function' && calcDate) {
    fpDate = window.flatpickr(calcDate, {
      locale: window.flatpickr.l10ns?.ru || 'ru',
      dateFormat: 'd.m.Y',
      minDate: tomorrow,
      disableMobile: true,
      onChange: function() {
        updateCalculator();
      }
    });
  }

  const typeNames = {
    family: '👨‍👩‍👧‍👦 Семейная ($170)',
    couple: '💑 Парная ($150)',
    single: '✨ Индивидуальная ($150)',
    dress: '👗🪽 Летящее платье ($150)'
  };

  const locConfig = {
    hurghada: {
      name: '🌴 Хургада Мамша',
      cleanName: 'Хургада Мамша',
      transfer: 30,
      price: 0
    },
    desert: {
      name: '🏜 Пустыня',
      cleanName: 'Пустыня',
      transfer: 30,
      price: 0
    },
    cliff: {
      name: '🌅 Утёс',
      cleanName: 'Утёс',
      transfer: 40,
      price: 0
    },
    sea_desert: {
      name: '🌊 Море + Пустыня',
      cleanName: 'Море + Пустыня',
      transfer: 40,
      price: 0
    },
    el_gouna: {
      name: '🌴 Эль-Гуна (+$30)',
      cleanName: 'Эль-Гуна',
      transfer: 40,
      price: 30
    }
  };

  function updateCalculator() {
    let basePrice = 170;
    let selectedTypeKey = 'family';
    let selectedLocKey = 'hurghada';
    let extrasPrice = 0;
    let extrasList = [];
    let readyDays = '14 дней';

    // Получаем выбранный тип съёмки
    calcTypeBtns.forEach(btn => {
      if (btn.classList.contains('selected')) {
        basePrice = parseInt(btn.getAttribute('data-price')) || 150;
        selectedTypeKey = btn.getAttribute('data-type');
      }
    });

    // Получаем выбранную локацию
    calcLocBtns.forEach(btn => {
      if (btn.classList.contains('selected')) {
        selectedLocKey = btn.getAttribute('data-loc');
      }
    });

    const currentLoc = locConfig[selectedLocKey] || locConfig.hurghada;
    const locPrice = currentLoc.price;
    const transferCost = currentLoc.transfer;

    // Обновляем бейдж цены трансфера и подсказку в шаге 3
    if (calcTransferPrice) {
      calcTransferPrice.textContent = `+$${transferCost}`;
    }
    if (transferLocNote) {
      transferLocNote.textContent = `локация: ${currentLoc.cleanName} ($${transferCost})`;
    }
    if (optTransfer) {
      optTransfer.value = transferCost;
    }

    // Расчёт трансфера
    let transferPrice = 0;
    let transferSummaryText = 'Не выбран ($0)';
    let transferMsgText = 'Не требуется (своё авто/такси)';

    if (optTransfer && optTransfer.checked) {
      transferPrice = transferCost;
      transferSummaryText = `+$${transferCost} (${currentLoc.cleanName})`;
      transferMsgText = `Индивидуальный (+$${transferCost}, ${currentLoc.cleanName})`;
    }

    // Дополнительные опции
    if (optFast && optFast.checked) {
      extrasPrice += parseInt(optFast.value);
      extrasList.push('🚀 Быстрая обработка 2-3 дня');
      readyDays = '2-3 дня';
    }
    if (optDress && optDress.checked) {
      extrasPrice += parseInt(optDress.value);
      extrasList.push('👗 Аренда доп. платья');
    }
    if (optRaw && optRaw.checked) {
      extrasPrice += parseInt(optRaw.value);
      extrasList.push('💾 Все исходники');
    }

    const total = basePrice + locPrice + transferPrice + extrasPrice;

    // Дата съёмки
    let dateSummaryText = 'Не выбрана';
    let dateMsgText = 'Уточняется / по договорённости';
    let dateClosingQuestion = 'Подскажите, свободны ли даты для съёмки?';

    const selectedDateVal = calcDate ? calcDate.value.trim() : '';

    if (selectedDateVal) {
      dateSummaryText = selectedDateVal;
      dateMsgText = selectedDateVal;
      dateClosingQuestion = `Подскажите, свободна ли дата ${selectedDateVal} для съёмки?`;
    }

    if (calcDateClear) {
      calcDateClear.style.display = selectedDateVal ? 'inline-flex' : 'none';
    }

    // Обновление отображения в карточке Итога
    if (sumType) sumType.textContent = typeNames[selectedTypeKey] ? typeNames[selectedTypeKey].split(' (')[0] : 'Семейная';
    if (sumLoc) sumLoc.textContent = currentLoc.cleanName;
    if (sumDate) sumDate.textContent = dateSummaryText;
    if (sumTransfer) sumTransfer.textContent = transferSummaryText;
    if (sumExtras) sumExtras.textContent = extrasList.length > 0 ? extrasList.join(', ') : 'Нет';
    if (sumTime) sumTime.textContent = readyDays;
    if (sumTotal) sumTotal.textContent = `$${total}`;

    // Формирование ссылки для Telegram и WhatsApp
    const rawMessage = `Здравствуйте, Кристина! 👋\n` +
      `Хочу забронировать фотосессию в Египте:\n` +
      `• Вид съёмки: ${typeNames[selectedTypeKey]}\n` +
      `• Локация: ${currentLoc.name}\n` +
      `• Желаемая дата: ${dateMsgText}\n` +
      `• Трансфер: ${transferMsgText}\n` +
      `• Доп. опции: ${extrasList.length > 0 ? extrasList.join(', ') : 'Без доп. опций'}\n` +
      `• Срок готовности: ${readyDays}\n` +
      `💰 Итоговая расчётная стоимость: $${total}\n\n` +
      `${dateClosingQuestion}`;

    const encodedMessage = encodeURIComponent(rawMessage);

    if (btnTelegram) {
      btnTelegram.href = `https://t.me/Kristina_Selesnova_photo?text=${encodedMessage}`;
    }
    if (btnWhatsapp) {
      btnWhatsapp.href = `https://wa.me/380682552141?text=${encodedMessage}`;
    }
  }

  // Клик по типам съёмки
  calcTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      calcTypeBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateCalculator();
    });
  });

  // Клик по локациям
  calcLocBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      calcLocBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateCalculator();
    });
  });

  // Чекбоксы
  [optFast, optDress, optRaw, optTransfer].forEach(chk => {
    if (chk) chk.addEventListener('change', updateCalculator);
  });

  // События выбора даты
  if (calcDate) {
    calcDate.addEventListener('change', updateCalculator);
    calcDate.addEventListener('input', updateCalculator);
    calcDate.addEventListener('click', () => {
      if (fpDate) {
        fpDate.open();
      }
    });
  }

  if (calcDateWrap) {
    calcDateWrap.addEventListener('click', (e) => {
      if (calcDateClear && (e.target === calcDateClear || calcDateClear.contains(e.target))) {
        return;
      }
      if (fpDate) {
        fpDate.open();
      }
    });
  }

  if (calcDateClear) {
    calcDateClear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fpDate) {
        fpDate.clear();
      } else if (calcDate) {
        calcDate.value = '';
      }
      updateCalculator();
    });
  }

  // Инициализация калькулятора при старте
  updateCalculator();

  // Глобальная функция вызова калькулятора из карточек цен
  window.selectCalcType = function(typeName) {
    calcTypeBtns.forEach(btn => {
      if (btn.getAttribute('data-type') === typeName) {
        btn.click();
      }
    });
  };

  window.selectCalcLoc = function(locName) {
    calcLocBtns.forEach(btn => {
      if (btn.getAttribute('data-loc') === locName) {
        btn.click();
      }
    });
  };

  /* --- 4.1. Аналитика GA4 (События бронирования и кликов по мессенджерам) --- */
  function sendCalculatorBookingEvent(messenger) {
    if (typeof window.gtag === 'function') {
      const typeText = sumType ? sumType.textContent.trim() : '';
      const locText = sumLoc ? sumLoc.textContent.trim() : '';
      const dateText = (calcDate && calcDate.value.trim()) ? calcDate.value.trim() : 'не указана';
      const totalText = sumTotal ? sumTotal.textContent.replace(/[^\d]/g, '') : '0';
      const totalValue = parseInt(totalText, 10) || 0;

      window.gtag('event', 'calculator_booking', {
        messenger: messenger,
        service_type: typeText,
        service_location: locText,
        booking_date: dateText,
        value: totalValue,
        currency: 'USD'
      });
    }
  }

  if (btnTelegram) {
    btnTelegram.addEventListener('click', () => {
      sendCalculatorBookingEvent('telegram');
    });
  }

  if (btnWhatsapp) {
    btnWhatsapp.addEventListener('click', () => {
      sendCalculatorBookingEvent('whatsapp');
    });
  }

  const floatingTelegram = document.getElementById('floating-btn-telegram');
  const floatingWhatsapp = document.getElementById('floating-btn-whatsapp');

  function sendFloatingMessengerEvent(messenger) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'floating_messenger_click', {
        messenger: messenger,
        placement: 'floating_bar'
      });
    }
  }

  if (floatingTelegram) {
    floatingTelegram.addEventListener('click', () => {
      sendFloatingMessengerEvent('telegram');
    });
  }

  if (floatingWhatsapp) {
    floatingWhatsapp.addEventListener('click', () => {
      sendFloatingMessengerEvent('whatsapp');
    });
  }

  /* --- 5. Модальное окно просмотра фото (Lightbox) --- */
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');

  let lightboxCollection = [];
  let lightboxIndex = 0;

  function formatLightboxCaption(item) {
    if (!item || !item.text) return '';
    if (item.type === 'location') {
      return `<span class="lightbox-caption-label">Локация:</span> ${item.text}`;
    }
    return item.text;
  }

  function preloadLightboxNeighbor(delta) {
    if (lightboxCollection.length < 2) return;
    const len = lightboxCollection.length;
    const idx = ((lightboxIndex + delta) % len + len) % len;
    const item = lightboxCollection[idx];
    if (item && item.src) {
      const img = new Image();
      img.src = item.src;
    }
  }

  function updateLightboxView() {
    const item = lightboxCollection[lightboxIndex];
    if (!item || !lightboxImg) return;

    lightboxImg.src = item.src;

    if (lightboxCaption) {
      const html = formatLightboxCaption(item);
      if (html) {
        lightboxCaption.innerHTML = html;
        lightboxCaption.style.display = 'inline-flex';
      } else {
        lightboxCaption.style.display = 'none';
      }
    }

    const hasMultiple = lightboxCollection.length > 1;
    if (lightboxCounter) {
      if (hasMultiple) {
        lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxCollection.length}`;
        lightboxCounter.style.display = 'inline-flex';
      } else {
        lightboxCounter.style.display = 'none';
      }
    }
    if (lightboxPrev) lightboxPrev.style.display = hasMultiple ? '' : 'none';
    if (lightboxNext) lightboxNext.style.display = hasMultiple ? '' : 'none';

    preloadLightboxNeighbor(1);
    preloadLightboxNeighbor(-1);
  }

  function navigateLightbox(delta) {
    if (lightboxCollection.length < 2) return;
    const len = lightboxCollection.length;
    lightboxIndex = ((lightboxIndex + delta) % len + len) % len;
    updateLightboxView();
  }

  function openLightbox(collection, index) {
    if (!lightboxModal || !collection || !collection.length) return;
    lightboxCollection = collection;
    lightboxIndex = Math.max(0, Math.min(index, collection.length - 1));
    updateLightboxView();
    lightboxModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!lightboxModal) return;
    lightboxModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function buildPortfolioCollection(photoEl) {
    const tab = photoEl.closest('.tab-content');
    if (!tab) return null;
    const slides = tab.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) .swiper-slide-photo');
    return Array.from(slides).map(el => ({
      src: el.getAttribute('data-full'),
      type: 'location',
      text: el.getAttribute('data-location') || ''
    }));
  }

  function buildLocationCollection(thumbEl) {
    const card = thumbEl.closest('.location-card');
    if (!card) return null;
    const locName = card.querySelector('.location-name')?.textContent?.trim() || '';
    const thumbs = card.querySelectorAll('.location-thumb');
    return Array.from(thumbs).map(el => ({
      src: el.getAttribute('data-full'),
      type: 'location',
      text: locName
    }));
  }

  function buildReviewsCollection() {
    const section = document.getElementById('reviews');
    if (!section) return null;
    const cards = section.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) .review-card');
    return Array.from(cards).map(el => ({
      src: el.getAttribute('data-full'),
      type: 'review',
      text: 'Отзыв из Instagram'
    }));
  }

  // Клики на слайды портфолио, миниатюры локаций, карточки отзывов
  document.addEventListener('click', (e) => {
    const photoContainer = e.target.closest('.swiper-slide-photo');
    const thumbContainer = e.target.closest('.location-thumb');
    const reviewCard = e.target.closest('.review-card');

    let collection = null;
    let clickedSrc = null;

    if (photoContainer) {
      collection = buildPortfolioCollection(photoContainer);
      clickedSrc = photoContainer.getAttribute('data-full');
    } else if (thumbContainer) {
      collection = buildLocationCollection(thumbContainer);
      clickedSrc = thumbContainer.getAttribute('data-full');
    } else if (reviewCard) {
      collection = buildReviewsCollection();
      clickedSrc = reviewCard.getAttribute('data-full');
    }

    if (collection && clickedSrc) {
      const idx = collection.findIndex(item => item.src === clickedSrc);
      openLightbox(collection, idx >= 0 ? idx : 0);
    }
  });

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);

  if (lightboxPrev) {
    lightboxPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateLightbox(-1);
    });
  }
  if (lightboxNext) {
    lightboxNext.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateLightbox(1);
    });
  }

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!lightboxModal || !lightboxModal.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') navigateLightbox(-1);
    else if (e.key === 'ArrowRight') navigateLightbox(1);
  });

  /* --- 5.1. Модальное окно видеообзора (Instagram Reels) --- */
  const videoModal = document.getElementById('video-modal');
  const videoModalBackdrop = document.getElementById('video-modal-backdrop');
  const videoModalClose = document.getElementById('video-modal-close');
  const videoModalTitle = document.getElementById('video-modal-title');
  const videoModalIframe = document.getElementById('video-modal-iframe');
  const videoModalExternal = document.getElementById('video-modal-external');
  const videoLoader = document.getElementById('video-loader');

  function openVideoModal(embedUrl, reelUrl, title) {
    if (!videoModal || !videoModalIframe) return;

    if (videoModalTitle) {
      videoModalTitle.textContent = title || 'Видеообзор локации';
    }
    if (videoModalExternal) {
      videoModalExternal.href = reelUrl || '#';
    }
    if (videoLoader) {
      videoLoader.style.display = 'flex';
    }

    videoModalIframe.src = embedUrl;
    videoModal.classList.add('active');
    videoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeVideoModal() {
    if (!videoModal || !videoModalIframe) return;
    videoModal.classList.remove('active');
    videoModal.setAttribute('aria-hidden', 'true');
    videoModalIframe.src = 'about:blank';
    document.body.style.overflow = '';
  }

  if (videoModalIframe && videoLoader) {
    videoModalIframe.addEventListener('load', () => {
      if (videoModalIframe.src && videoModalIframe.src !== 'about:blank' && !videoModalIframe.src.endsWith('about:blank')) {
        videoLoader.style.display = 'none';
      }
    });
  }

  document.querySelectorAll('[data-embed-url]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const embedUrl = trigger.getAttribute('data-embed-url');
      const reelUrl = trigger.getAttribute('data-reel-url');
      const title = trigger.getAttribute('data-video-title');
      if (embedUrl) openVideoModal(embedUrl, reelUrl, title);
    });
  });

  if (videoModalClose) videoModalClose.addEventListener('click', closeVideoModal);
  if (videoModalBackdrop) videoModalBackdrop.addEventListener('click', closeVideoModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && videoModal && videoModal.classList.contains('active')) {
      closeVideoModal();
    }
  });

  /* --- 6. FAQ Аккордеон --- */
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  /* --- 7. Живой анимированный фон (Золотая пыльца и свет курсора) --- */
  function initAmbientBackground() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [];
    let isVisible = true;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Плавное слежение за курсором
    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      active: false
    };

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    const particleCount = window.innerWidth < 768 ? 26 : 50;

    class Particle {
      constructor() {
        this.reset(true);
      }

      reset(initial = false) {
        this.x = Math.random() * width;
        this.y = initial ? Math.random() * height : height + 10 + Math.random() * 20;
        this.baseRadius = 1.0 + Math.random() * 2.0;
        this.radius = this.baseRadius;
        this.baseAlpha = 0.2 + Math.random() * 0.45;
        this.alpha = this.baseAlpha;
        this.vy = -(0.18 + Math.random() * 0.42);
        this.vx = (Math.random() - 0.5) * 0.25;
        this.swaySpeed = 0.015 + Math.random() * 0.02;
        this.swayAngle = Math.random() * Math.PI * 2;
        this.swayDistance = 0.35 + Math.random() * 0.7;
        this.twinkleSpeed = 0.02 + Math.random() * 0.035;
        this.twinkleAngle = Math.random() * Math.PI * 2;

        const hues = [
          '229, 193, 88',  // золото
          '245, 218, 138', // тёплый свет
          '255, 235, 175', // шампань
          '238, 160, 60'   // закатный янтарь
        ];
        this.colorRgb = hues[Math.floor(Math.random() * hues.length)];
      }

      update() {
        if (!prefersReducedMotion) {
          this.y += this.vy;
          this.swayAngle += this.swaySpeed;
          this.x += Math.sin(this.swayAngle) * this.swayDistance + this.vx;

          this.twinkleAngle += this.twinkleSpeed;
          this.alpha = this.baseAlpha + Math.sin(this.twinkleAngle) * 0.15;
          if (this.alpha < 0.05) this.alpha = 0.05;

          if (mouse.active) {
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = 130;

            if (dist < maxDist && dist > 0) {
              const force = (1 - dist / maxDist) * 1.6;
              this.x += (dx / dist) * force;
              this.y += (dy / dist) * force;
              this.alpha = Math.min(this.alpha + 0.35, 0.95);
              this.radius = this.baseRadius * (1 + (1 - dist / maxDist) * 0.5);
            } else {
              this.radius += (this.baseRadius - this.radius) * 0.1;
            }
          }
        }

        if (this.y < -20 || this.x < -30 || this.x > width + 30) {
          this.reset(false);
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.colorRgb}, ${this.alpha})`;
        ctx.fill();

        if (this.radius > 1.8) {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${this.colorRgb}, ${this.alpha * 0.22})`;
          ctx.fill();
        }
      }
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    }

    window.addEventListener('mousemove', (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      mouse.active = false;
    });

    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden;
      if (isVisible) requestAnimationFrame(loop);
    });

    window.addEventListener('resize', () => {
      resize();
      initParticles();
    }, { passive: true });

    function loop() {
      if (!isVisible) return;

      ctx.clearRect(0, 0, width, height);

      // Мягкое свечение за курсором
      if (mouse.active) {
        mouse.x += (mouse.targetX - mouse.x) * 0.12;
        mouse.y += (mouse.targetY - mouse.y) * 0.12;

        const glow = ctx.createRadialGradient(
          mouse.x, mouse.y, 0,
          mouse.x, mouse.y, 220
        );
        glow.addColorStop(0, 'rgba(229, 193, 88, 0.055)');
        glow.addColorStop(0.5, 'rgba(229, 193, 88, 0.015)');
        glow.addColorStop(1, 'rgba(229, 193, 88, 0)');

        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 220, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }

      requestAnimationFrame(loop);
    }

    resize();
    initParticles();
    requestAnimationFrame(loop);
  }

  initAmbientBackground();

  /* --- 8. Scroll Reveal (появление блоков при скролле) --- */
  function initScrollReveal() {
    // Каскадная задержка для карточек в сетках
    const staggerGroups = ['.packages-grid', '.locations-grid', '.info-grid', '.faq-wrapper'];
    staggerGroups.forEach(selector => {
      document.querySelectorAll(selector).forEach(group => {
        Array.from(group.children).forEach((child, i) => {
          if (child.hasAttribute('data-reveal')) {
            child.style.setProperty('--reveal-delay', (i * 90) + 'ms');
          }
        });
      });
    });

    const targets = document.querySelectorAll('[data-reveal]');
    if (!targets.length) return;

    // Fallback для старых браузеров без IntersectionObserver
    if (!('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('in-view'));
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          obs.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    targets.forEach(el => observer.observe(el));
  }

  initScrollReveal();

});
