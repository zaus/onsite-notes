[CmdletBinding()]
param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string]$InputPath,
	[string]$OutputPath = (Join-Path $PSScriptRoot 'index.jsonl'),
	[string]$EmbeddingEndpoint = 'http://localhost:8080',
	[string]$EmbeddingModel = 'local-embedding-model',
	[int]$TimeoutSec = 120
)

. (Join-Path $PSScriptRoot 'common.ps1')

$records = foreach ($chunk in Read-StandaloneJsonLines -Path $InputPath) {
	$embedding = Invoke-LlamaEmbedding -Endpoint $EmbeddingEndpoint -Model $EmbeddingModel -InputText $chunk.text -TimeoutSec $TimeoutSec
	[pscustomobject]@{
		chunkId = $chunk.chunkId
		sourcePath = $chunk.sourcePath
		startLine = $chunk.startLine
		endLine = $chunk.endLine
		text = $chunk.text
		embedding = $embedding
		embeddingModel = $EmbeddingModel
	}
}

Write-StandaloneJsonLines -Items @($records) -Path $OutputPath
Write-Host "Wrote $(@($records).Count) indexed chunk(s) to $OutputPath"