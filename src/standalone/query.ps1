[CmdletBinding()]
param(
	[Parameter(Mandatory = $true)]
	[string]$Question,
	[string]$IndexPath = (Join-Path $PSScriptRoot 'index.jsonl'),
	[int]$TopK = 5,
	[string]$EmbeddingEndpoint = 'http://localhost:8080',
	[string]$EmbeddingModel = 'local-embedding-model',
	[string]$ChatEndpoint = 'http://localhost:8080',
	[string]$ChatModel = 'local-chat-model',
	[int]$TimeoutSec = 300
)

. (Join-Path $PSScriptRoot 'common.ps1')

$index = @(Read-StandaloneJsonLines -Path $IndexPath)
if ($index.Count -eq 0) {
	throw 'The index is empty. Run embed.ps1 first.'
}

$questionEmbedding = Invoke-LlamaEmbedding -Endpoint $EmbeddingEndpoint -Model $EmbeddingModel -InputText $Question -TimeoutSec $TimeoutSec

$rankedChunks = $index |
	ForEach-Object {
		[pscustomobject]@{
			chunk = $_
			score = Get-CosineSimilarity -Left $questionEmbedding -Right $_.embedding
		}
	} |
	Sort-Object -Property score -Descending |
	Select-Object -First $TopK

$context = ($rankedChunks | ForEach-Object {
		$chunk = $_.chunk
		@"
Source: $($chunk.sourcePath)
Lines: $($chunk.startLine)-$($chunk.endLine)
Score: $([Math]::Round([double]$_.score, 4))
$($chunk.text)
"@
	}) -join "`n`n---`n`n"

$prompt = @"
You are answering a question from retrieved text chunks.
Only use the context below. If the answer is not in the context, say so plainly.

Question:
$Question

Context:
$context
"@

$answer = Invoke-LlamaChat -Endpoint $ChatEndpoint -Model $ChatModel -Prompt $prompt -TimeoutSec $TimeoutSec

Write-Host 'Answer:'
Write-Host $answer
Write-Host ''
Write-Host 'Sources:'
foreach ($item in $rankedChunks) {
	$chunk = $item.chunk
	Write-Host "- $($chunk.sourcePath) [$($chunk.startLine)-$($chunk.endLine)]"
}