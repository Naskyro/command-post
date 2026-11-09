# Personal Birthday Appearance

Birthday appearance is a private, temporary display for the signed-in employee. It is not a company announcement, a shared calendar, or a change to another employee’s workspace.

## Source and privacy

The server queries only `hr_records` where the ID is `hrpersonal:<authenticated person>`, `person_id` is that same person, and the kind is `personal`. The existing encrypted personnel record provides `data.dateOfBirth`. The decoded record’s identity is checked again. Missing, invalid, future-dated, deleted, or unreadable details produce no birthday celebration. The application does not infer birthdays from other personnel fields.

The appearance response contains no birth date, birth year, age, names of other employees, or personnel content. Admin permission does not allow switching the birthday target. Normal appearance responses remain private and noncacheable.

## Calendar behavior

The date is evaluated in `America/Chicago`, including daylight-saving changes. The effect starts on the birthday’s local calendar date and ends at the next local midnight. The documented default for February 29 birthdays is February 28 in non-leap years, and February 29 in leap years. No birth date is changed to implement that display rule.

Every appearance response supplies the next relevant availability boundary, including the next Austin midnight. The browser refreshes at that boundary and on returning to the page. An active birthday overlay also carries its end instant so the browser can remove it at midnight even if the refresh temporarily fails.

## Theme selection and restoration

Ten birthday designs are marked `personalOnly`. They are excluded from the general employee theme catalog and ordinary theme-selection endpoint. They become selectable only for the authenticated employee during their own birthday.

The default design is selected deterministically from the employee ID and current calendar year, using the available birthday pool. The employee may choose another eligible birthday design. That preference changes only the birthday choice, never the saved everyday or seasonal theme. Admin users with Site Themes Edit access can archive or restore birthday designs; they cannot publish them globally or put them on company-wide schedules. When all birthday designs are archived, no birthday overlay appears.

The stored base selection is preserved throughout the celebration, including a seasonal selection’s original start, expiration, and permanent fallback. At the end of the birthday, the currently valid base theme returns. An expired or newly unavailable seasonal selection follows its existing fallback rules; the birthday effect does not revive or extend it.

The employee may dismiss the celebration for the rest of the current Austin date. Selecting a normal theme during an active birthday atomically saves that new base selection and dismisses the birthday for that day. The next year’s birthday is not disabled.

## API and persistence

- `GET /api/user-settings` returns the effective theme and optional `birthday: { active, themeId, endsAt, baseTheme }`.
- `POST /api/user-settings` with `{ action: "dismiss-birthday", version }` dismisses only the caller’s current birthday.
- `POST /api/user-settings` with `{ action: "birthday-theme", theme, version }` selects an eligible birthday design and resumes today’s celebration.
- A normal `{ theme, version, dismissBirthday: true }` request updates the base and dismisses the active birthday in one optimistic, version-checked save.
- Clients cannot submit a person ID, date of birth, date to dismiss, age, or other personnel fields.

The existing `user_settings.theme` text column retains backward compatibility with permanent theme strings and seasonal JSON envelopes. Birthday preferences add a private current-day dismissal and optional birthday-design ID to the same envelope. No schema migration or personnel-record rewrite is required.

## Verification

Tests cover Austin midnight, both daylight-saving transitions, leap-day behavior, absent and invalid birthdays, no birth-year projection, stable personal selection, archived pools, automatic restoration, seasonal expiration during a birthday, self-only storage, version conflicts, and one-save base selection plus dismissal. Separate endpoint security tests verify the authenticated employee lookup and reject forged target parameters.
