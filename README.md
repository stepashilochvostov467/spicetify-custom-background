# Custom Background for Spicetify

Свой Spotify: фоны, стеклянные панели, файлы оформлений и тексты песен.
Your Spotify: custom backgrounds, glass panels, appearance files and lyrics.

[Русский](#русский) · [English](#english) · **4.12.3**

Версия **с выбором Spicy Lyrics или Spotify**. [Native без сторонних расширений](https://github.com/stepashilochvostov467/spicetify-custom-background-native).

**Choose Spicy Lyrics or Spotify.** [Native version without companion extensions](https://github.com/stepashilochvostov467/spicetify-custom-background-native).

## Русский

### Возможности

- Свой фон: картинки, GIF и видео MP4/WebM без звука до 30 МБ.
- Масштаб, положение, размытие и затемнение фона.
- Отдельные настройки стеклянных панелей медиатеки, центра и плеера.
- Свой или автоматически подобранный цвет текста, кнопок и иконок. У иконок контрастная тень, у кнопки воспроизведения — светлый или тёмный значок по цвету заливки.
- Spicy Lyrics: автоматическая загрузка, плавная подсветка слогов с настоящими таймингами, основной и фоновый вокал.
- Полноразмерная боковая панель текстов Spotify: подсветка текущей строки, плавная прокрутка и перемотка нажатием.
- Русский перевод под оригиналом: общая подсветка и прокрутка, выбранный цвет текста и локальный кэш переводов.
- Фон панели текста выбирается для каждой песни. В режиме «Авто» порядок такой — клип → Canvas → обложка. Можно выбрать конкретный источник или поставить свой ролик.
- Настройки обложек, размеров текста, строк и элементов плеера.
- Скрытие подкастов и аудиокниг вместе с кнопками их разделов, рекомендаций, магазина и штатной правой панели.
- Alt+P: сохранить текущее оформление в JSON или импортировать файл с предпросмотром. Файл включает фон и все настройки; каталога встроенных и сохранённых стилей нет.

В настройках доступны два источника текста. **Spicy Lyrics** должен быть установлен отдельно: расширение автоматически запускает его загрузку и использует настоящие тайминги слогов для плавного заполнения букв цветом. Если источник содержит только строки, показывается построчная синхронизация. **Spotify** работает без Spicy Lyrics, но предоставляет только строки. Пока загружаются тайминги Spicy Lyrics, панель может показать построчный текст Spotify и обновить его, когда тайминги поступят.

### Установка

Для синхронизации по слогам отдельно установи [Spicy Lyrics](https://github.com/spicetify/spicetify-marketplace) через Marketplace и выбери его в разделе «Текст песни в правой панели → Источник».

Нужны настольный Spotify и установленный [Spicetify](https://spicetify.app/docs/getting-started/).

1. Скачай [custom-bg.js](https://raw.githubusercontent.com/stepashilochvostov467/spicetify-custom-background/main/custom-bg.js).
2. Положи файл в каталог Extensions внутри папки настроек Spicetify. В Windows обычно это `%APPDATA%\spicetify\Extensions`.
3. Выполни:

```powershell
spicetify config extensions custom-bg.js
spicetify apply
```

**Alt+B** — настройки, **Alt+V** — открыть или закрыть текст песни, **Alt+P** — импорт и экспорт текущего оформления. Все разделы настроек при открытии свёрнуты; изменения сохраняются автоматически. Кнопка «Сохранить в файл» выгружает JSON с фоном и всеми настройками. Старые файлы пресетов по-прежнему импортируются.

### Синхронизация текста с клипом

Расширение сначала ищет тайминги видеоверсии. Если доступны только тайминги аудиоверсии, наведи курсор на звучащую строку и нажми **Alt+S**. Панель привяжет строку к текущему моменту, а клип продолжит играть. То же можно сделать через меню «Фон» → «Синхронизировать текст». После монтажной склейки можно добавить ещё одну точку. Привязки хранятся локально для каждого клипа.

### Перевод песен

Нажми **RU** в заголовке панели текста или включи «Русский перевод под каждой строкой» в настройках. По умолчанию используется **«На компьютере · EN → RU»**: английский текст переводится локальной моделью без дневной квоты, API-ключей и дополнительных расширений. При первом запуске скачиваются движок и модель. После загрузки сам перевод работает без интернета; исходные строки должны быть доступны в Spotify. При очистке кэша модель потребуется скачать заново.

Перевод показывается под оригиналом, использует его тайминг и цвет оформления. Нажатие на перевод перематывает к той же строке. Повторяющиеся строки переводятся один раз; результаты хранятся локально до 30 дней. Вычисления выполняются в отдельном потоке, модель выгружается из памяти после минуты простоя. Локальный режим передаёт в сеть только запросы фиксированных файлов движка и модели; текст песни остаётся на устройстве. Пока поддерживается английский → русский; художественное качество перевода не гарантируется. Цензура не применяется. Для выражения «fucking … up» добавлена контекстная поправка, сохраняющая грубый смысл; это не универсальное исправление всех ошибок модели.

Для других языков можно **явно выбрать MyMemory** в настройке «Переводчик». Этот режим отправляет строки [онлайн-сервису](https://mymemory.translated.net/doc/spec.php), у которого [лимит 5000 символов в день](https://mymemory.translated.net/doc/usagelimits.php). Автоматического переключения с локального режима на онлайн нет. При ошибке оригинал остаётся доступен; ↻ повторяет попытку.

Эта версия заменяет файл `custom-bg.js` предыдущего варианта. Выбирай один вариант расширения; запуск двух копий одновременно не поддерживается. Настройки и формат пресетов совместимы, неподдерживаемый источник текста из старого пресета отключается.

Подробности оптимизации и измерения: [PERFORMANCE.md](PERFORMANCE.md).

### Доступность и производительность

Картинки и настройки хранятся локально. Постоянного кадрового цикла у статичного фона нет. Синхронизация текста останавливается на паузе, при выключенной панели и в скрытом окне; видео также приостанавливается в скрытом окне.

Тексты, Canvas и клипы зависят от доступности в Spotify, аккаунта, региона и версии клиента. Недоступное видео заменяется обложкой. Независимость от других расширений не гарантирует неизменность внутренних API Spotify.

## English

### Features

- Custom images, GIFs and muted looping MP4/WebM videos up to 30 MB.
- Background framing, zoom, blur and dimming.
- Independent glass settings for the library, main area and player.
- Custom or automatically selected text, button and icon colors, contrast halos, and a light/dark foreground for the play button.
- Spicy Lyrics: automatic loading, smooth syllable fill using actual timings, lead and backing vocals.
- Full-height native Spotify lyric sidebar with line highlighting, smooth following and click-to-seek.
- Russian translation below each original line, sharing its highlight, timing and selected color, with a local translation cache.
- Choose sidebar media per song. Auto prefers a music video, then Canvas, then cover art. You can select a source or add a local video.
- Cover, typography, track row and player sizing controls.
- Hide podcasts and audiobooks including their navigation chips, recommendations, store links and Spotify's native sidebar.
- Alt+P: export the current appearance to JSON or import a file with preview. Files contain the background and all settings; there is no built-in or saved preset catalog.

Choose between two lyric sources. **Spicy Lyrics** must be installed separately: this extension automatically triggers its loader and uses actual syllable timings for smooth text fill. Line-only data remains line-synced. **Spotify** works without Spicy Lyrics and provides line timing only. While waiting for Spicy timing, the sidebar can show Spotify lines and upgrade to syllable timing when it becomes available.

### Installation

Install desktop Spotify and [Spicetify](https://spicetify.app/docs/getting-started/). Download [custom-bg.js](https://raw.githubusercontent.com/stepashilochvostov467/spicetify-custom-background/main/custom-bg.js), copy it to Spicetify's Extensions directory, and run the commands above.

**Alt+B** opens settings; **Alt+V** toggles lyrics; **Alt+P** opens appearance import/export. Settings sections open collapsed and changes save automatically. Export writes a JSON file containing all current settings and the wallpaper. Old preset files remain importable.

### Sync lyrics with a music video

The extension checks for video-specific timings first. When using timings from the audio track, hover over the line you hear and press **Alt+S**. The sidebar anchors the line to the current video position without seeking. You can also use the sidebar background menu to enter sync mode. Add another anchor after an edit if needed. Anchors are saved locally for each video.

### Russian translation

Press **RU** in the lyric panel header or enable Russian translation in settings. The default **on-device EN → RU** engine translates English locally without a daily service quota, API key or companion extension. The runtime and model download on first use. Afterwards translation itself works offline; original lines must still be available from Spotify. Clearing the cache requires downloading the model again.

Translations appear below their originals and share their highlight, timing, text color and click-to-seek action. Repeated lines are translated once; results are cached locally for up to 30 days. Inference runs in a worker; the model is unloaded after one minute of inactivity. Local mode only requests fixed runtime and model assets over the network; lyric text stays on the device. English → Russian is currently supported. Machine translation does not guarantee literary quality.

For other languages, explicitly select **MyMemory** in translator settings. This sends lines to the [online provider](https://mymemory.translated.net/doc/spec.php), whose anonymous tier is [limited to 5000 characters per day](https://mymemory.translated.net/doc/usagelimits.php). Local mode never silently falls back online. Errors preserve originals; press ↻ to retry.

This replaces the previous variant's `custom-bg.js`. Use one variant at a time. Appearance settings and preset files remain compatible; an unsupported imported lyric source is disabled.

### Availability and performance

Images and settings are stored locally. Static backgrounds have no permanent frame loop. Lyric synchronization stops when paused, hidden or disabled. Background video pauses in hidden windows.

Lyrics, Canvas and music videos depend on Spotify availability, account, region and client version. Unavailable video falls back to the cover. Internal Spotify APIs can change independently of this extension.

## Development

Node.js and Google Chrome are required for the browser checks.

```sh
npm ci
npm run build
npm test
```

`npm run test:local` additionally downloads the actual translation model into an ignored test browser profile, verifies inference and UI responsiveness, then starts a fresh worker with networking disabled. Standard tests mock inference and do not download model weights.

The build minifies `custom-bg.js` and checks its syntax. Isolated browser tests cover native lyrics, line timing, stale requests, seek/pause behavior, Canvas fallback, video layout, preset import/export and idle callbacks. Fixtures simulate the Spicy Lyrics loader and timed payloads; they do not guarantee compatibility with every Spotify or Spicy Lyrics release.

[Report a bug / Сообщить об ошибке](https://github.com/stepashilochvostov467/spicetify-custom-background/issues) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

MIT License. Independent project, not affiliated with Spotify. Local model/runtime credits and pinned versions: [THIRD_PARTY.md](THIRD_PARTY.md).


### Видео отдельно от текста / Separate media and lyrics

В настройках правой панели выбери расположение видео: **Над текстом**, **Под текстом** или **Фоном · прежний вид**. По умолчанию видео сверху, текст и перевод — ниже на отдельной тёмной поверхности. Видео показывается целиком, без обрезки и растягивания. Шрифт, тайминги, перевод и горячие клавиши сохраняются.

Choose **Above lyrics**, **Below lyrics**, or the previous **Background** layout in sidebar settings. The default separates the full uncropped video preview above the scrolling original/translation pairs. Fonts, timing, translation and shortcuts remain unchanged. Layout selection is saved and included in appearance exports.


### Закреплённая строка / Fixed lyric anchor

В основном виде текущая строка закреплена у начала нижней трети окна. Следующие строки идут ниже, прошедшие скрываются. Верхняя область заполнена медиа с мягким продолжением его цветов и переходом в тёмный фон текста. Панель доходит до краёв окна, постоянные технические надписи убраны. Кнопки RU, обновления и закрытия остаются вверху; пояснение переводчика доступно при наведении на RU. Если у текста нет таймингов, остаётся ручная прокрутка.

The main layout pins the playing original/translation pair at two thirds of the window height and hides previous rows. Media and static sampled ambient colors fade into the dark lyric surface. The sidebar reaches the window edges with compact controls. Untimed lyrics retain manual scrolling.


### История: отключение старой предзагрузки / Historical rollback

В предыдущей сборке предзагрузка была отключена после сообщений о пропадании текста при переключении песен. Текст и перевод снова загружаются обычным путём для текущего трека. Экспериментальные исходники сохранены, но не включаются в custom-bg.js. Оформление, закрепление строки и прозрачные кнопки сохранены.

Lookahead was excluded from the previous release following missing-lyrics reports on track changes. Foreground loading is restored. Experimental source files remain for further investigation; current layout and transparent controls are preserved.


### Резервный текст / Temporary native lyrics

При задержке Spicy через 200 мс запрашиваются строки Spotify. Доступный текст сразу показывается и переводится; загрузка Spicy продолжается. Когда приходят тайминги, строки заменяются послоговым текстом с сохранением перевода. Наличие текста зависит от обоих источников.

If Spicy is delayed, native Spotify lyrics are requested after 200 ms and translated immediately when available. Spicy continues loading and automatically replaces the preview when syllable timings arrive. Neither provider is guaranteed to have lyrics for every song.

## 4.10.0 — предзагрузка и приоритет перевода / Lookahead and translation priority

Две следующие песни: текст Spotify, доступные в кэше тайминги Spicy (только Full), Canvas до 32 МиБ суммарно и первые 12 уникальных переводимых строк. Основная загрузка не ждёт незавершённую предзагрузку. Текущая строка и следующие имеют приоритет, в том числе после перемотки. Кэш переводов: до 500 записей и 2 МиБ UTF-8, 30 дней. Тяжёлые экспериментальные модели не подключены. Новый текст Spicy по-прежнему зависит от его собственного загрузчика.

Preloads the next two songs: Spotify text, already cached Spicy timing (Full only), Canvas with a 32 MiB RAM cache, and the first 12 unique translatable lines. Foreground loading never waits for unfinished lookahead. Translation prioritizes the playing line and upcoming lines after seeking. Persistent translation cache: 500 entries / 2 MiB UTF-8 / 30 days. Experimental large models remain disconnected. Uncached Spicy lyrics still depend on its own loader.

## 4.11.0 — Дуэт / Duet

Full: партии Spicy с `OppositeAligned` располагаются слева и справа; бэк-вокал остаётся отдельной меньшей строкой с собственными таймингами. Совпадающие по тексту, началу и концу строки противоположных партий объединяются по центру. При наложении разных партий обе остаются видимыми у фиксированного якоря. Перевод следует своей партии. Переключатель находится в настройках правой панели и сохраняется. Без разметки, в том числе при резервном Spotify-тексте, используется обычный вид. Имена исполнителей не угадываются. Новых сетевых запросов и моделей нет. Native 1.9.0 остаётся отдельной версией без Spicy.

Full: uses Spicy alignment metadata for left/right vocal parts, separate smaller backing vocals, and centered identical unison lines with matching timings. Overlapping voices remain visible, preserving syllable timing and translations. The sidebar setting is persistent. Unmarked songs and Spotify fallback keep normal layout. No guessed performer names, extra model or network dependency. Native 1.9.0 remains independent of Spicy.

## 4.11.1 — английский запас перевода / English translation reserve

Предзагрузка перевода ищет две следующие английские песни среди десяти ближайших уникальных треков. Русские, другие языки и песни без текста не занимают место в этом запасе и не передаются локальному переводчику. Для ближайших двух песен любого языка по-прежнему готовятся текст и Canvas. Поиск прекращается после двух английских песен; при выключенном переводе остаётся обычный просмотр двух треков. Лимиты кэшей не увеличены.

Translation lookahead selects the next two English songs within ten upcoming unique tracks. Russian, other languages and unavailable lyrics do not occupy translation slots. Lyrics and Canvas still prepare for the immediate two tracks in any language. Cache limits remain unchanged.

## 4.12.0 — Карта песни / Song map

При открытой панели текста над полосой прогресса появляется карта синхронизированной песни. Нажатие на раздел перематывает; кнопка «⋯» или правый клик открывает редактор времени (секунды) и названий. Можно добавить отметку на текущем времени, удалить отметку, сохранить или вернуть автоматическую разметку. До 100 ручных карт по 40 разделов хранятся локально.

Автоматика ищет повторяющиеся пары разных строк и паузы между известным концом вокальной строки и следующей. Подписи «Повтор» и «Пауза в тексте» не являются гарантированными припевами и инструменталами. Для текста без таймингов карта не строится. Анализа аудио, новых моделей и фоновых таймеров нет.

With lyrics open, a song map appears above the progress bar. Click a section to seek; use «⋯» or right-click to edit timestamps and labels. Manual maps persist locally (100 songs, 40 sections each). Auto markers identify repeated two-line passages and gaps with known vocal-end timing; they do not claim semantic chorus/instrumental detection. Untimed lyrics are unsupported. No audio analysis or new model.
