# Email Shared Service Specification

The Email Shared Service abstracts SMTP connection setups and payload dispatches.

---

## 1. Description
Initializes Nodemailer transport objects, injects HTML body templates, registers logging details, and handles delivery failures.

---

## 2. API Contract
```typescript
export interface IEmailService {
  sendMail(to: string, subject: string, htmlContent: string): Promise<string>;
}
```
