# Google Calendar — deferred companion contract

v0.3.6 ships the widget and read-only data boundary. Google API connection and the companion server are intentionally deferred. Do not enable a connection by putting OAuth credentials in Vite environment variables or TV storage.

## Future Google Cloud setup

1. Create/select a Google Cloud project you own and enable **Google Calendar API** under APIs & Services → Library.
2. Configure Google Auth Platform branding, audience and consent. While in testing, add the Google accounts that will authorize FrameOS as test users. Google's testing/verification and token-expiry policies apply.
3. Create a **Web application** OAuth client. Register the deployed companion's exact HTTPS redirect URI, for example `https://YOUR-COMPANION-HOST/oauth/google/callback`. The TV's local `file:` URL is not the redirect URI.
4. Store `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and a server encryption key in the companion's secret store. They must not use a `VITE_` prefix, enter Git, appear in browser responses/logs or be copied into `dist/`.
5. Request `https://www.googleapis.com/auth/calendar.events.readonly`. For multiple-calendar discovery also request `https://www.googleapis.com/auth/calendar.calendarlist.readonly`. Do not request write scopes.
6. Deploy and test the companion, then add only its exact HTTPS origin to the reviewed Tizen `connect-src` packaging policy. Review CORS for the packaged TV's actual origin; authenticate every personal-data request, do not use wildcard credentialed CORS or infer identity from an Origin header.
7. Implement and verify the browser/phone pairing flow below before replacing `pendingCalendarProvider` in App. The current build intentionally has no connection switch, credentials field or fake connection success.

## Authentication design for the later server

The TV asks the authenticated companion for a short-lived pairing session. Show a single-use pairing code and HTTPS browser URL. The person opens that URL on their phone/browser, enters/confirms the pairing code and explicitly approves the named TV. Never enter a Google password on the TV.

The companion performs Google's web-server authorization code flow using unpredictable single-use `state`, a session-bound callback, exact redirect matching and supported PKCE protection. Use offline access only on the server. Encrypt refresh tokens at rest with a separately managed key. Never return a Google access token, refresh token or client secret to the TV. Rate-limit pairing/code checks and bound session expiry, polling frequency and attempts. A denied, expired, replayed or state-mismatched callback must leave the TV disconnected.

After approval, issue a short-lived revocable TV session credential with only read-calendar/disconnect capabilities, bound to that pairing. Pass it to `companionCalendarProvider(origin, credentialGetter)` **in memory**. Implement re-pairing/session renewal on the companion; do not silently turn this into a long-lived browser bearer token. When a TV restarts without a session it must show disconnected until safely reconnected.

Disconnect must revoke Google's grant server-side and delete its encrypted tokens, cached personal data and TV sessions. If Google is temporarily unreachable, revoke the TV session immediately and queue a bounded server-side revocation retry. Report failures honestly. The frontend disconnect helper clears its cached events even if the request fails. Revoked/expired Google permissions become an HTTP 401 or 403; the frontend erases cached events and reports expired access.

## Read-only API boundary

All responses use `Cache-Control: no-store`. Every endpoint verifies the short-lived TV credential. Errors must not echo provider tokens or personal data. The adapter sends credentials only to the configured HTTPS server, rejects redirects and omits cookies.

`GET /v1/calendar` returns:

```json
{
  "fetchedAt": 1792540800000,
  "calendars": [{ "id": "primary", "name": "Personal", "selected": true }],
  "events": [{
    "id": "primary:google-event-id",
    "calendarId": "primary",
    "title": "Appointment",
    "start": "2026-10-22T09:00:00+10:00",
    "end": "2026-10-22T09:30:00+10:00",
    "allDay": false,
    "recurring": false
  }]
}
```

The sample is a schema illustration, not app seed data. `CalendarEvent` is the typed contract. All-day `start` and `end` are `YYYY-MM-DD`, with Google's **exclusive end date**. Timed events use RFC3339 timestamps with offsets. Expanded recurring instances retain their unique event ID and `recurring: true`; do not send unexpanded RRULE masters. Cancelled events are omitted. Return only explicitly selected calendars that the user can read, at most 64 calendars and 2,000 events in a bounded date window.

The server should use paginated `calendarList.list` for discovery and `events.list` for each selected calendar with `singleEvents=true`, `showDeleted=false`, `orderBy=startTime`, a bounded `timeMin`/`timeMax`, and the selected IANA `timeZone`. Cover the visible month plus upcoming seven-day agenda; the later provider API must accept date-window/calendar-selection parameters before exposing arbitrary month event fetching. Current month browsing is local and unconfigured. Do not silently drop subsequent pages. Cache/coalesce requests on the server; the TV refresh cadence is ten minutes while visible, plus manual Refresh. Apply finite request deadlines and abort stale queries when date ranges or calendars change.

`DELETE /v1/calendar/connection` disconnects/revokes the paired account; return 204 only when the server has accepted the revocation and removed TV access. The frontend has no create/edit/delete-event method.

## Samsung Calendar and privacy

The phone's Samsung Calendar must save events to a **Google-backed calendar** in the connected account. Phone-only/Samsung-local calendars are not exposed by Google's API. Calendar titles are hidden from the dashboard, agenda, selected-day list and accessible text when Privacy Mode is enabled. Local reminders/tasks remain independent and never claim to sync.

## Official references

- [Google web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OAuth token handling best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Calendar events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [CalendarList discovery and scopes](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)

Live OAuth consent, Google token lifecycle/revocation, recurring-calendar pagination, multiple-calendar selection and real Samsung Calendar synchronization must be tested when the server/API is added. Unit fixtures verify the frontend contract only.
