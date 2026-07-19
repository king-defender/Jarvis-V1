# Search Shared Service Specification

The Search Shared Service maps Google Search or custom search API queries.

---

## 1. Description
Triggers API-driven web searches, extracts URLs and snippets, parses page headings, and formats lists of results.

---

## 2. API Contract
```typescript
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ISearchService {
  query(searchTerm: string, limit?: number): Promise<SearchResult[]>;
}
```
