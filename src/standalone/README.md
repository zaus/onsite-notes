# Standalone Processor

The standalone processor is a suite of scripts meant to break down a large dataset for direct RAG queries by a local model.

## Scripts

This should stay as simple as possible:

1. **breakdown.ps1** -- given a directory or file path, scan for text files, normalize them, and split them into overlapping chunks with source metadata
2. **embed.ps1** -- generate embeddings for each chunk and store them in one local index file or database
3. **query.ps1** -- take a question, embed it, retrieve the top matching chunks, build a prompt, and call llama.cpp for the answer

Recommended minimum data shape:

- chunk text
- source path
- start/end line or byte offsets
- embedding vector
- optional tags such as title or section

Minimal query flow:

1. Build or refresh the chunk index from the source files.
2. Embed the user question with the same embedding model used for the chunks.
3. Rank chunks by similarity and keep only the top few results.
4. Send those chunks plus the question to llama.cpp with a short instruction to answer only from the retrieved context.

Anything beyond that is optional until the basic flow is working.

### Usage

1. Chunk a file or folder into `chunks.jsonl`:

	```powershell
	.\breakdown.ps1 -Path .\notes -OutputPath .\chunks.jsonl
	```

2. Build the searchable index from those chunks:

	```powershell
	.\embed.ps1 -InputPath .\chunks.jsonl -OutputPath .\index.jsonl -EmbeddingEndpoint http://localhost:8080 -EmbeddingModel local-embedding-model
	```

3. Ask a question and get an answer from retrieved chunks:

	```powershell
	.\query.ps1 -Question "What does the dataset say about X?" -Start 8080 -EmbeddingModel local-embedding-model -ChatModel local-chat-model
	```

	Use `-Start <port>` to automatically check if llama-server is running and start it if needed. By default, startup omits explicit model selection so llama.cpp model routing can manage models.

	Use `-StartModel` only when you want to force startup with a specific local GGUF path (`-m`) or HF reference (`-hf`):

	```powershell
	.\query.ps1 -Question "What does the dataset say about X?" -Start 8080 -StartModel ggml-org/gemma-3-1b-it-GGUF -EmbeddingModel local-embedding-model -ChatModel local-chat-model
	```

	Starting the llama-server approach keeps the model loaded in memory, making queries much faster than command-line invocation.

	The default filenames are `chunks.jsonl` for chunk output and `index.jsonl` for the embedded search index.

## Local LLM

General guidance is to use [llama.cpp](https://steelph0enix.github.io/posts/llama-cpp-guide/) over Ollama, as Ollama is a fork/wrapper over llama.cpp with "bloat" that slows it down.

1. Download latest [llama.cpp binaries](https://github.com/ggml-org/llama.cpp/releases) for your system. Or compile it directly for optimized performance:

```bash
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j
```

2. Download a GGUF Model from [Hugging Face](https://huggingface.co/)
	1. Search for a lightweight, high-performance model tier (like Llama-3-8B-Instruct-GGUF or Qwen2.5-7B-Instruct-GGUF).
	2. Look for the Q4_K_M quantization file variant—it provides an ideal balance between file size and accuracy.
	3. Download the file directly via your browser or use wget in your command line: `wget https://huggingface.co`

3. Prompt the model...

	1. ...directly from commandline:

	```bash
	# Basic CPU execution
	llama-cli -m Meta-Llama-3-8B-Instruct.Q4_K_M.gguf -p "Why is the sky blue?"

	# GPU Acceleration (Offload 30 layers to your graphics card VRAM)
	llama-cli -m Meta-Llama-3-8B-Instruct.Q4_K_M.gguf -p "Write a poem about coding." -ngl 30
	```

	where:
	* `-m`: The path to your local .gguf model file.
	* `-p`: Your input prompt text.
	* `-ngl`: Number of layers to offload to your GPU. Adjust this higher or lower based on how much VRAM you have.

	2. ...from local webserver

	```bash
	llama-server -m Meta-Llama-3-8B-Instruct.Q4_K_M.gguf -ngl 30 --port 8080
	```

	then chat via or point harness to http://localhost:8080

## Sample Setup

If you don't have dedicated GPU you must select models that fit comfortably within your RAM while leaving a safety buffer for Windows 11.

* **Primary LLM (The Thinker):** [`Llama-3-8B-Instruct-GGUF`](https://huggingface.co/QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/blob/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf) (specifically the `Q4_K_M` file variant). An 8B model quantized to 4-bits requires roughly 4.8 GB of RAM. It runs smoothly on Intel i7 processors and delivers highly accurate synthesis of your retrieved data chunks.
* **Embedding Model (The Searcher):** [`nomic-embed-text-v1.5.f16.gguf`](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF). This lightweight model translates sentences into data coordinates for your vector search. It consumes less than 300 MB of RAM and supports a long 8,192-token context window, making it excellent for parsing deep into multi-thousand-line documents.

```bash
# Download Llama-3-8B (4.8 GB)
Invoke-WebRequest -Uri "https://huggingface.co" -OutFile "Meta-Llama-3-8B-Instruct.Q4_K_M.gguf"

# Download Nomic Embed (275 MB)
Invoke-WebRequest -Uri "https://huggingface.co" -OutFile "nomic-embed-text-v1.5.f16.gguf"
```

or use llama-cpp to directly download models to its cache folder `~/.cache/huggingface/hub` (each model saved to separate folder, with actual gguf in 'snapshots' subdirectory) and then exit from the cli.


```bash
# Download Llama-3-8B (4.8 GB)
llama-cli -hf "QuantFactory/Meta-Llama-3-8B-Instruct-GGUF"

# Download Nomic Embed (275 MB)
llama-cli -hf "nomic-ai/nomic-embed-text-v1.5-GGUF"
```

Manage local models with `llama-cache ls` and `llama-cache rm <vendor>/<modelname>`.

### Step 1: Acquire the model file:
* Download the file named `llama-bXXXX-bin-win-avx2-x64.zip` directly from the llama.cpp Releases Page.
* Unzip it and place your downloaded model file (`Meta-Llama-3-8B-Instruct.Q4_K_M.gguf`) right inside that same folder.
* Run terminal (match `-t` to your physical CPU core count, typically 4 or 8 on an i7 Evo ultrabook) and leave open in the background to host the AI network node:
```bash
.\llama-server.exe -m Meta-Llama-3-8B-Instruct.Q4_K_M.gguf -c 4096 -t 6 --port 8080
```

### Alternate Step 2: Configure AnythingLLM for RAG

Using the built-in vector DB of the UI App AnythingLLM

1. Install and launch the AnythingLLM desktop client application.
2. Navigate to Settings > LLM Preference and change the provider option to Generic OpenAI or Llama.cpp.
3. Set the base URL target address directly to: http://127.0.0.
4. Set the Model Name input field explicitly to llama3 and input a Token Context Window limit of 4096

### Alternate Step 3: Ingesting Text Files and Running Queries

1. Create a new digital workspace container in AnythingLLM and title it something descriptive (e.g., Text_Archive_Search).
2. Drag and drop your multi-thousand-line text files directly into the workspace's document upload pane.
3. Click the Move to Workspace button and select Save and Embed. AnythingLLM will parse your text files, slice them into smaller conceptual chunks, generate search coordinates, and store them securely inside its internal database.
4. Switch your active workspace chat mode switch from "Chat" over to "Query"
	> 💡 Why Query Mode Matters: In Query mode, the system searches your uploaded text database first, isolates the exact document lines containing relevant facts, and forces the LLM to write answers only using those explicit facts. This saves system memory and guarantees zero hallucinations.