@echo off
setlocal enabledelayedexpansion
title Deploy to origin/main (force replace)

:: ===== ПАРАМЕТРЫ =====
set "REPO_URL=https://github.com/nikarello/wagich.git"
set "BRANCH=main"
set "COMMIT_MSG=🔄 Полная замена main на актуальный код сайта"
set "MAKE_REMOTE_BACKUP=1"   :: 1 — создать тег-бэкап текущего origin/main перед перезаписью, 0 — не делать

:: ===== Проверка Git =====
git --version >nul 2>&1
if errorlevel 1 (
  echo ❌ Git не найден в PATH. Установи Git и перезапусти.
  pause
  exit /b
)

:: ===== Убедимся, что мы в git-репозитории =====
if not exist ".git" (
  echo ℹ️  Текущая папка не является git-репозиторием. Инициализирую...
  git init || (echo ❌ Не удалось git init & pause & exit /b)
)

:: ===== Настройка/обновление origin =====
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo ℹ️  Добавляю origin: %REPO_URL%
  git remote add origin %REPO_URL% || (echo ❌ Не удалось добавить origin & pause & exit /b)
) else (
  git remote set-url origin %REPO_URL% >nul 2>&1
)

:: ===== Подтянуть состояние origin (если есть) =====
git fetch origin --prune >nul 2>&1

:: ===== Опционально: бэкапнуть текущий origin/main в тег =====
if "%MAKE_REMOTE_BACKUP%"=="1" (
  for /f "tokens=1" %%H in ('git ls-remote origin %BRANCH% ^| findstr /r "refs/heads/%BRANCH%$"') do set "REMOTE_SHA=%%H"
  if defined REMOTE_SHA (
    set "TS=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
    set "TS=%TS: =0%"
    set "BACKUP_TAG=backup-%BRANCH%-%TS%"
    echo 💾 Бэкап origin/%BRANCH% в тег %BACKUP_TAG% (%REMOTE_SHA%)
    git tag -f "%BACKUP_TAG%" %REMOTE_SHA% >nul 2>&1
    git push origin "refs/tags/%BACKUP_TAG%" >nul 2>&1
  ) else (
    echo ℹ️  origin/%BRANCH% пока не существует — бэкап не требуется.
  )
)

:: ===== Переключиться/создать локальную main =====
echo 🔀 Переключаюсь на %BRANCH%...
git checkout -B %BRANCH% || (echo ❌ Не удалось переключиться на %BRANCH% & pause & exit /b)

:: ===== Стадирование и коммит =====
echo ➕ Стадирование файлов...
git add -A

echo 📝 Коммит...
git commit -m "%COMMIT_MSG%" >nul 2>&1
if errorlevel 1 (
  echo ℹ️  Нет изменений — создаю пустой коммит для фиксации снапшота.
  git commit --allow-empty -m "%COMMIT_MSG%" || (echo ❌ Не удалось выполнить коммит & pause & exit /b)
)

:: ===== Подтверждение force-push =====
echo.
echo ⚠️  ВНИМАНИЕ: будет выполнен принудительный пуш (force) в origin/%BRANCH%.
echo     Это перезапишет удалённую ветку её текущей историей.
echo.
choice /C YN /M "Продолжить?"
if errorlevel 2 (
  echo Операция отменена.
  pause
  exit /b
)

:: ===== Force push на origin/main =====
echo 🚀 Публикую в origin/%BRANCH% (force)...
git push -f origin %BRANCH%
if errorlevel 1 (
  echo ❌ Не удалось выполнить push.
  pause
  exit /b
)

echo ✅ Готово! origin/%BRANCH% полностью заменён актуальным кодом.
echo    (Если включён бэкап, тег сохранён в репозитории: %BACKUP_TAG%)
pause
