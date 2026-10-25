# Assignment supplied by the student

The following two blocks are the assignment wording pasted into this conversation. Formatting is preserved as text; no additional instructor requirements or grading weights have been invented.

## Objective, implementation, security audit and README (verbatim supplied text)

```text
Objective & Overview

Authentication (AuthN) and Authorization (AuthZ) are the gatekeepers of modern software systems. When developers generate security code with AI, language models frequently suggest insecure defaults—such as storing plaintext passwords, using weak hashing algorithms, relying solely on client-side role checks, or misconfiguring JWT validation.

In this assignment, you will:

    Use an AI tool to generate a functional starter application with user authentication (registration/login) and role-based authorization (e.g., User vs. Admin access).
    Audit and verify the AI-generated code against security industry standards (e.g., bcrypt/Argon2 password hashing, secure session/token management, and server-side route guards).
    Execute a structured Web Project QA test suite to confirm both positive paths and negative security attack vectors.
    Deploy and submit your project with a GitHub repository, AI prompt log, live URL (if applicable), and a video walkthrough demonstrating functionality and security testing.

Step-by-Step Instructions
Step 1: Prompt the AI for an Initial Draft

Use ChatGPT, Claude, Gemini, or GitHub Copilot to scaffold a simple application in the language/framework of your choice (e.g., Node/Express, Next.js, Python/FastAPI/Flask, Spring Boot, or Go).

Sample Initial Prompt for Students to Copy & Adapt:

Act as a senior security engineer. Build a lightweight full-stack application (or REST API with a simple frontend) demonstrating basic Authentication and Role-Based Access Control (RBAC).

 

The application must include:

    User Registration & Login with two roles: 'User' and 'Admin'.
    Password hashing using a modern, secure algorithm.
    Token-based (JWT) or Session-based authentication.
    Three distinct views or API endpoints:

   - Public: Accessible to anyone (e.g., home/landing page).

   - Protected (User): Accessible to any authenticated user (e.g., user profile or dashboard).

   - Restricted (Admin Only): Accessible ONLY to users with the 'Admin' role (e.g., user management list or system metrics).

 

Provide the backend server code, route-guard middleware, and a minimal frontend or HTML/JS interface to test registration, login, logout, and role access.

Step 2: Audit & Verify the AI Output (Security Checklist)

Before running the code, review what the AI generated against this Security Reality Check:

    Password Storage: Did the AI use a salted, slow hash (bcrypt, Argon2, PBKDF2)? If it used MD5, SHA-256, or plaintext, reject and refactor it immediately.
    Server-Side Enforcement: Is the Admin check enforced on the server/backend API? (A common AI flaw is hiding buttons on the frontend while leaving the backend endpoint accessible to any logged-in user).
    Token & Secret Safety: Are secrets stored in environment variables (.env) rather than hardcoded in the source code? Are sensitive fields (like password hashes) stripped before returning user objects?
    Error Leakage: Does the login endpoint fail generically (e.g., "Invalid username or password") rather than leaking information (e.g., "User not found" vs. "Incorrect password" which enables user enumeration)?

GitHub Repository README.md Requirements

Your repository's README.md must include:

    Project Title & Overview: High-level description of the app and tech stack.
    Setup & Execution Guide: Clear, step-by-step instructions to install dependencies, configure .env files, and run the project locally.
    AI Disclosure & Prompt Appendix:
        AI tool(s) used (ChatGPT, Claude, Copilot, etc.).
        The exact prompts submitted.
        A summary of what the AI produced correctly versus what vulnerabilities or omissions you had to manually patch.
    QA Test Summary: A completed copy of the QA checklist showing test results.
```

## QA checklist (verbatim supplied text)

```text
Step 3: Web Project Testing & Quality Assurance (QA) Checklist

Run your application through this QA framework. You will demonstrate these live in your recording:

    [ ] 1. Authentication Functional Tests:
        Successful registration with a new account.
        Successful login generating an active session or token.
        Failed login with an invalid password displays a generic error message.
        Logout successfully invalidates or removes the local credential/session.
    [ ] 2. Authorization & Privilege Boundary Tests:
        Logging in as a standard User allows access to the User Dashboard.
        Logging in as a standard User and attempting to access the Admin view/endpoint returns a clean 403 Forbidden (or redirects safely).
        Logging in as an Admin grants access to both User and Admin resources.
        Attempting to access protected endpoints while logged out returns 401 Unauthorized.
    [ ] 3. Input Validation & Edge Cases:
        Empty username/password submissions are rejected with client and server validation.
        Entering special characters or SQL-like syntax does not crash the server.
    [ ] 4. Browser Console & Network Health:
        Browser DevTools Network tab shows proper HTTP status codes (200, 401, 403).
        DevTools Console is free of unhandled JavaScript runtime exceptions.
```

## Student presentation instruction (verbatim)

> Remember that this needs to be integrated as a showcase:

## Student sequencing instruction (verbatim)

> And this we'll perform after the site is built, but it is good to know now for you to know what to watch for during built:

## Interpretation boundary

Supabase Auth is selected by the student as a managed credential backend, with custom server-side authorization in project source. This is not evidence of explicit instructor approval of managed Auth. Repository publication, hosting integration, production release and the student's recording remain separate actions.
