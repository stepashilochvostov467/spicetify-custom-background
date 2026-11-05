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
