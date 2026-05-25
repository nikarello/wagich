param(
  [string]$Source = "assets\public_tags.csv",
  [string]$OutputDir = "content\public-tags"
)

$ErrorActionPreference = "Stop"

function ConvertTo-YamlString {
  param([AllowNull()][string]$Value)

  if ($null -eq $Value) {
    return '""'
  }

  return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

$root = (Resolve-Path ".").Path
$sourcePath = Join-Path $root $Source
$outputPath = Join-Path $root $OutputDir

if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Source CSV not found: $sourcePath"
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$rows = Import-Csv -LiteralPath $sourcePath
$written = 0

foreach ($row in $rows) {
  if ([string]::IsNullOrWhiteSpace($row.public_slug)) {
    continue
  }

  $slug = $row.public_slug.Trim()
  $bannerPath = Join-Path $root (Join-Path "assets" $row.banner)
  if (-not (Test-Path -LiteralPath $bannerPath)) {
    throw "Banner for '$slug' not found: $bannerPath"
  }

  $indexable = if (($row.indexable -as [string]).ToLowerInvariant() -eq "true") { "true" } else { "false" }
  $draft = if ($indexable -eq "true") { "false" } else { "true" }
  $intro = ($row.intro_text -replace "`r`n", "`n").Trim()

  $frontMatter = @(
    "---"
    "title: $(ConvertTo-YamlString $row.title)"
    "h1: $(ConvertTo-YamlString $row.h1)"
    "meta_title: $(ConvertTo-YamlString $row.meta_title)"
    "meta_description: $(ConvertTo-YamlString $row.meta_description)"
    "public_slug: $(ConvertTo-YamlString $slug)"
    "banner: $(ConvertTo-YamlString $row.banner)"
    "url: $(ConvertTo-YamlString "/tags/$slug/")"
    "indexable: $indexable"
    "draft: $draft"
    "---"
    ""
  ) -join "`n"

  $target = Join-Path $outputPath "$slug.md"
  Set-Content -LiteralPath $target -Value ($frontMatter + $intro + "`n") -Encoding UTF8
  $written++
}

Write-Host "Generated $written public tag pages in $outputPath"
