@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "BRANCH=main"
set "DEFAULT_COMMIT_MSG=site: update local sources"

if "%~1"=="" (
  set "COMMIT_MSG=%DEFAULT_COMMIT_MSG%"
) else (
  set "COMMIT_MSG=%~1"
)

echo WAGICH safe push to origin/%BRANCH%
echo This script never force-pushes.
echo A successful push to main triggers GitHub Actions deploy to Yandex Object Storage.
echo.

git --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not available in PATH.
  pause
  exit /b 1
)

hugo version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Hugo is not available in PATH.
  pause
  exit /b 1
)

if not exist ".git" (
  echo ERROR: current folder is not a Git repository.
  pause
  exit /b 1
)

for /f "tokens=*" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not "%CURRENT_BRANCH%"=="%BRANCH%" (
  echo ERROR: current branch is "%CURRENT_BRANCH%". Switch to "%BRANCH%" first.
  pause
  exit /b 1
)

git fetch origin %BRANCH%
if errorlevel 1 (
  echo ERROR: could not fetch origin/%BRANCH%.
  pause
  exit /b 1
)

git merge-base --is-ancestor origin/%BRANCH% HEAD
if errorlevel 1 (
  echo ERROR: local %BRANCH% is behind or diverged from origin/%BRANCH%.
  echo Run: git pull --ff-only origin %BRANCH%
  pause
  exit /b 1
)

set "BUILD_DIR=.hugo-local-build"
set "BUILD_ABS=%CD%\%BUILD_DIR%"
if exist "%BUILD_DIR%" rd /s /q "%BUILD_DIR%"

echo Running Hugo build check...
hugo --destination "%BUILD_ABS%\public" --cacheDir "%BUILD_ABS%\cache" --cleanDestinationDir --minify
if errorlevel 1 (
  echo ERROR: Hugo build failed. Nothing was pushed.
  pause
  exit /b 1
)

rd /s /q "%BUILD_DIR%" 2>nul
rd /s /q "resources" 2>nul
del /q ".hugo_build.lock" 2>nul

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo No local changes to commit.
  pause
  exit /b 0
)

echo.
echo Commit message: %COMMIT_MSG%
choice /C YN /M "Commit and push to origin/%BRANCH%?"
if errorlevel 2 (
  echo Operation canceled.
  pause
  exit /b 1
)

git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo ERROR: commit failed.
  pause
  exit /b 1
)

git push origin HEAD:%BRANCH%
if errorlevel 1 (
  echo ERROR: push failed. Check remote changes and credentials.
  pause
  exit /b 1
)

echo.
echo OK: pushed to origin/%BRANCH%.
echo GitHub Actions will build Hugo and deploy public/ to Yandex Object Storage.
pause
