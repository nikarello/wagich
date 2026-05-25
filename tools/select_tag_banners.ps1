param(
  [string]$CandidatesDir = "tag-banners-candidates-v3",
  [string]$OutputDir = "tag-banners-selected",
  [switch]$InstallToAssets
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$root = Split-Path -Parent $PSScriptRoot
$candidatesPath = Join-Path $root $CandidatesDir
$manifestPath = Join-Path $candidatesPath "manifest.csv"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Manifest not found: $manifestPath"
}

$outputPath = if ($InstallToAssets) {
  Join-Path $root "assets\images\tag-banners"
} else {
  Join-Path $root $OutputDir
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
Remove-Item -Path (Join-Path $outputPath "*.jpg") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $outputPath "selected-manifest.csv") -Force -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Copy-SelectedBanner {
  param(
    [Parameter(Mandatory = $true)] $Item,
    [Parameter(Mandatory = $true)] [string] $DestinationRoot
  )

  $relative = if ($Item.normalized_file) { $Item.normalized_file } else { $Item.raw_file }
  $source = Join-Path $candidatesPath $relative
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Selected image not found: $source"
  }

  $destination = Join-Path $DestinationRoot ($Item.public_slug + ".jpg")
  Copy-Item -LiteralPath $source -Destination $destination -Force

  $choice = [pscustomobject]@{
    public_slug = $Item.public_slug
    public_name = $Item.public_name
    candidate = $Item.candidate
    selected_file = $destination
    source_file = $source
    source_page = $Item.source_page
    image_url = $Item.image_url
    title = $Item.title
  }

  $choicePath = Join-Path $DestinationRoot "selected-manifest.csv"
  $exists = Test-Path -LiteralPath $choicePath
  $choice | Export-Csv -Path $choicePath -Append:$exists -NoTypeInformation -Encoding UTF8
}

function Load-ImageSafe {
  param([string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $stream = New-Object System.IO.MemoryStream(,$bytes)
  $img = [System.Drawing.Image]::FromStream($stream)
  $clone = New-Object System.Drawing.Bitmap($img)
  $img.Dispose()
  $stream.Dispose()
  return $clone
}

$items = Import-Csv -LiteralPath $manifestPath |
  Where-Object { $_.normalized_file -or $_.raw_file } |
  Sort-Object public_slug, { [int]$_.candidate }

$groups = @($items | Group-Object public_slug | Sort-Object Name)
if ($groups.Count -eq 0) {
  throw "No banner candidates found in manifest."
}

$state = [ordered]@{
  Index = 0
  Groups = $groups
  Picks = @{}
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "WAGICH tag banner picker"
$form.StartPosition = "CenterScreen"
$form.Width = 1320
$form.Height = 760
$form.MinimumSize = New-Object System.Drawing.Size(1100, 650)
$form.BackColor = [System.Drawing.Color]::FromArgb(245, 245, 245)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Left = 20
$titleLabel.Top = 16
$titleLabel.Width = 900
$titleLabel.Height = 28
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($titleLabel)

$progressLabel = New-Object System.Windows.Forms.Label
$progressLabel.Left = 20
$progressLabel.Top = 48
$progressLabel.Width = 900
$progressLabel.Height = 22
$progressLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($progressLabel)

$hintLabel = New-Object System.Windows.Forms.Label
$hintLabel.Left = 20
$hintLabel.Top = 72
$hintLabel.Width = 1240
$hintLabel.Height = 40
$hintLabel.Text = "Click the best banner. It will be copied as <public_slug>.jpg and the picker will move to the next public tag."
$hintLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($hintLabel)

$cards = @()
for ($i = 0; $i -lt 3; $i++) {
  $panel = New-Object System.Windows.Forms.Panel
  $panel.Left = 20 + ($i * 420)
  $panel.Top = 125
  $panel.Width = 400
  $panel.Height = 495
  $panel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $panel.BackColor = [System.Drawing.Color]::White

  $picture = New-Object System.Windows.Forms.PictureBox
  $picture.Left = 10
  $picture.Top = 10
  $picture.Width = 378
  $picture.Height = 126
  $picture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $picture.Cursor = [System.Windows.Forms.Cursors]::Hand
  $picture.Tag = $i
  $panel.Controls.Add($picture)

  $meta = New-Object System.Windows.Forms.TextBox
  $meta.Left = 10
  $meta.Top = 150
  $meta.Width = 378
  $meta.Height = 300
  $meta.Multiline = $true
  $meta.ReadOnly = $true
  $meta.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
  $meta.BorderStyle = [System.Windows.Forms.BorderStyle]::None
  $meta.Font = New-Object System.Drawing.Font("Segoe UI", 9)
  $panel.Controls.Add($meta)

  $button = New-Object System.Windows.Forms.Button
  $button.Left = 10
  $button.Top = 456
  $button.Width = 378
  $button.Height = 30
  $button.Text = "Select banner " + ($i + 1)
  $button.Tag = $i
  $panel.Controls.Add($button)

  $form.Controls.Add($panel)
  $cards += [pscustomobject]@{ Panel = $panel; Picture = $picture; Meta = $meta; Button = $button; Item = $null }
}

$backButton = New-Object System.Windows.Forms.Button
$backButton.Left = 20
$backButton.Top = 640
$backButton.Width = 160
$backButton.Height = 34
$backButton.Text = "Back"
$form.Controls.Add($backButton)

$skipButton = New-Object System.Windows.Forms.Button
$skipButton.Left = 190
$skipButton.Top = 640
$skipButton.Width = 160
$skipButton.Height = 34
$skipButton.Text = "Skip"
$form.Controls.Add($skipButton)

$openOutputButton = New-Object System.Windows.Forms.Button
$openOutputButton.Left = 360
$openOutputButton.Top = 640
$openOutputButton.Width = 190
$openOutputButton.Height = 34
$openOutputButton.Text = "Open output folder"
$form.Controls.Add($openOutputButton)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Left = 570
$statusLabel.Top = 646
$statusLabel.Width = 700
$statusLabel.Height = 24
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.Controls.Add($statusLabel)

function Clear-CardImages {
  foreach ($card in $cards) {
    if ($card.Picture.Image) {
      $old = $card.Picture.Image
      $card.Picture.Image = $null
      $old.Dispose()
    }
  }
}

function Show-CurrentGroup {
  Clear-CardImages

  if ($state.Index -ge $state.Groups.Count) {
    $titleLabel.Text = "Done"
    $progressLabel.Text = "Selected $($state.Picks.Count) of $($state.Groups.Count). Output: $outputPath"
    $hintLabel.Text = "Review selected banners in the output folder. Candidate files were not deleted."
    foreach ($card in $cards) {
      $card.Panel.Visible = $false
    }
    $statusLabel.Text = "Finished."
    return
  }

  foreach ($card in $cards) {
    $card.Panel.Visible = $true
    $card.Item = $null
    $card.Meta.Text = ""
    $card.Button.Enabled = $false
  }

  $group = $state.Groups[$state.Index]
  $groupItems = @($group.Group | Sort-Object { [int]$_.candidate })
  $displayName = ($groupItems | Select-Object -First 1).public_name
  $titleLabel.Text = "$displayName [$($group.Name)]"
  $progressLabel.Text = "Group $($state.Index + 1) of $($state.Groups.Count). Selected: $($state.Picks.Count)."
  $statusLabel.Text = ""

  for ($i = 0; $i -lt $cards.Count; $i++) {
    if ($i -ge $groupItems.Count) {
      $cards[$i].Panel.Visible = $false
      continue
    }

    $item = $groupItems[$i]
    $relative = if ($item.normalized_file) { $item.normalized_file } else { $item.raw_file }
    $imagePath = Join-Path $candidatesPath $relative
    $cards[$i].Item = $item
    $cards[$i].Button.Enabled = $true

    if (Test-Path -LiteralPath $imagePath) {
      $cards[$i].Picture.Image = Load-ImageSafe $imagePath
    }

    $cards[$i].Meta.Text = @"
Candidate: $($item.candidate)
Detected: $($item.detected_width)x$($item.detected_height)
Query: $($item.query)

Title:
$($item.title)

Source:
$($item.source_page)
"@
  }
}

function Select-CardIndex {
  param([int]$Index)

  if ($Index -lt 0 -or $Index -ge $cards.Count) { return }
  $Card = $cards[$Index]
  if (-not $Card.Item) { return }
  Copy-SelectedBanner -Item $Card.Item -DestinationRoot $outputPath
  $state.Picks[$Card.Item.public_slug] = $Card.Item.candidate
  $statusLabel.Text = "Selected $($Card.Item.public_slug) candidate $($Card.Item.candidate)."
  $state.Index++
  Show-CurrentGroup
}

foreach ($card in $cards) {
  $card.Picture.Add_Click({
    Select-CardIndex -Index ([int]$this.Tag)
  })
  $card.Button.Add_Click({
    Select-CardIndex -Index ([int]$this.Tag)
  })
}

$backButton.Add_Click({
  if ($state.Index -gt 0) {
    $state.Index--
    Show-CurrentGroup
  }
})

$skipButton.Add_Click({
  $state.Index++
  Show-CurrentGroup
})

$openOutputButton.Add_Click({
  Start-Process explorer.exe -ArgumentList "`"$outputPath`""
})

$form.Add_FormClosed({ Clear-CardImages })

Show-CurrentGroup
[void]$form.ShowDialog()

Write-Host "Output folder: $outputPath"
