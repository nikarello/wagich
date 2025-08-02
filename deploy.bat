@echo off
setlocal enabledelayedexpansion

:: === ПАРАМЕТРЫ ===
set "REPO_URL=https://github.com/nikarello/wagich.git"
set "CSV_URL=https://docs.google.com/spreadsheets/d/1G-0NZi7_omk37RKGFr7A6eVuGZLkGzx3TMJuS4LH0ew/export?format=csv"

:: === 0. Скачиваем CSV из Google Sheets
echo 📥 Загрузка product данных из Google Sheets...
mkdir assets 2>nul
curl -L %CSV_URL% -o assets/products.csv

if %errorlevel% neq 0 (
    echo ❌ Ошибка при загрузке данных. Проверь URL или подключение.
    pause
    goto :EOF
)

:: === 1. Проверка, что assets/images существует
if not exist assets\images (
    echo ❌ Папка assets\images не найдена. Без неё картинки не будут обработаны Hugo.
    pause
    goto :EOF
)

:: === 2. Очистка предыдущей сборки
echo 🔄 Очистка public и кэша ресурсов...
rd /s /q public 2>nul
rd /s /q resources 2>nul

:: === 3. Перейти в корень проекта
cd /d %~dp0

:: === 4. Hugo сборка
echo 🛠️ Hugo сборка...
hugo --cleanDestinationDir --minify

if %errorlevel% neq 0 (
    echo ❌ Hugo сборка не удалась.
    echo ℹ️ Проверь логи выше: возможно, ошибка в шаблоне или пути к картинке.
    pause
    goto :EOF
)

:: === 5. Переход в public/
cd public

:: === 6. Настроить git
if not exist ".git" (
    git init
    git remote add origin %REPO_URL%
)

:: === 7. Переключиться на gh-pages
git checkout -B gh-pages

:: === 8. ДОБАВЛЯЕМ картинки после сборки
git add images/*.jpg

:: === 9. Проверить изменения
git add .
git diff --cached --quiet
if !errorlevel! equ 0 (
    echo 🔕 Нет изменений — пуш не требуется.
    pause
    goto :EOF
)

:: === 10. Коммит и пуш
git commit -m "🚀 Deploy Hugo site with updated catalog"
git push -f origin gh-pages

:: === 11. Дополнительно: коммит исходных изображений в assets (один раз)
cd ..
git add assets/images/ 2>nul
git commit -m "📦 Добавлены исходные изображения для Hugo"
git push

echo ✅ Сайт обновлён и опубликован на GitHub Pages!
pause
