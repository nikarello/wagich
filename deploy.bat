@echo off
setlocal
cd /d "%~dp0"

set "BUILD_DIR=.hugo-local-build"
set "BUILD_ABS=%CD%\%BUILD_DIR%"

echo WAGICH local build check
echo This script does not push to GitHub or deploy to hosting.
echo GitHub Actions deploys main to Yandex Object Storage.
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

if not exist "assets\products.csv" (
  echo ERROR: assets\products.csv not found.
  pause
  exit /b 1
)

if not exist "assets\images" (
  echo ERROR: assets\images not found.
  pause
  exit /b 1
)

if exist "%BUILD_DIR%" rd /s /q "%BUILD_DIR%"

echo Running Hugo build into %BUILD_DIR%...
hugo --destination "%BUILD_ABS%\public" --cacheDir "%BUILD_ABS%\cache" --cleanDestinationDir --minify
if errorlevel 1 (
  echo ERROR: Hugo build failed.
  pause
  exit /b 1
)

rd /s /q "%BUILD_DIR%" 2>nul
rd /s /q "resources" 2>nul
del /q ".hugo_build.lock" 2>nul

echo.
echo OK: local build check passed.
echo Next step: commit and push to main. GitHub Actions will deploy to Yandex.
pause
