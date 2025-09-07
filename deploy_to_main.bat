@echo off
setlocal enabledelayedexpansion
title Deploy to origin/main (force replace)

:: ===== SETTINGS =====
set "REPO_URL=https://github.com/nikarello/wagich.git"
set "BRANCH=main"
set "COMMIT_MSG=Full replace of main with current local site code"
set "MAKE_REMOTE_BACKUP=1"   :: 1 - create a backup tag of current origin/main, 0 - skip

:: ===== Check Git availability =====
git --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not in PATH. Install Git and try again.
  pause
  exit /b
)

:: ===== Ensure we are inside a git repo =====
if not exist ".git" (
  echo Current folder is not a git repository. Initializing...
  git init || (echo ERROR: git init failed & pause & exit /b)
)

:: ===== Configure or update "origin" remote =====
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo Adding origin: %REPO_URL%
  git remote add origin %REPO_URL% || (echo ERROR: cannot add origin & pause & exit /b)
) else (
  git remote set-url origin %REPO_URL% >nul 2>&1
)

:: ===== Fetch remote refs (if any) =====
git fetch origin --prune >nul 2>&1

:: ===== Optional: backup current origin/main into a tag =====
if "%MAKE_REMOTE_BACKUP%"=="1" (
  for /f "tokens=1" %%H in ('git ls-remote origin %BRANCH% ^| findstr /r "refs/heads/%BRANCH%$"') do set "REMOTE_SHA=%%H"
  if defined REMOTE_SHA (
    set "TS=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
    set "TS=%TS: =0%"
    set "BACKUP_TAG=backup-%BRANCH%-%TS%"
    echo Creating backup tag of origin/%BRANCH%: %BACKUP_TAG% (%REMOTE_SHA%)
    git tag -f "%BACKUP_TAG%" %REMOTE_SHA% >nul 2>&1
    git push origin "refs/tags/%BACKUP_TAG%" >nul 2>&1
  ) else (
    echo origin/%BRANCH% does not exist yet. Backup is not required.
  )
)

:: ===== Switch/create local main =====
echo Switching to %BRANCH%...
git checkout -B %BRANCH% || (echo ERROR: could not switch to %BRANCH% & pause & exit /b)

:: ===== Stage and commit =====
echo Staging files...
git add -A

echo Creating commit...
git commit -m "%COMMIT_MSG%" >nul 2>&1
if errorlevel 1 (
  echo No changes detected. Creating an empty commit to record a snapshot.
  git commit --allow-empty -m "%COMMIT_MSG%" || (echo ERROR: commit failed & pause & exit /b)
)

:: ===== Confirmation for force-push =====
echo.
echo WARNING: A force push to origin/%BRANCH% will be performed.
echo This will overwrite the remote branch history with the local one.
echo.
choice /C YN /M "Continue?"
if errorlevel 2 (
  echo Operation canceled by user.
  pause
  exit /b
)

:: ===== Force push to origin/main =====
echo Pushing to origin/%BRANCH% (force)...
git push -f origin %BRANCH%
if errorlevel 1 (
  echo ERROR: push failed.
  pause
  exit /b
)

echo Done. origin/%BRANCH% has been fully replaced with the current local code.
if defined BACKUP_TAG echo Backup tag pushed: %BACKUP_TAG%
pause
