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

  const sumType = document.getElementById('sum-type');
  const sumLoc = document.getElementById('sum-loc');
  const sumExtras = document.getElementById('sum-extras');
  const sumTime = document.getElementById('sum-time');
  const sumTotal = document.getElementById('sum-total');
  const btnTelegram = document.getElementById('btn-book-telegram');
  const btnWhatsapp = document.getElementById('btn-book-whatsapp');

  const typeNames = {
    family: '👨‍👩‍👧‍👦 Семейная ($170)',
    couple: '💑 Парная ($150)',
    single: '✨ Индивидуальная ($150)',
    dress: '👗🪽 Летящее платье ($150)'
  };

  const locNames = {
    hurghada: '🌴 Хургада (+$0)',
    desert: '🏜 Пустыня (+$0)',
    cliff: '🌅 Утёс Сафага (+$0)',
    sea_desert: '🌊 Море + Пустыня (+$0)',
    el_gouna: '🌴 Эль-Гуна (+$30)'
  };

  function updateCalculator() {
    let basePrice = 170;
    let selectedTypeKey = 'family';
    let locPrice = 0;
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
        locPrice = parseInt(btn.getAttribute('data-price')) || 0;
        selectedLocKey = btn.getAttribute('data-loc');
      }
    });

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
    if (optTransfer && optTransfer.checked) {
      extrasPrice += parseInt(optTransfer.value);
      extrasList.push('🚗 Трансфер (~$35)');
    }

    const total = basePrice + locPrice + extrasPrice;

    // Обновление отображения в карточке Итога
    sumType.textContent = typeNames[selectedTypeKey] ? typeNames[selectedTypeKey].split(' (')[0] : 'Семейная';
    sumLoc.textContent = locNames[selectedLocKey] ? locNames[selectedLocKey].split(' (')[0] : 'Хургада';
    sumExtras.textContent = extrasList.length > 0 ? extrasList.join(', ') : 'Нет';
    sumTime.textContent = readyDays;
    sumTotal.textContent = `$${total}`;

    // Формирование ссылки для Telegram и WhatsApp
    const messageText = `Здравствуйте, Кристина! 👋%0A` +
      `Хочу забронировать фотосессию в Египте:%0A` +
      `• Вид съёмки: ${typeNames[selectedTypeKey]}%0A` +
      `• Локация: ${locNames[selectedLocKey]}%0A` +
      `• Доп. опции: ${extrasList.length > 0 ? extrasList.join(', ') : 'Без доп. опций'}%0A` +
      `• Срок готовности: ${readyDays}%0A` +
      `💰 Итоговая расчётная стоимость: $${total}%0A%0A` +
      `Подскажите, свободны ли даты для съёмки?`;

    if (btnTelegram) {
      btnTelegram.href = `https://t.me/Kristina_Selesnova_photo?text=${messageText}`;
    }
    if (btnWhatsapp) {
      btnWhatsapp.href = `https://wa.me/380682552141?text=${messageText}`;
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

  /* --- 5. Модальное окно просмотра фото (Lightbox) --- */
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');

  function openLightbox(src) {
    if (lightboxModal && lightboxImg) {
      lightboxImg.src = src;
      lightboxModal.classList.add('active');
    }
  }

  function closeLightbox() {
    if (lightboxModal) {
      lightboxModal.classList.remove('active');
    }
  }

  // Клики на слайды портфолио
  document.addEventListener('click', (e) => {
    const photoContainer = e.target.closest('.swiper-slide-photo');
    const thumbContainer = e.target.closest('.location-thumb');

    if (photoContainer) {
      const fullSrc = photoContainer.getAttribute('data-full');
      if (fullSrc) openLightbox(fullSrc);
    } else if (thumbContainer) {
      const fullSrc = thumbContainer.getAttribute('data-full');
      if (fullSrc) openLightbox(fullSrc);
    }
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

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

});
