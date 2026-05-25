# WAGICH site

Static Hugo catalog for `wagich.ru`.

## Production pipeline

The production path is:

1. Edit site sources locally.
2. Push changes to `main` on GitHub.
3. GitHub Actions builds the site with Hugo.
4. `.github/workflows/deploy_yc.yml` syncs the generated `public/` directory to Yandex Object Storage bucket `wagich.ru`.

The Yandex deployment uses repository secrets:

- `YC_S3_KEY_ID`
- `YC_S3_SECRET_KEY`

## Catalog update button

`.github/workflows/update-catalog.yml` is a manual GitHub Actions workflow. It downloads the Google Sheets CSV into `assets/products.csv`, commits it to `main`, and that push triggers the Yandex deploy workflow.

Required secrets:

- `GH_PAT`
- `GSHEET_ID`
- `GSHEET_GID`

## Local workflow

Use `deploy.bat` only as a local build check. It does not push anything.

Use `deploy_to_main.bat` only when you want to commit local changes and push them to `main`. It uses a normal push and refuses to run if local `main` is behind `origin/main`.

Do not force-push `main` for normal site updates. A push to `main` is enough to trigger the Yandex deploy action.
