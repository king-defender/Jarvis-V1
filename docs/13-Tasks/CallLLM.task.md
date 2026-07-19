# CallLLM Task Specification

The CallLLM Task dispatches standard string prompts to LLM endpoints and validates outputs against target structural shapes.

---

## 1. Interface & Arguments
* **Input:** `{ prompt: string, systemInstruction?: string, responseSchema?: Record<string, any> }`
* **Output:** `{ text: string, jsonOutput?: Record<string, any> }`

---

## 2. Tools & Infrastructure
* Uses the Infrastructure Layer `ModelRouter` to dispatch to target models.

---

## 3. AI Usage Guidelines
* **AI is enabled.** This acts as the single pipeline wrapper for all LLM calls.

---

## 4. Error Handling
* Intercepts model timeouts and errors, triggering the ModelRouter fallback pipeline. If all fallbacks fail, throws `INTELLIGENCE_DEGRADED` errors.
