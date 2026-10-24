<p align="center">
  <img src="assets/banner.png" alt="Custom Background for Spicetify" width="100%">
</p>

<p align="center">
  <a href="#русский">Русский</a> · <a href="#english">English</a>
</p>

<p align="center">
  <img alt="Release" src="https://img.shields.io/badge/release-2.2.0-7c5cff">
  <img alt="Spicetify" src="https://img.shields.io/badge/Spicetify-extension-1ed760">
  <img alt="Tests" src="https://img.shields.io/badge/tests-74%20passed-21c55d">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-60a5fa">
</p>

<a id="русский"></a>

# Custom Background for Spicetify

Расширение для Spicetify, которое добавляет настраиваемый фон, стеклянные панели и полноэкранный режим погружения в Spotify.

## Как выглядит

| Настройки | Режим погружения | Синхронный текст |
|---|---|---|
| <img src="screenshots/settings.png" alt="Настройки" width="320"> | <img src="screenshots/immersion.png" alt="Режим погружения" width="320"> | <img src="screenshots/lyrics.png" alt="Синхронный текст" width="320"> |

## Возможности

- отдельное размытие и затемнение медиатеки, центральной области и плеера;
- прозрачные страницы плейлистов и исполнителей;
- автоматический подбор читаемого цвета текста;
- масштабирование и позиционирование фоновой картинки;
- пресеты со своей картинкой, экспортом и импортом;
- полноэкранный режим погружения со свободной компоновкой;
- текст песен из Spotify или установленного Spicy Lyrics;
- построчная синхронизация и подсветка отдельных слогов, когда источник предоставляет их тайминги.

## Установка

1. Установите [Spicetify](https://spicetify.app/docs/getting-started/).
2. Скачайте файл [`custom-bg.js`](custom-bg.js).
3. Скопируйте его в `%APPDATA%\spicetify\Extensions`.
4. Выполните в PowerShell:

```powershell
spicetify config extensions custom-bg.js
spicetify apply
```

Для текста из Spicy Lyrics установите это расширение отдельно через Marketplace. Custom Background использует его локальное хранилище и автоматически запускает загрузку текста в режиме погружения.

## Управление

- `Alt+B` — открыть настройки;
- `Alt+I` — включить или выключить режим погружения;
- `Alt+P` — переключить оформление;
- `Escape` — закрыть настройки или выйти из погружения.

В режиме погружения нажмите **Компоновка**, перетащите блоки и измените их размеры, затем нажмите **Сохранить компоновку**.

## Разработка

Для сборки достаточно Node.js:

```powershell
node scripts/build.cjs
```

Готовый файл появится в корне репозитория как `custom-bg.js`.

Тесты используют Playwright:

```powershell
npm install
npm test
```

Планы развития находятся в [ROADMAP.md](ROADMAP.md). Идеи, сообщения об ошибках и pull request приветствуются — перед первым вкладом прочитайте [CONTRIBUTING.md](CONTRIBUTING.md).

## Совместимость

Проверено со Spicetify 2.46.2 и Spotify 1.3.6. Классы интерфейса Spotify меняются между версиями, поэтому после обновления клиента отдельные поверхности могут потребовать новых CSS-селекторов.

## Лицензия

[MIT](LICENSE)

---

<a id="english"></a>

# Custom Background for Spicetify — English

A Spicetify extension that adds customizable backgrounds, glass panels, and a full-screen immersion mode to Spotify.

## Features

- separate blur and dimming controls for the library, main view, and player;
- transparent playlist and artist pages;
- automatic text contrast based on the visible part of the background;
- background zoom and positioning;
- presets with their own images, plus import and export;
- full-screen immersion mode with a freely adjustable layout;
- lyrics from Spotify or an installed Spicy Lyrics extension;
- line synchronization and per-syllable highlighting whenever the source provides syllable timing.

## Installation

1. Install [Spicetify](https://spicetify.app/docs/getting-started/).
2. Download [`custom-bg.js`](custom-bg.js).
3. Copy it to `%APPDATA%\spicetify\Extensions`.
4. Run the following commands in PowerShell:

```powershell
spicetify config extensions custom-bg.js
spicetify apply
```

To use Spicy Lyrics as the lyric source, install it separately through Marketplace. Custom Background reads its local cache and automatically triggers lyric loading when immersion mode is opened or the track changes.

## Shortcuts

- `Alt+B` — open settings;
- `Alt+I` — toggle immersion mode;
- `Alt+P` — switch to the next preset;
- `Escape` — close settings or leave immersion mode.

In immersion mode, select **Компоновка / Layout**, drag and resize the blocks, then select **Сохранить компоновку / Save layout**.

## Development

Build the extension with Node.js:

```powershell
node scripts/build.cjs
```

The compiled `custom-bg.js` file will be written to the repository root.

Install the development dependency and run the test suite with:

```powershell
npm install
npm test
```

The current release passes 74 browser checks. It was tested with Spicetify 2.46.2 and Spotify 1.3.6. Spotify class names can change between releases, so some surfaces may require updated CSS selectors after a client update.

See [ROADMAP.md](ROADMAP.md) for planned development. Ideas, bug reports, and pull requests are welcome; please read [CONTRIBUTING.md](CONTRIBUTING.md) before your first contribution.
