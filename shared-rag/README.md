# Shared RAG Service

The Shared RAG (Retrieval-Augmented Generation) service provides semantic search over code and documents. It indexes local files using Ollama embeddings and provides search with optional web search fallback.

## Features

- **Semantic Search**: Vector-based similarity search over code
- **Local Indexing**: Indexes code from workspace files
- **Web Search Fallback**: DuckDuckGo search when local results are empty
- **Multiple Ingestion Methods**: Text, URL, file ingestion
- **Configurable Chunking**: Adjustable text chunk size

## Quick Start

1. **Install Dependencies**
   ```bash
   cd shared-rag
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file (required):
   ```
   OLLAMA_URL=http://127.0.0.1:11434
   EMBED_MODEL=nomic-embed-text
   ```

   Optional:
   ```
   PORT=7777
   WORKSPACE_ROOT=../
   RAG_INCLUDE=src/**,app/**,components/**
   RAG_EXCLUDE=node_modules/**,.git/**
   CHUNK_SIZE=1200
   MAX_FILE_SIZE=500000
   ```

3. **Start the Service**
   ```bash
   npm start
   ```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| POST | /search | Semantic search |
| POST | /reindex | Rebuild index |
| POST | /ingest/text | Ingest raw text |
| POST | /ingest/url | Ingest URL content |
| POST | /ingest/file | Ingest file content |

## Endpoints Detail

### POST /search

Perform semantic search over indexed content.

**Request:**
```json
{
  "query": "React useState hook",
  "k": 8,
  "useWebFallback": true
}
```

**Response:**
```json
{
  "results": [
    {
      "path": "src/components/Counter.tsx",
      "snippet": "const [count, setCount] = useState(0);",
      "offset": 150
    }
  ],
  "source": "local"
}
```

- `query`: Search query string (required)
- `k`: Number of results to return (default: 8)
- `useWebFallback`: Enable DuckDuckGo fallback if no local results (default: true)

### POST /reindex

Rebuild the entire index from workspace files.

**Response:**
```json
{
  "indexed": 42
}
```

### POST /ingest/text

Ingest raw text into the index.

**Request:**
```json
{
  "text": "Your text content here",
  "source": "my-source"
}
```

**Response:**
```json
{
  "indexed": 3
}
```

### POST /ingest/url

Fetch and ingest content from a URL.

**Request:**
```json
{
  "url": "https://example.com/docs"
}
```

**Response:**
```json
{
  "indexed": 10
}
```

### POST /ingest/file

Ingest a file from the workspace.

**Request:**
```json
{
  "path": "src/utils/helper.ts"
}
```

**Response:**
```json
{
  "indexed": 5,
  "path": "/full/path/to/src/utils/helper.ts"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 7777 | Service port |
| OLLAMA_URL | (required) | Ollama API URL |
| EMBED_MODEL | (required) | Embedding model |
| WORKSPACE_ROOT | ../ | Code root directory |
| RAG_INCLUDE | src/**,app/**,pages/**,components/**,server/** | File patterns to index |
| RAG_EXCLUDE | node_modules/**,.git/**,.next/**,.nuxt/**,dist/**,build/**,coverage/** | Patterns to exclude |
| CHUNK_SIZE | 1200 | Text chunk size |
| MAX_FILE_SIZE | 500000 | Max file size (bytes) |

## Embedding Models

Recommended embedding models:

- `nomic-embed-text` (recommended)
- `mxbai-embed-large`
- `snowflake-arctic-embed`

## How It Works

1. **Indexing**: On startup or `/reindex`, the service:
   - Scans workspace for files matching `RAG_INCLUDE` patterns
   - Skips files matching `RAG_EXCLUDE` patterns
   - Chunks files into segments of `CHUNK_SIZE`
   - Generates embeddings via Ollama `/api/embeddings`

2. **Search**: On `/search`:
   - Generates query embedding
   - Computes cosine similarity with indexed chunks
   - Returns top-k results
   - If no results and `useWebFallback=true`, queries DuckDuckGo

3. **Ingestion**: Additional content can be added via `/ingest/*` endpoints:
   - Text is chunked and embedded
   - URLs are fetched and processed
   - Files are read and processed
