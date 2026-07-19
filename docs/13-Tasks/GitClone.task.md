# GitClone Task Specification

The GitClone Task clones repositories or pulls the latest branch updates using local git commands.

---

## 1. Interface & Arguments
* **Input:** `{ repoUrl: string, targetPath: string, branchName?: string }`
* **Output:** `{ success: boolean, commitHash: string }`

---

## 2. Tools & Infrastructure
* Uses the child_process terminal commands module for local Git binary executions.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.**

---

## 4. Error Handling
* Returns failure if Git authentication is missing or repos do not exist.
