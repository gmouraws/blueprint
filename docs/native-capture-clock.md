# Fresh native session clock-boundary correction

The native stream IPC rejects deadlines beyond twelve hours on the local PC clock. A freshly issued twelve-hour server session can cross that exact local boundary when the server clock is slightly ahead, rejecting configure for publishers and viewers. Existing older sessions can remain unaffected.

The hosted heartbeat now submits a conservative capture lease of at most sixty seconds, refreshed at the existing five-second interval and never beyond the provided session deadline. Watch-only, expired or malformed states explicitly disable native capture. The native sender/origin, twelve-hour bound and fifteen-second heartbeat checks remain unchanged; server access checks, invitation revocation and absolute session expiry still apply. This is compatible with Windows 0.1.7 and requires no installer, account, Discord or service configuration change. It does not fix arbitrary PC clock errors or establish the cause of every integration rejection.

Regression coverage models the installed IPC guard with fresh publisher/viewer sessions and a server clock ahead by thirty seconds, checks renewal, no idle media admission and capture disablement after revocation. Unit coverage includes positive/negative clock offsets, nearing expiry and malformed deadlines.
