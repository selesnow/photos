# Скрипт автоматического создания Custom Dimensions и Custom Metrics в Google Analytics 4 через GA4 Admin API
# Сайт: christina-hurghada.photos
# Property ID: 560132103 (G-FFC3HRMXXG)

suppressPackageStartupMessages({
  library(googleAnalyticsR)
  library(googleAuthR)
  library(httr)
  library(jsonlite)
  library(gargle)
})

message("\n=== Авторизация в Google Analytics ===")
tok_file <- "C:/Users/User/AppData/Local/gargle/gargle/Cache/9b80f6a79b3080c58c5dd1e54bf00a07_selesnow@gmail.com"
if (!file.exists(tok_file)) {
  tok_file <- list.files("C:/Users/User/AppData/Local/gargle/gargle/Cache", pattern = "selesnow@gmail.com", full.names = TRUE)[1]
}

tok <- readRDS(tok_file)
tok$refresh()
token_str <- tok$credentials$access_token

property_id <- "560132103"
message(sprintf("Выбран ресурс Property ID: %s (christina-hurghada.photos)", property_id))

# --- 1. Проверяем существующие параметры (Custom Dimensions) ---
url_dims <- sprintf("https://analyticsadmin.googleapis.com/v1beta/properties/%s/customDimensions", property_id)
resp_dims <- GET(url_dims, add_headers(Authorization = paste("Bearer", token_str)))

existing_dims <- character(0)
if (status_code(resp_dims) == 200) {
  content_dims <- fromJSON(content(resp_dims, as = "text", encoding = "UTF-8"))
  if (!is.null(content_dims$customDimensions) && length(content_dims$customDimensions$parameterName) > 0) {
    existing_dims <- content_dims$customDimensions$parameterName
  }
}
message(sprintf("Существующих пользовательских параметров: %d", length(existing_dims)))

# Список параметров
dims <- list(
  list(param = "service_type", name = "Тип съёмки", desc = "Выбранный тип съёмки в калькуляторе (Семейная, Love Story, Индивидуальная, Летящее платье)"),
  list(param = "service_location", name = "Локация съёмки", desc = "Выбранная локация в калькуляторе (Хургада Мамша, Пустыня, Эль-Гуна, Утёс, Море + Пустыня)"),
  list(param = "booking_date", name = "Дата бронирования", desc = "Выбранная дата съёмки в калькуляторе (ДД.ММ.ГГГГ или не указана)"),
  list(param = "messenger", name = "Мессенджер", desc = "Канал связи: telegram или whatsapp"),
  list(param = "trigger_source", name = "Источник старта калькулятора", desc = "Элемент первого взаимодействия (type_button, location_button, addon_checkbox, date_picker, package_card)"),
  list(param = "package_name", name = "Тариф в блоке цен", desc = "Выбранный тариф в карточках цен (family, couple, single, dress)"),
  list(param = "location_name", name = "Локация видеообзора", desc = "Название локации при открытии Reels видеообзора"),
  list(param = "photo_name", name = "Имя файла фото", desc = "Имя файла просмотренной фотографии в Lightbox (например, family/1.jpg)"),
  list(param = "photo_src", name = "Путь к фото", desc = "Относительный URL файла фотографии"),
  list(param = "photo_type", name = "Тип фотоконтента", desc = "Раздел фото: portfolio, location, review"),
  list(param = "photo_caption", name = "Подпись фото", desc = "Локация или текстовая подпись к фотографии"),
  list(param = "tab_name", name = "Вкладка портфолио", desc = "Выбранная вкладка в портфолио (family, couple, single)"),
  list(param = "button_name", name = "Кнопка первого экрана", desc = "Нажатая кнопка в hero-блоке (calculator, portfolio)"),
  list(param = "network", name = "Социальная сеть", desc = "Кликнутая соцсеть: instagram, telegram, whatsapp"),
  list(param = "placement", name = "Размещение элемента", desc = "Место клика (floating_bar, footer, video_modal)"),
  list(param = "target_url", name = "Целевой URL", desc = "Внешняя ссылка перехода"),
  list(param = "question_title", name = "Вопрос FAQ", desc = "Заголовок раскрытого вопроса в аккордеоне FAQ")
)

message("\n=== Создание специальных параметров (Custom Dimensions) ===")
created_dims <- 0
skipped_dims <- 0

for (d in dims) {
  if (d$param %in% existing_dims) {
    message(sprintf("  [ПРОПУСК] Уже существует: %s (%s)", d$param, d$name))
    skipped_dims <- skipped_dims + 1
    next
  }
  
  body <- list(
    parameterName = d$param,
    displayName = d$name,
    description = d$desc,
    scope = "EVENT"
  )
  
  post_resp <- POST(
    url_dims,
    add_headers(
      Authorization = paste("Bearer", token_str),
      "Content-Type" = "application/json; charset=utf-8"
    ),
    body = toJSON(body, auto_unbox = TRUE)
  )
  
  if (status_code(post_resp) %in% c(200, 201)) {
    message(sprintf("  [СОЗДАН] %s (%s)", d$param, d$name))
    created_dims <- created_dims + 1
  } else {
    err_msg <- content(post_resp, as = "text", encoding = "UTF-8")
    message(sprintf("  [ОШИБКА] %s: %s", d$param, err_msg))
  }
  Sys.sleep(0.3)
}

# --- 2. Проверяем и создаем специальные показатели (Custom Metrics) ---
url_metrics <- sprintf("https://analyticsadmin.googleapis.com/v1beta/properties/%s/customMetrics", property_id)
resp_metrics <- GET(url_metrics, add_headers(Authorization = paste("Bearer", token_str)))

existing_metrics <- character(0)
if (status_code(resp_metrics) == 200) {
  content_metrics <- fromJSON(content(resp_metrics, as = "text", encoding = "UTF-8"))
  if (!is.null(content_metrics$customMetrics) && length(content_metrics$customMetrics$parameterName) > 0) {
    existing_metrics <- content_metrics$customMetrics$parameterName
  }
}
message(sprintf("\nСуществующих пользовательских показателей: %d", length(existing_metrics)))

metrics_list <- list(
  list(param = "photo_index", name = "Номер фото в просмотре", desc = "Порядковый номер фото в галерее Lightbox", unit = "STANDARD"),
  list(param = "total_photos", name = "Всего фото в галерее", desc = "Общее число фото в открытой категории", unit = "STANDARD")
)

message("\n=== Создание специальных показателей (Custom Metrics) ===")
created_metrics <- 0
skipped_metrics <- 0

for (m in metrics_list) {
  if (m$param %in% existing_metrics) {
    message(sprintf("  [ПРОПУСК] Уже существует: %s (%s)", m$param, m$name))
    skipped_metrics <- skipped_metrics + 1
    next
  }
  
  body <- list(
    parameterName = m$param,
    displayName = m$name,
    description = m$desc,
    measurementUnit = m$unit,
    scope = "EVENT"
  )
  
  post_resp <- POST(
    url_metrics,
    add_headers(
      Authorization = paste("Bearer", token_str),
      "Content-Type" = "application/json; charset=utf-8"
    ),
    body = toJSON(body, auto_unbox = TRUE)
  )
  
  if (status_code(post_resp) %in% c(200, 201)) {
    message(sprintf("  [СОЗДАН] %s (%s)", m$param, m$name))
    created_metrics <- created_metrics + 1
  } else {
    err_msg <- content(post_resp, as = "text", encoding = "UTF-8")
    message(sprintf("  [ОШИБКА] %s: %s", m$param, err_msg))
  }
  Sys.sleep(0.3)
}

message(sprintf("\nИтог: создано параметров: %d (пропущено: %d), показателей: %d (пропущено: %d)\n",
                created_dims, skipped_dims, created_metrics, skipped_metrics))
