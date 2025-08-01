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
    echo ❌ Ошибка при загрузке данных
    exit /b
)

:: === 1. Перейти в корень проекта (где config.toml)
cd /d %~dp0

:: === 2. Пересобрать Hugo-сайт
echo 🛠️ Hugo сборка...
hugo --cleanDestinationDir
if %errorlevel% neq 0 (
    echo ❌ Hugo сборка не удалась
    exit /b
)

:: === 3. Переход в public/
cd public

:: === 4. Настроить git
if not exist ".git" (
    git init
    git remote add origin %REPO_URL%
)

:: === 5. Переключиться на gh-pages
git checkout -B gh-pages

:: === 6. Проверить изменения
git add .
git diff --cached --quiet
if !errorlevel! equ 0 (
    echo 🔕 Нет изменений — пуш не требуется.
    exit /b
)

:: === 7. Коммит и пуш
git commit -m "🚀 Deploy Hugo site with updated catalog"
git push -f origin gh-pages

echo ✅ Сайт обновлён и опубликован на GitHub Pages!
pause
