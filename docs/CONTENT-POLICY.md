# Repository and privacy boundaries

Use only gmouraws/blueprint, the owner's explicit instructions and public technical documentation. Never inspect or reuse unrelated private repositories or professional source material. Do not publish employer/client details, private systems, credentials, biographies or inferred personal information.

The application has no editorial publishing system. Nicknames and messages are user input: validate size, render as plain text and attribute saved messages through the server-validated session. Do not log passwords, cookies, tokens or messages. Do not add analytics or recordings. The owner-approved shared chat retains messages for 30 days in isolated Preview/Production PostgreSQL databases; see CHAT-STORAGE.md.

Voice and screen content is transported by LiveKit Cloud; chat is stored in Neon PostgreSQL. Transport encryption is not a claim of end-to-end encryption against these providers. Peers can still record with their own tools. Providers may retain operational logs or backups under their own policies. Shared-password access is appropriate to the explicitly requested small trusted group, not an identity-proof system.
