Set-StrictMode -Version Latest

function Get-DefaultTextExtensions {
	return @('.txt', '.trk', '.md', '.markdown', '.rst', '.log', '.csv', '.json', '.yaml', '.yml', '.xml', '.ini', '.cfg')
}

function Test-StandaloneTextFile {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path,
		[Parameter(Mandatory = $true)]
		[string[]]$IncludeExtensions
	)

	$extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
	return $IncludeExtensions -contains $extension
}

function Get-StandaloneInputFiles {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path,
		[Parameter(Mandatory = $true)]
		[string[]]$IncludeExtensions
	)

	if (-not (Test-Path -LiteralPath $Path)) {
		throw "Input path not found: $Path"
	}

	$item = Get-Item -LiteralPath $Path
	if ($item.PSIsContainer) {
		return Get-ChildItem -LiteralPath $Path -File -Recurse | Where-Object {
			Test-StandaloneTextFile -Path $_.FullName -IncludeExtensions $IncludeExtensions
		}
	}

	if (Test-StandaloneTextFile -Path $item.FullName -IncludeExtensions $IncludeExtensions) {
		return @($item)
	}

	return @()
}

function Get-StandaloneChunks {
	param(
		[Parameter(Mandatory = $true)]
		[System.IO.FileInfo]$File,
		[int]$ChunkLines = 80,
		[int]$OverlapLines = 10
	)

	if ($ChunkLines -lt 1) {
		throw 'ChunkLines must be greater than zero.'
	}

	if ($OverlapLines -lt 0) {
		throw 'OverlapLines cannot be negative.'
	}

	if ($OverlapLines -ge $ChunkLines) {
		throw 'OverlapLines must be smaller than ChunkLines.'
	}

	$reader = [System.IO.File]::OpenText($File.FullName)
	$buffer = New-Object System.Collections.Generic.List[string]
	$currentLine = 0
	$chunkStartLine = 1
	$chunkIndex = 0
	$lastEmittedEndLine = 0

	try {
		while (($line = $reader.ReadLine()) -ne $null) {
			$currentLine++
			$buffer.Add($line)

			if ($buffer.Count -lt $ChunkLines) {
				continue
			}

			$chunkIndex++
			$endLine = $currentLine
			[pscustomobject]@{
				chunkId = "{0}:{1}" -f $File.FullName, $chunkIndex
				sourcePath = $File.FullName
				startLine = $chunkStartLine
				endLine = $endLine
				text = [string]::Join("`n", $buffer)
			}

			$lastEmittedEndLine = $endLine

			if ($OverlapLines -eq 0) {
				$buffer.Clear()
				$chunkStartLine = $currentLine + 1
				continue
			}

			$keep = [Math]::Min($OverlapLines, $buffer.Count)
			$nextBuffer = New-Object System.Collections.Generic.List[string]

			for ($i = $buffer.Count - $keep; $i -lt $buffer.Count; $i++) {
				$nextBuffer.Add($buffer[$i])
			}

			$buffer = $nextBuffer
			$chunkStartLine = $endLine - $keep + 1
		}

		if ($buffer.Count -gt 0 -and $currentLine -gt $lastEmittedEndLine) {
			$chunkIndex++
			[pscustomobject]@{
				chunkId = "{0}:{1}" -f $File.FullName, $chunkIndex
				sourcePath = $File.FullName
				startLine = $chunkStartLine
				endLine = $currentLine
				text = [string]::Join("`n", $buffer)
			}
		}
	}
	finally {
		$reader.Dispose()
	}
}

function Read-StandaloneJsonLines {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path
	)

	if (-not (Test-Path -LiteralPath $Path)) {
		throw "Input file not found: $Path"
	}

	foreach ($line in [System.IO.File]::ReadLines($Path)) {
		if ([string]::IsNullOrWhiteSpace($line)) {
			continue
		}

		$line | ConvertFrom-Json
	}
}

function Write-StandaloneJsonLines {
	param(
		[Parameter(Mandatory = $true)]
		[object[]]$Items,
		[Parameter(Mandatory = $true)]
		[string]$Path
	)

	$directory = Split-Path -Parent $Path
	if ($directory -and -not (Test-Path -LiteralPath $directory)) {
		New-Item -ItemType Directory -Path $directory | Out-Null
	}

	$writer = [System.IO.StreamWriter]::new($Path, $false, [System.Text.UTF8Encoding]::new($false))
	try {
		foreach ($item in $Items) {
			$writer.WriteLine(($item | ConvertTo-Json -Depth 20 -Compress))
		}
	}
	finally {
		$writer.Dispose()
	}
}

function Get-CosineSimilarity {
	param(
		[Parameter(Mandatory = $true)]
		[object[]]$Left,
		[Parameter(Mandatory = $true)]
		[object[]]$Right
	)

	$limit = [Math]::Min($Left.Count, $Right.Count)
	if ($limit -eq 0) {
		return 0.0
	}

	$dotProduct = 0.0
	$leftMagnitude = 0.0
	$rightMagnitude = 0.0

	for ($i = 0; $i -lt $limit; $i++) {
		$leftValue = [double]$Left[$i]
		$rightValue = [double]$Right[$i]
		$dotProduct += $leftValue * $rightValue
		$leftMagnitude += $leftValue * $leftValue
		$rightMagnitude += $rightValue * $rightValue
	}

	if ($leftMagnitude -eq 0.0 -or $rightMagnitude -eq 0.0) {
		return 0.0
	}

	return $dotProduct / ([Math]::Sqrt($leftMagnitude) * [Math]::Sqrt($rightMagnitude))
}

function Invoke-LlamaEmbedding {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Endpoint,
		[Parameter(Mandatory = $true)]
		[string]$Model,
		[Parameter(Mandatory = $true)]
		[string]$InputText,
		[int]$TimeoutSec = 120
	)

	$uri = ($Endpoint.TrimEnd('/') + '/v1/embeddings')
	$body = @{
		model = $Model
		input = $InputText
	} | ConvertTo-Json -Depth 6

	$response = Invoke-RestMethod -Method Post -Uri $uri -Body $body -ContentType 'application/json' -TimeoutSec $TimeoutSec

	if ($response.data -and $response.data.Count -gt 0 -and $response.data[0].embedding) {
		return @($response.data[0].embedding)
	}

	if ($response.embedding) {
		return @($response.embedding)
	}

	throw 'Embedding response did not contain an embedding vector.'
}

function Invoke-LlamaChat {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Endpoint,
		[Parameter(Mandatory = $true)]
		[string]$Model,
		[Parameter(Mandatory = $true)]
		[string]$Prompt,
		[int]$TimeoutSec = 300
	)

	$uri = ($Endpoint.TrimEnd('/') + '/v1/chat/completions')
	$body = @{
		model = $Model
		messages = @(
			@{
				role = 'user'
				content = $Prompt
			}
		)
		temperature = 0.2
	} | ConvertTo-Json -Depth 8

	$response = Invoke-RestMethod -Method Post -Uri $uri -Body $body -ContentType 'application/json' -TimeoutSec $TimeoutSec

	if ($response.choices -and $response.choices.Count -gt 0 -and $response.choices[0].message.content) {
		return $response.choices[0].message.content
	}

	if ($response.content) {
		return $response.content
	}

	throw 'Chat response did not contain an answer.'
}