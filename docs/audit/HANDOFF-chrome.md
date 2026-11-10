# Handoff to the session that runs Claude in Chrome

Paste the following into a Claude Code session on the owner's computer that has the Claude in Chrome extension connected, after `git fetch origin claude/production-audit && git checkout claude/production-audit`:

---

Continue the production audit of Milestone Impact from the branch `claude/production-audit`. Read the following first:
- `docs/audit/2026-11-10-phase1-public.md`: phase one, the public pages, which is done.
- `docs/audit/2026-11-10-coverage-map.md`: a map of every screen and button by role, with a safety class for each.

### Accounts (approved by the owner)
- **Admin panel:** omar@sunkvalue.com
- **Participant:** mi@sunkvalue.com
- **Expert (/x):** omar@manzoma.sa
- **Coordinator (/org):** saleh@manzoma.sa

The OTP codes are given by the owner in the chat. Any name entered is prefixed with [TEST].

### Safety limits (binding)
- No real payment: stop at Creem and document it.
- No deletion, no bulk email, and no approving certificates or a final evaluation.
- No change to settings or to admin permissions.
- Writes only on the test accounts' own data.
- Any action that reaches other people or that is UNSAFE in the map is documented and not executed.
- Do not read sign-in codes from the database.

### Work
In Chrome, sign in with each role. Then:
1. Walk every screen in the coverage map and press every SAFE or TEST-WRITE button.
2. Record the result of each one: worked, failed, no effect, or not tested and why. Add console errors (`read_console_messages`) and failed requests (`read_network_requests`).
3. Take a screenshot of every fault, on desktop and at mobile width.
4. Count the steps of the journey: registration ← assessment ← payment (stop) ← journey ← certificate.
5. Score Nielsen's ten heuristics and the quality of the Arabic text.
6. Leave test records tagged [TEST] and do not delete them.

### Output
- `docs/audit/2026-11-10-report.md` on the same branch, with:
  - an executive summary and a score per platform
  - a coverage matrix
  - faults by severity, with steps to reproduce and the location in the code
  - prioritised recommendations
- A one-page HTML report published as an Artifact (load artifact-design first; Milestone Impact identity; no four-part system).
- No change to the app code, and no rebuild of `leaders/` or `admin/`.
