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
  const calcTransferPrice = document.getElementById('calc-transfer-price');
  const transferLocNote = document.getElementById('transfer-loc-note');

  const sumType = document.getElementById('sum-type');
  const sumLoc = document.getElementById('sum-loc');
  const sumTransfer = document.getElementById('sum-transfer');
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

    // Обновление отображения в карточке Итога
    if (sumType) sumType.textContent = typeNames[selectedTypeKey] ? typeNames[selectedTypeKey].split(' (')[0] : 'Семейная';
    if (sumLoc) sumLoc.textContent = currentLoc.cleanName;
    if (sumTransfer) sumTransfer.textContent = transferSummaryText;
    if (sumExtras) sumExtras.textContent = extrasList.length > 0 ? extrasList.join(', ') : 'Нет';
    if (sumTime) sumTime.textContent = readyDays;
    if (sumTotal) sumTotal.textContent = `$${total}`;

    // Формирование ссылки для Telegram и WhatsApp
    const messageText = `Здравствуйте, Кристина! 👋%0A` +
      `Хочу забронировать фотосессию в Египте:%0A` +
      `• Вид съёмки: ${typeNames[selectedTypeKey]}%0A` +
      `• Локация: ${currentLoc.name}%0A` +
      `• Трансфер: ${transferMsgText}%0A` +
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

  window.selectCalcLoc = function(locName) {
    calcLocBtns.forEach(btn => {
      if (btn.getAttribute('data-loc') === locName) {
        btn.click();
      }
    });
  };

  /* --- 5. Модальное окно просмотра фото (Lightbox) --- */
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxCaption = document.getElementById('lightbox-caption');

  function openLightbox(src, location) {
    if (lightboxModal && lightboxImg) {
      lightboxImg.src = src;
      if (lightboxCaption) {
        if (location) {
          lightboxCaption.innerHTML = `<span class="lightbox-caption-label">Локация:</span> ${location}`;
          lightboxCaption.style.display = 'inline-flex';
        } else {
          lightboxCaption.style.display = 'none';
        }
      }
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
      const location = photoContainer.getAttribute('data-location') || '';
      if (fullSrc) openLightbox(fullSrc, location);
    } else if (thumbContainer) {
      const fullSrc = thumbContainer.getAttribute('data-full');
      const card = thumbContainer.closest('.location-card');
      const location = card ? card.querySelector('.location-name')?.textContent?.trim() : '';
      if (fullSrc) openLightbox(fullSrc, location);
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

});
