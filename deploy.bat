@echo off
setlocal

:: === ПАРАМЕТРЫ ===
set "REPO_URL=https://github.com/nikarello/wagich.git"
set "CSV_URL=https://docs.google.com/spreadsheets/d/1G-0NZi7_omk37RKGFr7A6eVuGZLkGzx3TMJuS4LH0ew/export?format=csv"

:: === 0. Скачиваем CSV из Google Sheets
echo 📥 Загрузка product данных из Google Sheets...
mkdir assets
curl -L %CSV_URL% -o assets/products.csv

if %errorlevel% neq 0 (
    echo ❌ Ошибка при загрузке данных
    exit /b
)

:: === 1. Перейти в корень проекта (где config.toml)
cd /d %~dp0

:: === 2. Пересобрать Hugo-сайт
echo 🛠️ Пересборка сайта...
hugo --cleanDestinationDir
if %errorlevel% neq 0 (
    echo ❌ Hugo сборка не удалась
    exit /b
)

:: === 3. Перейти в public/
cd public

:: === 4. Настроить git (если не инициализировано)
if not exist ".git" (
    git init
    git remote add origin %REPO_URL%
)

:: === 5. Создать и переключиться на ветку gh-pages
git checkout -B gh-pages

:: === 6. Добавить и закоммитить изменения
git add .
git commit -m "🚀 Deploy Hugo site"

:: === 7. Залить в ветку gh-pages с форсом
git push -f origin gh-pages

echo ✅ Сайт успешно опубликован на GitHub Pages!
pause
