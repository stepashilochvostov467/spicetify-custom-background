# Custom Background for Spicetify

Свой фон, прозрачные панели и синхронные тексты в Spotify.
Custom backgrounds, transparent panels and synced lyrics for Spotify.

[Русский](#русский) · [English](#english)

## Русский

### Что умеет

- Картинки, GIF и зацикленные видео MP4/WebM без звука — до 30 МБ.
- Настройка положения, масштаба, затемнения и размытия фона мышью или ползунками.
- Раздельное оформление медиатеки, основной области и плеера.
- Стандартный, свой или автоматически подобранный цвет текста.
- Скрытие подкастов, рекомендаций, магазина и правой панели.
- Настройка обложек, строк треков, размеров текста и элементов плеера.
- Пресеты со своим фоном, привязкой к плейлистам, экспортом и импортом.
- Предпросмотр импорта: применить всё либо только фон и цвета.
- Правая панель текстов Spotify или Spicy Lyrics.

Режим погружения, визуализатор, автоматическое движение фона и параллакс удалены. Плавная смена картинки осталась.

### Установка

Нужен установленный [Spicetify](https://spicetify.app/docs/getting-started/).

1. Скачай [custom-bg.js](https://raw.githubusercontent.com/stepashilochvostov467/spicetify-custom-background/main/custom-bg.js).
2. Положи файл в папку Extensions внутри каталога настроек Spicetify. В Windows обычно это %APPDATA%\spicetify\Extensions.
3. Выполни:

```powershell
spicetify config extensions custom-bg.js
spicetify apply
```

**Alt+B** открывает настройки, **Alt+P** переключает пресеты. Все изменения оформления сохраняются локально.

### Тексты Spicy Lyrics

Установи [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) отдельно и оставь включённой его карточку Lyrics в правой панели. В настройках Custom Background выбери «Текст песни в правой панели → Spicy Lyrics».

Если трека ещё нет в кэше, расширение автоматически запускает штатную карточку Spicy для загрузки, затем восстанавливает её состояние. Страница плейлиста остаётся открытой. Прямых запросов к API Spicy и чтения его токенов нет.

При наличии таймингов заливка плавно проходит по буквам внутри каждого слога, строки следуют за воспроизведением. Цвет берётся из твоего оформления. Нажатие на строку перематывает песню. Если источник предоставляет только строки, панель сообщает об этом. Spotify выбирается отдельно — скрытой подмены источника нет.

### Производительность и совместимость

У статичного фона нет постоянного кадрового цикла. Анимация слогов работает только во время воспроизведения в видимом окне; на паузе и при выключенных текстах останавливается. Одинаковые стили не применяются повторно. Видео приостанавливается в скрытом окне.

В версии 4.2.1 поиск текущей строки индексирован, текст добавляется в панель одним блоком, список кэшей Spicy переиспользуется между проверками.

Проверено со Spicetify 2.46.2 и Spotify 1.3.6. После обновлений Spotify классы интерфейса могут меняться. Скрытие рекомендаций распознаёт известные секции и заголовки на русском и английском. Тексты и тайминги зависят от доступности источника.

## English

### Features

Custom images, GIFs and muted looping MP4/WebM videos up to 30 MB; on-screen background framing; independent glass panels; automatic or custom text color; interface visibility and sizing controls; per-playlist presets; portable import/export with preview; and a Spotify/Spicy Lyrics sidebar.

Immersion mode, audio visualization, automatic background movement and parallax have been removed. Background crossfades remain available.

### Installation

Install [Spicetify](https://spicetify.app/docs/getting-started/), download [custom-bg.js](https://raw.githubusercontent.com/stepashilochvostov467/spicetify-custom-background/main/custom-bg.js), copy it into Spicetify's Extensions directory, then run the commands above. **Alt+B** opens settings; **Alt+P** switches presets.

For Spicy lyrics, install [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) separately and keep its native sidebar Lyrics card enabled. Select Spicy Lyrics in this extension's settings. Uncached songs automatically start the native loader without leaving the current playlist. No direct Spicy API calls or token access are used.

Syllable timestamps drive a smooth fill across letters, with automatic line following and the selected text color. Click a line to seek. Songs with only line timing are labeled accordingly. Spotify is an explicit separate source, with no silent fallback.

Static backgrounds have no animation loop. Syllable animation stops on pause, hidden windows and disabled lyrics. Styles are cached. Version 4.2.1 adds indexed line lookup, batched lyric rendering and cache-list reuse. UI compatibility depends on the Spotify build; tested with Spotify 1.3.6 and Spicetify 2.46.2.

## Development

Node.js and Google Chrome are required for the browser checks.

```sh
npm ci
npm run build
npm test
```

The build writes custom-bg.js to the repository root and validates its syntax. Tests use an isolated Spotify fixture, including cold Spicy loading, syllable timing, seek/pause behavior, preset round trips and idle callbacks. Fixture tests do not guarantee compatibility with every Spotify or Spicy Lyrics release.

Suggestions and bug reports: [Issues](https://github.com/stepashilochvostov467/spicetify-custom-background/issues). See [CONTRIBUTING.md](CONTRIBUTING.md) and [ROADMAP.md](ROADMAP.md).

MIT · [LICENSE](LICENSE)
