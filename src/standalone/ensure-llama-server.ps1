[CmdletBinding()]
param(
	[int]$Port = 8080,
	[string]$ModelPath,
	[int]$TimeoutSec = 30
)

. (Join-Path $PSScriptRoot 'common.ps1')

$endpoint = "http://localhost:$Port"

function Test-LlamaServerReady {
	param(
		[string]$Endpoint,
		[int]$TimeoutSec
	)

	$start = Get-Date
	$timeout = New-TimeSpan -Seconds $TimeoutSec

	while ((Get-Date) - $start -lt $timeout) {
		try {
			$response = Invoke-RestMethod -Method Get -Uri ($Endpoint.TrimEnd('/') + '/health') -TimeoutSec 5 -ErrorAction Stop
			if ($response) {
				return $true
			}
		}
		catch {
			Start-Sleep -Milliseconds 500
		}
	}

	return $false
}

try {
	Write-Host "Checking if llama-server is running on $endpoint..."
	if (Test-LlamaServerReady -Endpoint $endpoint -TimeoutSec 5) {
		Write-Host 'llama-server is already running.'
		return @{ endpoint = $endpoint; started = $false }
	}

	if (-not $ModelPath) {
		throw 'llama-server is not running and no model path was provided. Use -ModelPath to specify the GGUF file.'
	}

	if (-not (Test-Path -LiteralPath $ModelPath)) {
		throw "Model file not found: $ModelPath"
	}

	Write-Host "Starting llama-server on port $Port with model: $ModelPath"
	$serverProcess = Start-Process -FilePath 'llama-server.exe' -ArgumentList @(
		"-m", $ModelPath,
		"-c", "4096",
		"-t", "6",
		"--port", $Port
	) -PassThru -WindowStyle Minimized

	Write-Host "Waiting for llama-server to become ready (up to $TimeoutSec seconds)..."
	if (Test-LlamaServerReady -Endpoint $endpoint -TimeoutSec $TimeoutSec) {
		Write-Host 'llama-server is ready.'
		return @{ endpoint = $endpoint; started = $true; processId = $serverProcess.Id }
	}

	Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
	throw "llama-server did not become ready within $TimeoutSec seconds."
}
catch {
	Write-Host "Error: $_" -ForegroundColor Red
	throw
}
