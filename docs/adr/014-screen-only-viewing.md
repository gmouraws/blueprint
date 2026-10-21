# ADR-014: Screen-only viewing without joining voice

Status: owner-approved implementation scope; Preview only. Production release requires separate approval.

## Problem and evidence

The existing room selector changed local UI state, but `useTracks` still read only the joined voice connection. No connection or credential existed for the other room, so its screens could not appear.

LiveKit's token grants do not restrict subscription by track source. Granting a viewer `canSubscribe: true` in a voice room would authorize its microphones as well as screens. Hiding microphone elements is not an authorization boundary. A loopback probe against LiveKit 1.13.10 also confirmed that `UpdateSubscriptions` does not override `canSubscribe: false`; the current server's subscription manager checks that permission before subscribing.

## Decision

Keep the two existing voice room names and Redis admission ledger unchanged. Add one screen-only LiveKit transport per logical room, named `${LIVEKIT_ROOM_NAME}-v2-main-screens` and `${LIVEKIT_ROOM_NAME}-v2-second-screens`. These are internal media channels, not additional selectable rooms. No new service, dependency, environment variable, database migration or paid plan is needed.

- Voice admission still reserves one of eight combined slots and returns an exact-room microphone token. Its data permission preserves existing chat refresh hints.
- The same server-authorized admission returns a second token for that room's screens, bound to `<voice-identity>:screen`. It can publish only screen video/audio, never microphone/camera/data. Leaving, switching or reclaiming admission revokes both identities before freeing the voice slot.
- `POST /api/view` validates the current session, exact Origin, allowlisted room and a separate 30/minute rate limit. It can only issue a hidden, non-publishing screen-room token. Clients cannot request publisher privileges or choose an identity. Tokens expire after 120 seconds; secrets stay server-side.
- Screen rooms have a separate bounded 16-connection capacity, enough for eight publishers and eight viewers. They never enter the voice roster or Redis voice count. Exhausting screen capacity fails viewing without increasing the eight-person voice allowance. No participant is misclassified as an agent or recorder to evade caps.
- A voice connection and its screen publisher stay mounted independently of navigation. Browsing the other room owns at most one additional read-only screen connection. Cancellation aborts pending authorization, disconnects old transports and waits for cleanup before the next connection. Authenticated `/api/view/leave` can revoke only a session-owned viewing identity in an allowlisted screen room; it cannot target a voice publisher. Failed cleanup is retained and retried before another viewing token is requested. Voice reconnection does not tear down an otherwise independent observer. Switching voice stops screen capture and disconnects the previous publisher before obtaining another admission.
- Only the selected screen's video is subscribed/rendered. Other-room screen audio requires an explicit opt-in, off initially and reset on room/stream selection. Global mute dominates playback while preserving volume. No other-room microphone can exist in the screen transport. Device-output changes follow the voice output without requesting microphone permission.
- Single click selects; double click uses the existing safe voice join. Disclosure remains a separate button. An accessible selected-room header join button supports touch/keyboard. Only voice membership triggers the existing sounds.

## Consequences and rollout

This costs an additional LiveKit connection while voice is joined, and another while browsing the other room. Provider participant-minute/bandwidth quotas still apply; no billing changes are authorized. This separation is necessary for server-enforced microphone isolation with the installed SDK/server capabilities.

The voice namespace/ledger remains v2, preserving admission accounting with older deployments. Old clients publish screens into the old mixed transport and will not appear in the new screen viewer. Preview testers must reload/rejoin the current Preview together. The screen-only namespaces have no legacy unrestricted tokens. A future Production rollout must likewise ask clients to reload; this PR does not deploy Production.

Controlled local tests cannot establish hosted token revocation, physical-speaker audibility, NAT traversal or free-plan capacity. Record those limits explicitly rather than inferring them from successful synthetic media.

Sources: [LiveKit token grants](https://docs.livekit.io/frontends/reference/tokens-grants/), [Room service API](https://docs.livekit.io/reference/other/roomservice-api/), [server subscription permission check](https://github.com/livekit/livekit/blob/master/pkg/rtc/subscriptionmanager.go).
