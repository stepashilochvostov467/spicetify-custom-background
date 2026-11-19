# Performance / Производительность

Оптимизация сохраняет функции, настройки, тайминги, качество модели перевода и формат файлов оформления.

## Проверенные изменения

| Операция в изолированном тесте | До | После |
| --- | ---: | ---: |
| Переход через 100 строк в тексте из 2000 строк: изменения атрибутов | 400 000 | 400 |
| Те же переходы назад | 400 000 | 400 |
| Чтения строк при применении 100 уникальных переводов к 2000 строкам | 204 000 | 2 000 |
| Анализ статичной обложки при 100 пересчётах | 100 | 1 |
| Анализ пикселей при выбранном своём цвете | 100 | 0 |
| Повторные команды play для уже играющего видео | 100 | 0 |
| Повторные записи неизменившегося отсечения строк | 2 | 0 |

Это счётчики работы самого расширения в синтетическом тесте. Они не означают, что весь Spotify ускорился в 1000 раз: результат на компьютере зависит также от клиента, темы, других расширений и оборудования.

- Состояние обновляется у изменившихся строк; тайминги слогов индексируются, кадры обрабатывают текущие сегменты. Перемотка восстанавливает полное состояние.
- У статичных обложек кэшируется анализ. Видео с автоматическим цветом по-прежнему анализируется во время воспроизведения; свой цвет обходится без чтения кадров.
- Измерения геометрии выполняются перед изменением стилей, без чередования чтений и записей для каждой строки.
- Загрузка Canvas обрабатывает по одному сегменту, без удержания дополнительной копии всего ролика в массиве.
- Обновления редактора фона объединяются в кадр. Неизменившиеся стили и элементы настроек не переписываются.
- Ссылки на старые строки, сегменты и медиаданные освобождаются при закрытии панели и смене трека.

В проверке простоя за 1200 мс: 0 кадровых и интервальных вызовов; 5 неизменившихся render не меняют таблицы стилей. Это проверка статичного фона с выключенной панелью текста, а не обещание нулевой нагрузки при видео или переводе.

## Проверки

npm test запускает функциональные проверки, сравнение алгоритма автоконтраста со старым на 20 изображениях, тесты простоя и активной работы. npm run test:local дополнительно запускает настоящую модель и новый worker при отключённой сети. Веса модели и тестовые профили в репозиторий не включены.

## English

The synthetic 2000-line fixture reduces attribute mutations for 100 line transitions from 400,000 to 400, in both directions. Translation application reads 2,000 line texts instead of 204,000. Static covers are analyzed once rather than on every recalculation; custom text colors require no pixel sampling. Already-playing videos receive no redundant play calls.

These are extension-level operation counts, not a whole-app speedup claim. Automatic wallpaper analysis matches the previous output on 20 opaque, transparent and uniform fixtures. Functional checks cover seeking, overlapping and zero-duration syllables, delayed video decoding, appearance transfer, and translation. The actual local model also passes fresh-worker offline inference without sending lyrics over the network. Model quality and decoding parameters are unchanged.


## Lyrics fix

Normalized language codes and checked clearly English lyrics against incorrect provider tags before local translation. Sidebar uses the Spotify font without glyph strokes. Offline translation and model quality are unchanged.

Simulated Spicy card ready at 60 ms reached our sidebar in 84–89 ms (previously 406–408 ms). A temporary listener wakes the cache read, with a 400 ms fallback and a 24-second timeout. External service response time is excluded.


## Adaptive palette update

Automatic text now retains the background hue rather than mapping every channel into 232–255. Sidebar text uses its own cropped cover/video palette with local dark surfaces behind lines for mixed black/white backgrounds. The local model stays loaded while its translated panel is visible; closing/hiding the panel still releases it after idle timeout. External Spicy service response time is unchanged. The previous exact-color-equivalence benchmark applies only to the earlier optimization release.


## Fixed sidebar color

Sidebar ink is selected once for each new media source, independently of main wallpaper colors. GIF/video playback, resizing, dimming changes and visibility events reuse that selection. No recurring color sampling timers, text shadows, drop shadows, strokes or opaque lyric cards are used. Original and translation share the same ink.


## First-frame streaming and visible fill

Canvas becomes visible on loadeddata while later segments continue downloading. A delayed-final-segment test verifies this independently of service latency. This does not guarantee cold network/media startup below 500 ms.

Syllable fill uses one hue with different opacity before/after the moving boundary. Screenshot pixel tests at 0/50/100 percent confirm visible progress within glyphs. Spicy initial cache polling uses 100 ms bounded waits, then 250 ms, with earlier DOM wakeup. No substitute source or fabricated timing is used.


## Media frame proportions

Separated preview frames use intrinsic media aspect ratio and cap height at 34vh. Portrait Canvas narrows its frame, landscape clips reduce frame height, and photos retain their own proportions. No stretching, cropping or extra CSS letterboxing is needed. Actual 9:16/16:9 recordings and square/landscape/portrait images are checked. This layout change makes no sub-500-ms cold loading claim.


## Translation recovery

English detection accepts sufficiently strong English vocabulary despite incorrect provider tags, while checking Latin-script predominance. A failing local inference is retried once with a fresh worker; isolated bad rows no longer abort all following translations. Three consecutive failures still stop the queue. Sidebar control backgrounds remain transparent in both RU states.


## Two-track lookahead

A browser fixture with delayed lyric/Canvas responses prepares two upcoming tracks, then switches with zero new network/inference calls. Actual WebM decoding plus text and cached translation took 32–81 ms in the observed runs. This is a prepared-cache fixture, not an end-to-end cold service benchmark. Memory eviction at 32 MiB and cancellation on queue replacement are tested. Background local inference is sequential and yields to foreground work.


## Lookahead rollback

Experimental prefetch is excluded from the release build after real-world missing-lyrics reports. Earlier prepared-cache benchmarks did not establish reliable live multi-track integration. Regression tests now drive five consecutive songchange events plus a rapid stale-response race and require both original and translation after every switch.

## Последнее обновление / Latest update

| Замер / Measurement | До / Before | После / After |
| --- | ---: | ---: |
| Записи очереди, прочитанные для двух ближайших треков / Queue entries read to prefetch two songs | 1000 | 2 |
| Повторные открытия IndexedDB при 20 обращениях после запуска / IndexedDB reopens for 20 requests after startup | 20 | 0 |
| Размер custom-bg.js / bundle size | 255 214 Б | 183 945 Б |
| Чтения стилей букв за 100 кадров / Letter style reads across 100 frames | 60 000 | 0 |
