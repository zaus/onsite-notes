[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string]$Path,
	[string]$OutputPath = (Join-Path $PSScriptRoot 'chunks.jsonl'),
	[int]$ChunkLines = 80,
	[int]$OverlapLines = 10,
	[string[]]$IncludeExtensions = (Get-DefaultTextExtensions),
	[string]$FilterPattern,
	[int]$ContextLines = 0,
	[switch]$UseRegex
)

. (Join-Path $PSScriptRoot 'common.ps1')

function Get-FilteredLines {
	param(
		[System.IO.FileInfo]$File,
		[string]$Pattern,
		[int]$Context,
		[bool]$AsRegex
	)

	$allLines = [System.IO.File]::ReadAllLines($File.FullName)
	$matchIndices = @()

	for ($i = 0; $i -lt $allLines.Count; $i++) {
		$matches = if ($AsRegex) {
			$allLines[$i] -match $Pattern
		}
		else {
			$allLines[$i] -like "*$Pattern*"
		}

		if ($matches) {
			$matchIndices += $i
		}
	}

	if ($matchIndices.Count -eq 0) {
		return @()
	}

	$includeIndices = @()
	foreach ($idx in $matchIndices) {
		$includeIndices += $idx
		for ($j = 1; $j -le $Context; $j++) {
			$nextIdx = $idx + $j
			if ($nextIdx -lt $allLines.Count -and $includeIndices -notcontains $nextIdx) {
				$includeIndices += $nextIdx
			}
		}
	}

	$includeIndices = @($includeIndices | Sort-Object -Unique)
	return @($allLines[$includeIndices])
}

$inputFiles = Get-StandaloneInputFiles -Path $Path -IncludeExtensions $IncludeExtensions
if (-not $inputFiles -or $inputFiles.Count -eq 0) {
	throw 'No supported text files were found.'
}

$chunks = foreach ($file in $inputFiles) {
	if ($FilterPattern) {
		$filteredLines = Get-FilteredLines -File $file -Pattern $FilterPattern -Context $ContextLines -AsRegex $UseRegex
		if ($filteredLines.Count -eq 0) {
			Write-Host "No matches for pattern '$FilterPattern' in $($file.Name)"
			continue
		}

		$tempFile = Join-Path $env:TEMP "breakdown_filtered_$(Get-Random).txt"
		try {
			$filteredLines | Out-File -LiteralPath $tempFile -Encoding utf8 -Force
			$tempFileInfo = Get-Item -LiteralPath $tempFile
			Get-StandaloneChunks -File $tempFileInfo -ChunkLines $ChunkLines -OverlapLines $OverlapLines |
				ForEach-Object {
					$_ | Add-Member -MemberType NoteProperty -Name 'originalSourcePath' -Value $file.FullName -PassThru
				}
		}
		finally {
			if (Test-Path -LiteralPath $tempFile) {
				Remove-Item -LiteralPath $tempFile -Force
			}
		}
	}
	else {
		Get-StandaloneChunks -File $file -ChunkLines $ChunkLines -OverlapLines $OverlapLines
	}
}

Write-StandaloneJsonLines -Items @($chunks) -Path $OutputPath
Write-Host "Wrote $(@($chunks).Count) chunk(s) to $OutputPath"