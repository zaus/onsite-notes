[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string]$Path,
	[string]$OutputPath = (Join-Path $PSScriptRoot 'chunks.jsonl'),
	[int]$ChunkLines = 80,
	[int]$OverlapLines = 10,
	[string[]]$IncludeExtensions = (Get-DefaultTextExtensions)
)

. (Join-Path $PSScriptRoot 'common.ps1')

$inputFiles = Get-StandaloneInputFiles -Path $Path -IncludeExtensions $IncludeExtensions
if (-not $inputFiles -or $inputFiles.Count -eq 0) {
	throw 'No supported text files were found.'
}

$chunks = foreach ($file in $inputFiles) {
	Get-StandaloneChunks -File $file -ChunkLines $ChunkLines -OverlapLines $OverlapLines
}

Write-StandaloneJsonLines -Items @($chunks) -Path $OutputPath
Write-Host "Wrote $(@($chunks).Count) chunk(s) to $OutputPath"