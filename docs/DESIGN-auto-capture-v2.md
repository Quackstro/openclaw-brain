# Design: Auto-Capture v2 — Conversation Distillation Pipeline

**Author:** DevBot  
**Date:** 2026-03-27  
**Status:** Draft  
**PR Target:** `Quackstro/openclaw-brain`

---

## 1. Problem Statement

The current auto-capture (`autoCapture: true`) embeds every individual message that passes a basic `isMessageNoteworthy()` heuristic. This creates three problems:

1. **Noise** — Raw chat turns ("yes do it", "check this", assistant boilerplate) dilute retrieval quality
2. **Waste** — One embedding per message when 80% of messages carry no standalone value
3. **No structure** — Everything goes through the full classifier → bucket pipeline, mixing ephemeral chat context with durable knowledge

## 2. Goals

- **High signal-to-noise**: Only embed distilled facts, decisions, preferences, and action items
- **Cost efficient**: One LLM extraction call + one embedding per conversation exchange (not per message)
- **Killswitch**: Isolated `conversations` bucket that can be excluded from search without losing data
- **Hybrid retrieval**: Structured columns for precise queries + vector for fuzzy semantic search
- **Backward compatible**: Existing `brain_drop`, `brain_search`, `brain_fix` tools work unchanged

## 3. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   message_received hook                  │
│                                                          │
│  ┌──────────────┐    idle/N turns    ┌───────────────┐  │
│  │ Turn Buffer   │ ─────────────────▶│ Extractor LLM  │  │
│  │ (per-session  │   (flush trigger)  │ (Gemini Flash  │  │
│  │  ring buffer) │                    │  / Haiku)      │  │
│  └──────────────┘                    └───────┬───────┘  │
│                                               │          │
│                              ┌────────────────┘          │
│                              ▼                           │
│                    ┌─────────────────┐                   │
│                    │ Extracted Items  │                   │
│                    │ facts[]          │                   │
│                    │ decisions[]      │                   │
│                    │ preferences[]    │                   │
│                    │ todos[]          │                   │
│                    │ context_summary  │                   │
│                    └────────┬────────┘                   │
│                             │                            │
│                    ┌────────▼────────┐                   │
│                    │ Embed + Store   │                   │
│                    │ → conversations │                   │
│                    │   bucket        │                   │
│                    └─────────────────┘                   │
└────────────────────────────────────────────────────────┘
```

## 4. Detailed Design

### 4.1 Turn Buffer

An in-memory ring buffer per session/chat, holding the last N turns.

```typescript
interface BufferedTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sessionId?: string;
}

interface TurnBuffer {
  turns: BufferedTurn[];
  maxTurns: number;          // default: 20
  lastFlushAt: number;       // epoch ms
  flushTimer?: NodeJS.Timeout;
}
```

**Flush triggers** (whichever fires first):
| Trigger | Default | Config key |
|---------|---------|------------|
| Turn count | 10 user turns accumulated | `autoCapture.flushAfterTurns` |
| Idle timeout | 5 minutes since last message | `autoCapture.idleFlushMs` |
| Session end | Session close / agent stop event | (automatic) |

On flush, the buffer contents are sent to the extraction LLM and then cleared.

**Why in-memory?** Turns are ephemeral. If the process restarts, we lose the buffer — acceptable since we'd also lose the session context. No persistence needed.

### 4.2 Extraction LLM

A single cheap LLM call per flush that distills the buffered conversation into structured items.

**Model selection** (config: `autoCapture.extractionModel`):
- Default: `gemini-2.0-flash` (free tier, fast)
- Alternative: `claude-haiku-3.5` via gateway

**Prompt:**

```
You are an information extraction engine. Given a conversation between a user and an assistant, extract ONLY durable, referenceable information. Skip pleasantries, acknowledgments, debugging back-and-forth, and assistant explanations.

Extract into these categories:

FACTS: Concrete statements of truth the user stated or confirmed
  - Personal details, preferences, names, dates, locations
  - Technical decisions, architecture choices
  - Account details, configurations mentioned

DECISIONS: Explicit choices the user made
  - "Let's go with X", "Use Y instead of Z", "We'll do A"

PREFERENCES: Stated likes, dislikes, or preferred approaches
  - "I prefer X", "Don't do Y", "Always use Z"

TODOS: Action items that emerged (for user or assistant)
  - "Need to do X", "Remind me to Y", "Next step is Z"

OUTPUT (JSON, no fences):
{
  "items": [
    {
      "type": "fact|decision|preference|todo",
      "text": "concise distilled statement",
      "confidence": 0.0-1.0,
      "entities": ["person", "project", "tool"],
      "temporal": "YYYY-MM-DD or null"
    }
  ],
  "context_summary": "1-sentence summary of what this conversation was about"
}

If the conversation contains NO extractable durable information, return:
{"items": [], "context_summary": "..."}
```

**Expected behavior:**
- A 10-turn debugging exchange → 1-2 items (the fix that worked, the root cause)
- A planning conversation → 3-5 items (decisions made, todos assigned)
- Casual chit-chat → 0 items (no embedding at all)

### 4.3 Conversations Bucket — Schema

A new bucket `conversations` with structured columns alongside the vector:

```typescript
interface ConversationRecord {
  // Standard brain fields
  id: string;
  vector: number[];                // embedding of distilled text
  
  // Structured fields (SQL-queryable)
  type: "fact" | "decision" | "preference" | "todo";
  text: string;                    // the distilled statement
  confidence: number;              // extraction confidence
  source_session: string;          // originating session ID
  context_summary: string;         // what the conversation was about
  entities: string;                // JSON string[] of extracted entities
  temporal: string;                // referenced date or ""
  captured_at: string;             // ISO timestamp of extraction
  
  // Standard bucket fields
  tags: string;                    // JSON string[]
  entries: string;                 // JSON EntryNote[]
  nextActions: string;             // JSON string[]
  status: string;                  // "active" | "archived"
}
```

**Schema seed** (added to `schemas.ts`):

```typescript
case "conversations":
  return {
    id: "__schema__",
    type: "fact",
    text: "",
    confidence: 0,
    source_session: "",
    context_summary: "",
    entities: "[]",
    temporal: "",
    captured_at: "",
    tags: "[]",
    entries: "[]",
    nextActions: "[]",
    status: "active",
    vector: zeroVec,
  };
```

### 4.4 Hybrid Search

`brain_search` currently does pure vector search across buckets. We add a hybrid path:

```typescript
// Existing: vector-only search (unchanged for other buckets)
store.search("projects", queryVector, limit);

// New: hybrid search for conversations bucket
store.hybridSearch("conversations", {
  vector: queryVector,
  filters: {
    type?: "fact" | "decision" | "preference" | "todo",
    entities?: string,     // SQL LIKE match
    temporal?: { from?: string, to?: string },
    status?: string,
  },
  limit,
});
```

**Merge strategy for multi-bucket search:**
1. Vector search all included buckets (existing behavior)
2. For `conversations`, also run filtered queries when structured filters apply
3. Merge results by score, deduplicate by semantic similarity

### 4.5 Search Exclusion

New config option to exclude buckets from default search:

```jsonc
{
  "autoCapture": {
    "enabled": true,
    // ...
  },
  "search": {
    "excludeBuckets": ["conversations"]  // excluded from default brain_search
  }
}
```

When `excludeBuckets` contains `"conversations"`:
- `brain_search(query: "...")` → searches all buckets EXCEPT conversations
- `brain_search(query: "...", bucket: "conversations")` → explicitly searches only conversations
- This is the killswitch: add `"conversations"` to silence noise, remove it to include

### 4.6 Aggressiveness Tiers

Config: `autoCapture.level`

| Level | Behavior | LLM calls | Embeddings |
|-------|----------|-----------|------------|
| `off` | No auto-capture | 0 | 0 |
| `facts` | Extract only facts + decisions | 1 per flush | ~1-3 per flush |
| `standard` | Facts + decisions + preferences + todos | 1 per flush | ~2-5 per flush |
| `full` | All items + context summary embedding | 1 per flush | ~3-8 per flush |

The extraction prompt adjusts based on level:
- `facts`: Only extract `type: "fact"` and `type: "decision"`
- `standard`: All four types (default)
- `full`: All four types + embed `context_summary` as a separate record

## 5. Configuration

Full config shape (all optional, defaults shown):

```jsonc
{
  "autoCapture": {
    "enabled": false,                    // master switch
    "level": "standard",                 // off | facts | standard | full
    "extractionModel": "gemini-2.0-flash",
    "flushAfterTurns": 10,              // user turns before flush
    "idleFlushMs": 300000,              // 5 min idle timeout
    "maxBufferTurns": 20,              // ring buffer size
    "bucket": "conversations",          // target bucket
    "minConfidence": 0.6,              // skip items below this
    "hooks": ["message_received"]       // which hooks feed the buffer
  },
  "search": {
    "excludeBuckets": []                // buckets to exclude from default search
  }
}
```

## 6. Files Changed

| File | Change |
|------|--------|
| `src/schemas.ts` | Add `conversations` to `DEFAULT_BUCKETS`, add schema seed |
| `src/store.ts` | Add `hybridSearch()` method with structured filters |
| `src/index.ts` | Replace raw auto-capture with turn buffer + extraction pipeline |
| `src/auto-capture.ts` | **New** — `TurnBuffer` class, flush logic, extraction LLM call |
| `src/auto-capture.test.ts` | **Rewrite** — Tests for buffer, flush triggers, extraction |
| `src/noteworthy.ts` | Keep as pre-filter before buffering (skip trivial turns) |
| `src/classifier.ts` | No changes (existing classifier untouched) |
| `src/router.ts` | No changes (conversations bypass the classifier/router entirely) |
| `openclaw.plugin.json` | Add `autoCapture.*` and `search.*` config schema entries |

## 7. Data Flow — Happy Path

```
1. User sends message "let's use PostgreSQL instead of MySQL for the auth service"
2. message_received hook fires
3. isMessageNoteworthy() → true (passes heuristic)
4. Turn buffered: { role: "user", content: "let's use...", ts: "..." }
5. Assistant replies (also buffered)
6. ... more turns ...
7. Idle timeout fires (5 min no messages)
8. Buffer flushed → extraction LLM call with 8 turns
9. LLM returns:
   {
     "items": [
       { "type": "decision", "text": "Use PostgreSQL instead of MySQL for auth service", "confidence": 0.95, "entities": ["PostgreSQL", "MySQL", "auth service"] }
     ],
     "context_summary": "Discussion about database choice for auth service"
   }
10. Embed "Use PostgreSQL instead of MySQL for auth service"
11. Store in conversations bucket with structured fields
12. Later: brain_search("what database for auth") → finds the decision
```

## 8. Data Flow — Low-Value Conversation

```
1. User: "hey"
2. Assistant: "Hi! How can I help?"
3. User: "what's the weather"
4. Assistant: "It's 72°F and sunny..."
5. Idle timeout fires
6. Buffer flushed → extraction LLM call
7. LLM returns: { "items": [], "context_summary": "Weather check" }
8. No embedding, no storage → zero cost
```

## 9. Migration

- No migration needed — `conversations` table is created lazily on first write
- Existing data untouched
- To add `conversations` to existing instances: just update config and restart
- LanceDB auto-creates the table with the schema seed on first access

## 10. Cost Analysis

**Per conversation exchange (10 turns, ~2000 tokens):**

| Component | Cost |
|-----------|------|
| Extraction LLM (Gemini Flash) | Free tier / ~$0.0001 |
| Embedding (Gemini) | Free tier |
| LanceDB write | Free (local) |
| **Total per exchange** | **~$0** |

**Vs. current approach (10 messages × individual embed):**
| Component | Cost |
|-----------|------|
| 10 × classifier LLM calls | ~$0.001 |
| 10 × embeddings | Free |
| 10 × LanceDB writes | Free |
| **Total per exchange** | **~$0.001 + noise** |

The v2 approach is cheaper AND produces better retrieval quality.

## 11. Testing Strategy

1. **Unit tests** (`auto-capture.test.ts`):
   - TurnBuffer: add, flush, ring buffer eviction, idle timer
   - Extraction prompt building per level
   - Noteworthy pre-filter integration
   - Mock LLM responses → correct record creation

2. **Integration tests**:
   - End-to-end: buffer turns → extract → embed → store → search retrieves
   - Hybrid search: structured filter + vector combined
   - Exclusion: search with/without `excludeBuckets`

3. **Manual testing** (on this instance):
   - Enable auto-capture on dev instance
   - Chat normally for a day
   - Check `conversations` bucket content quality
   - Verify `brain_search` relevance with/without conversations included

## 12. Rollout Plan

1. **PR #1**: Core implementation (buffer, extraction, conversations bucket, config)
2. **CodeRabbit review** → iterate on feedback
3. **Deploy to dev instance** (this box)
4. **Test for 1-2 days** with `level: "facts"`
5. **Tune**: Adjust flush timing, confidence threshold, extraction prompt
6. **Promote to `standard`** once quality is validated

## 13. Open Questions

1. **Should assistant turns be buffered?** Current design says yes — the assistant's response often contains the "answer" that gives context to the user's decision. But it increases extraction input tokens.
   
2. **Multi-agent sessions**: When DevBot and Jarvis both run, should they share a buffer or have separate ones? Recommendation: separate per session/agent, with `source_session` tracking origin.

3. **Cross-bucket promotion**: Should high-confidence extracted items (e.g., a clear `todo`) also be promoted to the appropriate main bucket (e.g., `projects`)? Or keep conversations isolated? Recommendation: start isolated, add promotion as a future enhancement.

4. **Retention**: Should old conversation records auto-archive after N days? LanceDB doesn't have TTL, so this would need a periodic cleanup job. Recommendation: defer — disk is cheap, and old context is occasionally valuable.

---

## Appendix A: Extraction Prompt Variants by Level

### Level: `facts`
```
Extract ONLY concrete facts and explicit decisions from this conversation.
Skip opinions, preferences, action items, and casual discussion.
```

### Level: `standard`
```
Extract facts, decisions, preferences, and action items from this conversation.
Skip pleasantries, debugging back-and-forth, and assistant explanations.
```

### Level: `full`
```
Extract all durable information from this conversation: facts, decisions,
preferences, action items, and a context summary of the overall topic.
Skip only trivial acknowledgments.
```
