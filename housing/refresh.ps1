# Re-scrapes the housing listings from this PC and publishes them.
# GitHub's scheduled job covers most agencies, but Cardiff Student Letting blocks GitHub's servers,
# so this keeps CSL current whenever the PC is on. Safe to run any time.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)

git pull --rebase --quiet
Push-Location housing
python scraper.py
Pop-Location

git add housing/listings.json housing/cardiff_student_houses.csv
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host 'No changes to publish.'; exit 0 }
git -c user.name=3aks -c user.email=3aks@users.noreply.github.com commit --quiet -m 'Refresh housing listings'
# If GitHub's job published in the meantime, this run is newer: keep our copy of the data files
git pull --rebase --quiet -X theirs
git push --quiet
Write-Host 'Published.'
